// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/searchconsoleSync.test.js

import { describe, test, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  parseArgs,
  parseConfig,
  loadConfigFromRoot,
  domainSiteUrl,
  describeCnameRecord,
  isVerified,
  isSiteAdded,
  buildPropertyPlan,
  describePropertyPlan,
  isTokenNotFoundError,
  applyPropertyPlan,
  buildSitemapPlan,
  sitemapErrorCount,
  anySitemapHasErrors,
  describeSitemap,
} from "../../../infra/google/searchconsole/searchconsole-sync.js";

const verifiedResource = (domain) => ({ site: { type: "INET_DOMAIN", identifier: domain } });

describe("parseArgs", () => {
  test("defaults to plan mode", () => {
    expect(parseArgs([])).toEqual({ apply: false, sitemapsOnly: false, failOnErrors: false });
  });
  test("reads --apply", () => {
    expect(parseArgs(["--apply"])).toEqual({ apply: true, sitemapsOnly: false, failOnErrors: false });
  });
  test("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("parseConfig", () => {
  test("the checked-in file covers the four sites in two domain properties", () => {
    const { properties } = loadConfigFromRoot();
    expect(properties.map((p) => p.domain)).toEqual(["diyaccounting.co.uk", "diya-gl.co.uk"]);
    expect(properties.flatMap((p) => p.sites).sort()).toEqual([
      "diya-gl.co.uk",
      "diyaccounting.co.uk",
      "spreadsheets.diyaccounting.co.uk",
      "submit.diyaccounting.co.uk",
    ]);
    expect(properties.every((p) => p.verificationMethod === "DNS_CNAME")).toBe(true);
  });
  test("rejects an empty file and an unsupported method", () => {
    expect(() => parseConfig("")).toThrow(/no \[\[property\]\]/);
    expect(() => parseConfig('[[property]]\ndomain = "a.example"\nverification_method = "FILE"')).toThrow(/unsupported/);
  });
  test("defaults sites to the domain", () => {
    expect(parseConfig('[[property]]\ndomain = "a.example"').properties[0].sites).toEqual(["a.example"]);
  });
});

describe("describeCnameRecord", () => {
  test("joins the label to the domain", () => {
    expect(describeCnameRecord("a.example", "abc123 gv-xyz.dv.googlehosted.com")).toEqual({
      name: "abc123.a.example",
      type: "CNAME",
      value: "gv-xyz.dv.googlehosted.com",
    });
  });
  test("returns null for a token that is not a pair", () => {
    expect(describeCnameRecord("a.example", "google-site-verification=abc")).toBeNull();
    expect(describeCnameRecord("a.example", null)).toBeNull();
  });
});

describe("live state matching", () => {
  test("isVerified matches an INET_DOMAIN resource", () => {
    expect(isVerified("a.example", [verifiedResource("a.example")])).toBe(true);
    expect(isVerified("a.example", [verifiedResource("b.example")])).toBe(false);
    expect(isVerified("a.example", [{ site: { type: "SITE", identifier: "a.example" } }])).toBe(false);
  });
  test("isSiteAdded matches the sc-domain url", () => {
    expect(isSiteAdded("a.example", [{ siteUrl: "sc-domain:a.example" }])).toBe(true);
    expect(isSiteAdded("a.example", [{ siteUrl: "https://a.example/" }])).toBe(false);
  });
});

describe("buildPropertyPlan", () => {
  const property = { domain: "a.example", verificationMethod: "DNS_CNAME", sites: ["a.example"] };

  test("an unverified, unadded domain plans verify and add with the DNS record", () => {
    const plan = buildPropertyPlan(property, { token: "lbl tgt.example" });
    expect(plan.verify).toMatchObject({ action: "verify", method: "DNS_CNAME", token: "lbl tgt.example" });
    expect(plan.verify.dnsRecord).toEqual({ name: "lbl.a.example", type: "CNAME", value: "tgt.example" });
    expect(plan.add).toEqual({ action: "add", siteUrl: "sc-domain:a.example" });
  });
  test("a verified, added domain is a noop", () => {
    const plan = buildPropertyPlan(property, {
      liveWebResources: [verifiedResource("a.example")],
      liveSites: [{ siteUrl: domainSiteUrl("a.example") }],
    });
    expect(plan.verify).toEqual({ action: "noop" });
    expect(plan.add).toEqual({ action: "noop" });
  });
  test("describePropertyPlan prints the CNAME and marks a dry run", () => {
    const lines = describePropertyPlan(buildPropertyPlan(property, { token: "lbl tgt.example" }), true);
    expect(lines[0]).toMatch(/^\[dry-run\] Property sc-domain:a.example/);
    expect(lines.join("\n")).toContain("DNS record to add: lbl.a.example CNAME tgt.example");
  });
});

describe("isTokenNotFoundError", () => {
  test("400 is a missing record; other statuses are not", () => {
    expect(isTokenNotFoundError({ response: { status: 400 } })).toBe(true);
    expect(isTokenNotFoundError({ response: { status: 403 } })).toBe(false);
    expect(isTokenNotFoundError(new Error("boom"))).toBe(false);
  });
});

describe("applyPropertyPlan", () => {
  const property = { domain: "a.example", verificationMethod: "DNS_CNAME", sites: ["a.example"] };
  const plan = buildPropertyPlan(property, { token: "lbl tgt.example" });

  test("verifies then adds when the record exists", async () => {
    const request = vi.fn().mockResolvedValue({ data: {} });
    const outcome = await applyPropertyPlan({ request }, plan);
    expect(outcome).toEqual({ domain: "a.example", state: "verified" });
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls[0][0]).toMatchObject({ method: "POST", params: { verificationMethod: "DNS_CNAME" } });
    expect(request.mock.calls[1][0]).toMatchObject({ method: "PUT", url: expect.stringContaining("sc-domain%3Aa.example") });
  });
  test("reports unverified and adds nothing when the record is absent", async () => {
    const request = vi.fn().mockRejectedValue({ response: { status: 400 } });
    const outcome = await applyPropertyPlan({ request }, plan);
    expect(outcome).toEqual({ domain: "a.example", state: "unverified" });
    expect(request).toHaveBeenCalledTimes(1);
  });
  test("rethrows any other failure", async () => {
    const request = vi.fn().mockRejectedValue({ response: { status: 403 } });
    await expect(applyPropertyPlan({ request }, plan)).rejects.toBeDefined();
  });
  test("a verified domain skips insert and only adds the property", async () => {
    const verifiedPlan = buildPropertyPlan(property, { liveWebResources: [verifiedResource("a.example")] });
    const request = vi.fn().mockResolvedValue({ data: {} });
    await applyPropertyPlan({ request }, verifiedPlan);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request.mock.calls[0][0].method).toBe("PUT");
  });
});

