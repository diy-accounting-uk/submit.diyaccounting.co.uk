// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

const mockPublishActivityEvent = vi.fn().mockResolvedValue({ published: true });
vi.mock("@app/lib/activityAlert.js", async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, publishActivityEvent: (...args) => mockPublishActivityEvent(...args) };
});

const mockGetSignInSession = vi.fn();
const mockDeleteSignInSession = vi.fn().mockResolvedValue(undefined);
vi.mock("@app/data/dynamoDbSecurityStateRepository.js", () => ({
  getSignInSession: (...args) => mockGetSignInSession(...args),
  deleteSignInSession: (...args) => mockDeleteSignInSession(...args),
}));

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

const { ingestHandler } = await import("../../functions/account/sessionSignOutPost.js");
const { _setTestSalt, _clearSalt, hashSub } = await import("../../services/subHasher.js");

function ssmParam(value) {
  return { Parameter: { Value: value } };
}

function buildSignOutEvent({ sub = "test-sub", clientId = "submit-client-id", origin } = {}) {
  return buildLambdaEvent({
    method: "POST",
    path: "/api/v1/session/sign-out",
    headers: origin ? { origin } : {},
    authorizer: buildJwtAuthorizerContext(sub, "test", "customer@example.com", { client_id: clientId }),
  });
}

describe("sessionSignOutPost", () => {
  beforeEach(() => {
    mockPublishActivityEvent.mockClear();
    mockGetSignInSession.mockReset();
    mockDeleteSignInSession.mockClear();
    mockSsmSend.mockReset();
    process.env.ENVIRONMENT_NAME = "ci";
    process.env.DIYA_GL_ALLOWED_ORIGINS = "https://ci.diya-gl.co.uk";
    _setTestSalt("test-salt");
    mockSsmSend.mockImplementation((command) => {
      if (command.input.Name === "/submit/ci/submit-app-client-id") return Promise.resolve(ssmParam("submit-client-id"));
      if (command.input.Name === "/submit/ci/spreadsheets-diya-gl-app-client-id") return Promise.resolve(ssmParam("books-client-id"));
      if (command.input.Name === "/submit/ci/mcp-app-client-id") return Promise.resolve(ssmParam("mcp-client-id"));
      return Promise.reject(new Error("unexpected parameter"));
    });
  });

  test("rejects an unauthenticated request", async () => {
    const response = await ingestHandler(buildLambdaEvent({ method: "POST", path: "/api/v1/session/sign-out", authorizer: {} }));
    expect(response.statusCode).toBe(401);
  });

  test("publishes logout with the resolved app client and the session's id, then deletes the session item", async () => {
    mockGetSignInSession.mockResolvedValue({ sessionId: "session-abc", lastIssuedAt: 1, sessionStartedAt: 1 });

    const response = await ingestHandler(buildSignOutEvent({ clientId: "books-client-id" }));

    expect(response.statusCode).toBe(200);
    expect(mockGetSignInSession).toHaveBeenCalledWith(hashSub("test-sub"), "books");
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "logout",
        appClient: "books",
        sessionId: "session-abc",
        userSub: "test-sub",
        actor: "customer",
      }),
    );
    expect(mockDeleteSignInSession).toHaveBeenCalledWith(hashSub("test-sub"), "books");
  });

  test("classifies the app client from the mcp client id", async () => {
    mockGetSignInSession.mockResolvedValue(null);

    await ingestHandler(buildSignOutEvent({ clientId: "mcp-client-id" }));

    expect(mockPublishActivityEvent).toHaveBeenCalledWith(expect.objectContaining({ appClient: "mcp" }));
    expect(mockDeleteSignInSession).toHaveBeenCalledWith(hashSub("test-sub"), "mcp");
  });

  test("carries the DIYA-GL CORS header for an allow-listed origin", async () => {
    mockGetSignInSession.mockResolvedValue(null);

    const response = await ingestHandler(buildSignOutEvent({ origin: "https://ci.diya-gl.co.uk" }));

    expect(response.headers["Access-Control-Allow-Origin"]).toBe("https://ci.diya-gl.co.uk");
  });
});
