// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
  getPracticeArn: vi.fn(),
  setClientAuthorisation: vi.fn(),
}));

vi.mock("@app/lib/hmrcAgentAuthorisation.js", () => ({
  cancelInvitation: vi.fn(),
  agentAuthorisationErrorResponse: vi.fn(() => ({ statusCode: 500, body: JSON.stringify({ message: "mapped error" }) })),
}));

const { getClient, getPracticeArn, setClientAuthorisation } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { cancelInvitation, agentAuthorisationErrorResponse } = await import("@app/lib/hmrcAgentAuthorisation.js");
const { ingestHandler } = await import("../../functions/practice/practiceClientAuthorisationInviteDelete.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

function buildAuthenticatedEvent({ sub = "practice-sub", clientId = "c1", service = "MTD-VAT", accessToken = "hmrc-token" } = {}) {
  return buildLambdaEvent({
    method: "DELETE",
    path: `/api/v1/practice/clients/${clientId}/authorisation/invitations`,
    authorizer: buildJwtAuthorizerContext(sub),
    pathParameters: { clientId },
    queryStringParameters: service ? { service } : null,
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
}

describe("practiceClientAuthorisationInviteDelete", () => {
  beforeEach(() => {
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
    process.env.HMRC_AGENT_AUTHORISATION_BASE_URI = "https://test-api.service.hmrc.gov.uk";
    getClient.mockReset();
    getPracticeArn.mockReset();
    setClientAuthorisation.mockReset();
    cancelInvitation.mockReset();
    agentAuthorisationErrorResponse.mockClear();
    _setTestSalt("test-salt");
  });

  test("cancels a pending invitation", async () => {
    getClient.mockResolvedValue({
      clientId: "c1",
      archivedAt: null,
      authorisations: { "MTD-VAT": { status: "pending", invitationId: "inv-1" } },
    });
    getPracticeArn.mockResolvedValue("TARN0000001");
    cancelInvitation.mockResolvedValue({ ok: true, status: 204 });
    setClientAuthorisation.mockResolvedValue({ clientId: "c1" });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(cancelInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ arn: "TARN0000001", invitationId: "inv-1", accessToken: "hmrc-token" }),
    );
    expect(setClientAuthorisation).toHaveBeenCalledWith("practice-sub", "c1", "MTD-VAT", { status: "cancelled", invitationId: null });
  });

  test("answers 404 when there is no pending invitation for the service", async () => {
    getClient.mockResolvedValue({ clientId: "c1", archivedAt: null, authorisations: {} });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(404);
    expect(cancelInvitation).not.toHaveBeenCalled();
  });

  test("answers 404 for a client that does not belong to this practice", async () => {
    getClient.mockResolvedValue(null);

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(404);
    expect(cancelInvitation).not.toHaveBeenCalled();
  });

  test("rejects an unsupported service query parameter", async () => {
    const result = await ingestHandler(buildAuthenticatedEvent({ service: "MTD-CT" }));

    expect(result.statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });

  test("rejects a missing Authorization header", async () => {
    const result = await ingestHandler(buildAuthenticatedEvent({ accessToken: null }));

    expect(result.statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });

  test("maps a failed HMRC call through agentAuthorisationErrorResponse", async () => {
    getClient.mockResolvedValue({
      clientId: "c1",
      archivedAt: null,
      authorisations: { "MTD-VAT": { status: "pending", invitationId: "inv-1" } },
    });
    getPracticeArn.mockResolvedValue("TARN0000001");
    cancelInvitation.mockResolvedValue({ ok: false, status: 403, data: {} });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(agentAuthorisationErrorResponse).toHaveBeenCalled();
    expect(result.statusCode).toBe(500);
    expect(setClientAuthorisation).not.toHaveBeenCalled();
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({
      method: "DELETE",
      path: "/api/v1/practice/clients/c1/authorisation/invitations",
      authorizer: {},
      pathParameters: { clientId: "c1" },
      queryStringParameters: { service: "MTD-VAT" },
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
    expect(cancelInvitation).not.toHaveBeenCalled();
  });
});
