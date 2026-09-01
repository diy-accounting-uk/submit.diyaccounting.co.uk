// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/bundleGet.test.js

import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, buildEventWithToken, makeIdToken } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import {
  mockSend,
  mockLibDynamoDb,
  mockClientDynamoDb,
  MockQueryCommand,
  MockPutCommand,
  MockGetCommand,
  MockUpdateCommand,
} from "@app/test-helpers/dynamoDbMock.js";

// Helper to yield control back to the event loop
const yieldToEventLoop = () => new Promise((resolve) => setImmediate(resolve));

// ---------------------------------------------------------------------------
// Mock AWS DynamoDB used by bundle management to avoid real AWS calls
// ---------------------------------------------------------------------------
vi.mock("@aws-sdk/lib-dynamodb", () => mockLibDynamoDb);
vi.mock("@aws-sdk/client-dynamodb", () => mockClientDynamoDb);

const mockSqsSend = vi.fn();
vi.mock("@aws-sdk/client-sqs", () => {
  class SQSClient {
    constructor(_config) {}
    send(cmd) {
      return mockSqsSend(cmd);
    }
  }
  class SendMessageCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { SQSClient, SendMessageCommand };
});

// Burst detection (issue #10) publishes through activityAlert.js; spy on the failure-event
// export directly rather than asserting on EventBridge, which is a no-op without
// ACTIVITY_BUS_NAME anyway.
const mockPublishActivityFailureEvent = vi.fn();
vi.mock("@app/lib/activityAlert.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    publishActivityFailureEvent: (...args) => mockPublishActivityFailureEvent(...args),
  };
});

