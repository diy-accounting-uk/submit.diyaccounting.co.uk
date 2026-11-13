// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { comparePrices, problemLines } from "../../scripts/check-compare-prices.mjs";

const tool = { name: "Sheet Bridge", compares: "vat", price_url: "https://example.test/pricing", price_text: "£5 + VAT per month" };
const pageWith = (body, status = 200) => new Map([[tool.price_url, { status, html: body }]]);

describe("check compare prices", () => {
  test("a price text that is on the page, with other spacing and entities, is found", () => {
    const html = "<html><script>var x = 1;</script><p>Pay&nbsp;&pound;5\n + VAT   per <b>month</b>.</p></html>";
    const [result] = comparePrices([tool], pageWith(html));
    expect(result.found).toBe(true);
    expect(problemLines([result])).toEqual([]);
  });

  test("a changed price is reported with the tool, the old words and the page", () => {
    const [result] = comparePrices([tool], pageWith("<p>£6 + VAT per month</p>"));
    expect(result.found).toBe(false);
    expect(problemLines([result])).toEqual([`Sheet Bridge (vat): "£5 + VAT per month" is no longer on https://example.test/pricing`]);
  });

  test("a page that did not load is reported by its status, even when the text would match", () => {
    const [notFound] = comparePrices([tool], pageWith("<p>£5 + VAT per month</p>", 404));
    expect(problemLines([notFound])).toEqual([`Sheet Bridge (vat): https://example.test/pricing did not load (HTTP 404)`]);
    const [missing] = comparePrices([tool], new Map());
    expect(problemLines([missing])[0]).toContain("HTTP 0");
  });
});
