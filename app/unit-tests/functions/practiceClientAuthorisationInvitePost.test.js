// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
  getPracticeArn: vi.fn(),
  setPracticeArn: vi.fn(),
  setClientAuthorisation: vi.fn(),
}));

vi.mock("@app/lib/hmrcAgentAuthorisation.js", () => ({
  createInvitation: vi.fn(),
  agentAuthorisationErrorResponse: vi.fn(() => ({ statusCode: 500, body: JSON.stringify({ message: "mapped error" }) })),
}));

const { getClient, getPracticeArn, setPracticeArn, setClientAuthorisation } = await import(
  "@app/data/dynamoDbPracticeClientRepository.js"
);
const { createInvitation, agentAuthorisationErrorResponse } = await import("@app/lib/hmrcAgentAuthorisation.js");
const { ingestHandler } = await import("../../functions/practice/practiceClientAuthorisationInvitePost.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

function buildAuthenticatedEvent({ sub = "practice-sub", clientId = "c1", body } = {}) {
  return buildLambdaEvent({
    method: "POST",
    path: `/api/v1/practice/clients/${clientId}/authorisation/invitations`,
    authorizer: buildJwtAuthorizerContext(sub),
    pathParameters: { clientId },
    body,
  });
}

describe("practiceClientAuthorisationInvitePost", () => {
  beforeEach(() => {
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
    process.env.HMRC_AGENT_AUTHORISATION_BASE_URI = "https://test-api.service.hmrc.gov.uk";
    getClient.mockReset();
    getPracticeArn.mockReset();
    setPracticeArn.mockReset();
    setClientAuthorisation.mockReset();
    createInvitation.mockReset();
    agentAuthorisationErrorResponse.mockClear();
    _setTestSalt("test-salt");
  });

  test("invites a client using the practice's stored ARN", async () => {
    getClient.mockResolvedValue({ clientId: "c1", identifiers: { vrn: "123456789" }, archivedAt: null });
    getPracticeArn.mockResolvedValue("TARN0000001");
    createInvitation.mockResolvedValue({ ok: true, status: 204, invitationId: "inv-1" });
    setClientAuthorisation.mockResolvedValue({ clientId: "c1", authorisations: { "MTD-VAT": { status: "pending", invitationId: "inv-1" } } });

    const result = await ingestHandler(
      buildAuthenticatedEvent({ body: { service: "MTD-VAT", knownFact: "2020-01-01", accessToken: "hmrc-token" } }),
    );

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toMatchObject({ invitationId: "inv-1", status: "pending" });
    expect(createInvitation).toHaveBeenCalledWith(
      expect.objectContaining({ arn: "TARN0000001", service: "MTD-VAT", clientIdType: "vrn", clientId: "123456789", knownFact: "2020-01-01" }),
    );
    expect(setPracticeArn).not.toHaveBeenCalled();
    expect(setClientAuthorisation).toHaveBeenCalledWith("practice-sub", "c1", "MTD-VAT", { status: "pending", invitationId: "inv-1" });
  });

  test("stores a newly supplied ARN before inviting", async () => {
    getClient.mockResolvedValue({ clientId: "c1", identifiers: { vrn: "123456789" }, archivedAt: null });
    createInvitation.mockResolvedValue({ ok: true, status: 204, invitationId: "inv-1" });
    setClientAuthorisation.mockResolvedValue({ clientId: "c1" });

    await ingestHandler(
      buildAuthenticatedEvent({
        body: { service: "MTD-VAT", knownFact: "2020-01-01", accessToken: "hmrc-token", arn: "TARN0000002" },
      }),
    );

    expect(setPracticeArn).toHaveBeenCalledWith("practice-sub", "TARN0000002");
    expect(getPracticeArn).not.toHaveBeenCalled();
    expect(createInvitation).toHaveBeenCalledWith(expect.objectContaining({ arn: "TARN0000002" }));
  });

  test("rejects an unsupported service", async () => {
    const result = await ingestHandler(
      buildAuthenticatedEvent({ body: { service: "MTD-CT", knownFact: "2020-01-01", accessToken: "hmrc-token" } }),
    );

    expect(result.statusCode).toBe(400);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test("rejects a missing knownFact", async () => {
    const result = await ingestHandler(buildAuthenticatedEvent({ body: { service: "MTD-VAT", accessToken: "hmrc-token" } }));

    expect(result.statusCode).toBe(400);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test("rejects a missing accessToken", async () => {
    const result = await ingestHandler(buildAuthenticatedEvent({ body: { service: "MTD-VAT", knownFact: "2020-01-01" } }));

    expect(result.statusCode).toBe(400);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test("answers 404 for a client that does not belong to this practice", async () => {
    getClient.mockResolvedValue(null);

    const result = await ingestHandler(
      buildAuthenticatedEvent({ body: { service: "MTD-VAT", knownFact: "2020-01-01", accessToken: "hmrc-token" } }),
    );

    expect(result.statusCode).toBe(404);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test("answers 404 for an archived client", async () => {
    getClient.mockResolvedValue({ clientId: "c1", identifiers: { vrn: "123456789" }, archivedAt: "2026-01-01T00:00:00.000Z" });

    const result = await ingestHandler(
      buildAuthenticatedEvent({ body: { service: "MTD-VAT", knownFact: "2020-01-01", accessToken: "hmrc-token" } }),
    );

    expect(result.statusCode).toBe(404);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test("rejects a client with no vrn on file for MTD-VAT", async () => {
    getClient.mockResolvedValue({ clientId: "c1", identifiers: {}, archivedAt: null });
    getPracticeArn.mockResolvedValue("TARN0000001");

    const result = await ingestHandler(
      buildAuthenticatedEvent({ body: { service: "MTD-VAT", knownFact: "2020-01-01", accessToken: "hmrc-token" } }),
    );

    expect(result.statusCode).toBe(400);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test("rejects when the practice has no ARN stored or supplied", async () => {
    getClient.mockResolvedValue({ clientId: "c1", identifiers: { vrn: "123456789" }, archivedAt: null });
    getPracticeArn.mockResolvedValue(null);

    const result = await ingestHandler(
      buildAuthenticatedEvent({ body: { service: "MTD-VAT", knownFact: "2020-01-01", accessToken: "hmrc-token" } }),
    );

    expect(result.statusCode).toBe(400);
    expect(createInvitation).not.toHaveBeenCalled();
  });

  test("maps a failed HMRC call through agentAuthorisationErrorResponse", async () => {
    getClient.mockResolvedValue({ clientId: "c1", identifiers: { vrn: "123456789" }, archivedAt: null });
    getPracticeArn.mockResolvedValue("TARN0000001");
    createInvitation.mockResolvedValue({ ok: false, status: 403, data: {} });

    const result = await ingestHandler(
      buildAuthenticatedEvent({ body: { service: "MTD-VAT", knownFact: "2020-01-01", accessToken: "hmrc-token" } }),
    );

    expect(agentAuthorisationErrorResponse).toHaveBeenCalled();
    expect(result.statusCode).toBe(500);
    expect(setClientAuthorisation).not.toHaveBeenCalled();
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/practice/clients/c1/authorisation/invitations",
      authorizer: {},
      pathParameters: { clientId: "c1" },
      body: { service: "MTD-VAT", knownFact: "2020-01-01", accessToken: "hmrc-token" },
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
    expect(createInvitation).not.toHaveBeenCalled();
  });
});
