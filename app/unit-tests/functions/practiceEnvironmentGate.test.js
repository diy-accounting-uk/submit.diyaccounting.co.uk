// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getUserBundles: vi.fn().mockResolvedValue([]),
  putBundle: vi.fn(),
  deleteBundle: vi.fn(),
}));
vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
  listClients: vi.fn().mockResolvedValue([]),
  getPracticeArn: vi.fn().mockResolvedValue(null),
}));
vi.mock("@app/lib/operators.js", () => ({
  isOperatorEmail: vi.fn().mockResolvedValue(false),
  isOperatorEmailLoaded: vi.fn().mockReturnValue(false),
  warmOperators: vi.fn().mockResolvedValue(undefined),
}));

const { ingestHandler: listHandler } = await import("../../functions/practice/practiceClientsListGet.js");
const { ingestHandler: getHandler } = await import("../../functions/practice/practiceClientGet.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

function listEvent() {
  return buildLambdaEvent({
    method: "GET",
    path: "/api/v1/practice/clients",
    authorizer: buildJwtAuthorizerContext("practice-sub"),
  });
}

describe("the practice API by environment", () => {
  const savedEnvironmentName = process.env.ENVIRONMENT_NAME;

  beforeEach(() => {
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
    _setTestSalt("test-salt");
  });

  afterEach(() => {
    if (savedEnvironmentName === undefined) delete process.env.ENVIRONMENT_NAME;
    else process.env.ENVIRONMENT_NAME = savedEnvironmentName;
  });

  test("answers 403 ACTIVITY_ENVIRONMENT_RESTRICTED in prod", async () => {
    process.env.ENVIRONMENT_NAME = "prod";

    const result = await listHandler(listEvent());

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "practice" });
  });

  test("answers 403 in prod for a client read", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    const event = buildLambdaEvent({
      method: "GET",
      path: "/api/v1/practice/clients/c1",
      authorizer: buildJwtAuthorizerContext("practice-sub"),
      pathParameters: { clientId: "c1" },
    });

    const result = await getHandler(event);

    expect(result.statusCode).toBe(403);
  });

  test("lets the request through in ci", async () => {
    process.env.ENVIRONMENT_NAME = "ci";

    const result = await listHandler(listEvent());

    expect(result.statusCode).toBe(200);
  });
});
