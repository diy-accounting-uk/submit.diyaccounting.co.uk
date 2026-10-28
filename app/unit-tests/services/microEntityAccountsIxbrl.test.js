// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/microEntityAccountsIxbrl.test.js

import { readFileSync } from "node:fs";
import { describe, test, expect } from "vitest";
import {
  buildMicroEntityAccounts,
  MANDATORY_CONCEPT_KEYS,
  STATEMENT_KEYS,
  DORMANT_STATEMENT_KEYS,
  sharesIssuedFor,
} from "@app/services/microEntityAccountsIxbrl.js";
import {
  buildContexts,
  formatMonetary,
  renderStatement,
  loadFrcTaxonomyConcepts,
  countryMemberForCompanyNumber,
  CONCEPTS,
} from "@app/services/accountsIxbrlCommon.js";
import { parseXmlDocument } from "@app/lib/xmlDom.js";

const SAMPLE_INPUT = {
  companyNumber: "02706061",
  companyName: "TEST MICRO LIMITED",
  registeredOffice: { addressLine1: "1 Test Street", cityOrTown: "London", postalCode: "EC1A 1AA" },
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

// The countries module is outside the business, core and direp lists in the checked-in concept file.
function inFrcBusinessOrCoreTaxonomy({ dimension, member }) {
  return !dimension.startsWith("countries:") && !member.startsWith("countries:");
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

const PACKAGE_VERSION = JSON.parse(readFileSync(new URL("../../../package.json", import.meta.url), "utf8")).version;

function hiddenText(xhtml, name) {
  const hidden = parseXmlDocument(xhtml).getElementsByTagName("ix:hidden")[0];
  return Array.from(hidden.getElementsByTagName("ix:nonNumeric")).find((fact) => fact.getAttribute("name") === name)?.textContent;
}

describe("services/microEntityAccountsIxbrl", () => {
  describe("buildMicroEntityAccounts", () => {
    test("names the production software and its package version in the hidden section", () => {
      const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
      expect(hiddenText(xhtml, "bus:NameProductionSoftware")).toBe("DIY Accounting Submit");
      expect(hiddenText(xhtml, "bus:VersionProductionSoftware")).toBe(PACKAGE_VERSION);
    });

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
      for (const { dimension, member } of dimensionNames(xhtml).filter(inFrcBusinessOrCoreTaxonomy)) {
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
        return Number(element.textContent.replaceAll(",", ""));
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

  describe("buildMicroEntityAccounts descriptive facts", () => {
    const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
    const dormantXhtml = buildMicroEntityAccounts(DORMANT_INPUT);

    test("reports filleted accounts, because no profit and loss account is delivered", () => {
      for (const document of [xhtml, dormantXhtml]) {
        expect(dimensionNames(document)).toContainEqual({ dimension: "bus:AccountsTypeDimension", member: "bus:FilletedAccounts" });
        expect(hiddenText(document, "bus:ReportIncludesDetailedProfitLossStatementTruefalse")).toBe("false");
        expect(hiddenText(document, "direp:EntityHasTakenExemptionUnderCompaniesActInNotPublishingItsOwnProfitLossAccountTruefalse")).toBe(
          "true",
        );
      }
    });

    test("tags the report title, the authorising body and the signing director as an officer", () => {
      expect(xhtml).toMatch(/name="bus:ReportTitle" contextRef="y2026">Unaudited micro-entity accounts</);
      expect(xhtml).toMatch(/name="core:DescriptionBodyAuthorisingFinancialStatements" contextRef="y2026">the board of directors</);
      expect(xhtml).toMatch(/name="bus:NameEntityOfficer" contextRef="y2026-director-1">Jo Smith</);
      expect(xhtml).toMatch(
        /name="core:StatementComplianceWithApplicableReportingFramework" contextRef="y2026">These financial statements/,
      );
    });

    test("states the company information in the first note", () => {
      for (const document of [xhtml, dormantXhtml]) {
        expect(document).toContain("is a private company limited by shares, registered in England and Wales, registered number");
        expect(document).toContain(
          'Its registered office is <ix:nonNumeric name="bus:AddressLine1" contextRef="y2026-registered-office">1 Test Street</ix:nonNumeric>, <ix:nonNumeric name="bus:PrincipalLocation-CityOrTown" contextRef="y2026-registered-office">London</ix:nonNumeric>, <ix:nonNumeric name="bus:PostalCodeZip" contextRef="y2026-registered-office">EC1A 1AA</ix:nonNumeric>.',
        );
      }
      expect(() => buildMicroEntityAccounts({ ...SAMPLE_INPUT, registeredOffice: {} })).toThrow(/registeredOffice/);
    });

    test("tags every registered office part on the registered office context and omits an absent part", () => {
      const document = buildMicroEntityAccounts({
        ...SAMPLE_INPUT,
        registeredOffice: {
          addressLine1: "Unit 1",
          addressLine2: "High Street",
          cityOrTown: "Leeds",
          countyRegion: "West Yorkshire",
          postalCode: "LS1 1AA",
          country: "England",
        },
      });
      expect(document).toMatch(/<xbrli:context id="y2026-registered-office">.*bus:EntityContactTypeDimension">bus:RegisteredOffice</);
      for (const [concept, value] of [
        ["AddressLine1", "Unit 1"],
        ["AddressLine2", "High Street"],
        ["PrincipalLocation-CityOrTown", "Leeds"],
        ["CountyRegion", "West Yorkshire"],
        ["PostalCodeZip", "LS1 1AA"],
      ]) {
        expect(document).toContain(`name="bus:${concept}" contextRef="y2026-registered-office">${value}<`);
      }
      expect(document).toContain("</ix:nonNumeric>, England, <ix:nonNumeric");
      expect(document).not.toContain("bus:AddressLine3");
    });

    test("states the report period, language and sterling currency on the contexts where they are not defaults", () => {
      for (const document of [xhtml, dormantXhtml]) {
        expect(document).toContain('<ix:nonNumeric name="bus:ReportPeriod" contextRef="y2026"></ix:nonNumeric>');
        expect(document).toContain('<ix:nonNumeric name="bus:ReportPrincipalLanguage" contextRef="y2026"></ix:nonNumeric>');
        expect(document).toContain(
          '<ix:nonNumeric name="bus:PrincipalCurrencyUsedInBusinessReport" contextRef="y2026-currency"></ix:nonNumeric>',
        );
        expect(document).toMatch(/<xbrli:context id="y2026-currency">.*curr:CurrenciesDimension">curr:PoundSterling</);
        expect(document).toContain('xmlns:curr="http://xbrl.frc.org.uk/cd/2026-01-01/currencies"');
      }
    });

    test("prints the never-traded sentence only for a company that has never traded", () => {
      const neverTraded = buildMicroEntityAccounts({ ...DORMANT_INPUT, dormantTradingStatus: "neverTraded" });
      const sentence = "The company has not traded during the year or the preceding financial period.";
      expect(neverTraded).toContain(sentence);
      expect(neverTraded).toContain("therefore no profit and loss account is presented.");
      expect(dormantXhtml).not.toContain(sentence);
      expect(xhtml).not.toContain(sentence);
    });

    test("describes a dormant company as dormant and a trading company with the micro-entity default", () => {
      expect(hiddenText(dormantXhtml, "bus:DescriptionPrincipalActivities")).toBe("Dormant company");
      expect(hiddenText(xhtml, "bus:DescriptionPrincipalActivities")).toBe("No description of principal activity");
    });

    test("puts DirectorSigningFinancialStatements on the signing director's officer context, with the name on the same context", () => {
      for (const document of [xhtml, dormantXhtml]) {
        const parsed = parseXmlDocument(document);
        const signing = Array.from(parsed.getElementsByTagName("ix:nonNumeric")).find(
          (el) => el.getAttribute("name") === "core:DirectorSigningFinancialStatements",
        );
        const context = parsed.getElementById(signing.getAttribute("contextRef"));
        expect(context.getElementsByTagName("xbrldi:explicitMember")[0].getAttribute("dimension")).toBe("bus:EntityOfficersDimension");
        expect(context.getElementsByTagName("xbrldi:explicitMember")[0].textContent).toBe("bus:Director1");
        expect(document).toContain(`name="bus:NameEntityOfficer" contextRef="${signing.getAttribute("contextRef")}"`);
      }
    });

    test("describes the company: legal form, country of formation, scope, no amendment, entry-point match, small companies regime", () => {
      for (const document of [xhtml, dormantXhtml]) {
        expect(dimensionNames(document)).toContainEqual({
          dimension: "bus:LegalFormEntityDimension",
          member: "bus:PrivateLimitedCompanyLtd",
        });
        expect(dimensionNames(document)).toContainEqual({
          dimension: "countries:CountriesRegionsDimension",
          member: "countries:EnglandWales",
        });
        expect(dimensionNames(document)).toContainEqual({
          dimension: "bus:ApplicableLegislationDimension",
          member: "bus:SmallCompaniesRegimeForAccounts",
        });
        expect(factNames(document)).toContain("bus:LegalFormEntity");
        expect(factNames(document)).toContain("bus:CountryFormationOrIncorporation");
        expect(factNames(document)).toContain("bus:ScopeAccounts");
        expect(hiddenText(document, "bus:ReportAnAmendedRevisedVersionPreviouslyFiledReportTruefalse")).toBe("false");
        expect(hiddenText(document, "bus:AccountingStandardsAppliedMatchesTaxonomyEntry-pointTruefalse")).toBe("true");
      }
    });

    test("states that the accounts were delivered under the small companies regime (section 444(5))", () => {
      for (const document of [xhtml, dormantXhtml]) {
        expect(document).toContain(
          "prepared in accordance with the provisions applicable to companies subject to the micro-entities regime and delivered in accordance with the provisions applicable to companies subject to the small companies regime.",
        );
      }
    });
  });

  describe("buildMicroEntityAccounts layout", () => {
    const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
    const document = parseXmlDocument(xhtml);

    test("the ix:header sits inside a div hidden with display:none", () => {
      const header = document.getElementsByTagName("ix:header")[0];
      expect(header.parentNode.localName).toBe("div");
      expect(header.parentNode.getAttribute("style")).toBe("display:none");
    });

    test("every figure on the balance sheet sits in a labelled table row with both years", () => {
      const rows = Array.from(document.getElementsByTagName("tr")).map((row) =>
        Array.from(row.getElementsByTagName("td")).map((cell) => cell.textContent.trim()),
      );
      expect(rows).toContainEqual(["Fixed assets", "10,000", "8,000"]);
      expect(rows).toContainEqual(["Creditors: amounts falling due within one year", "(3,000)", "(2,500)"]);
      expect(rows).toContainEqual(["Net assets", "10,000", "8,000"]);
      expect(rows).toContainEqual(["Shareholders' funds", "10,000", "8,000"]);
      const headings = Array.from(document.getElementsByTagName("th")).map((cell) => cell.textContent);
      expect(headings).toEqual(expect.arrayContaining(["2026", "2025", "£"]));
    });

    test("no fact sits outside a table, a paragraph or the hidden header", () => {
      for (const fact of [...document.getElementsByTagName("ix:nonFraction"), ...document.getElementsByTagName("ix:nonNumeric")]) {
        expect(["td", "p", "ix:hidden"], fact.getAttribute("name")).toContain(
          fact.parentNode.localName === "hidden" ? "ix:hidden" : fact.parentNode.localName,
        );
      }
    });

    test("carries no script, link, image or external stylesheet", () => {
      for (const tag of ["script", "a", "img", "link", "iframe", "object"]) {
        expect(document.getElementsByTagName(tag), tag).toHaveLength(0);
      }
      expect(xhtml).toContain('<style type="text/css">');
    });

    test("writes dates as printed accounts do and tags them with the English date transform", () => {
      expect(xhtml).toMatch(/name="bus:BalanceSheetDate" contextRef="e2026" format="ixt2:datedaymonthyearen">30 June 2026</);
      expect(xhtml).toContain("for the year ended 30 June 2026");
    });
  });

  describe("buildMicroEntityAccounts for a dormant company", () => {
    const dormantXhtml = buildMicroEntityAccounts(DORMANT_INPUT);

    test("parses as well-formed XML", () => {
      expect(() => parseXmlDocument(dormantXhtml)).not.toThrow();
    });

    test("names the production software and its package version in the hidden section", () => {
      expect(hiddenText(dormantXhtml, "bus:NameProductionSoftware")).toBe("DIY Accounting Submit");
      expect(hiddenText(dormantXhtml, "bus:VersionProductionSoftware")).toBe(PACKAGE_VERSION);
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
      expect(dormantXhtml).toMatch(
        /name="core:NumberSharesIssuedFullyPaid"[^>]*contextRef="e\d{4}-share-class"[^>]*unitRef="shares"[^>]*>200</,
      );
      expect(dormantXhtml).toMatch(
        /name="core:NominalValueAllottedShareCapital"[^>]*contextRef="y\d{4}-share-class"[^>]*unitRef="GBP"[^>]*>0.5</,
      );
      expect(dimensionNames(dormantXhtml)).toContainEqual({
        dimension: "bus:EntityShareClassesDimension",
        member: "bus:OrdinaryShareClass1",
      });
      expect(dormantXhtml).toMatch(/>200<\/ix:nonFraction> ordinary shares of £<ix:nonFraction[^>]*>0.5<\/ix:nonFraction> each/);
    });

    test("the share note uses the singular for one share", () => {
      const single = buildMicroEntityAccounts({ ...DORMANT_INPUT, nominalValue: 100 });
      expect(single).toMatch(/>1<\/ix:nonFraction> ordinary share of £<ix:nonFraction[^>]*>100<\/ix:nonFraction> each/);
    });

    test("every concept it uses is in the FRS 102 taxonomy", () => {
      const known = new Set(loadFrcTaxonomyConcepts());
      for (const name of [
        ...factNames(dormantXhtml),
        ...dimensionNames(dormantXhtml)
          .filter(inFrcBusinessOrCoreTaxonomy)
          .flatMap((d) => [d.dimension, d.member]),
      ]) {
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

  describe("buildMicroEntityAccounts balance sheet headings", () => {
    const withHeadings = {
      ...SAMPLE_INPUT,
      balanceSheet: {
        current: {
          calledUpShareCapitalNotPaid: 100,
          fixedAssets: 10000,
          currentAssets: 5000,
          prepaymentsAccruedIncome: 400,
          creditorsWithinOneYear: 3000,
          creditorsAfterOneYear: 2000,
          provisionsForLiabilities: 300,
          accrualsDeferredIncome: 200,
          calledUpShareCapital: 100,
          profitAndLossAccount: 9900,
          capitalAndReserves: 10000,
        },
        prior: { ...SAMPLE_INPUT.balanceSheet.prior, prepaymentsAccruedIncome: 50, accrualsDeferredIncome: 50 },
      },
    };
    const xhtml = buildMicroEntityAccounts(withHeadings);

    test("tags each heading with a taxonomy concept on both balance sheet dates", () => {
      const concepts = loadFrcTaxonomyConcepts();
      for (const key of ["calledUpShareCapitalNotPaid", "prepaymentsAccruedIncome", "provisionsForLiabilities", "accrualsDeferredIncome"]) {
        const { prefix, name } = CONCEPTS[key];
        expect(concepts.includes(`${prefix}:${name}`)).toBe(true);
        expect(xhtml.match(new RegExp(`name="${prefix}:${name}"`, "g"))).toHaveLength(2);
      }
    });

    test("a heading one year carries shows as nil in the other year", () => {
      expect(xhtml).toMatch(/name="core:CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset"[^>]*>0</);
    });

    test("the headings enter net current assets, total assets less current liabilities and net assets", () => {
      expect(xhtml).toMatch(/name="core:NetCurrentAssetsLiabilities"[^>]*>2,400</);
      expect(xhtml).toMatch(/name="core:TotalAssetsLessCurrentLiabilities"[^>]*>12,500</);
      expect(xhtml).toMatch(/name="core:NetAssetsLiabilities"[^>]*>10,000</);
    });

    test("refuses capital and reserves that ignore a heading", () => {
      const input = structuredClone(withHeadings);
      input.balanceSheet.current.accrualsDeferredIncome = 0;
      expect(() => buildMicroEntityAccounts(input)).toThrow(/does not equal net assets/);
    });

    test("headings of zero in every year change no output", () => {
      const zeroed = structuredClone(SAMPLE_INPUT);
      for (const year of [zeroed.balanceSheet.current, zeroed.balanceSheet.prior]) {
        Object.assign(year, {
          calledUpShareCapitalNotPaid: 0,
          prepaymentsAccruedIncome: 0,
          provisionsForLiabilities: 0,
          accrualsDeferredIncome: 0,
        });
      }
      expect(buildMicroEntityAccounts(zeroed)).toBe(buildMicroEntityAccounts(SAMPLE_INPUT));
    });

    test("a dormant set states it has not acted as an agent and a trading set does not", () => {
      expect(hiddenText(buildMicroEntityAccounts(DORMANT_INPUT), "direp:CompanyHasActedAsAnAgentDuringPeriodTruefalse")).toBe("false");
      expect(buildMicroEntityAccounts(SAMPLE_INPUT)).not.toContain("CompanyHasActedAsAnAgentDuringPeriodTruefalse");
    });
  });

  describe("countryMemberForCompanyNumber", () => {
    test("reads the country of formation from the company number prefix", () => {
      expect(countryMemberForCompanyNumber("03176906").name).toBe("EnglandWales");
      expect(countryMemberForCompanyNumber("SC123456").name).toBe("Scotland");
      expect(countryMemberForCompanyNumber("NI012345").name).toBe("NorthernIreland");
      expect(countryMemberForCompanyNumber("R0000123").name).toBe("NorthernIreland");
      expect(countryMemberForCompanyNumber("OC301234").name).toBe("EnglandWales");
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
      expect(formatMonetary(1234.6)).toBe("1,235");
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

describe("the accountants' report of a micro-entity", () => {
  const accountantsReport = { accountantsName: "Test Firm LLP", statement: "We compiled these accounts." };

  test("adds the page after the cover, tags the firm and statement and uses the with-accountants status member", () => {
    for (const input of [SAMPLE_INPUT, DORMANT_INPUT]) {
      const xhtml = buildMicroEntityAccounts({ ...input, accountantsReport });
      expect(() => parseXmlDocument(xhtml)).not.toThrow();
      expect(xhtml).toMatch(/name="bus:NameEntityAccountants" contextRef="y2026">Test Firm LLP</);
      expect(xhtml).toMatch(/name="accrep:StatementOnScopeAccountantsReport" contextRef="y2026">We compiled these accounts\.</);
      expect(xhtml.indexOf("Accountants' report")).toBeGreaterThan(xhtml.indexOf('class="page cover"'));
      expect(xhtml.indexOf("Accountants' report")).toBeLessThan(
        xhtml.indexOf("<h1>Balance sheet") === -1 ? xhtml.indexOf("Balance sheet") : xhtml.indexOf("<h1>Balance sheet"),
      );
      expect(dimensionNames(xhtml)).toContainEqual({
        dimension: "bus:AccountsStatusDimension",
        member: "bus:AuditExemptWithAccountantsReport",
      });
      expect(dimensionNames(xhtml)).not.toContainEqual({
        dimension: "bus:AccountsStatusDimension",
        member: "bus:AuditExempt-NoAccountantsReport",
      });
    }
  });

  test("a request without the report builds no accountants' facts", () => {
    const xhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
    expect(xhtml).not.toContain("NameEntityAccountants");
    expect(xhtml).not.toContain("accrep:");
  });
});
