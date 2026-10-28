// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/country-codes.test.js

import { describe, it, expect, beforeAll } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "web/public/lib/country-codes.js"), "utf-8");

describe("country codes", () => {
  let api;

  beforeAll(() => {
    // eslint-disable-next-line no-new-func
    new Function(source)();
    api = globalThis.countryCodes;
  });

  it("holds every code as three upper-case letters", () => {
    for (const { code } of api.COUNTRIES) {
      expect(code).toMatch(/^[A-Z]{3}$/);
    }
  });

  it("holds each code once and each name once", () => {
    const codes = api.COUNTRIES.map((country) => country.code);
    const names = api.COUNTRIES.map((country) => country.name);
    expect(new Set(codes).size).toBe(codes.length);
    expect(new Set(names).size).toBe(names.length);
  });

  it("leaves out GBR, which belongs to the UK property journey", () => {
    expect(api.isCountryCode("GBR")).toBe(false);
    expect(api.COUNTRIES.some((country) => country.code === "GBR")).toBe(false);
  });

  it("includes Jersey, Guernsey and the Isle of Man", () => {
    expect(api.countryName("JEY")).toBe("Jersey");
    expect(api.countryName("GGY")).toBe("Guernsey");
    expect(api.countryName("IMN")).toBe("Isle of Man");
  });

  it("names a known code and returns an unknown code as it is", () => {
    expect(api.countryName("FRA")).toBe("France");
    expect(api.countryName("ZZZ")).toBe("ZZZ");
  });

  it("rejects codes outside the list", () => {
    ["", "fra", "FR", "FRAN", "XXX", undefined, null].forEach((code) => expect(api.isCountryCode(code)).toBe(false));
  });

  it("sorts the select list by name", () => {
    const names = api.countriesByName().map((country) => country.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "en-GB")));
    expect(names[0]).toBe("Afghanistan");
  });
});
