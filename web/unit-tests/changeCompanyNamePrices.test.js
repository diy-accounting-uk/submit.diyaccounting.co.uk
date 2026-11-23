// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/changeCompanyNamePrices.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { loadCatalogFromRoot, getActivityPrices } from "../../app/services/productCatalog.js";

const pounds = (pence) => `£${(pence / 100).toFixed(2)}`;

describe("the change of company name page's prices", () => {
  const prices = Object.fromEntries(
    getActivityPrices(loadCatalogFromRoot().activities.find((activity) => activity.id === "change-company-name")).map((price) => [
      price.key,
      price.amount,
    ]),
  );

  test("are the catalogue's standard and same-day amounts", () => {
    const script = fs.readFileSync(path.join(process.cwd(), "web/public/companies-house/changeCompanyName.page.js"), "utf8");
    const shown = /const PRICE = \{ standard: "([^"]+)", sameDay: "([^"]+)" \};/.exec(script);
    expect(shown?.slice(1)).toEqual([pounds(prices.standard), pounds(prices["same-day"])]);
  });

  test("are the amounts the page's hint and service choice name", () => {
    const page = fs
      .readFileSync(path.join(process.cwd(), "web/public/companies-house/changeCompanyName.html"), "utf8")
      .replace(/\s+/g, " ");
    expect(page).toContain(
      `${pounds(prices.standard)} for the standard service, or ${pounds(prices["same-day"])} for the same-day service`,
    );
    expect(page).toContain(`(you pay ${pounds(prices["same-day"])} in place of ${pounds(prices.standard)})`);
  });
});
