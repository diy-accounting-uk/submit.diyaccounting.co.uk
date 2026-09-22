// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  archiveClient: vi.fn(),
}));

const { archiveClient } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { ingestHandler } = await import("../../functions/practice/practiceClientDelete.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

function buildAuthenticatedEvent({ sub = "practice-sub", clientId = "c1" } = {}) {
  return buildLambdaEvent({
    method: "DELETE",
    path: `/api/v1/practice/clients/${clientId}`,
    authorizer: buildJwtAuthorizerContext(sub),
    pathParameters: { clientId },
  });
}

describe("practiceClientDelete", () => {
  beforeEach(() => {
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
    archiveClient.mockReset();
    _setTestSalt("test-salt");
  });

  test("archives a client owned by the caller", async () => {
    archiveClient.mockResolvedValue({ clientId: "c1", archivedAt: "2026-09-22T00:00:00.000Z" });

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ client: { clientId: "c1", archivedAt: "2026-09-22T00:00:00.000Z" } });
    expect(archiveClient).toHaveBeenCalledWith("practice-sub", "c1");
  });

  test("answers 404 for a client id belonging to another practice", async () => {
    const conditionalError = new Error("row not found");
    conditionalError.name = "ConditionalCheckFailedException";
    archiveClient.mockRejectedValue(conditionalError);

    const result = await ingestHandler(buildAuthenticatedEvent({ clientId: "not-mine" }));

    expect(result.statusCode).toBe(404);
  });

  test("rejects an unauthenticated call", async () => {
    const event = buildLambdaEvent({
      method: "DELETE",
      path: "/api/v1/practice/clients/c1",
      authorizer: {},
      pathParameters: { clientId: "c1" },
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(401);
    expect(archiveClient).not.toHaveBeenCalled();
  });

  test("rejects a missing clientId path parameter", async () => {
    const event = buildLambdaEvent({
      method: "DELETE",
      path: "/api/v1/practice/clients/",
      authorizer: buildJwtAuthorizerContext("practice-sub"),
    });

    const result = await ingestHandler(event);

    expect(result.statusCode).toBe(400);
    expect(archiveClient).not.toHaveBeenCalled();
  });
});
