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
  getInvitationStatus: vi.fn(),
  getRelationship: vi.fn(),
  agentAuthorisationErrorResponse: vi.fn(() => ({ statusCode: 500, body: JSON.stringify({ message: "mapped error" }) })),
}));

const { getClient, getPracticeArn, setClientAuthorisation } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { getInvitationStatus, getRelationship, agentAuthorisationErrorResponse } = await import("@app/lib/hmrcAgentAuthorisation.js");
const { ingestHandler } = await import("../../functions/practice/practiceClientAuthorisationGet.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

function buildAuthenticatedEvent({ sub = "practice-sub", clientId = "c1", service = "MTD-VAT", accessToken = "hmrc-token" } = {}) {
  return buildLambdaEvent({
    method: "GET",
    path: `/api/v1/practice/clients/${clientId}/authorisation`,
    authorizer: buildJwtAuthorizerContext(sub),
    pathParameters: { clientId },
    queryStringParameters: service ? { service } : null,
    headers: accessToken ? { authorization: `Bearer ${accessToken}` } : {},
  });
}

describe("practiceClientAuthorisationGet", () => {
  beforeEach(() => {
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
    process.env.HMRC_AGENT_AUTHORISATION_BASE_URI = "https://test-api.service.hmrc.gov.uk";
    getClient.mockReset();
    getPracticeArn.mockReset();
    setClientAuthorisation.mockReset();
    getInvitationStatus.mockReset();
    getRelationship.mockReset();
    agentAuthorisationErrorResponse.mockClear();
    _setTestSalt("test-salt");
  });

  test("re-reads a pending invitation's status from HMRC", async () => {
    getClient.mockResolvedValue({
      clientId: "c1",
      identifiers: { vrn: "123456789" },
      archivedAt: null,
      authorisations: { "MTD-VAT": { status: "pending", invitationId: "inv-1" } },
    });
    getPracticeArn.mockResolvedValue("TARN0000001");
    getInvitationStatus.mockResolvedValue({ ok: true, status: 200, data: { status: "Accepted" } });
    setClientAuthorisation.mockResolvedValue({ clientId: "c1" });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ status: "accepted", invitationId: "inv-1" });
    expect(getInvitationStatus).toHaveBeenCalledWith(
      expect.objectContaining({ arn: "TARN0000001", invitationId: "inv-1", accessToken: "hmrc-token" }),
    );
    expect(getRelationship).not.toHaveBeenCalled();
  });

  test("checks HMRC's relationships endpoint when no invitation is on file", async () => {
    getClient.mockResolvedValue({ clientId: "c1", identifiers: { vrn: "123456789" }, archivedAt: null, authorisations: {} });
    getPracticeArn.mockResolvedValue("TARN0000001");
    getRelationship.mockResolvedValue({ ok: true, status: 200, data: { authorisedRelationship: true } });
    setClientAuthorisation.mockResolvedValue({ clientId: "c1" });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ status: "authorised" });
    expect(getRelationship).toHaveBeenCalledWith(
      expect.objectContaining({ arn: "TARN0000001", service: "MTD-VAT", clientIdType: "vrn", clientId: "123456789" }),
    );
  });

  test("reads unauthorised when HMRC answers no relationship", async () => {
    getClient.mockResolvedValue({ clientId: "c1", identifiers: { vrn: "123456789" }, archivedAt: null, authorisations: {} });
    getPracticeArn.mockResolvedValue("TARN0000001");
    getRelationship.mockResolvedValue({ ok: false, status: 404, data: {} });
    setClientAuthorisation.mockResolvedValue({ clientId: "c1" });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toMatchObject({ status: "unauthorised" });
    expect(agentAuthorisationErrorResponse).not.toHaveBeenCalled();
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

  test("answers 404 for a client that does not belong to this practice", async () => {
    getClient.mockResolvedValue(null);

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(404);
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/practice/clients/c1/authorisation",
      authorizer: {},
      pathParameters: { clientId: "c1" },
      queryStringParameters: { service: "MTD-VAT" },
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
    expect(getClient).not.toHaveBeenCalled();
  });
});
