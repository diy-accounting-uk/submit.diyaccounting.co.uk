// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/terms-bundles.test.js
//
// The bundles table in terms.html describes each paid bundle with the words of its catalogue
// description, so the terms and the bundles page name the same filings.

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import TOML from "@iarna/toml";

const catalogue = TOML.parse(fs.readFileSync("web/public/submit.catalogue.toml", "utf8"));
const termsHtml = fs.readFileSync("web/public/terms.html", "utf8");

function whatItGives(bundleName) {
  const row = termsHtml.split("<tr>").find((chunk) => chunk.includes(`<th scope="row">${bundleName}</th>`));
  const cells = [...row.matchAll(/<td>([\s\S]*?)<\/td>/g)].map((m) => m[1].replace(/\s+/g, " ").trim());
  return cells[2];
}

function descriptionWithoutPrice(description) {
  return description.replace(/\s*£.*cancel anytime\.$/, "").trim();
}

describe("terms.html bundles table", () => {
  const paidBundles = catalogue.bundles.filter((b) => b.allocation === "on-subscription" && b.description);

  it("covers at least the three paid bundles", () => {
    expect(paidBundles.length).toBeGreaterThanOrEqual(3);
  });

  for (const bundle of paidBundles) {
    it(`${bundle.name} starts with its catalogue description`, () => {
      expect(whatItGives(bundle.name).startsWith(descriptionWithoutPrice(bundle.description))).toBe(true);
    });
  }
});
