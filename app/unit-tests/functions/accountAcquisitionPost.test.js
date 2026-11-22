// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/accountAcquisitionPost.test.js

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

const { ingestHandler } = await import("@app/functions/account/accountAcquisitionPost.js");
const { _setTestSalt } = await import("@app/services/subHasher.js");

const LANDING = {
  utmSource: "newsletter",
  utmMedium: "email",
  utmCampaign: "watch-list",
  utmContent: "director",
  utmTerm: "confirmation statement",
  ref: "partner-1",
  landedAt: "2026-11-20T09:00:00.000Z",
};

function acquisitionEvent(body, { sub = "test-sub" } = {}) {
  return buildLambdaEvent({
    method: "POST",
    path: "/api/v1/account/acquisition",
    body,
    authorizer: buildJwtAuthorizerContext(sub, "test", "", { client_id: "submit-client-id" }),
  });
}

describe("accountAcquisitionPost ingestHandler", () => {
  beforeEach(() => {
    mockPublishActivityEvent.mockClear();
    mockSsmSend.mockReset();
    process.env.ENVIRONMENT_NAME = "ci";
    _setTestSalt("test-salt");
    mockSsmSend.mockImplementation((command) => {
      if (command.input.Name === "/submit/ci/submit-app-client-id") return Promise.resolve({ Parameter: { Value: "submit-client-id" } });
      return Promise.resolve({ Parameter: { Value: "other-client-id" } });
    });
  });

  test("answers 401 in JSON without a token, and publishes nothing", async () => {
    const response = await ingestHandler(
      buildLambdaEvent({ method: "POST", path: "/api/v1/account/acquisition", body: LANDING, authorizer: {} }),
    );
    expect(response.statusCode).toBe(401);
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(parseResponseBody(response).message).toBe("Authentication required");
    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
  });

  test("publishes one account-acquisition event whose detail holds the landing fields", async () => {
    const response = await ingestHandler(acquisitionEvent(LANDING));
    expect(response.statusCode).toBe(200);
    expect(mockPublishActivityEvent).toHaveBeenCalledTimes(1);
    expect(mockPublishActivityEvent).toHaveBeenCalledWith(
      expect.objectContaining({ event: "account-acquisition", userSub: "test-sub", appClient: "submit", detail: LANDING }),
    );
  });

  test("drops a field it does not know", async () => {
    await ingestHandler(acquisitionEvent({ ...LANDING, email: "someone@example.com", page: "/index.html" }));
    expect(mockPublishActivityEvent.mock.calls[0][0].detail).toEqual(LANDING);
  });

  test("drops the click ids", async () => {
    await ingestHandler(acquisitionEvent({ ...LANDING, gclid: "Cj0KCQ-click", msclkid: "ms-click" }));
    const { detail, summary } = mockPublishActivityEvent.mock.calls[0][0];
    expect(detail).toEqual(LANDING);
    expect(JSON.stringify({ detail, summary })).not.toMatch(/click/);
  });

  test("answers 400 in JSON when only click ids are sent, and publishes nothing", async () => {
    const response = await ingestHandler(acquisitionEvent({ gclid: "Cj0KCQ-click" }));
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).message).toBe("No landing fields to record");
    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
  });

  test("answers 400 in JSON for a body that is not JSON", async () => {
    const event = acquisitionEvent(LANDING);
    event.body = "{not json";
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).message).toBe("Invalid JSON in request body");
  });
});
