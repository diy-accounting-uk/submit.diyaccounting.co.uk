// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/functions/interestPost.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent, buildHeadEvent, buildJwtAuthorizerContext } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

const mockSnsSend = vi.fn();
vi.mock("@aws-sdk/client-sns", () => {
  class SNSClient {
    constructor(_config) {}
    send(cmd) {
      return mockSnsSend(cmd);
    }
  }
  class PublishCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { SNSClient, PublishCommand };
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

import { ingestHandler } from "@app/functions/account/interestPost.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("interestPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    process.env.FEEDBACK_TOPIC_ARN = "arn:aws:sns:eu-west-2:123456789012:test-feedback-engagement";
    vi.clearAllMocks();
    mockSnsSend.mockResolvedValue({});
    mockEventBridgeSend.mockResolvedValue({});
  });

  test("HEAD request returns 200 OK", async () => {
    const event = buildHeadEvent();
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(200);
  });

  test("returns 200 and publishes to SNS when email is present", async () => {
    const event = buildLambdaEvent({
      method: "POST",
    });
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.registered).toBe(true);

    // Verify SNS publish was called
    expect(mockSnsSend).toHaveBeenCalledTimes(1);
    const publishCommand = mockSnsSend.mock.calls[0][0];
    expect(publishCommand.input.TopicArn).toBe("arn:aws:sns:eu-west-2:123456789012:test-feedback-engagement");
    expect(publishCommand.input.Subject).toBe("Feedback engagement");
    expect(publishCommand.input.Message).toContain("Email: test@test.submit.diyaccounting.co.uk");
    expect(publishCommand.input.Message).toContain("Timestamp:");
  });

  test("publishes the feedback-engagement-registered event with the hashed sub, never the raw sub", async () => {
    const event = buildLambdaEvent({ method: "POST" });
    await ingestHandler(event);

    expect(mockEventBridgeSend).toHaveBeenCalledTimes(1);
    const rawDetail = mockEventBridgeSend.mock.calls[0][0].input.Entries[0].Detail;
    expect(rawDetail).not.toContain("test-sub");
    const detail = JSON.parse(rawDetail);
    expect(detail.event).toBe("feedback-engagement-registered");
    expect(detail.hashedSub).toBe(hashSub("test-sub"));
  });

  test("returns 200 with JWT authorizer context (HTTP API)", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      authorizer: buildJwtAuthorizerContext("jwt-sub", "jwt-user", "jwt@example.com"),
    });
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.registered).toBe(true);

    const publishCommand = mockSnsSend.mock.calls[0][0];
    expect(publishCommand.input.Message).toContain("Email: jwt@example.com");
  });

  test("returns 400 when email is missing from custom authorizer context", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      authorizer: {
        authorizer: {
          lambda: {
            "sub": "test-sub",
            "cognito:username": "test",
            "scope": "read write",
          },
        },
      },
    });
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Email not found");
  });

  test("returns 400 when email is missing from JWT authorizer context", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      authorizer: {
        authorizer: {
          jwt: {
            claims: {
              "sub": "test-sub",
              "cognito:username": "test",
            },
            scopes: [],
          },
        },
      },
    });
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Email not found");
  });

  test("returns 500 when FEEDBACK_TOPIC_ARN is not set", async () => {
    delete process.env.FEEDBACK_TOPIC_ARN;
    const event = buildLambdaEvent({ method: "POST" });
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.message).toContain("not configured");
  });

  test("returns 500 when SNS publish fails", async () => {
    mockSnsSend.mockRejectedValue(new Error("SNS publish failed"));
    const event = buildLambdaEvent({ method: "POST" });
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Failed to register interest");
  });
});
