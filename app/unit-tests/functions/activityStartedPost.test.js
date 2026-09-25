// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/activityStartedPost.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { parseResponseBody } from "@app/test-helpers/mockHelpers.js";

const mockPublishActivityEvent = vi.fn().mockResolvedValue({ published: true });
vi.mock("@app/lib/activityAlert.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, publishActivityEvent: (...args) => mockPublishActivityEvent(...args) };
});

const mockSsmSend = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send(...args) {
      return mockSsmSend(...args);
    }
  },
  GetParameterCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const { ingestHandler } = await import("@app/functions/account/activityStartedPost.js");
const { _setTestSalt } = await import("@app/services/subHasher.js");

function buildActivityStartedEvent({ activityId = "submit-vat", sub = "test-sub", clientId = "submit-client-id" } = {}) {
  return buildLambdaEvent({
    method: "POST",
    path: "/api/v1/activity/started",
    body: { activityId },
    authorizer: buildJwtAuthorizerContext(sub, "test", "customer@example.com", { client_id: clientId }),
  });
}

describe("activityStartedPost ingestHandler", () => {
  beforeEach(() => {
    mockPublishActivityEvent.mockClear();
    mockSsmSend.mockReset();
    process.env.ENVIRONMENT_NAME = "ci";
    _setTestSalt("test-salt");
    mockSsmSend.mockImplementation((command) => {
      if (command.input.Name === "/submit/ci/submit-app-client-id") return Promise.resolve({ Parameter: { Value: "submit-client-id" } });
      if (command.input.Name === "/submit/ci/spreadsheets-diya-gl-app-client-id")
        return Promise.resolve({ Parameter: { Value: "books-client-id" } });
      if (command.input.Name === "/submit/ci/mcp-app-client-id") return Promise.resolve({ Parameter: { Value: "mcp-client-id" } });
      return Promise.reject(new Error("unexpected parameter"));
    });
  });

  test("rejects an unauthenticated request", async () => {
    const response = await ingestHandler(buildLambdaEvent({ method: "POST", path: "/api/v1/activity/started", authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
  });

  test("rejects an activity id the catalogue does not list", async () => {
    const response = await ingestHandler(buildActivityStartedEvent({ activityId: "not-a-real-activity" }));
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("Unknown activity id");
    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
  });

  test("rejects a request with no activity id", async () => {
    const response = await ingestHandler(
      buildLambdaEvent({
        method: "POST",
        path: "/api/v1/activity/started",
        body: {},
        authorizer: buildJwtAuthorizerContext("test-sub", "test", "customer@example.com", { client_id: "submit-client-id" }),
      }),
    );
    expect(response.statusCode).toBe(400);
  });

  test("publishes activity-started with the hashed sub, the actor and the activity id", async () => {
    const response = await ingestHandler(buildActivityStartedEvent({ activityId: "submit-vat", clientId: "submit-client-id" }));

    expect(response.statusCode).toBe(200);
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "activity-started",
        actor: "customer",
        userSub: "test-sub",
        appClient: "submit",
        detail: { activityId: "submit-vat" },
      }),
    );
  });

  test("classifies the app client from the books client id", async () => {
    await ingestHandler(buildActivityStartedEvent({ activityId: "submit-vat", clientId: "books-client-id" }));
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(expect.objectContaining({ appClient: "books" }));
  });
});
