// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companyTaxReturnRoutes.test.js

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

const { enforceBundles } = await import("../../services/bundleManagement.js");
const { refuseJointFilingWhenNotEnabled, refuseJointFilingIdOnAccountsWhenNotOpen, enforceCtBundles } =
  await import("../../services/ctClientScope.js");
const { _setTestSalt } = await import("../../services/subHasher.js");

const CUSTOMER = { sub: "customer-sub", email: "customer@example.com" };

function holds(...bundleIds) {
  mockGetUserBundles.mockResolvedValue(bundleIds.map((bundleId) => ({ bundleId })));
}

function ctEvent({ path = "/api/v1/hmrc/ct/return", method = "POST" } = {}) {
  return buildLambdaEvent({ method, path, authorizer: buildJwtAuthorizerContext(CUSTOMER.sub, "customer", CUSTOMER.email) });
}

function inEnvironment(name) {
  const saved = process.env.ENVIRONMENT_NAME;
  beforeEach(() => {
    process.env.ENVIRONMENT_NAME = name;
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.ENVIRONMENT_NAME;
    else process.env.ENVIRONMENT_NAME = saved;
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mockIsOperatorEmail.mockResolvedValue(false);
  holds("resident-ltd");
  _setTestSalt("test-salt");
});

describe.each(["prod", "ci"])("the Company Tax Return routes on %s", (environmentName) => {
  inEnvironment(environmentName);

  test("a customer who holds resident-ltd reaches the return route, and no account setting is read", async () => {
    const result = await enforceBundles(ctEvent());
    expect(result.bundleIds).toEqual(["resident-ltd"]);
    expect(mockGetAccountSettings).not.toHaveBeenCalled();
  });

  test("a customer who holds resident-ltd through an aggregate reaches the return route", async () => {
    holds("resident-pro");
    const result = await enforceBundles(ctEvent());
    expect(result.bundleIds).toEqual(["resident-pro"]);
  });

  test("a customer with no bundle that includes resident-ltd is refused for the bundle", async () => {
    holds();
    await expect(enforceBundles(ctEvent())).rejects.toMatchObject({ details: { code: "BUNDLE_FORBIDDEN" } });
  });

  test("a return that carries a joint filing id goes on for a customer", async () => {
    expect(
      await refuseJointFilingWhenNotEnabled(ctEvent(), { pathname: "/api/v1/hmrc/ct/return" }, true, ["resident-ltd"]),
    ).toBeUndefined();
  });

  test("accounts that carry a joint filing id go on for a customer", async () => {
    const accountsEvent = ctEvent({ path: "/api/v1/companies-house/accounts" });
    expect(
      await refuseJointFilingIdOnAccountsWhenNotOpen(accountsEvent, { pathname: "/api/v1/companies-house/accounts" }, true),
    ).toBeUndefined();
  });
});

describe("agent filing on prod", () => {
  inEnvironment("prod");

  test("a client-scoped return is refused, because the practice activity is not listed on prod", async () => {
    const { refusal } = await enforceCtBundles(ctEvent(), { pathname: "/api/v1/hmrc/ct/return" }, "client-1");
    expect(JSON.parse(refusal.body)).toMatchObject({ code: "CLIENT_SCOPE_ENVIRONMENT_RESTRICTED" });
  });
});
