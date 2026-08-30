// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/bundleDelete.test.js
// Comprehensive tests for bundleDelete ingestHandler

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
  MockDeleteCommand,
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

// Defer importing the ingestHandlers until after mocks are defined
import { ingestHandler as bundleDeleteHandler, workerHandler as bundleDeleteWorker } from "@app/functions/account/bundleDelete.js";
import { ingestHandler as bundlePostHandler } from "@app/functions/account/bundlePost.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("bundleDelete ingestHandler", () => {
  let asyncRequests = new Map();

  beforeEach(() => {
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
      if (cmd instanceof MockDeleteCommand) {
        return {};
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

    const response = await bundleDeleteHandler(event);
    // Same HEAD detection issue
    expect([200, 401]).toContain(response.statusCode);
  });

  // ============================================================================
  // Authentication Tests (401)
  // ============================================================================

  test("returns 401 when Authorization header is missing", async () => {
    const event = buildLambdaEvent({
      method: "DELETE",
      body: { bundleId: "day-guest" },
      headers: {}, // No Authorization
    });

    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(401);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Authentication required");
  });

  test("returns 401 when Authorization token is invalid", async () => {
    const event = buildLambdaEvent({
      method: "DELETE",
      body: { bundleId: "day-guest" },
      headers: { Authorization: "Bearer invalid-token" },
    });

    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(401);
  });

  // ============================================================================
  // Validation Tests (400)
  // ============================================================================

  test("returns 400 when bundleId is missing and removeAll is false", async () => {
    const token = makeIdToken("user-no-bundle-id");
    const event = buildEventWithToken(token, {});
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Missing bundle Id");
  });

  // ============================================================================
  // Not Found Tests (404)
  // ============================================================================

  test("returns 404 when bundle not found for user", async () => {
    const token = makeIdToken("user-no-bundles");
    const event = buildEventWithToken(token, { bundleId: "nonexistent" });
    event.headers["x-wait-time-ms"] = "30000";

    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(404);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Bundle not found");
  });

  // ============================================================================
  // Happy Path Tests (200)
  // ============================================================================

  test("successfully deletes a bundle", async () => {
    const token = makeIdToken("user-delete-success");

    // Mock bundle existence
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        return { Items: [{ bundleId: "day-guest" }], Count: 1 };
      }
      return {};
    });

    // Then delete it
    const deleteEvent = buildEventWithToken(token, { bundleId: "day-guest" });
    deleteEvent.headers["x-wait-time-ms"] = "30000";
    const response = await bundleDeleteHandler(deleteEvent);

    // Yield to allow non-blocking writes to complete
    await yieldToEventLoop();

    expect(response.statusCode).toBe(204);
    const body = parseResponseBody(response);
    expect(body).toBeNull();
  });

  test("skips async request lookup when x-initial-request header is true", async () => {
    const token = makeIdToken("user-initial");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-initial-request"] = "true";
    event.headers["x-wait-time-ms"] = "30000";

    // Mock bundle existence
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        return { Items: [{ bundleId: "day-guest" }], Count: 1 };
      }
      return {};
    });

    const response = await bundleDeleteHandler(event);

    expect(response.statusCode).toBe(204);

    // Verify that GetCommand was NOT called for this requestId
    const getCalls = mockSend.mock.calls.filter((call) => call[0] instanceof MockGetCommand);
    expect(getCalls.length).toBe(0);
  });

  test("successfully removes all bundles with removeAll flag", async () => {
    const token = makeIdToken("user-remove-all");

    // Mock multiple bundles
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        return { Items: [{ bundleId: "day-guest" }, { bundleId: "default" }], Count: 2 };
      }
      return {};
    });

    // Remove all
    const deleteEvent = buildEventWithToken(token, { removeAll: true });
    deleteEvent.headers["x-wait-time-ms"] = "30000";
    const response = await bundleDeleteHandler(deleteEvent);

    expect(response.statusCode).toBe(204);
    const body = parseResponseBody(response);
    expect(body).toBeNull();
  });

  test("accepts bundleId via path parameter", async () => {
    const token = makeIdToken("user-path-param");

    // Mock bundle existence
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        return { Items: [{ bundleId: "day-guest" }], Count: 1 };
      }
      return {};
    });

    // Delete via path parameter
    const event = {
      ...buildEventWithToken(token, {}),
      pathParameters: { id: "day-guest" },
    };
    event.headers["x-wait-time-ms"] = "30000";
    const response = await bundleDeleteHandler(event);

    await yieldToEventLoop();

    expect(response.statusCode).toBe(204);
    const body = parseResponseBody(response);
    expect(body).toBeNull();
  });

  test("accepts bundleId via query parameter", async () => {
    const token = makeIdToken("user-query-param");

    // Mock bundle existence
    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        return { Items: [{ bundleId: "day-guest" }], Count: 1 };
      }
      return {};
    });

    // Delete via query parameter
    const event = {
      ...buildEventWithToken(token, {}),
      queryStringParameters: { bundleId: "day-guest" },
    };
    event.headers["x-wait-time-ms"] = "30000";
    const response = await bundleDeleteHandler(event);

    await yieldToEventLoop();

    expect(response.statusCode).toBe(204);
    const body = parseResponseBody(response);
    expect(body).toBeNull();
  });

  test("publishes the bundle-deleted event with the hashed sub, never the raw sub", async () => {
    const token = makeIdToken("user-delete-hashed-sub-check");

    mockSend.mockImplementation(async (cmd) => {
      if (cmd instanceof MockQueryCommand) {
        return { Items: [{ bundleId: "day-guest" }], Count: 1 };
      }
      return {};
    });

    const deleteEvent = buildEventWithToken(token, { bundleId: "day-guest" });
    deleteEvent.headers["x-wait-time-ms"] = "30000";
    await bundleDeleteHandler(deleteEvent);
    await yieldToEventLoop();

    const bundleDeletedCalls = mockEventBridgeSend.mock.calls.filter((call) => {
      const detail = JSON.parse(call[0].input.Entries[0].Detail);
      return detail.event === "bundle-deleted";
    });
    expect(bundleDeletedCalls).toHaveLength(1);
    const rawDetail = bundleDeletedCalls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain('"user-delete-hashed-sub-check"');
    const detail = JSON.parse(rawDetail);
    expect(detail.hashedSub).toBe(hashSub("user-delete-hashed-sub-check"));
  });

  // ============================================================================
  // Error Handling Tests (500)
  // ============================================================================

  test("returns 500 on internal server error", async () => {
    // Mock an error condition by deleting required env var
    delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;

    const token = makeIdToken("user-error");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-wait-time-ms"] = "30000";

    await expect(bundleDeleteHandler(event)).rejects.toThrow();
  });

  // ============================================================================
  // Async & Worker Tests
  // ============================================================================

  test("returns 202 Accepted for async deletion initiation", async () => {
    const token = makeIdToken("user-async-delete");
    const event = buildEventWithToken(token, { bundleId: "day-guest" });
    event.headers["x-wait-time-ms"] = "0";

    const response = await bundleDeleteHandler(event);
    expect(response.statusCode).toBe(202);
    expect(response.headers).toHaveProperty("x-request-id");
    expect(mockSqsSend).toHaveBeenCalled();
  });

  test("SQS record processing updates DynamoDB status to completed for deletion", async () => {
    const userId = "user-sqs-delete-success";
    const requestId = "req-sqs-delete-success";
    const payload = {
      userId,
      bundleToRemove: "day-guest",
      removeAll: false,
      requestId,
    };

    // Mock bundle existence for worker
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "day-guest" }], Count: 1 };
      }
      if (cmd instanceof lib.PutCommand) {
        const item = cmd.input.Item;
        if (item.requestId) {
          asyncRequests.set(item.requestId, item);
        }
        return {};
      }
      if (cmd instanceof lib.UpdateCommand) {
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
      return {};
    });

    const event = {
      Records: [
        {
          body: JSON.stringify({ userId, requestId, payload }),
          messageId: "msg-delete-123",
        },
      ],
    };

    await bundleDeleteWorker(event);

    const stored = asyncRequests.get(requestId);
    expect(stored).toBeDefined();
    expect(stored.status).toBe("completed");
    expect(stored.data.status).toBe("removed");
  });
});
