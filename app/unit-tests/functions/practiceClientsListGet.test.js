// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

vi.mock("@app/services/bundleManagement.js", async (importOriginal) => ({
  ...(await importOriginal()),
  enforceBundles: vi.fn().mockResolvedValue({ userSub: "practice-sub", bundleIds: ["default"], client: null }),
}));

vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  listClients: vi.fn(),
  getPracticeArn: vi.fn(),
}));

vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: vi.fn(),
}));

const { listClients, getPracticeArn } = await import("@app/data/dynamoDbPracticeClientRepository.js");
const { getUserBundles } = await import("@app/data/dynamoDbBundleRepository.js");
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
    getPracticeArn.mockReset();
    getPracticeArn.mockResolvedValue(null);
    getUserBundles.mockReset();
    getUserBundles.mockResolvedValue([]);
    _setTestSalt("test-salt");
  });

  test("lists the caller's own clients", async () => {
    listClients.mockResolvedValue([{ clientId: "c1", displayName: "Acme Ltd" }]);

    const result = await ingestHandler(buildAuthenticatedEvent({ sub: "practice-sub" }));

    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({
      clients: [{ clientId: "c1", displayName: "Acme Ltd" }],
      arnOnFile: false,
      licence: { held: false },
    });
    expect(listClients).toHaveBeenCalledWith("practice-sub");
  });

  test.each([
    ["an active resident-pro subscription", [{ bundleId: "resident-pro", subscriptionStatus: "active" }]],
    ["a resident-pro-comp pass", [{ bundleId: "resident-pro-comp" }]],
  ])("reports the licence as held for %s", async (_name, bundles) => {
    listClients.mockResolvedValue([]);
    getUserBundles.mockResolvedValue(bundles);

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(JSON.parse(result.body).licence).toEqual({ held: true });
  });

  test("reports the licence as not held for a lapsed resident-pro subscription", async () => {
    listClients.mockResolvedValue([]);
    getUserBundles.mockResolvedValue([{ bundleId: "resident-pro", subscriptionStatus: "cancelled" }]);

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(JSON.parse(result.body).licence).toEqual({ held: false });
  });

  test("reports that an agent reference number is on file", async () => {
    listClients.mockResolvedValue([]);
    getPracticeArn.mockResolvedValue("AARN1234567");

    const result = await ingestHandler(buildAuthenticatedEvent({}));

    expect(JSON.parse(result.body).arnOnFile).toBe(true);
  });

  test("lists only archived clients when asked", async () => {
    listClients.mockResolvedValue([
      { clientId: "c1", displayName: "Live Ltd", archivedAt: null },
      { clientId: "c2", displayName: "Old Ltd", archivedAt: "2026-01-01T00:00:00.000Z" },
    ]);
    const event = { ...buildAuthenticatedEvent({}), queryStringParameters: { archived: "true" } };

    const result = await ingestHandler(event);

    expect(JSON.parse(result.body).clients.map((c) => c.clientId)).toEqual(["c2"]);
    expect(listClients).toHaveBeenCalledWith("practice-sub", { includeArchived: true });
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
