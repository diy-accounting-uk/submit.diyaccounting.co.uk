// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/ct-comp-labels.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { COMPUTATIONS_CONCEPTS, TRADING_LINES, loadCtCompTaxonomyConcepts } from "@app/services/ctComputationsIxbrl.js";
import { COMPUTATION_LINES, CT600_FORM_FIELDS } from "../public/lib/ct600-fields.js";

const FIXTURE = JSON.parse(readFileSync(join(process.cwd(), "fixtures", "hmrc-ct-comp", "ct-comp-2024-labels.json"), "utf8"));
const labelOf = (concept) => FIXTURE.labels[`ct-comp:${concept}`];

// The form fields with no box: each fills a trading line's concept or feeds a concept of its own.
const FIELD_CONCEPTS = {
  depreciation: "AdjustmentsDepreciation",
  amortisation: "AdjustmentsAmortisation",
  entertaining: "AdjustmentsEntertaining",
  specialRatePoolAnnualInvestmentAllowance: "SpecialRatePoolAnnualInvestmentAllowance",
  ownCorporationTax: "CorporationTaxChargeable",
};

describe("the CT computations labels", () => {
  test("name the HMRC package they come from", () => {
    expect(FIXTURE.source).toMatchObject({
      url: "http://www.hmrc.gov.uk/softwaredevelopers/ct/CT2024-v1.0.0.zip",
      size: 593165,
      sha256: "2870e82e2b5813389b886514434e6655f1f56c2247e38f4d25707be51beefd9f",
      file: "www.hmrc.gov.uk/schemas/ct/comp/2024-01-01/ct-comp/ct-comp-2024-label.xml",
    });
  });

  test("hold only concepts the 2025 taxonomy declares", () => {
    const declared = new Set(loadCtCompTaxonomyConcepts());
    for (const concept of Object.keys(FIXTURE.labels)) expect(declared.has(concept), concept).toBe(true);
  });

  test("give every concept the computations file a label", () => {
    for (const concept of [...COMPUTATIONS_CONCEPTS, "NameOfProductionSoftware", "VersionOfProductionSoftware"]) {
      expect(labelOf(concept), concept).toEqual(expect.any(String));
    }
  });

  test("are the labels of the trading lines in the computations document", () => {
    for (const line of TRADING_LINES) expect(line.label, line.key).toBe(labelOf(line.concept));
  });

  test("are the labels of the trading lines in the worked tax", () => {
    for (const line of TRADING_LINES) {
      const shown = COMPUTATION_LINES.find(({ field }) => field === line.key);
      expect(shown.meaning, line.key).toBe(labelOf(line.concept));
    }
  });

  test("are the labels of the form fields that fill or feed a concept", () => {
    for (const [id, concept] of Object.entries(FIELD_CONCEPTS)) {
      const field = CT600_FORM_FIELDS.find((candidate) => candidate.id === id);
      expect(field.label, id).toBe(labelOf(concept));
    }
  });
});
