// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  createClient: vi.fn(),
}));

const { createClient } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { ingestHandler } = await import("../../functions/practice/practiceClientsPost.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

function buildAuthenticatedEvent({ sub = "practice-sub", body } = {}) {
  return buildLambdaEvent({
    method: "POST",
    path: "/api/v1/practice/clients",
    authorizer: buildJwtAuthorizerContext(sub),
    body,
  });
}

describe("practiceClientsPost", () => {
  beforeEach(() => {
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
    createClient.mockReset();
    _setTestSalt("test-salt");
  });

  test("creates a client from a minimal valid body", async () => {
    createClient.mockResolvedValue({ clientId: "c1", displayName: "Acme Ltd" });

    const result = await ingestHandler(buildAuthenticatedEvent({ body: { displayName: "Acme Ltd" } }));

    expect(result.statusCode).toBe(201);
    expect(JSON.parse(result.body)).toEqual({ client: { clientId: "c1", displayName: "Acme Ltd" } });
    expect(createClient).toHaveBeenCalledWith("practice-sub", {
      displayName: "Acme Ltd",
      vrn: undefined,
      nino: undefined,
      utr: undefined,
      companyNumber: undefined,
    });
  });

  test("passes through valid identifiers", async () => {
    createClient.mockResolvedValue({ clientId: "c1" });

    await ingestHandler(
      buildAuthenticatedEvent({
        body: { displayName: "Acme Ltd", vrn: "123456789", nino: "AB123456C", utr: "1234567890", companyNumber: "12345678" },
      }),
    );

    expect(createClient).toHaveBeenCalledWith("practice-sub", {
      displayName: "Acme Ltd",
      vrn: "123456789",
      nino: "AB123456C",
      utr: "1234567890",
      companyNumber: "12345678",
    });
  });

  test("rejects a missing displayName", async () => {
    const result = await ingestHandler(buildAuthenticatedEvent({ body: {} }));

    expect(result.statusCode).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  test("rejects an invalid VRN", async () => {
    const result = await ingestHandler(buildAuthenticatedEvent({ body: { displayName: "Acme Ltd", vrn: "not-a-vrn" } }));

    expect(result.statusCode).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  test("rejects an invalid UTR", async () => {
    const result = await ingestHandler(buildAuthenticatedEvent({ body: { displayName: "Acme Ltd", utr: "123" } }));

    expect(result.statusCode).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  test("rejects an invalid company number", async () => {
    const result = await ingestHandler(
      buildAuthenticatedEvent({ body: { displayName: "Acme Ltd", companyNumber: "not-valid!" } }),
    );

    expect(result.statusCode).toBe(400);
    expect(createClient).not.toHaveBeenCalled();
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({
      method: "POST",
      path: "/api/v1/practice/clients",
      authorizer: {},
      body: { displayName: "Acme Ltd" },
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
    expect(createClient).not.toHaveBeenCalled();
  });
});
