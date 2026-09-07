// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/services/microEntityAccountsIxbrl.test.js

import { describe, test, expect } from "vitest";
import {
  buildMicroEntityAccounts,
  buildContexts,
  formatMonetary,
  renderStatement,
  loadFrcTaxonomyConcepts,
  MANDATORY_CONCEPT_KEYS,
  STATEMENT_KEYS,
  CONCEPTS,
} from "@app/services/microEntityAccountsIxbrl.js";
import { parseXmlDocument } from "@app/lib/xmlDom.js";

const SAMPLE_INPUT = {
  companyNumber: "02706061",
  companyName: "TEST MICRO LIMITED",
  periodStart: "2025-07-01",
  periodEnd: "2026-06-30",
  averageNumberOfEmployees: 2,
  directorName: "Jo Smith",
  dateOfApproval: "2026-09-01",
  balanceSheet: {
    current: {
      fixedAssets: 10000,
      currentAssets: 5000,
      creditorsWithinOneYear: 3000,
      creditorsAfterOneYear: 2000,
      calledUpShareCapital: 100,
      profitAndLossAccount: 9900,
      capitalAndReserves: 10000,
    },
    prior: {
      fixedAssets: 8000,
      currentAssets: 4000,
      creditorsWithinOneYear: 2500,
      creditorsAfterOneYear: 1500,
      calledUpShareCapital: 100,
      profitAndLossAccount: 7900,
      capitalAndReserves: 8000,
    },
  },
};

function factNames(xhtml) {
  const names = [];
  const pattern = /name="([a-z]+:[A-Za-z0-9-]+)"/g;
  let match;
  while ((match = pattern.exec(xhtml)) !== null) {
    names.push(match[1]);
  }
  return names;
}

function dimensionNames(xhtml) {
  const names = [];
  const pattern = /<xbrldi:explicitMember dimension="([a-z]+:[A-Za-z0-9-]+)">([a-z]+:[A-Za-z0-9-]+)</g;
  let match;
  while ((match = pattern.exec(xhtml)) !== null) {
    names.push({ dimension: match[1], member: match[2] });
  }
  return names;
}

