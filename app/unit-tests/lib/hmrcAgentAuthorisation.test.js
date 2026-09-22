// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/hmrcAgentAuthorisation.test.js

import { describe, it, expect, vi, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function mockJsonResponse({ ok, status, body = {}, headers = {} }) {
  return {
    ok,
    status,
    json: () => Promise.resolve(body),
    headers: { get: (name) => headers[name.toLowerCase()] ?? null },
  };
}

describe("lib/hmrcAgentAuthorisation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.HMRC_AGENT_AUTHORISATION_BASE_URI = "https://test-api.service.hmrc.gov.uk";
  });

  it("getAgentAuthorisationBaseUrl throws when the environment variable is missing", async () => {
    delete process.env.HMRC_AGENT_AUTHORISATION_BASE_URI;
    const { getAgentAuthorisationBaseUrl } = await import("@app/lib/hmrcAgentAuthorisation.js");
    expect(() => getAgentAuthorisationBaseUrl()).toThrow(/HMRC_AGENT_AUTHORISATION_BASE_URI/);
  });

  it("buildAgentAuthorisationHeaders carries the bearer token, accept version and Gov-Test-Scenario", async () => {
    const { buildAgentAuthorisationHeaders } = await import("@app/lib/hmrcAgentAuthorisation.js");
    const headers = buildAgentAuthorisationHeaders("token-123", { "Gov-Client-Device-ID": "dev" }, "SCENARIO");
    expect(headers.Authorization).toBe("Bearer token-123");
    expect(headers.Accept).toBe("application/vnd.hmrc.1.0+json");
    expect(headers["Gov-Client-Device-ID"]).toBe("dev");
    expect(headers["Gov-Test-Scenario"]).toBe("SCENARIO");
  });

  it("createInvitation posts to /agents/{arn}/invitations and reads the invitation id off the Location header", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(
      mockJsonResponse({ ok: true, status: 204, headers: { location: "/agents/TARN0000001/invitations/inv-1" } }),
    );
    vi.stubGlobal("fetch", mockFetch);

    const { createInvitation } = await import("@app/lib/hmrcAgentAuthorisation.js");
    const result = await createInvitation({
      arn: "TARN0000001",
      service: "MTD-VAT",
      clientIdType: "vrn",
      clientId: "123456789",
      knownFact: "2020-01-01",
      accessToken: "token-123",
      govClientHeaders: {},
    });

    expect(result.ok).toBe(true);
    expect(result.invitationId).toBe("inv-1");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test-api.service.hmrc.gov.uk/agents/TARN0000001/invitations");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      service: ["MTD-VAT"],
      clientType: "business",
      clientIdType: "vrn",
      clientId: "123456789",
      knownFact: "2020-01-01",
    });
  });

  it("createInvitation answers a null invitationId when HMRC sends no Location header", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(mockJsonResponse({ ok: true, status: 204 }));
    vi.stubGlobal("fetch", mockFetch);

    const { createInvitation } = await import("@app/lib/hmrcAgentAuthorisation.js");
    const result = await createInvitation({
      arn: "TARN0000001",
      service: "MTD-VAT",
      clientIdType: "vrn",
      clientId: "123456789",
      knownFact: "2020-01-01",
      accessToken: "token-123",
    });

    expect(result.invitationId).toBeNull();
  });

  it("getInvitationStatus reads the invitation's status", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(mockJsonResponse({ ok: true, status: 200, body: { status: "Accepted" } }));
    vi.stubGlobal("fetch", mockFetch);

    const { getInvitationStatus } = await import("@app/lib/hmrcAgentAuthorisation.js");
    const result = await getInvitationStatus({ arn: "TARN0000001", invitationId: "inv-1", accessToken: "token-123" });

    expect(result.ok).toBe(true);
    expect(result.data.status).toBe("Accepted");
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test-api.service.hmrc.gov.uk/agents/TARN0000001/invitations/inv-1");
    expect(init.method).toBe("GET");
  });

  it("cancelInvitation deletes the invitation", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(mockJsonResponse({ ok: true, status: 204 }));
    vi.stubGlobal("fetch", mockFetch);

    const { cancelInvitation } = await import("@app/lib/hmrcAgentAuthorisation.js");
    const result = await cancelInvitation({ arn: "TARN0000001", invitationId: "inv-1", accessToken: "token-123" });

    expect(result.ok).toBe(true);
    const [url, init] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test-api.service.hmrc.gov.uk/agents/TARN0000001/invitations/inv-1");
    expect(init.method).toBe("DELETE");
  });

  it("getRelationship builds the query string from service, clientIdType and clientId", async () => {
    const mockFetch = vi.fn().mockResolvedValueOnce(mockJsonResponse({ ok: true, status: 200, body: { authorisedRelationship: true } }));
    vi.stubGlobal("fetch", mockFetch);

    const { getRelationship } = await import("@app/lib/hmrcAgentAuthorisation.js");
    const result = await getRelationship({
      arn: "TARN0000001",
      service: "MTD-VAT",
      clientIdType: "vrn",
      clientId: "123456789",
      accessToken: "token-123",
    });

    expect(result.ok).toBe(true);
    const [url] = mockFetch.mock.calls[0];
    expect(url).toBe("https://test-api.service.hmrc.gov.uk/agents/TARN0000001/relationships?service=MTD-VAT&clientIdType=vrn&clientId=123456789");
  });

  it("agentAuthorisationErrorResponse maps a 404 to a not-found response", async () => {
    const { agentAuthorisationErrorResponse } = await import("@app/lib/hmrcAgentAuthorisation.js");
    const response = agentAuthorisationErrorResponse({}, { status: 404, data: {} }, {});
    expect(response.statusCode).toBe(404);
  });

  it("agentAuthorisationErrorResponse maps a 403 to a forbidden response", async () => {
    const { agentAuthorisationErrorResponse } = await import("@app/lib/hmrcAgentAuthorisation.js");
    const response = agentAuthorisationErrorResponse({}, { status: 403, data: {} }, {});
    expect(response.statusCode).toBe(403);
  });

  it("agentAuthorisationErrorResponse maps an unrecognised status to a server error response", async () => {
    const { agentAuthorisationErrorResponse } = await import("@app/lib/hmrcAgentAuthorisation.js");
    const response = agentAuthorisationErrorResponse({}, { status: 502, data: {} }, {});
    expect(response.statusCode).toBe(500);
  });
});
