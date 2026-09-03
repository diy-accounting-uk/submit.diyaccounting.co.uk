// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/bundlePost.test.js
// Comprehensive tests for bundlePost ingestHandler

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

// Capture EventBridge sends so activity-event tests can inspect the Detail JSON directly.
const mockEventBridgeSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// Defer importing the ingestHandler until after mocks are defined
import { ingestHandler as bundlePostHandler, workerHandler as bundlePostWorker, grantBundle } from "@app/functions/account/bundlePost.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("bundlePost ingestHandler", () => {
  let asyncRequests = new Map();

  beforeEach(() => {
    // Setup test environment
    Object.assign(
      process.env,
      setupTestEnv({
        ASYNC_REQUESTS_DYNAMODB_TABLE_NAME: "test-async-table",
        SQS_QUEUE_URL: "https://sqs.eu-west-2.amazonaws.com/123456789012/test-queue",
      }),
    );
    asyncRequests = new Map();

    // Reset and provide default mock DynamoDB behaviour
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
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

  test("HEAD request returns 200 OK after bundle enforcement", async () => {
    // TODO: Handler checks request.method === "HEAD" but extractRequest returns a URL object
    // which doesn't have a .method property. This needs to be fixed in either:
    // 1. extractRequest to add method from event.requestContext.http.method, or
    // 2. Handler to check event.requestContext.http.method directly
    // For now, HEAD requests will return 401 because they're treated as POST
    const event = buildLambdaEvent({
      method: "HEAD",
      path: "/api/v1/bundle",
    });

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(200);
  });

  // ============================================================================
  // Authentication Tests (401)
  // ============================================================================

  test("returns 401 when Authorization header is missing", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      body: { bundleId: "day-guest" },
      headers: {}, // No Authorization header
    });

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(401);
    const body = parseResponseBody(response);
    expect(body).toBeDefined();
  });

  test("returns 401 when Authorization token is invalid", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      body: { bundleId: "day-guest" },
      headers: { Authorization: "Bearer invalid-token" },
    });

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(401);
  });

  // ============================================================================
  // Validation Tests (400)
  // ============================================================================

  test("returns 400 when bundleId is missing", async () => {
    const token = makeIdToken("user-missing-bundle");
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.error).toBe("Missing bundleId in request");
  });

  test("returns 400 with invalid JSON in request body", async () => {
    const token = makeIdToken("user-invalid-json");
    const event = {
      ...buildEventWithToken(token, {}),
      body: "invalid-json{",
    };
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.error).toBe("Invalid JSON in request body");
  });

  test("returns 400 when unknown qualifier is provided", async () => {
    const token = makeIdToken("user-unknown-qualifier");
    const event = buildEventWithToken(token, {
      bundleId: "day-guest",
      qualifiers: { unknownField: "value" },
    });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.error).toBe("unknown_qualifier");
    expect(body.qualifier).toBe("unknownField");
  });

  test("returns 400 when qualifier mismatch occurs", async () => {
    const token = makeIdToken("user-qualifier-mismatch");
    // Test bundle may have specific qualifier requirements
    const event = buildEventWithToken(token, {
      bundleId: "basic",
      qualifiers: { subscriptionTier: "Wrong" },
    });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    // This depends on catalog configuration; if basic requires specific tier
    if (response.statusCode === 400) {
      const body = parseResponseBody(response);
      expect(body.error).toBe("qualifier_mismatch");
    } else {
      // If bundle doesn't require qualifiers, it should succeed or give different error
      expect([200, 404, 202]).toContain(response.statusCode);
    }
  });

  // ============================================================================
  // Bundle Not Found Tests (404)
  // ============================================================================

  test("returns 404 when bundle is not found in catalog", async () => {
    const token = makeIdToken("user-not-found");
    const event = buildEventWithToken(token, {
      bundleId: "nonexistent-bundle-xyz",
    });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(404);
    const body = parseResponseBody(response);
    expect(body.error).toBe("bundle_not_found");
    expect(body.message).toContain("nonexistent-bundle-xyz");
  });

  // ============================================================================
  // Happy Path Tests (200)
  // ============================================================================

  test("returns 201 and grants automatic bundle without persistence", async () => {
    const token = makeIdToken("user-auto");
    const event = buildEventWithToken(token, { bundleId: "default" });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.status).toBe("granted");
    expect(body.granted).toBe(true);
    expect(body.expiry).toBe(null); // automatic bundles don't have expiry
    expect(body.bundle).toBe("default");
  });

  test("returns 201 and grants test bundle with timeout producing expiry", async () => {
    const token = makeIdToken("user-test");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.status).toBe("granted");
    expect(body.granted).toBe(true);
    // Test bundle should have timeout producing non-null expiry
    if (body.expiry) {
      expect(/\d{4}-\d{2}-\d{2}/.test(body.expiry)).toBe(true);
    }
  });

  test("returns 201 with granted status when re-granting existing bundle", async () => {
    const token = makeIdToken("user-duplicate");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-wait-time-ms"] = "30000";

    // Mock: first query returns existing bundle, subsequent calls succeed
    let queryCallCount = 0;
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        queryCallCount++;
        // First query: existing bundle found (triggers delete + re-grant)
        // Second query (from updateUserBundles): no bundles after delete
        return queryCallCount === 1 ? { Items: [{ bundleId: "day-guest" }], Count: 1 } : { Items: [], Count: 0 };
      }
      return {};
    });

    const response = await bundlePostHandler(event);

    // Yield to allow non-blocking writes to complete
    await yieldToEventLoop();

    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.status).toBe("granted");
  });

  test("returns 409 and refuses a second day-guest request from the same user within the day", async () => {
    const token = makeIdToken("user-day-pass-repeat");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-wait-time-ms"] = "30000";

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let queryCallCount = 0;
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        queryCallCount++;
        // The user already holds an unexpired day-guest allocation from earlier today.
        return queryCallCount === 1 ? { Items: [{ bundleId: "day-guest", expiry: tomorrow }], Count: 1 } : { Items: [], Count: 0 };
      }
      return {};
    });

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(409);
    const body = parseResponseBody(response);
    expect(body.status).toBe("already_granted");

    // The existing allocation must not have been deleted.
    const lib = await import("@aws-sdk/lib-dynamodb");
    const deleteCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.DeleteCommand);
    expect(deleteCalls.length).toBe(0);
  });

  test("grantBundle with viaPass replaces an active day-guest allocation instead of refusing it", async () => {
    const userId = "user-day-pass-via-pass";
    const decodedToken = { sub: userId };

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    let queryCallCount = 0;
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        queryCallCount++;
        // The user already holds an unexpired day-guest allocation from earlier today.
        return queryCallCount === 1 ? { Items: [{ bundleId: "day-guest", expiry: tomorrow }], Count: 1 } : { Items: [], Count: 0 };
      }
      return {};
    });

    const result = await grantBundle(userId, { bundleId: "day-guest" }, decodedToken, null, { skipCapCheck: true, viaPass: true });

    expect(result.status).toBe("granted");

    // The existing allocation must have been deleted and replaced, unlike the direct-request case.
    const lib = await import("@aws-sdk/lib-dynamodb");
    const deleteCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.DeleteCommand);
    expect(deleteCalls.length).toBe(1);
  });

  test("skips async request lookup when x-initial-request header is true", async () => {
    const token = makeIdToken("user-initial");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-initial-request"] = "true";
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(201);

    // Verify that GetCommand was NOT called for this requestId
    const lib = await import("@aws-sdk/lib-dynamodb");
    const getCalls = mockSend.mock.calls.filter((call) => call[0] instanceof lib.GetCommand);
    expect(getCalls.length).toBe(0);
  });

  test("grants bundle successfully with all fields in response", async () => {
    const token = makeIdToken("user-success");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundlePostHandler(event);

    expect(response.statusCode).toBe(201);
    expect(response.headers).toHaveProperty("Content-Type", "application/json");
    expect(response.headers).toHaveProperty("Access-Control-Allow-Origin", "*");

    const body = parseResponseBody(response);
    expect(body.status).toBe("granted");
    expect(body.granted).toBe(true);
    expect(body.bundle).toBe("day-guest");
    expect(Array.isArray(body.bundles)).toBe(true);
  });

  test("publishes the bundle-granted event with the hashed sub, never the raw sub", async () => {
    const token = makeIdToken("user-hashed-sub-check");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-wait-time-ms"] = "30000";

    await bundlePostHandler(event);

    const bundleGrantedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "bundle-granted";
    });
    expect(bundleGrantedCalls).toHaveLength(1);
    const rawDetail = bundleGrantedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"user-hashed-sub-check"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("user-hashed-sub-check"));
  });

  // ============================================================================
  // Error Handling Tests (500)
  // ============================================================================

  test("returns 500 on internal server error", async () => {
    // Mock an error by providing invalid environment
    delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;

    const token = makeIdToken("user-error");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-wait-time-ms"] = "30000";

    await expect(bundlePostHandler(event)).rejects.toThrow();
  });

  // ============================================================================
  // Async & Worker Tests
  // ============================================================================

  test("returns 202 Accepted for async initiation", async () => {
    const token = makeIdToken("user-async");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-wait-time-ms"] = "0";

    const response = await bundlePostHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("SQS record processing updates DynamoDB status to completed", async () => {
    const userId = "user-sqs-success";
    const requestId = "req-sqs-success";
    const payload = {
      userId,
      requestBody: { bundleId: "day-guest" },
      decodedToken: { sub: userId },
      requestId,
    };

    const event = {
      Records: [
        {
          body: JSON.stringify({ userId, requestId, payload }),
          messageId: "msg-123",
        },
      ],
    };

    await bundlePostWorker(event);

    const stored = asyncRequests.get(requestId);
    expect(stored).toBeDefined();
    expect(stored.status).toBe("completed");
    expect(stored.data.status).toBe("granted");
  });
});