describe("sitemaps", () => {
  const property = {
    domain: "diyaccounting.co.uk",
    sitemaps: ["https://submit.diyaccounting.co.uk/sitemap.xml", "https://spreadsheets.diyaccounting.co.uk/sitemap.xml"],
  };
  const live = JSON.parse(
    fs.readFileSync(path.join(import.meta.dirname, "..", "fixtures", "searchconsole", "sitemaps-list.json"), "utf-8"),
  ).sitemap;
  const status = (name) => JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "..", "fixtures", "searchconsole", name), "utf-8"));

  test("the checked-in file declares the four sitemaps under their properties", () => {
    const { properties } = loadConfigFromRoot();
    expect(properties.map((p) => p.sitemaps)).toEqual([
      [
        "https://submit.diyaccounting.co.uk/sitemap.xml",
        "https://spreadsheets.diyaccounting.co.uk/sitemap.xml",
        "https://diyaccounting.co.uk/sitemap.xml",
      ],
      ["https://diya-gl.co.uk/sitemap.xml"],
    ]);
  });
  test("a sitemap that is not an https URL is refused", () => {
    expect(() => parseConfig('[[property]]\ndomain = "a.example"\nsitemaps = ["a.example/sitemap.xml"]')).toThrow(/not an https URL/);
  });
  test("parseArgs reads the sitemap flags", () => {
    expect(parseArgs(["--sitemaps-only", "--apply", "--fail-on-errors"])).toEqual({ apply: true, sitemapsOnly: true, failOnErrors: true });
  });
  test("buildSitemapPlan submits only the sitemap Search Console does not hold", () => {
    expect(buildSitemapPlan(property, live)).toEqual([
      { feedpath: "https://submit.diyaccounting.co.uk/sitemap.xml", action: "noop" },
      { feedpath: "https://spreadsheets.diyaccounting.co.uk/sitemap.xml", action: "submit" },
    ]);
  });
  test("buildSitemapPlan submits all when none is held", () => {
    expect(buildSitemapPlan(property, []).map((e) => e.action)).toEqual(["submit", "submit"]);
  });
  test("sitemapErrorCount reads the string count", () => {
    expect(sitemapErrorCount(status("sitemap-status.json"))).toBe(0);
    expect(sitemapErrorCount(status("sitemap-status-errors.json"))).toBe(2);
    expect(sitemapErrorCount(null)).toBe(0);
  });
  test("anySitemapHasErrors is true when one sitemap shows errors", () => {
    expect(anySitemapHasErrors([status("sitemap-status.json")])).toBe(false);
    expect(anySitemapHasErrors([status("sitemap-status.json"), status("sitemap-status-errors.json")])).toBe(true);
  });
  test("describeSitemap prints the last download, errors, warnings and contents", () => {
    const lines = describeSitemap(
      { feedpath: "https://submit.diyaccounting.co.uk/sitemap.xml", action: "noop" },
      status("sitemap-status.json"),
      false,
    );
    expect(lines).toEqual([
      "Sitemap https://submit.diyaccounting.co.uk/sitemap.xml: held",
      "  lastSubmitted: 2026-11-01T05:23:11.000Z",
      "  lastDownloaded: 2026-11-01T05:30:02.000Z",
      "  pending: no",
      "  errors: 0",
      "  warnings: 1",
      "  contents web: submitted 20, indexed 0",
    ]);
  });
  test("describeSitemap in a plan says will submit and prints no status", () => {
    expect(describeSitemap({ feedpath: "https://x.example/sitemap.xml", action: "submit" }, null, true)).toEqual([
      "[dry-run] Sitemap https://x.example/sitemap.xml: will submit",
    ]);
  });
});
