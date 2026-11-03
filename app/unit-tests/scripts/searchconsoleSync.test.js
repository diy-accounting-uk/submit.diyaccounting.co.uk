// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/searchconsoleSync.test.js

import { describe, test, expect, vi } from "vitest";

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
} from "../../../infra/google/searchconsole/searchconsole-sync.js";

const verifiedResource = (domain) => ({ site: { type: "INET_DOMAIN", identifier: domain } });

describe("parseArgs", () => {
  test("defaults to plan mode", () => {
    expect(parseArgs([])).toEqual({ apply: false });
  });
  test("reads --apply", () => {
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
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