describe("services/microEntityAccountsIxbrl", () => {
  describe("buildMicroEntityAccounts", () => {
    test("the first line is exactly the XML declaration with no leading whitespace", () => {
      const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
      const firstLine = xhtml.split("\n")[0];
      expect(firstLine).toBe('<?xml version="1.0"?>');
    });

    test("parses as well-formed XML", () => {
      const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
      expect(() => parseXmlDocument(xhtml)).not.toThrow();
    });

    test("every mandatory concept is present with a contextRef", () => {
      const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
      const document = parseXmlDocument(xhtml);
      for (const key of MANDATORY_CONCEPT_KEYS) {
        const concept = CONCEPTS[key];
        const qualifiedName = `${concept.prefix}:${concept.name}`;
        const elements = Array.from(document.getElementsByTagName("ix:nonNumeric")).filter((el) => el.getAttribute("name") === qualifiedName);
        expect(elements.length, `expected a fact for ${qualifiedName}`).toBeGreaterThan(0);
        expect(elements[0].getAttribute("contextRef")).toBeTruthy();
      }
    });

    test("each of the four statements passes its Companies House phrase check", () => {
      const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
      const document = parseXmlDocument(xhtml);

      function textFor(key) {
        const concept = CONCEPTS[key];
        const qualifiedName = `${concept.prefix}:${concept.name}`;
        const element = Array.from(document.getElementsByTagName("ix:nonNumeric")).find((el) => el.getAttribute("name") === qualifiedName);
        return element.textContent.toLowerCase();
      }

      const section477 = textFor("statementAuditExemptionSection477");
      expect(section477).toMatch(/exempt|exemption/);
      expect(section477).toContain("section 477 of the companies act 2006");

      expect(textFor("statementMembersNotRequiredAudit")).toContain("members have not required the company to obtain an audit");

      expect(textFor("statementDirectorsResponsibilities")).toContain("directors acknowledge");

      const microEntityProvisions = textFor("statementMicroEntityProvisions");
      expect(microEntityProvisions).toContain("prepared");
      expect(microEntityProvisions).toContain("in accordance with");
      expect(microEntityProvisions).toContain("provisions");
      expect(microEntityProvisions).toContain("micro");
    });

    test("every emitted concept exists in the checked-in FRC taxonomy concept list", () => {
      const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
      const concepts = loadFrcTaxonomyConcepts();
      const emitted = factNames(xhtml);
      expect(emitted.length).toBeGreaterThan(0);
      for (const name of emitted) {
        expect(concepts, `expected ${name} to exist in the FRC taxonomy concept list`).toContain(name);
      }
      for (const { dimension, member } of dimensionNames(xhtml)) {
        expect(concepts, `expected dimension ${dimension} to exist`).toContain(dimension);
        expect(concepts, `expected dimension member ${member} to exist`).toContain(member);
      }
    });

    test("EntityTradingStatus and AccountingStandardsApplied are not both reported with no dimension: only a non-default fact carries one", () => {
      const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
      const document = parseXmlDocument(xhtml);

      const tradingStatusFact = Array.from(document.getElementsByTagName("ix:nonNumeric")).find(
        (el) => el.getAttribute("name") === "bus:EntityTradingStatus",
      );
      const tradingStatusContext = document.getElementById(tradingStatusFact.getAttribute("contextRef"));
      expect(tradingStatusContext.getElementsByTagName("xbrli:segment")).toHaveLength(0);

      const accountingStandardsFact = Array.from(document.getElementsByTagName("ix:nonNumeric")).find(
        (el) => el.getAttribute("name") === "bus:AccountingStandardsApplied",
      );
      const accountingStandardsContext = document.getElementById(accountingStandardsFact.getAttribute("contextRef"));
      expect(accountingStandardsContext.getElementsByTagName("xbrli:segment")).toHaveLength(1);
      expect(accountingStandardsContext.getElementsByTagName("xbrldi:explicitMember")[0].textContent).toBe("bus:Micro-entities");
    });

    test("the balance sheet adds up: net current assets, total assets less current liabilities and net assets", () => {
      const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
      const document = parseXmlDocument(xhtml);

      function valueFor(conceptKey, contextRefSuffix) {
        const concept = CONCEPTS[conceptKey];
        const qualifiedName = `${concept.prefix}:${concept.name}`;
        const elements = Array.from(document.getElementsByTagName("ix:nonFraction")).filter((el) => el.getAttribute("name") === qualifiedName);
        const element = contextRefSuffix ? elements.find((el) => el.getAttribute("contextRef").endsWith(contextRefSuffix)) : elements[0];
        return Number(element.textContent);
      }

      expect(valueFor("netCurrentAssetsLiabilities")).toBe(2000);
      expect(valueFor("totalAssetsLessCurrentLiabilities")).toBe(12000);
      expect(valueFor("netAssetsLiabilities")).toBe(10000);
    });

    test("throws when capital and reserves does not equal the derived net assets", () => {
      const badInput = {
        ...SAMPLE_INPUT,
        balanceSheet: {
          current: { ...SAMPLE_INPUT.balanceSheet.current, capitalAndReserves: 999 },
        },
      };
      expect(() => buildMicroEntityAccounts(badInput)).toThrow(/does not equal net assets/);
    });

    test("reports a negative profit and loss account with a sign attribute rather than a negative number", () => {
      // capitalAndReserves must still equal the derived net assets (10000), so only the split
      // between the two equity components changes: calledUpShareCapital 10500 + profitAndLossAccount -500 = 10000.
      const balancedLossInput = {
        ...SAMPLE_INPUT,
        balanceSheet: {
          current: { ...SAMPLE_INPUT.balanceSheet.current, calledUpShareCapital: 10500, profitAndLossAccount: -500, capitalAndReserves: 10000 },
        },
      };
      const xhtml = buildMicroEntityAccounts(balancedLossInput);
      const document = parseXmlDocument(xhtml);
      const profitAndLossFact = Array.from(document.getElementsByTagName("ix:nonFraction")).find(
        (el) => el.getAttribute("name") === "core:Equity" && el.getAttribute("contextRef").endsWith("-profit-and-loss-account"),
      );
      expect(profitAndLossFact.getAttribute("sign")).toBe("-");
      expect(profitAndLossFact.textContent).toBe("500");
    });
  });

  describe("buildContexts", () => {
    test("names a duration context and an instant context for the current period, keyed by year", () => {
      const { refs } = buildContexts(SAMPLE_INPUT);
      expect(refs.current).toBe("y2026");
      expect(refs.currentInstant).toBe("e2026");
    });

    test("derives the prior balance sheet date as the day before the current period start when not given", () => {
      const { refs } = buildContexts(SAMPLE_INPUT);
      expect(refs.priorInstant).toBe("e2025");
    });

    test("uses an explicit priorBalanceSheetDate when one is given", () => {
      const { refs } = buildContexts({ ...SAMPLE_INPUT, priorBalanceSheetDate: "2024-12-31" });
      expect(refs.priorInstant).toBe("e2024");
    });
  });

  describe("formatMonetary", () => {
    test("rounds to whole pounds", () => {
      expect(formatMonetary(1234.6)).toBe("1235");
    });

    test("returns the magnitude for a negative value", () => {
      expect(formatMonetary(-500)).toBe("500");
    });
  });

  describe("renderStatement", () => {
    test.each(STATEMENT_KEYS)("tags %s against the given contextRef", (key) => {
      const fragment = renderStatement(key, "y2026");
      expect(fragment).toContain('contextRef="y2026"');
      const concept = CONCEPTS[key];
      expect(fragment).toContain(`name="${concept.prefix}:${concept.name}"`);
    });
  });
});
