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
    gatewayTest: process.env.COMPANIES_HOUSE_GATEWAY_TEST,
    corporationTaxGatewayTest: process.env.HMRC_CT_GATEWAY_TEST,
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
      ["COMPANIES_HOUSE_GATEWAY_TEST", saved.gatewayTest],
      ["HMRC_CT_GATEWAY_TEST", saved.corporationTaxGatewayTest],
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

  test("a preview request for a Companies House XML gateway path runs only where the gateway is the test service", () => {
    const event = practiceEvent({ "x-preview-features": "on" });
    process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api-sandbox.company-information.service.gov.uk";

    for (const path of [
      "/api/v1/companies-house/accounts",
      "/api/v1/companies-house/accounts/render",
      "/api/v1/companies-house/confirmation-statement",
      "/api/v1/companies-house/psc-verification-statement",
      "/api/v1/companies-house/company/00000008/filing-data",
    ]) {
      process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
      expect(previewRunsAgainstSandbox(event, path), path).toBe(true);
      delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
      expect(previewRunsAgainstSandbox(event, path), path).toBe(false);
    }
  });

  test("a preview request for a Companies House REST path runs only where the filing API is the sandbox", () => {
    const event = practiceEvent({ "x-preview-features": "on" });
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";

    for (const path of ["/api/v1/companies-house/transaction", "/api/v1/companies-house/company/00000008/registered-office-address"]) {
      process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api-sandbox.company-information.service.gov.uk";
      expect(previewRunsAgainstSandbox(event, path), path).toBe(true);
      process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api.company-information.service.gov.uk";
      expect(previewRunsAgainstSandbox(event, path), path).toBe(false);
    }
  });

  test("a synthetic HMRC account does not let a preview request reach a live Companies House service", () => {
    const event = practiceEvent({ "x-preview-features": "on", "hmrcAccount": "synthetic" });
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
    process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api.company-information.service.gov.uk";

    expect(previewRunsAgainstSandbox(event, "/api/v1/companies-house/psc-verification-statement")).toBe(false);
    expect(previewRunsAgainstSandbox(event, "/api/v1/companies-house/transaction")).toBe(false);
    expect(previewRunsAgainstSandbox(event, "/api/v1/hmrc/ct/return")).toBe(true);
  });

  test.each([
    ["an XML gateway filing", "/api/v1/companies-house/accounts"],
    ["a REST filing", "/api/v1/companies-house/transaction"],
  ])(
    "enforceBundles refuses %s that the environment does not list, for a synthetic preview request on live Companies House services",
    async (_kind, path) => {
      process.env.ENVIRONMENT_NAME = "an-environment-that-lists-nothing";
      delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
      process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api.company-information.service.gov.uk";
      const event = buildLambdaEvent({
        method: "POST",
        path,
        headers: { "x-preview-features": "on", "hmrcAccount": "synthetic" },
        authorizer: buildJwtAuthorizerContext("preview-sub"),
      });

      await expect(enforceBundles(event)).rejects.toMatchObject({ details: { code: "ACTIVITY_ENVIRONMENT_RESTRICTED" } });
    },
  );

  test.each([
    ["an XML gateway filing on the gateway's test service", "/api/v1/companies-house/accounts", { COMPANIES_HOUSE_GATEWAY_TEST: "true" }],
    [
      "a REST filing on the sandbox filing API",
      "/api/v1/companies-house/transaction",
      { COMPANIES_HOUSE_FILING_BASE_URI: "https://api-sandbox.company-information.service.gov.uk" },
    ],
  ])("enforceBundles lets a preview request run %s that the environment does not list", async (_kind, path, settings) => {
    process.env.ENVIRONMENT_NAME = "an-environment-that-lists-nothing";
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
    process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api.company-information.service.gov.uk";
    Object.assign(process.env, settings);
    const event = buildLambdaEvent({
      method: "POST",
      path,
      headers: { "x-preview-features": "on" },
      authorizer: buildJwtAuthorizerContext("preview-sub"),
    });

    const outcome = await enforceBundles(event).catch((error) => error);
    expect(outcome?.details?.code).not.toBe("ACTIVITY_ENVIRONMENT_RESTRICTED");
  });

  test("a preview request for an HMRC path with no synthetic account does not run on the Companies House test service", () => {
    process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api-sandbox.company-information.service.gov.uk";

    expect(previewRunsAgainstSandbox(practiceEvent({ "x-preview-features": "on" }), "/api/v1/hmrc/itsa/business-details")).toBe(false);
  });

  test("a preview request with the synthetic HMRC account for a Corporation Tax path is refused while the Transaction Engine is the live service", async () => {
    process.env.HMRC_CT_GATEWAY_TEST = "false";
    const headers = { "x-preview-features": "on", "hmrcAccount": "synthetic" };

    for (const path of ["/api/v1/hmrc/ct/return", "/api/v1/hmrc/ct/return/preview", "/api/v1/hmrc/ct/return/abc-123"]) {
      expect(previewRunsAgainstSandbox(practiceEvent(headers), path), path).toBe(false);
    }
    delete process.env.HMRC_CT_GATEWAY_TEST;
    expect(previewRunsAgainstSandbox(practiceEvent(headers), "/api/v1/hmrc/ct/return")).toBe(false);
  });

  test("a preview request for a Corporation Tax path runs where the Transaction Engine is the test service", () => {
    process.env.HMRC_CT_GATEWAY_TEST = "true";

    for (const headers of [{ "x-preview-features": "on" }, { "x-preview-features": "on", "hmrcAccount": "synthetic" }]) {
      expect(previewRunsAgainstSandbox(practiceEvent(headers), "/api/v1/hmrc/ct/return")).toBe(true);
    }
    expect(previewRunsAgainstSandbox(practiceEvent({}), "/api/v1/hmrc/ct/return")).toBe(false);
  });

  test("the Corporation Tax test service does not admit other HMRC paths without the synthetic account", () => {
    process.env.HMRC_CT_GATEWAY_TEST = "true";

    expect(previewRunsAgainstSandbox(practiceEvent({ "x-preview-features": "on" }), "/api/v1/hmrc/itsa/business-details")).toBe(false);
  });
});