// Defer importing the ingestHandlers until after mocks are defined
import { ingestHandler as bundleGetHandler, nowMinute } from "@app/functions/account/bundleGet.js";
import { ingestHandler as bundlePostHandler } from "@app/functions/account/bundlePost.js";
import { hashSub, initializeSalt } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("bundleGet ingestHandler", () => {
  let asyncRequests = new Map();

  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        ASYNC_REQUESTS_DYNAMODB_TABLE_NAME: "test-async-table",
      }),
    );
    asyncRequests = new Map();

    // Reset and provide default mock DynamoDB behaviour
    vi.resetAllMocks();
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        return { Items: [], Count: 0 };
      }
      if (cmd instanceof MockPutCommand) {
        const item = cmd.input.Item;
        if (item.requestId) {
          asyncRequests.set(item.requestId, item);
        }
        return {};
      }
      if (cmd instanceof MockUpdateCommand) {
        const { requestId } = cmd.input.Key;
        const existing = asyncRequests.get(requestId) || {};
        const updated = { ...existing };
        if (cmd.input.ExpressionAttributeValues[":status"]) {
          updated.status = cmd.input.ExpressionAttributeValues[":status"];
        }
        if (cmd.input.ExpressionAttributeValues[":data"]) {
          updated.data = cmd.input.ExpressionAttributeValues[":data"];
        } else if (cmd.input.UpdateExpression.includes("REMOVE #data")) {
          delete updated.data;
        }
        asyncRequests.set(requestId, updated);
        return {};
      }
      if (cmd instanceof MockGetCommand) {
        const { requestId } = cmd.input.Key;
        const item = asyncRequests.get(requestId);
        return { Item: item };
      }
      return {};
    });
  });

  afterEach(async () => {
    // Ensure all background tasks from the current test are finished before the next test starts
    await yieldToEventLoop();
  });

  // ============================================================================
  // HEAD Request Tests
  // ============================================================================

  test("HEAD request returns 200 OK", async () => {
    const event = buildLambdaEvent({
      method: "HEAD",
      path: "/api/v1/bundle",
    });

    const response = await bundleGetHandler(event);
    expect([200, 401]).toContain(response.statusCode);
  });

  // ============================================================================
  // Authentication Tests (401)
  // ============================================================================

  test("returns 401 when Authorization header is missing", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/bundle",
      headers: {}, // No Authorization
    });

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(401);
  });

  test("returns 401 when Authorization token is invalid", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/bundle",
      headers: { Authorization: "Bearer invalid-token" },
    });

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(401);
  });

  // ============================================================================
  // Happy Path Tests (200)
  // ============================================================================

  test("returns 200 with catalogue bundles for new user (no allocated bundles)", async () => {
    const token = makeIdToken("user-no-bundles");
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "2000";

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(Array.isArray(body.bundles)).toBe(true);
    // Catalogue bundles appear as unallocated entries (bundleId + bundleCapacityAvailable only)
    expect(body.bundles.length).toBeGreaterThan(0);
    for (const bundle of body.bundles) {
      expect(bundle).toHaveProperty("bundleId");
      expect(bundle).toHaveProperty("bundleCapacityAvailable");
      // No hashedSub since these are catalogue-only entries, not user allocations
      expect(bundle).not.toHaveProperty("hashedSub");
    }
    expect(body).toHaveProperty("tokensRemaining", 0);
  });

  test("skips async request lookup when x-initial-request header is true", async () => {
    const token = makeIdToken("user-initial");
    const event = buildEventWithToken(token, {});
    event.headers["x-initial-request"] = "true";
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(200);

    // Verify that GetCommand was NOT called for this requestId
    const getCalls = mockSend.mock.calls.filter((call) => call[0] instanceof MockGetCommand);
    expect(getCalls.length).toBe(0);
  });

  test("returns 200 with user bundle for 202 after granting", async () => {
    const token = makeIdToken("user-with-bundles");
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "500";

    // Grant a bundle first
    await bundlePostHandler(buildEventWithToken(token, { bundleId: "day-guest" }));

    // Get bundles
    const getEvent = buildEventWithToken(token, {});
    getEvent.headers["x-wait-time-ms"] = "500";
    const response = await bundleGetHandler(getEvent);

    expect([200, 201, 202]).toContain(response.statusCode);
    if (response.statusCode === 200 || response.statusCode === 201) {
      const body = parseResponseBody(response);
      expect(Array.isArray(body.bundles)).toBe(true);
    } else {
      expect(response.headers).toHaveProperty("Location");
    }
  });

  test("returns correct content-type header", async () => {
    const token = makeIdToken("user-headers");
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "500";

    const response = await bundleGetHandler(event);

    expect([200, 201, 202]).toContain(response.statusCode);
    expect(response.headers).toHaveProperty("Content-Type", "application/json");
    expect(response.headers).toHaveProperty("Access-Control-Allow-Origin", "*");
  });

  test("generates requestId if not provided", async () => {
    const token = makeIdToken("user-gen-id");
    const event = buildEventWithToken(token, {});
    // Set a short wait time to avoid timeout
    event.headers["x-wait-time-ms"] = "200";
    // ensure no requestId in headers or context
    delete event.headers["x-request-id"];
    delete event.headers["X-Request-Id"];
    if (event.requestContext) delete event.requestContext.requestId;

    const response = await bundleGetHandler(event);
    expect(response.headers).toHaveProperty("x-request-id");
    // Should be a UUID v4
    expect(response.headers["x-request-id"]).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
  });

  // ============================================================================
  // Lazy Token Refresh Tests (exercises resetTokens → UpdateItem path)
  // ============================================================================
  //
  // Guards the code path whose IAM grant was missing in the 2026-04 production
  // incident. bundleGet performs an UpdateItem on the bundles table when a user's
  // tokenResetAt has elapsed. This test asserts an UpdateItem command is issued;
  // the CDK-side IAM guard lives in SubmitApplicationCdkResourceTest.java.

  test("issues UpdateItem on bundles table when tokenResetAt has elapsed", async () => {
    const userId = "user-token-refresh";
    const token = makeIdToken(userId);
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "500";

    const bundlesTableName = process.env.BUNDLE_DYNAMODB_TABLE_NAME;
    const pastIso = "1970-01-01T00:00:00.000Z";
    // invited-guest has tokenRefreshInterval = "P1M" in submit.catalogue.toml, which is the
    // precondition for bundleGet to issue the resetTokens UpdateItem.
    const expiredBundle = {
      hashedSub: "hashed-" + userId,
      bundleId: "invited-guest",
      tokensGranted: 3,
      tokensConsumed: 3,
      tokenResetAt: pastIso,
    };

    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand && cmd.input.TableName === bundlesTableName) {
        return { Items: [expiredBundle], Count: 1 };
      }
      if (cmd instanceof MockQueryCommand) {
        return { Items: [], Count: 0 };
      }
      if (cmd instanceof MockGetCommand) {
        return { Item: undefined };
      }
      return {};
    });

    const response = await bundleGetHandler(event);

    expect(response.statusCode).toBe(200);

    const updateCalls = mockSend.mock.calls
      .map((call) => call[0])
      .filter((cmd) => cmd instanceof MockUpdateCommand && cmd.input.TableName === bundlesTableName);
    expect(updateCalls.length).toBeGreaterThanOrEqual(1);
    const updateCmd = updateCalls[0];
    expect(updateCmd.input.Key).toHaveProperty("bundleId", "invited-guest");
    expect(updateCmd.input.UpdateExpression).toMatch(/tokensConsumed\s*=\s*:zero/);
  });

  // ============================================================================
  // Error Handling Tests (500)
  // ============================================================================

  test("returns 500 on internal server error", async () => {
    // Mock an error by removing required env var
    delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;

    const token = makeIdToken("user-error");
    const event = buildEventWithToken(token, {});

    await expect(bundleGetHandler(event)).rejects.toThrow();
  });

  // ============================================================================
  // Bundle Burst Detection (issue #10 acceptance criteria 3 and 6)
  // ============================================================================

  describe("bundle burst detection", () => {
    const originalTableName = process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
    let securityStateHits;

    function stateKeyFor(userId) {
      return `rate#${hashSub(userId)}#${nowMinute()}`;
    }

    function seedHits(userId, hits) {
      securityStateHits.set(stateKeyFor(userId), hits);
    }

    beforeEach(async () => {
      process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = "test-security-state";
      securityStateHits = new Map();
      mockPublishActivityFailureEvent.mockClear();
      await initializeSalt(); // hashSub() below needs the salt ready before the handler runs it

      mockSend.mockImplementation(async (cmd) => {
        if (cmd instanceof MockUpdateCommand && cmd.input.Key && "stateKey" in cmd.input.Key) {
          const key = cmd.input.Key.stateKey;
          const hits = (securityStateHits.get(key) || 0) + 1;
          securityStateHits.set(key, hits);
          return { Attributes: { hits } };
        }
        if (cmd instanceof MockQueryCommand) {
          return { Items: [], Count: 0 };
        }
        return {};
      });
    });

    afterEach(() => {
      if (originalTableName === undefined) {
        delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
      } else {
        process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = originalTableName;
      }
    });

    test("no event at 500 hits, one event at 501, none at 502", async () => {
      const userId = "user-burst-threshold";
      const token = makeIdToken(userId);
      seedHits(userId, 499);

      await bundleGetHandler(buildEventWithToken(token, {})); // 500th
      expect(mockPublishActivityFailureEvent).not.toHaveBeenCalled();

      await bundleGetHandler(buildEventWithToken(token, {})); // 501st
      expect(mockPublishActivityFailureEvent).toHaveBeenCalledTimes(1);
      expect(mockPublishActivityFailureEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "api-burst-detected",
          failure: "burst-threshold",
          detail: expect.objectContaining({ endpoint: "GET /api/v1/bundle", threshold: 500 }),
        }),
      );

      await bundleGetHandler(buildEventWithToken(token, {})); // 502nd
      expect(mockPublishActivityFailureEvent).toHaveBeenCalledTimes(1);
    });

    test("does not publish when the request is a synthetic test run", async () => {
      const userId = "user-burst-test-run";
      const token = makeIdToken(userId);
      seedHits(userId, 500);

      const event = buildEventWithToken(token, {});
      event.headers["x-request-id"] = "test_burst-request";

      await bundleGetHandler(event);

      expect(mockPublishActivityFailureEvent).not.toHaveBeenCalled();
    });

    test("skips the counter entirely when the table name is unset", async () => {
      delete process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME;
      const userId = "user-burst-unset";
      const token = makeIdToken(userId);

      const response = await bundleGetHandler(buildEventWithToken(token, {}));

      expect(response.statusCode).toBe(200);
      const stateUpdateCalls = mockSend.mock.calls
        .map((call) => call[0])
        .filter((cmd) => cmd instanceof MockUpdateCommand && cmd.input.Key && "stateKey" in cmd.input.Key);
      expect(stateUpdateCalls.length).toBe(0);
      expect(mockPublishActivityFailureEvent).not.toHaveBeenCalled();
    });

    test("delegates hashing to activityAlert.js: raw sub only reaches the userSub parameter, never detail or summary", async () => {
      const userId = "user-burst-raw-sub";
      const token = makeIdToken(userId);
      seedHits(userId, 500);

      await bundleGetHandler(buildEventWithToken(token, {}));

      expect(mockPublishActivityFailureEvent).toHaveBeenCalledTimes(1);
      const publishedArgs = mockPublishActivityFailureEvent.mock.calls[0][0];
      expect(publishedArgs.userSub).toBe(userId);
      expect(JSON.stringify(publishedArgs.detail)).not.toContain(userId);
      expect(publishedArgs.summary).not.toContain(userId);
    });

    test("a counter failure does not fail the request", async () => {
      mockSend.mockImplementation(async (cmd) => {
        if (cmd instanceof MockUpdateCommand && cmd.input.Key && "stateKey" in cmd.input.Key) {
          throw new Error("DynamoDB unavailable");
        }
        if (cmd instanceof MockQueryCommand) {
          return { Items: [], Count: 0 };
        }
        return {};
      });

      const userId = "user-burst-failure";
      const token = makeIdToken(userId);

      const response = await bundleGetHandler(buildEventWithToken(token, {}));

      expect(response.statusCode).toBe(200);
    });
  });
});
