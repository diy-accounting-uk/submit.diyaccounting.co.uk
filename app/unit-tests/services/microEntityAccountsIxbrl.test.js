// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/microEntityAccountsIxbrl.test.js

import { describe, test, expect } from "vitest";
import {
  buildMicroEntityAccounts,
  MANDATORY_CONCEPT_KEYS,
  STATEMENT_KEYS,
  DORMANT_STATEMENT_KEYS,
  sharesIssuedFor,
} from "@app/services/microEntityAccountsIxbrl.js";
import { buildContexts, formatMonetary, renderStatement, loadFrcTaxonomyConcepts, CONCEPTS } from "@app/services/accountsIxbrlCommon.js";
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

const DORMANT_INPUT = {
  ...SAMPLE_INPUT,
  dormant: true,
  dormantTradingStatus: "noLongerTrading",
  shareClass: "ordinaryShares",
  nominalValue: 0.5,
  balanceSheet: {
    current: { ...SAMPLE_INPUT.balanceSheet.prior, calledUpShareCapital: 100, profitAndLossAccount: 7900 },
    prior: SAMPLE_INPUT.balanceSheet.prior,
  },
};

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
        const elements = Array.from(document.getElementsByTagName("ix:nonNumeric")).filter(
          (el) => el.getAttribute("name") === qualifiedName,
        );
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
        const elements = Array.from(document.getElementsByTagName("ix:nonFraction")).filter(
          (el) => el.getAttribute("name") === qualifiedName,
        );
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
          current: {
            ...SAMPLE_INPUT.balanceSheet.current,
            calledUpShareCapital: 10500,
            profitAndLossAccount: -500,
            capitalAndReserves: 10000,
          },
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

  describe("buildMicroEntityAccounts for a dormant company", () => {
    const dormantXhtml = buildMicroEntityAccounts(DORMANT_INPUT);

    test("parses as well-formed XML", () => {
      expect(() => parseXmlDocument(dormantXhtml)).not.toThrow();
    });

    test("the section 480 statement is present and the section 477 statement is absent", () => {
      const names = factNames(dormantXhtml);
      expect(names).toContain(`direp:${CONCEPTS.statementAuditExemptionSection480.name}`);
      expect(names).not.toContain(`direp:${CONCEPTS.statementAuditExemptionSection477.name}`);
      expect(dormantXhtml).toContain("section 480 of the Companies Act 2006 relating to dormant companies");
    });

    test("keeps the members, directors' responsibilities and regime statements", () => {
      const names = factNames(dormantXhtml);
      for (const key of DORMANT_STATEMENT_KEYS.filter((key) => key !== "statementAuditExemptionSection480")) {
        expect(names).toContain(`${CONCEPTS[key].prefix}:${CONCEPTS[key].name}`);
      }
    });

    test("reports the dormant flag as true and the trading status at the chosen member", () => {
      expect(dormantXhtml).toMatch(/name="bus:EntityDormantTruefalse"[^>]*>true</);
      expect(dimensionNames(dormantXhtml)).toContainEqual({
        dimension: "bus:EntityTradingStatusDimension",
        member: "bus:EntityNoLongerTradingButTradedInPast",
      });
    });

    test("a company that never traded reports the never-traded member", () => {
      const xhtml = buildMicroEntityAccounts({ ...DORMANT_INPUT, dormantTradingStatus: "neverTraded" });
      expect(dimensionNames(xhtml)).toContainEqual({ dimension: "bus:EntityTradingStatusDimension", member: "bus:EntityHasNeverTraded" });
    });

    test("the share note carries the number of shares and the nominal value against the share class", () => {
      expect(dormantXhtml).toMatch(/name="core:NumberSharesIssuedFullyPaid"[^>]*unitRef="shares"[^>]*>200</);
      expect(dormantXhtml).toMatch(/name="core:NominalValueAllottedShareCapital"[^>]*unitRef="GBP"[^>]*>0.5</);
      expect(dimensionNames(dormantXhtml)).toContainEqual({
        dimension: "bus:EntityShareClassesDimension",
        member: "bus:OrdinaryShareClass1",
      });
      expect(dormantXhtml).toContain("200 ordinary shares of £0.5 each");
    });

    test("every concept it uses is in the FRS 102 taxonomy", () => {
      const known = new Set(loadFrcTaxonomyConcepts());
      for (const name of [...factNames(dormantXhtml), ...dimensionNames(dormantXhtml).flatMap((d) => [d.dimension, d.member])]) {
        expect(known.has(name), `${name} is in the taxonomy`).toBe(true);
      }
    });

    test("a company that is not dormant carries no section 480 statement, share note or trading status dimension", () => {
      const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
      const names = factNames(xhtml);
      expect(names).not.toContain(`direp:${CONCEPTS.statementAuditExemptionSection480.name}`);
      expect(names).not.toContain("core:NumberSharesIssuedFullyPaid");
      expect(dimensionNames(xhtml).map((d) => d.dimension)).not.toContain("bus:EntityTradingStatusDimension");
    });
  });

  describe("sharesIssuedFor", () => {
    test("divides the capital by the nominal value", () => {
      expect(sharesIssuedFor(100, 0.01)).toBe(10000);
      expect(sharesIssuedFor(100, 1)).toBe(100);
    });

    test("is null when the capital is not a whole number of shares or the nominal value is not positive", () => {
      expect(sharesIssuedFor(100, 30)).toBeNull();
      expect(sharesIssuedFor(100, 0)).toBeNull();
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
