// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  listClients: vi.fn(),
}));

const { listClients } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { ingestHandler } = await import("../../functions/practice/practiceClientsListGet.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

function buildAuthenticatedEvent({ sub = "practice-sub" } = {}) {
  return buildLambdaEvent({
    method: "GET",
    path: "/api/v1/practice/clients",
    authorizer: buildJwtAuthorizerContext(sub),
  });
}

describe("practiceClientsListGet", () => {
  beforeEach(() => {
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
    listClients.mockReset();
    _setTestSalt("test-salt");
  });

  test("lists the caller's own clients", async () => {
    listClients.mockResolvedValue([{ clientId: "c1", displayName: "Acme Ltd" }]);

    const result = await ingestHandler(buildAuthenticatedEvent({ sub: "practice-sub" }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ clients: [{ clientId: "c1", displayName: "Acme Ltd" }] });
    expect(listClients).toHaveBeenCalledWith("practice-sub");
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({ method: "GET", path: "/api/v1/practice/clients", authorizer: {} });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
    expect(listClients).not.toHaveBeenCalled();
  });

  test("answers 500 when the repository fails", async () => {
    listClients.mockRejectedValue(new Error("table unavailable"));

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(500);
  });
});
