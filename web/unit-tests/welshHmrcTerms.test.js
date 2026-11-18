// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/welshHmrcTerms.test.js

import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";

const catalogue = readFileSync(new URL("../../i18n/cy.toml", import.meta.url), "utf-8");

// HMRC's Welsh CT600 uses rhyddhad ffiniol, gwariant llawn and cyfradd elw bychan. Each pattern covers
// the mutated forms (ryddhad, gyfradd) and both apostrophes.
const REPLACED_TERMS = [
  { term: "rhyddhad ymylol", hmrc: "rhyddhad ffiniol", pattern: /r(h)?yddhad ymylol/i },
  { term: "treulio’n llawn", hmrc: "gwariant llawn", pattern: /treulio(['’]n)? llawn/i },
  { term: "cyfradd elw bach", hmrc: "cyfradd elw bychan", pattern: /(c|g|ch|ng)yfradd elw bach\b|terfyn elw bach\b/i },
];

describe("the Welsh catalogue uses HMRC's Welsh Corporation Tax terms", () => {
  test.each(REPLACED_TERMS)("no entry says $term (HMRC: $hmrc)", ({ pattern }) => {
    const lines = catalogue.split("\n").filter((line) => pattern.test(line));
    expect(lines).toEqual([]);
  });
});

// The HMRC Assist widget draws the same control on the VAT return and on the Income Tax calculation
// and final declaration, so its Welsh names "the return" (y Ffurflen) and not a VAT return (Ffurflen TAW).
describe("the Welsh of the HMRC Assist widget fits every return it checks", () => {
  test("no widget.assist entry names a VAT return", () => {
    const entries = [...catalogue.matchAll(/^\[strings\."(widget\.assist[^"]*)"\][^[]*?^cy = '''([\s\S]*?)'''/gm)].map(([, id, cy]) => ({
      id,
      cy,
    }));
    expect(entries.length).toBeGreaterThan(5);
    expect(entries.filter(({ cy }) => /\bTAW\b/.test(cy))).toEqual([]);
  });
});
