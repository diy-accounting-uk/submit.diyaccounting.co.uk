// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/operatorPreview.test.js

import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import { buildJwtAuthorizerContext, buildLambdaEvent } from "../../test-helpers/eventBuilders.js";

const mockGetAccountSettings = vi.fn();
const mockGetUserBundles = vi.fn();
const mockIsOperatorEmail = vi.fn();

vi.mock("@app/data/dynamoDbBundleRepository.js", () => ({
  getAccountSettings: (...args) => mockGetAccountSettings(...args),
  getUserBundles: (...args) => mockGetUserBundles(...args),
  putBundle: vi.fn(),
  deleteBundle: vi.fn(),
}));
vi.mock("@app/data/dynamoDbPracticeClientRepository.js", () => ({
  getClient: vi.fn(),
}));
vi.mock("@app/lib/operators.js", () => ({
  isOperatorEmail: (...args) => mockIsOperatorEmail(...args),
  isOperatorEmailLoaded: vi.fn().mockReturnValue(false),
  warmOperators: vi.fn().mockResolvedValue(undefined),
}));

const { operatorPreviewPasses, opensByOperatorPreview } = await import("../../lib/previewFeatures.js");
const { enforceBundles, BundleEntitlementError } = await import("../../services/bundleManagement.js");
const { refuseJointFilingWhenNotEnabled, refuseJointFilingIdOnAccountsWhenNotOpen, enforceCtBundles } =
  await import("../../services/ctClientScope.js");
const { loadCatalogFromRoot } = await import("../../services/productCatalog.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

const OPERATOR = { sub: "operator-sub", email: "operator@example.com" };
const catalogue = loadCatalogFromRoot();
const activity = (id) => catalogue.activities.find((candidate) => candidate.id === id);
const TAX_RETURN = activity("file-company-tax-return");
const JOINT_FILING = activity("file-company-tax-return-with-accounts");

function storedPreviewFeatures(on) {
  mockGetAccountSettings.mockResolvedValue(on === undefined ? {} : { previewFeatures: on });
}

function holds(...bundleIds) {
  mockGetUserBundles.mockResolvedValue(bundleIds.map((bundleId) => ({ bundleId })));
}

function ctEvent({ headers = {}, path = "/api/v1/hmrc/ct/return", method = "POST", sub = OPERATOR.sub } = {}) {
  return buildLambdaEvent({ method, path, headers, authorizer: buildJwtAuthorizerContext(sub, "operator", OPERATOR.email) });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsOperatorEmail.mockImplementation(async (email) => email === OPERATOR.email);
  storedPreviewFeatures(true);
  holds("resident-ltd");
  _setTestSalt("test-salt");
});

describe("an activity the catalogue opens to an operator's own preview", () => {
  test("the Company Tax Return and the joint filing open on prod and nowhere else", () => {
    for (const entry of [TAX_RETURN, JOINT_FILING]) {
      expect(opensByOperatorPreview(entry, "prod")).toBe(true);
      expect(opensByOperatorPreview(entry, "ci")).toBe(false);
    }
    expect(opensByOperatorPreview(activity("practice"), "prod")).toBe(false);
  });
});

describe("operatorPreviewPasses", () => {
  test("passes on prod for an operator whose stored preview features setting is on", async () => {
    expect(await operatorPreviewPasses(TAX_RETURN, "prod", OPERATOR)).toBe(true);
    expect(mockGetAccountSettings).toHaveBeenCalledWith(OPERATOR.sub);
  });

  test("refuses where the catalogue does not open the activity to an operator's preview", async () => {
    expect(await operatorPreviewPasses(TAX_RETURN, "ci", OPERATOR)).toBe(false);
    expect(await operatorPreviewPasses(activity("practice"), "prod", OPERATOR)).toBe(false);
    expect(mockGetAccountSettings).not.toHaveBeenCalled();
  });

  test("refuses a user whose email is not on the operator list, without reading the settings", async () => {
    expect(await operatorPreviewPasses(TAX_RETURN, "prod", { sub: "customer-sub", email: "customer@example.com" })).toBe(false);
    expect(mockGetAccountSettings).not.toHaveBeenCalled();
  });

  test.each([[false], [undefined], ["on"]])("refuses an operator whose stored preview features setting is %j", async (stored) => {
    mockGetAccountSettings.mockResolvedValue(stored === undefined ? {} : { previewFeatures: stored });
    expect(await operatorPreviewPasses(TAX_RETURN, "prod", OPERATOR)).toBe(false);
  });

  test("refuses claims with no sub", async () => {
    expect(await operatorPreviewPasses(TAX_RETURN, "prod", { email: OPERATOR.email })).toBe(false);
    expect(await operatorPreviewPasses(TAX_RETURN, "prod", null)).toBe(false);
  });

  test("a failed read of the stored settings rejects and never passes", async () => {
    mockGetAccountSettings.mockRejectedValue(new Error("table unavailable"));
    await expect(operatorPreviewPasses(TAX_RETURN, "prod", OPERATOR)).rejects.toThrow("table unavailable");
  });
});

