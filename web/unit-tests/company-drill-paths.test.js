// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/company-drill-paths.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("company drill-down addresses", () => {
  let paths;
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/company-drill-paths.js");
    paths = window.companyDrillPaths;
  });

  const company = "/companies-house/company/00000001";
  const views = [
    [company, { view: "overview" }],
    [`${company}/officers`, { view: "officers" }],
    [`${company}/psc`, { view: "psc" }],
    [`${company}/filing-history`, { view: "filing-history" }],
    [`${company}/accounts`, { view: "accounts" }],
    [`${company}/accounts/2098-04-30`, { view: "accounts-period", periodEnd: "2098-04-30" }],
    [
      `${company}/accounts/2098-04-30/SIMTX00000001AA2098`,
      { view: "accounts-set", periodEnd: "2098-04-30", filingId: "SIMTX00000001AA2098" },
    ],
    [`${company}/confirmation-statement/2098-04-16`, { view: "confirmation-statement", madeUpDate: "2098-04-16" }],
  ];

  it.each(views)("reads %s and writes the same path back", (address, expected) => {
    const state = paths.parseDrillPath(address);
    expect(state).toEqual({ welsh: false, companyNumber: "00000001", ...expected });
    expect(paths.drillPath(state)).toBe(address);
  });

  it.each(views)("reads /cy%s as the Welsh view and writes it back under /cy/", (address, expected) => {
    const state = paths.parseDrillPath(`/cy${address}`);
    expect(state).toEqual({ welsh: true, companyNumber: "00000001", ...expected });
    expect(paths.drillPath(state)).toBe(`/cy${address}`);
  });

  it("pads a short company number and upper-cases a prefix, as the register writes them", () => {
    expect(paths.parseDrillPath("/companies-house/company/1").companyNumber).toBe("00000001");
    expect(paths.parseDrillPath("/companies-house/company/sc000000/officers")).toEqual({
      welsh: false,
      companyNumber: "SC000000",
      view: "officers",
    });
  });

  it("names a path under a company that this page has no view for as unknown", () => {
    for (const address of [
      `${company}/nonsense`,
      `${company}/accounts/30-04-2098`,
      `${company}/accounts/2098-04-30/a%2Fb`,
      `${company}/confirmation-statement`,
      "/companies-house/company/not!valid",
      `${company}/officers/extra`,
    ]) {
      expect(paths.parseDrillPath(address).view, address).toBe("unknown");
    }
  });

  it("is not a drill-down path for any other page", () => {
    expect(paths.parseDrillPath("/companies-house/companySearch.html")).toBeNull();
    expect(paths.parseDrillPath("/companies-house/company")).toBeNull();
    expect(paths.parseDrillPath("/cy/index.html")).toBeNull();
  });
});

describe("company number from a form's address", () => {
  async function prefill(search, existing = "") {
    const input = { value: existing };
    globalThis.window = { location: { search } };
    globalThis.document = { getElementById: (id) => (id === "companyNumber" ? input : null) };
    const url = new URL("../public/lib/company-number-from-address.js", import.meta.url);
    url.searchParams.set("run", Math.random().toString(36));
    await import(url.href);
    return input.value;
  }

  it("fills the company number field, padded and upper-cased", async () => {
    expect(await prefill("?companyNumber=1")).toBe("00000001");
    expect(await prefill("?companyNumber=sc000000")).toBe("SC000000");
  });

  it("leaves out a value that is not a company number, and keeps a number already typed", async () => {
    expect(await prefill("?companyNumber=%3Cscript%3E")).toBe("");
    expect(await prefill("?companyNumber=123456789")).toBe("");
    expect(await prefill("?companyNumber=00000001", "06846849")).toBe("06846849");
    expect(await prefill("")).toBe("");
  });
});
