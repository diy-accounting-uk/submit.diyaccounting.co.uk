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

const firstSourceBySub = new Map();
const mockGetFirstAccountSource = vi.fn(async (sub) => firstSourceBySub.get(sub));
const mockRecordFirstAccountSource = vi.fn(async (sub, source) => {
  if (!firstSourceBySub.has(sub)) firstSourceBySub.set(sub, source);
  return firstSourceBySub.get(sub);
});
vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getFirstAccountSource: (...args) => mockGetFirstAccountSource(...args),
  recordFirstAccountSource: (...args) => mockRecordFirstAccountSource(...args),
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
    mockPublishActivityEvent.mockResolvedValue({ published: true });
    firstSourceBySub.clear();
    mockGetFirstAccountSource.mockClear();
    mockRecordFirstAccountSource.mockClear();
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundles";
    process.env.ACTIVITY_BUS_NAME = "test-bus";
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

  test("answers firstRecord true for the account's first landing, and stores it", async () => {
    const response = await ingestHandler(acquisitionEvent(LANDING));
    expect(parseResponseBody(response)).toEqual({ ok: true, firstRecord: true });
    expect(firstSourceBySub.get("test-sub")).toEqual(LANDING);
  });

  test("answers firstRecord false for a later landing of an account that has a source, and publishes nothing more", async () => {
    await ingestHandler(acquisitionEvent(LANDING));
    const later = { utmSource: "google", utmMedium: "cpc", utmCampaign: "watch-due", landedAt: "2026-12-01T10:00:00.000Z" };
    const response = await ingestHandler(acquisitionEvent(later));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({ ok: true, firstRecord: false });
    expect(mockPublishActivityEvent).toHaveBeenCalledTimes(1);
    expect(firstSourceBySub.get("test-sub")).toEqual(LANDING);
  });

  test("answers firstRecord true again when the same landing is sent again, and publishes nothing more", async () => {
    await ingestHandler(acquisitionEvent(LANDING));
    const response = await ingestHandler(acquisitionEvent(LANDING));
    expect(parseResponseBody(response)).toEqual({ ok: true, firstRecord: true });
    expect(mockPublishActivityEvent).toHaveBeenCalledTimes(1);
  });

  test("records an untagged first landing as the account's source, so a later tagged landing is not its first", async () => {
    const untagged = { landedAt: "2026-11-20T09:00:00.000Z" };
    const first = await ingestHandler(acquisitionEvent(untagged));
    expect(parseResponseBody(first)).toEqual({ ok: true, firstRecord: true });
    expect(mockPublishActivityEvent.mock.calls[0][0]).toEqual(
      expect.objectContaining({ summary: "Account acquisition: untagged", detail: untagged }),
    );
    const later = await ingestHandler(acquisitionEvent(LANDING));
    expect(parseResponseBody(later)).toEqual({ ok: true, firstRecord: false });
    expect(mockPublishActivityEvent).toHaveBeenCalledTimes(1);
  });

  test("keeps one account's source apart from another's", async () => {
    await ingestHandler(acquisitionEvent(LANDING, { sub: "sub-a" }));
    const response = await ingestHandler(acquisitionEvent({ ...LANDING, utmSource: "other" }, { sub: "sub-b" }));
    expect(parseResponseBody(response)).toEqual({ ok: true, firstRecord: true });
    expect(mockPublishActivityEvent).toHaveBeenCalledTimes(2);
  });

  test("answers 500 in JSON and stores nothing when the event is not published, so the next post records it", async () => {
    mockPublishActivityEvent.mockResolvedValueOnce({ published: false, error: "throttled" });
    const failed = await ingestHandler(acquisitionEvent(LANDING));
    expect(failed.statusCode).toBe(500);
    expect(failed.headers["Content-Type"]).toBe("application/json");
    expect(parseResponseBody(failed).message).toBe("The account's source was not recorded");
    expect(firstSourceBySub.has("test-sub")).toBe(false);

    const next = await ingestHandler(acquisitionEvent(LANDING));
    expect(parseResponseBody(next)).toEqual({ ok: true, firstRecord: true });
  });

  test("answers 500 in JSON when the store fails", async () => {
    mockGetFirstAccountSource.mockRejectedValueOnce(new Error("table unavailable"));
    const response = await ingestHandler(acquisitionEvent(LANDING));
    expect(response.statusCode).toBe(500);
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(JSON.stringify(parseResponseBody(response))).not.toContain("table unavailable");
    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
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

  test("drops a value that holds markup, an email address or a control character, and a landedAt that is not a timestamp", async () => {
    await ingestHandler(
      acquisitionEvent({
        utmSource: "<script>alert(1)</script>",
        utmMedium: "someone@example.com",
        utmCampaign: "watch-due",
        utmContent: 'x" onload="y',
        utmTerm: "line\nbreak",
        ref: "partner-1",
        landedAt: "my name is Someone 1 2020",
      }),
    );
    const { detail, summary } = mockPublishActivityEvent.mock.calls[0][0];
    expect(detail).toEqual({ utmCampaign: "watch-due", ref: "partner-1" });
    expect(summary).toBe("Account acquisition: partner-1");
  });

  test("caps each value at 200 characters", async () => {
    await ingestHandler(acquisitionEvent({ utmSource: "a".repeat(5000) }));
    expect(mockPublishActivityEvent.mock.calls[0][0].detail).toEqual({ utmSource: "a".repeat(200) });
  });

  test.each([
    ["a nested object in a field", { utmSource: { nested: { deep: "x" } }, ref: ["a"] }],
    ["an array", [LANDING]],
    ["a string", "newsletter"],
    ["null", null],
  ])("answers 400 in JSON for %s, and publishes nothing", async (_name, body) => {
    const event = acquisitionEvent(LANDING);
    event.body = JSON.stringify(body);
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(400);
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(parseResponseBody(response).message).toBe("No landing fields to record");
    expect(mockPublishActivityEvent).not.toHaveBeenCalled();
  });

  test("records the caller's own account whatever the body names", async () => {
    await ingestHandler(
      acquisitionEvent({ ...LANDING, sub: "other-sub", userSub: "other-sub", hashedSub: "x", actor: "operator" }, { sub: "sub-a" }),
    );
    const published = mockPublishActivityEvent.mock.calls[0][0];
    expect(published.userSub).toBe("sub-a");
    expect(published.detail).toEqual(LANDING);
  });

  test("answers 400 in JSON for a body that is not JSON", async () => {
    const event = acquisitionEvent(LANDING);
    event.body = "{not json";
    const response = await ingestHandler(event);
    expect(response.statusCode).toBe(400);
    expect(parseResponseBody(response).message).toBe("Invalid JSON in request body");
  });
});