describe("the Company Tax Return routes on prod", () => {
  const savedEnvironmentName = process.env.ENVIRONMENT_NAME;

  beforeEach(() => {
    process.env.ENVIRONMENT_NAME = "prod";
  });

  afterEach(() => {
    if (savedEnvironmentName === undefined) delete process.env.ENVIRONMENT_NAME;
    else process.env.ENVIRONMENT_NAME = savedEnvironmentName;
  });

  test("an operator with stored preview features on and resident-ltd reaches the return route", async () => {
    const result = await enforceBundles(ctEvent());
    expect(result.bundleIds).toEqual(["resident-ltd"]);
  });

  test("an operator who holds resident-ltd through an aggregate reaches the return route", async () => {
    holds("resident-pro");
    const result = await enforceBundles(ctEvent());
    expect(result.bundleIds).toEqual(["resident-pro"]);
  });

  test("an operator with stored preview features on and no bundle that includes resident-ltd is refused for the bundle", async () => {
    holds();
    await expect(enforceBundles(ctEvent())).rejects.toMatchObject({ details: { code: "BUNDLE_FORBIDDEN" } });
  });

  test("the preview header with no stored setting is refused for the environment", async () => {
    storedPreviewFeatures(undefined);
    const error = await enforceBundles(ctEvent({ headers: { "x-preview-features": "on", "hmrcAccount": "synthetic" } })).catch((e) => e);
    expect(error).toBeInstanceOf(BundleEntitlementError);
    expect(error.details).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "file-company-tax-return" });
  });

  test("a customer with stored preview features on is refused for the environment", async () => {
    mockIsOperatorEmail.mockResolvedValue(false);
    await expect(enforceBundles(ctEvent())).rejects.toMatchObject({ details: { code: "ACTIVITY_ENVIRONMENT_RESTRICTED" } });
  });

  test("a client-scoped return from that operator is still refused, because agent filing stays off prod", async () => {
    const event = ctEvent();
    const { refusal } = await enforceCtBundles(event, { pathname: "/api/v1/hmrc/ct/return" }, "client-1");
    expect(JSON.parse(refusal.body)).toMatchObject({ code: "CLIENT_SCOPE_ENVIRONMENT_RESTRICTED" });
  });

  test("a return that carries a joint filing id goes on for that operator", async () => {
    const event = ctEvent();
    expect(await refuseJointFilingWhenNotEnabled(event, { pathname: "/api/v1/hmrc/ct/return" }, true, ["resident-ltd"])).toBeUndefined();
  });

  test("a return that carries a joint filing id is refused for a customer and for the header alone", async () => {
    mockIsOperatorEmail.mockResolvedValue(false);
    const customer = await refuseJointFilingWhenNotEnabled(ctEvent(), { pathname: "/api/v1/hmrc/ct/return" }, true, ["resident-ltd"]);
    expect(JSON.parse(customer.body)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED" });

    mockIsOperatorEmail.mockImplementation(async (email) => email === OPERATOR.email);
    storedPreviewFeatures(false);
    const headerOnly = await refuseJointFilingWhenNotEnabled(
      ctEvent({ headers: { "x-preview-features": "on", "hmrcAccount": "synthetic" } }),
      { pathname: "/api/v1/hmrc/ct/return" },
      true,
      ["resident-ltd"],
    );
    expect(JSON.parse(headerOnly.body)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED" });
  });

  test("accounts that carry a joint filing id go on for that operator and are refused for a customer", async () => {
    const accountsEvent = () => ctEvent({ path: "/api/v1/companies-house/accounts" });
    expect(
      await refuseJointFilingIdOnAccountsWhenNotOpen(accountsEvent(), { pathname: "/api/v1/companies-house/accounts" }, true),
    ).toBeUndefined();

    mockIsOperatorEmail.mockResolvedValue(false);
    const refusal = await refuseJointFilingIdOnAccountsWhenNotOpen(accountsEvent(), { pathname: "/api/v1/companies-house/accounts" }, true);
    expect(refusal.statusCode).toBe(403);
    expect(JSON.parse(refusal.body)).toMatchObject({
      code: "ACTIVITY_ENVIRONMENT_RESTRICTED",
      activityId: "file-company-tax-return-with-accounts",
    });
  });
});

describe("the Company Tax Return routes on ci", () => {
  const savedEnvironmentName = process.env.ENVIRONMENT_NAME;

  beforeEach(() => {
    process.env.ENVIRONMENT_NAME = "ci";
  });

  afterEach(() => {
    if (savedEnvironmentName === undefined) delete process.env.ENVIRONMENT_NAME;
    else process.env.ENVIRONMENT_NAME = savedEnvironmentName;
  });

  test("a customer with no stored setting reaches the return route, which ci lists, and nothing reads the settings", async () => {
    mockIsOperatorEmail.mockResolvedValue(false);
    storedPreviewFeatures(undefined);
    const result = await enforceBundles(ctEvent());
    expect(result.bundleIds).toEqual(["resident-ltd"]);
    expect(mockGetAccountSettings).not.toHaveBeenCalled();
  });
});
