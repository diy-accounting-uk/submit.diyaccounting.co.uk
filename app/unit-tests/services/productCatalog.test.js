// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseCatalog,
  loadCatalogFromRoot,
  bundlesForActivity,
  isActivityAvailable,
  isActivityListedInEnvironment,
  getCatalogBundleById,
  getStripeSubscriptionBundles,
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
      "invited-guest",
      "resident-vat",
      "resident-guest",
      "resident-pro-comp",
      "resident-pro",
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

  it("resident-itsa should mirror resident-vat's pricing shape and be hidden in prod", () => {
    const catalog = parseCatalog(tomlText);
    const residentVat = getCatalogBundleById(catalog, "resident-vat");
    const residentItsa = getCatalogBundleById(catalog, "resident-itsa");
    expect(residentItsa).toBeTruthy();
    expect(residentItsa.allocation).toBe("on-subscription");
    expect(residentItsa.tokensGranted).toBe(residentVat.tokensGranted);
    expect(residentItsa.tokenRefreshInterval).toBe(residentVat.tokenRefreshInterval);
    expect(residentItsa.enable).toBe("always");
    expect(residentItsa.listedInEnvironments).not.toContain("prod");
  });

  it("self-employed activity should be granted by resident-itsa", () => {
    const catalog = parseCatalog(tomlText);
    expect(bundlesForActivity(catalog, "self-employed")).toEqual(["resident-itsa"]);
    expect(isActivityAvailable(catalog, "self-employed", "resident-itsa")).toBe(true);
    expect(isActivityAvailable(catalog, "self-employed", "resident-vat")).toBe(false);
  });

  it("resident-pro, resident-vat and resident-itsa should carry Stripe price fields", () => {
    const catalog = parseCatalog(tomlText);
    const residentPro = getCatalogBundleById(catalog, "resident-pro");
    const residentVat = getCatalogBundleById(catalog, "resident-vat");
    const residentItsa = getCatalogBundleById(catalog, "resident-itsa");

    expect(residentPro).toMatchObject({ stripePriceAmount: 999, stripeCurrency: "gbp", stripeInterval: "month" });
    expect(residentVat).toMatchObject({ stripePriceAmount: 99, stripeCurrency: "gbp", stripeInterval: "month" });
    expect(residentItsa).toMatchObject({ stripePriceAmount: 99, stripeCurrency: "gbp", stripeInterval: "month" });
  });

  it("getStripeSubscriptionBundles should return exactly the three Stripe-priced bundles", () => {
    const catalog = parseCatalog(tomlText);
    const bundleIds = getStripeSubscriptionBundles(catalog)
      .map((b) => b.id)
      .sort();
    expect(bundleIds).toEqual(["resident-itsa", "resident-pro", "resident-vat"]);
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

  it("vat-liabilities, vat-payments, vat-penalties, self-employed and company-lookup stay out of prod until examined on ci", () => {
    const catalog = parseCatalog(tomlText);
    const gatedActivityIds = ["vat-liabilities", "vat-payments", "vat-penalties", "self-employed", "company-lookup"];
    for (const activityId of gatedActivityIds) {
      const activity = catalog.activities.find((a) => a.id === activityId);
      expect(activity.environments).toContain("ci");
      expect(activity.environments).not.toContain("prod");
    }
  });
});
