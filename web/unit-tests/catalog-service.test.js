// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/catalog-service.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { parse as parseToml } from "@iarna/toml";

import {
  isActivityListedInEnvironment,
  fetchCurrentEnvironmentName,
  activityPagePath,
  activityArea,
  featureStatusSummary,
  STATUS_FEATURES,
} from "../public/lib/services/catalog-service.js";

describe("isActivityListedInEnvironment", () => {
  it("lists an activity in a named environment", () => {
    const activity = { id: "vat-liabilities", environments: ["local", "ci"] };
    expect(isActivityListedInEnvironment(activity, "ci")).toBe(true);
  });

  it("hides an activity from an environment not in its list", () => {
    const activity = { id: "vat-liabilities", environments: ["local", "ci"] };
    expect(isActivityListedInEnvironment(activity, "prod")).toBe(false);
  });

  it("lists an activity with no environments field everywhere", () => {
    const activity = { id: "submit-vat" };
    expect(isActivityListedInEnvironment(activity, "prod")).toBe(true);
    expect(isActivityListedInEnvironment(activity, "ci")).toBe(true);
  });

  it("hides a restricted activity when the current environment is unknown", () => {
    const activity = { id: "vat-liabilities", environments: ["local", "ci"] };
    expect(isActivityListedInEnvironment(activity, null)).toBe(false);
  });
});

describe("fetchCurrentEnvironmentName", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    vi.stubGlobal("fetch", global.fetch);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the trimmed body of submit.environment-name.txt", async () => {
    global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("ci\n") });

    const name = await fetchCurrentEnvironmentName();

    expect(global.fetch).toHaveBeenCalledWith("/submit.environment-name.txt", { cache: "no-store" });
    expect(name).toBe("ci");
  });

  it("returns null when the file cannot be fetched", async () => {
    global.fetch.mockResolvedValue({ ok: false });

    expect(await fetchCurrentEnvironmentName()).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    global.fetch.mockRejectedValue(new Error("network error"));

    expect(await fetchCurrentEnvironmentName()).toBeNull();
  });
});

describe("home page activity buttons", () => {
  it("opens the first page in the activity's paths", () => {
    expect(activityPagePath({ paths: ["hmrc/vat/submitVat.html", "^/api/v1/hmrc/vat.*"] })).toBe("hmrc/vat/submitVat.html");
  });

  it("gives an activity with no page no button path", () => {
    expect(
      activityPagePath({ id: "file-psc-verification-statement", paths: ["^/api/v1/companies-house/psc-verification-statement.*"] }),
    ).toBeNull();
    expect(activityPagePath({ id: "no-paths" })).toBeNull();
  });

  it("files a page under the group of its directory", () => {
    expect(activityArea("hmrc/vat/vatObligations.html")).toBe("VAT");
    expect(activityArea("hmrc/itsa/itsaObligations.html")).toBe("Income Tax");
    expect(activityArea("companies-house/filePscVerification.html")).toBe("Companies House");
    expect(activityArea("passes/redeem.html")).toBe("Passes");
    expect(activityArea("mcp-harness.html")).toBe("More");
  });
});

describe("featureStatusSummary", () => {
  const catalog = {
    activities: [
      { id: "submit-vat", name: "Submit VAT (HMRC)" },
      { id: "vat-assist-check", name: "HMRC Assist check (VAT, preview)", environments: ["ci", "simulator"] },
      { id: "self-employed", name: "Self Assessment (HMRC, sandbox)", environments: ["ci"] },
      { id: "company-lookup", name: "Company Lookup (Companies House)", environments: ["ci", "prod"] },
    ],
  };

  it("lists only the features the catalogue lists for the environment, under their status", () => {
    expect(featureStatusSummary(catalog, "prod")).toEqual({
      groups: [{ status: "production", labels: ["HMRC VAT", "company lookup"] }],
      filings: ["VAT returns"],
    });
  });

  it("adds sandbox and preview features where the catalogue lists them", () => {
    expect(featureStatusSummary(catalog, "ci")).toEqual({
      groups: [
        { status: "production", labels: ["HMRC VAT", "company lookup"] },
        { status: "sandbox", labels: ["HMRC Income Tax (MTD)"] },
        { status: "preview", labels: ["HMRC Assist for VAT"] },
      ],
      filings: ["VAT returns", "Income Tax updates"],
    });
  });

  it("names every feature activity that the real catalogue holds", () => {
    const real = parseToml(readFileSync("web/public/submit.catalogue.toml", "utf8"));
    const ids = new Set(real.activities.map((activity) => activity.id));
    for (const feature of STATUS_FEATURES) expect(ids.has(feature.activity)).toBe(true);
    const prod = featureStatusSummary(real, "prod");
    expect(prod.groups.map((group) => group.status)).toEqual(["production"]);
    expect(prod.groups[0].labels).not.toContain("HMRC Assist for VAT");
    expect(prod.groups[0].labels).not.toContain("HMRC Company Tax Return (CT600)");
  });
});
