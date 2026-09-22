// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
}));

const { getClient } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { ingestHandler } = await import("../../functions/practice/practiceClientGet.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

function buildAuthenticatedEvent({ sub = "practice-sub", clientId = "c1" } = {}) {
  return buildLambdaEvent({
    method: "GET",
    path: `/api/v1/practice/clients/${clientId}`,
    authorizer: buildJwtAuthorizerContext(sub),
    pathParameters: { clientId },
  });
}

describe("practiceClientGet", () => {
  beforeEach(() => {
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
    getClient.mockReset();
    _setTestSalt("test-salt");
  });

  test("reads a client owned by the caller", async () => {
    getClient.mockResolvedValue({ clientId: "c1", displayName: "Acme Ltd" });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ client: { clientId: "c1", displayName: "Acme Ltd" } });
    expect(getClient).toHaveBeenCalledWith("practice-sub", "c1");
  });

  test("answers 404 for a client id belonging to another practice", async () => {
    getClient.mockResolvedValue(null);

    const result = await ingestHandler(buildAuthenticatedEvent({ clientId: "not-mine" }));

    expect(result.statusCode).toBe(404);
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/practice/clients/c1",
      authorizer: {},
      pathParameters: { clientId: "c1" },
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
    expect(getClient).not.toHaveBeenCalled();
  });

  test("rejects a missing clientId path parameter", async () => {
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/practice/clients/",
      authorizer: buildJwtAuthorizerContext("practice-sub"),
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(400);
    expect(getClient).not.toHaveBeenCalled();
  });
});
