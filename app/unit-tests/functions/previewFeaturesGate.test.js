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
const { enforceBundles, BundleEntitlementError } = await import("../../services/bundleManagement.js");
const { previewRunsAgainstSandbox } = await import("../../lib/previewFeatures.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

function practiceEvent(headers = {}) {
  return buildLambdaEvent({
    method: "GET",
    path: "/api/v1/practice/clients",
    headers,
    authorizer: buildJwtAuthorizerContext("preview-sub"),
  });
}

describe("preview features against the environment gate", () => {
  const saved = {
    environmentName: process.env.ENVIRONMENT_NAME,
    filingBaseUri: process.env.COMPANIES_HOUSE_FILING_BASE_URI,
  };

  beforeEach(() => {
    process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = "test-practice-clients-table";
    process.env.ENVIRONMENT_NAME = "prod";
    _setTestSalt("test-salt");
  });

  afterEach(() => {
    for (const [name, value] of [
      ["ENVIRONMENT_NAME", saved.environmentName],
      ["COMPANIES_HOUSE_FILING_BASE_URI", saved.filingBaseUri],
    ]) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  test("a preview request against the synthetic HMRC account runs a hidden activity", async () => {
    const result = await listHandler(practiceEvent({ "x-preview-features": "on", "hmrcAccount": "synthetic" }));

    expect(result.statusCode).toBe(200);
  });

  test("a preview request against the live HMRC account is refused", async () => {
    const result = await listHandler(practiceEvent({ "x-preview-features": "on", "hmrcAccount": "live" }));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "practice" });
  });

  test("a preview request with no HMRC account is refused", async () => {
    const result = await listHandler(practiceEvent({ "x-preview-features": "on" }));

    expect(result.statusCode).toBe(403);
  });

  test("a synthetic request without the preview header is refused", async () => {
    const result = await listHandler(practiceEvent({ hmrcAccount: "synthetic" }));

    expect(result.statusCode).toBe(403);
    expect(JSON.parse(result.body)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED" });
  });

  test("enforceBundles throws the environment restriction for a live preview request", async () => {
    const event = practiceEvent({ "x-preview-features": "on", "hmrcAccount": "live" });

    await expect(enforceBundles(event)).rejects.toBeInstanceOf(BundleEntitlementError);
  });

  test("a preview request for a Companies House path runs only where the filing service is the test service", () => {
    const event = practiceEvent({ "x-preview-features": "on" });
    const path = "/api/v1/companies-house/accounts/render";

    process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api-sandbox.company-information.service.gov.uk";
    expect(previewRunsAgainstSandbox(event, path)).toBe(true);

    process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api.company-information.service.gov.uk";
    expect(previewRunsAgainstSandbox(event, path)).toBe(false);
  });

  test("a preview request for an HMRC path with no synthetic account does not run on the Companies House test service", () => {
    process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api-sandbox.company-information.service.gov.uk";

    expect(previewRunsAgainstSandbox(practiceEvent({ "x-preview-features": "on" }), "/api/v1/hmrc/itsa/business-details")).toBe(false);
  });
});
