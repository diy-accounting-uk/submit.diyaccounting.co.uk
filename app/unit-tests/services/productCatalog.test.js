// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseCatalog,
  loadCatalogFromRoot,
  bundlesForActivity,
  isActivityAvailable,
  isActivityListedInEnvironment,
  isBundleListedInEnvironment,
  getCatalogBundleById,
  getStripeSubscriptionBundles,
  getBundlePrices,
  getBundlePriceForInterval,
  getActivityPrices,
  isUnlimitedTokenGrant,
} from "../../services/productCatalog.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

describe("productCatalogHelper", () => {
  const tomlPath = path.join(process.cwd(), "web/public/submit.catalogue.toml");
  const tomlText = fs.readFileSync(tomlPath, "utf-8");

  it("parseCatalog should parse TOML into object", () => {
    const catalog = parseCatalog(tomlText);
    expect(catalog).toBeTruthy();
    expect(catalog.version).toBeTypeOf("string");
    expect(Array.isArray(catalog.bundles)).toBe(true);
    expect(Array.isArray(catalog.activities)).toBe(true);
  });

  it("loadCatalogFromRoot should load and parse file from root", () => {
    const catalog = loadCatalogFromRoot();
    expect(catalog.version).toBe("1.1.0");
  });

  it("bundlesForActivity should return expected bundles", () => {
    const catalog = parseCatalog(tomlText);
    expect(bundlesForActivity(catalog, "submit-vat")).toEqual([
      "day-guest",
      "week-guest",
      "invited-guest",
      "resident-vat",
      "resident-guest",
      "resident-pro",
      "resident-tax-agent",
      "resident-pro-comp",
    ]);
    // expect(bundlesForActivity(catalog, "vat-obligations")).toEqual(["default"]);
  });

  // it("activitiesForBundle should return expected activity ids", () => {
  //  const catalog = parseCatalog(tomlText);
  //  const legacyActivities = activitiesForBundle(catalog, "legacy");
  //  expect(legacyActivities).toContain("submit-vat");
  //  expect(legacyActivities).toContain("diy-limited-company-upload");
  // });

  it("isActivityAvailable should work for positive and negative cases", () => {
    const catalog = parseCatalog(tomlText);
    expect(isActivityAvailable(catalog, "submit-vat", "day-guest")).toBe(true);
    expect(isActivityAvailable(catalog, "submit-vat", "default")).toBe(false);
  });

  it("self-employed activity should be granted by resident-pro and the bundles that include it", () => {
    const catalog = parseCatalog(tomlText);
    expect(bundlesForActivity(catalog, "self-employed")).toEqual(["resident-pro", "resident-tax-agent", "resident-pro-comp"]);
    expect(isActivityAvailable(catalog, "self-employed", "resident-pro")).toBe(true);
    expect(isActivityAvailable(catalog, "self-employed", "resident-vat")).toBe(false);
  });

  it("self-employed carries the foreign property quarterly update and its amendment, and not the list or the view", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "self-employed");
    expect(activity.paths).toEqual(
      expect.arrayContaining(["hmrc/itsa/foreignPropertyPeriod.html", "hmrc/itsa/foreignPropertyPeriodAmend.html"]),
    );
    expect(activity.paths).not.toContain("hmrc/itsa/foreignPropertyPeriods.html");
    expect(activity.paths).not.toContain("hmrc/itsa/foreignPropertyPeriodView.html");
  });

  it("self-employed costs a token and does not carry the read-only pages, the annual submission or the adjustable summary", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "self-employed");
    expect(activity.tokenCost).toBe(1);
    expect(activity.paths).not.toContain("hmrc/itsa/annualSubmission.html");
    expect(activity.paths).not.toContain("hmrc/itsa/adjustments.html");
    expect(activity.paths).not.toContain("hmrc/itsa/businessDetails.html");
    expect(activity.paths).not.toContain("hmrc/itsa/obligations.html");
    expect(activity.paths).not.toContain("hmrc/itsa/taxCalculation.html");
  });

  it("self-employed-read carries business details, obligations and the period lists/views at no token cost", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "self-employed-read");
    expect(activity).toBeTruthy();
    expect(activity.tokenCost).toBe(0);
    expect(activity.metered).toBe(true);
    expect(activity.paths).toEqual([
      "hmrc/itsa/businessDetails.html",
      "hmrc/itsa/obligations.html",
      "hmrc/itsa/selfEmploymentPeriods.html",
      "hmrc/itsa/selfEmploymentPeriodView.html",
      "hmrc/itsa/ukPropertyPeriods.html",
      "hmrc/itsa/ukPropertyPeriodView.html",
      "hmrc/itsa/foreignPropertyPeriods.html",
      "hmrc/itsa/foreignPropertyPeriodView.html",
    ]);
    // Same entitlement rules as self-employed - a read is still gated on an ITSA bundle, it
    // just spends nothing from it.
    expect(bundlesForActivity(catalog, "self-employed-read")).toEqual(bundlesForActivity(catalog, "self-employed"));
    expect(activity.hmrcScopesRequired).toEqual(["read:self-assessment"]);
  });

  it("self-employed-property-details carries the foreign property details page at no token cost with write scope, outside prod", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "self-employed-property-details");
    expect(activity).toBeTruthy();
    expect(activity.tokenCost).toBe(0);
    expect(activity.metered).toBe(true);
    expect(activity.paths).toEqual(["hmrc/itsa/foreignPropertyDetails.html"]);
    expect(bundlesForActivity(catalog, "self-employed-property-details")).toEqual(bundlesForActivity(catalog, "self-employed"));
    expect(activity.hmrcScopesRequired).toEqual(["write:self-assessment", "read:self-assessment"]);
    const selfEmployed = catalog.activities.find((a) => a.id === "self-employed");
    expect(activity.environments).toEqual(selfEmployed.environments);
    expect(activity.environments).not.toContain("prod");
  });

  it("self-employed-year-end carries the annual submission, the adjustable summary, losses and claims, and tax liability adjustments at a token each", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "self-employed-year-end");
    expect(activity).toBeTruthy();
    expect(activity.tokenCost).toBe(1);
    expect(activity.metered).toBe(true);
    expect(activity.paths).toEqual([
      "hmrc/itsa/annualSubmission.html",
      "hmrc/itsa/adjustments.html",
      "hmrc/itsa/ukPropertyAnnualSubmission.html",
      "hmrc/itsa/ukPropertyAdjustments.html",
      "hmrc/itsa/foreignPropertyAnnualSubmission.html",
      "hmrc/itsa/foreignPropertyAdjustments.html",
      "hmrc/itsa/lossesAndClaims.html",
      "hmrc/itsa/taxLiabilityAdjustments.html",
    ]);
    // Same entitlement and access rules as self-employed.
    expect(bundlesForActivity(catalog, "self-employed-year-end")).toEqual(bundlesForActivity(catalog, "self-employed"));
    const selfEmployed = catalog.activities.find((a) => a.id === "self-employed");
    expect(activity.environments).toEqual(selfEmployed.environments);
    expect(activity.hmrcScopesRequired).toEqual(["write:self-assessment", "read:self-assessment"]);
  });

  it("self-employed-calculation carries the tax calculation page at no token cost with write scope, since triggering a calculation writes at HMRC", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "self-employed-calculation");
    expect(activity.tokenCost).toBe(0);
    expect(activity.paths).toEqual(["hmrc/itsa/taxCalculation.html"]);
    expect(bundlesForActivity(catalog, "self-employed-calculation")).toEqual(bundlesForActivity(catalog, "self-employed"));
    expect(activity.hmrcScopesRequired).toEqual([
      "write:self-assessment",
      "read:self-assessment",
      "read:self-assessment-assist",
      "write:self-assessment-assist",
    ]);
  });

  it("self-employed, which carries the final declaration page, requests the Self Assessment Assist scopes", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "self-employed");
    expect(activity.paths).toContain("hmrc/itsa/finalDeclaration.html");
    expect(activity.hmrcScopesRequired).toEqual([
      "write:self-assessment",
      "read:self-assessment",
      "read:self-assessment-assist",
      "write:self-assessment-assist",
    ]);
  });

  it("self-employed-year-end-delete removes a loss claim or a tax liability adjustment at no token cost", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "self-employed-year-end-delete");
    const yearEnd = catalog.activities.find((a) => a.id === "self-employed-year-end");
    expect(activity).toBeTruthy();
    expect(activity.tokenCost).toBe(0);
    expect(activity.metered).toBe(true);
    // Same entitlement and scope rules as the year-end writes it undoes - a DELETE still needs
    // write:self-assessment, which self-employed-read doesn't carry.
    expect(bundlesForActivity(catalog, "self-employed-year-end-delete")).toEqual(bundlesForActivity(catalog, "self-employed-year-end"));
    expect(activity.hmrcScopesRequired).toEqual(yearEnd.hmrcScopesRequired);
    expect(activity.environments).toEqual(yearEnd.environments);
  });

  it("file-micro-entity-accounts activity should be granted by resident-ltd and the bundles that include it", () => {
    const catalog = parseCatalog(tomlText);
    expect(bundlesForActivity(catalog, "file-micro-entity-accounts")).toEqual([
      "resident-ltd",
      "resident-pro",
      "resident-tax-agent",
      "resident-pro-comp",
    ]);
    expect(isActivityAvailable(catalog, "file-micro-entity-accounts", "resident-ltd")).toBe(true);
    expect(isActivityAvailable(catalog, "file-micro-entity-accounts", "resident-vat")).toBe(false);
    expect(isActivityAvailable(catalog, "file-micro-entity-accounts", "default")).toBe(false);
  });

  it("file-small-company-accounts is granted like file-micro-entity-accounts, costs one token, and shares the accounts API routes", () => {
    const catalog = parseCatalog(tomlText);
    const small = catalog.activities.find((a) => a.id === "file-small-company-accounts");
    const micro = catalog.activities.find((a) => a.id === "file-micro-entity-accounts");
    expect(bundlesForActivity(catalog, "file-small-company-accounts")).toEqual(bundlesForActivity(catalog, "file-micro-entity-accounts"));
    expect(small.tokenCost).toBe(micro.tokenCost);
    expect(small.metered).toBe(true);
    expect(small.environments).toEqual(micro.environments);
    expect(small.paths).toContain("companies-house/fileSmallCompanyAccounts.html");
    expect(small.paths).toContain("^/api/v1/companies-house/accounts.*");
    expect(micro.paths).not.toContain("companies-house/fileSmallCompanyAccounts.html");
  });

  it("file-company-tax-return is granted like the accounts filings, costs one token and is not listed on prod", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "file-company-tax-return");
    expect(bundlesForActivity(catalog, "file-company-tax-return")).toEqual(bundlesForActivity(catalog, "file-micro-entity-accounts"));
    expect(activity.tokenCost).toBe(1);
    expect(activity.metered).toBe(true);
    expect(activity.environments).toEqual(["local", "test", "simulator", "proxy", "ci"]);
    expect(activity.paths).toContain("companies-house/fileCompanyTaxReturn.html");
    expect(activity.paths).toContain("^/api/v1/hmrc/ct/return.*");
  });

  it("file-confirmation-statement activity should be granted by resident-ltd and the bundles that include it, ci only", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "file-confirmation-statement");
    expect(bundlesForActivity(catalog, "file-confirmation-statement")).toEqual([
      "resident-ltd",
      "resident-pro",
      "resident-tax-agent",
      "resident-pro-comp",
    ]);
    expect(isActivityAvailable(catalog, "file-confirmation-statement", "resident-ltd")).toBe(true);
    expect(isActivityAvailable(catalog, "file-confirmation-statement", "default")).toBe(false);
    expect(activity.environments).toEqual(["local", "test", "simulator", "proxy", "ci"]);
    expect(activity.environments).not.toContain("prod");
  });

  it("file-confirmation-statement carries a one-off per-submission price", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "file-confirmation-statement");
    expect(getActivityPrices(activity)).toEqual([{ interval: "submission", amount: 6135, currency: "gbp", default: true }]);
  });

  it("getActivityPrices returns nothing for an activity with no price fields", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "file-micro-entity-accounts");
    expect(getActivityPrices(activity)).toEqual([]);
    expect(getActivityPrices(null)).toEqual([]);
  });

  it("resident-vat carries the annual and monthly Stripe prices, annual default", () => {
    const catalog = parseCatalog(tomlText);
    const residentVat = getCatalogBundleById(catalog, "resident-vat");
    expect(getBundlePrices(residentVat)).toEqual([
      { interval: "year", amount: 999, currency: "gbp", default: true },
      { interval: "month", amount: 99, currency: "gbp", default: false },
    ]);
    expect(getBundlePriceForInterval(residentVat)).toMatchObject({ interval: "year", amount: 999 });
  });

  it("resident-ltd is always visible, on-subscription, 100 tokens monthly, annual default", () => {
    const catalog = parseCatalog(tomlText);
    const residentLtd = getCatalogBundleById(catalog, "resident-ltd");
    expect(residentLtd).toMatchObject({
      name: "Resident Ltd",
      enable: "always",
      hidden: false,
      allocation: "on-subscription",
      tokensGranted: 100,
      tokenRefreshInterval: "P1M",
    });
    expect(getBundlePrices(residentLtd)).toEqual([
      { interval: "year", amount: 999, currency: "gbp", default: true },
      { interval: "month", amount: 99, currency: "gbp", default: false },
    ]);
  });

  it("resident-pro includes resident-vat and resident-ltd, carries 100 tokens monthly and the annual and monthly prices, annual default", () => {
    const catalog = parseCatalog(tomlText);
    const residentPro = getCatalogBundleById(catalog, "resident-pro");
    expect(residentPro).toMatchObject({
      levelName: "Pro",
      enable: "always",
      hidden: false,
      allocation: "on-subscription",
      includes: ["resident-vat", "resident-ltd"],
      tokensGranted: 100,
      tokenRefreshInterval: "P1M",
      description: "Submit VAT returns to HMRC and Accounts to Companies House. £39.99/yr / £3.99/mo, cancel anytime.",
    });
    expect(residentPro.listedInEnvironments).toBeUndefined();
    expect(getBundlePrices(residentPro)).toEqual([
      { interval: "year", amount: 3999, currency: "gbp", default: true },
      { interval: "month", amount: 399, currency: "gbp", default: false },
    ]);
    expect(getBundlePriceForInterval(residentPro)).toMatchObject({ interval: "year", amount: 3999 });
    expect(getBundlePriceForInterval(residentPro, "month")).toMatchObject({ interval: "month", amount: 399 });
  });

  it("resident-tax-agent includes resident-pro, carries an unlimited token grant and no refresh interval, and is not listed in prod", () => {
    const catalog = parseCatalog(tomlText);
    const taxAgent = getCatalogBundleById(catalog, "resident-tax-agent");
    expect(taxAgent.includes).toEqual(["resident-pro"]);
    expect(taxAgent.tokensGranted).toBe("unlimited");
    expect(taxAgent.tokenRefreshInterval).toBeUndefined();
    expect(isUnlimitedTokenGrant(taxAgent.tokensGranted)).toBe(true);
    expect(taxAgent.listedInEnvironments).toEqual(["local", "test", "simulator", "proxy", "ci"]);
    expect(getBundlePrices(taxAgent)).toEqual([
      { interval: "year", amount: 19999, currency: "gbp", default: true },
      { interval: "month", amount: 1999, currency: "gbp", default: false },
    ]);
  });

  it("resident-pro-comp includes resident-tax-agent and carries an unlimited grant", () => {
    const comp = getCatalogBundleById(parseCatalog(tomlText), "resident-pro-comp");
    expect(comp.includes).toEqual(["resident-tax-agent"]);
    expect(comp.tokensGranted).toBe("unlimited");
  });

  it("the resident bundle is folded away", () => {
    expect(getCatalogBundleById(parseCatalog(tomlText), "resident")).toBeNull();
  });

  it("isUnlimitedTokenGrant is true only for the unlimited sentinel", () => {
    expect(isUnlimitedTokenGrant("unlimited")).toBe(true);
    expect(isUnlimitedTokenGrant(100)).toBe(false);
    expect(isUnlimitedTokenGrant(undefined)).toBe(false);
    expect(isUnlimitedTokenGrant("Unlimited")).toBe(false);
  });

  it("getStripeSubscriptionBundles should return exactly the four Stripe-priced bundles", () => {
    const catalog = parseCatalog(tomlText);
    const bundleIds = getStripeSubscriptionBundles(catalog)
      .map((b) => b.id)
      .sort();
    expect(bundleIds).toEqual(["resident-ltd", "resident-pro", "resident-tax-agent", "resident-vat"]);
  });

  it("getBundlePrices returns nothing for a bundle with no price fields", () => {
    expect(getBundlePrices(getCatalogBundleById(parseCatalog(tomlText), "default"))).toEqual([]);
    expect(getBundlePrices(null)).toEqual([]);
  });

  it("getBundlePriceForInterval returns null for a multi-price bundle's unlisted interval", () => {
    const catalog = parseCatalog(tomlText);
    const residentPro = getCatalogBundleById(catalog, "resident-pro");
    expect(getBundlePriceForInterval(residentPro, "week")).toBeNull();
  });

  describe("isActivityListedInEnvironment", () => {
    it("lists an activity in a named environment", () => {
      const activity = { environments: ["local", "ci"] };
      expect(isActivityListedInEnvironment(activity, "ci")).toBe(true);
    });

    it("hides an activity from an environment not in its list", () => {
      const activity = { environments: ["local", "ci"] };
      expect(isActivityListedInEnvironment(activity, "prod")).toBe(false);
    });

    it("lists an activity with no environments field everywhere", () => {
      expect(isActivityListedInEnvironment({}, "prod")).toBe(true);
    });

    it("hides a restricted activity when the current environment is unknown", () => {
      const activity = { environments: ["local", "ci"] };
      expect(isActivityListedInEnvironment(activity, undefined)).toBe(false);
    });
  });

  describe("isBundleListedInEnvironment", () => {
    it("lists a bundle in a named environment", () => {
      const bundle = { listedInEnvironments: ["local", "ci"] };
      expect(isBundleListedInEnvironment(bundle, "ci")).toBe(true);
    });

    it("hides a bundle from an environment not in its list", () => {
      const bundle = { listedInEnvironments: ["local", "ci"] };
      expect(isBundleListedInEnvironment(bundle, "prod")).toBe(false);
    });

    it("lists a bundle with no listedInEnvironments field everywhere", () => {
      expect(isBundleListedInEnvironment({}, "prod")).toBe(true);
    });
  });

  it("vat-liabilities, vat-payments and vat-penalties are available on prod", () => {
    const catalog = parseCatalog(tomlText);
    const vatReadActivities = ["vat-liabilities", "vat-payments", "vat-penalties"];
    for (const activityId of vatReadActivities) {
      const activity = catalog.activities.find((a) => a.id === activityId);
      expect(activity.environments).toContain("prod");
    }
  });

  it("self-employed stays out of prod until examined on ci", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "self-employed");
    expect(activity.environments).toContain("ci");
    expect(activity.environments).not.toContain("prod");
  });

  it("company-lookup should be available in prod alongside the register filings", () => {
    const catalog = parseCatalog(tomlText);
    const activity = catalog.activities.find((a) => a.id === "company-lookup");
    expect(activity.environments).toContain("prod");
  });
});

describe("productCatalog aggregation", () => {
  const fixture = `
[[bundles]]
id = "part"

[[bundles]]
id = "whole"
includes = ["part"]

[[activities]]
id = "uses-part"
bundles = ["part"]

[[activities]]
id = "uses-whole"
bundles = ["whole"]
`;

  it("parseCatalog gives an aggregate the activities of its parts", () => {
    const catalog = parseCatalog(fixture);
    expect(bundlesForActivity(catalog, "uses-part")).toEqual(["part", "whole"]);
    expect(bundlesForActivity(catalog, "uses-whole")).toEqual(["whole"]);
    expect(isActivityAvailable(catalog, "uses-part", "whole")).toBe(true);
  });
});
