// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseConfirmationStatementXml.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseXmlDocument, firstElementText, firstElement, allElements } from "@app/lib/xmlDom.js";
import {
  buildConfirmationStatementBody,
  readConfirmationStatementElementOrder,
  assertConfirmationStatementElementOrder,
  isOfficerIdentityVerified,
  selectConfirmationStatementSchema,
  CONFIRMATION_STATEMENT_ELEMENT_ORDER,
  CONFIRMATION_STATEMENT_V1_3_ELEMENT_ORDER,
} from "@app/services/companiesHouseConfirmationStatementXml.js";

const FIXTURES_DIR = new URL("../../../fixtures/companies-house-xmlgw/", import.meta.url);

const CONFIRMATION_AND_VERIFICATION_STATEMENT_XSD = readFileSync(
  new URL("ConfirmationAndVerificationStatement-v1-0.xsd", FIXTURES_DIR),
  "utf8",
);
const CONFIRMATION_STATEMENT_V1_3_XSD = readFileSync(new URL("ConfirmationStatement-v1-3.xsd", FIXTURES_DIR), "utf8");
const CONFIRMATION_AND_VERIFICATION_STATEMENT_EXAMPLE = readFileSync(
  new URL("ConfirmationAndVerificationStatement.xml", FIXTURES_DIR),
  "utf8",
);
const SIC_AND_SHAREHOLDER_CHANGE_EXAMPLE = readFileSync(new URL("ConfirmationStatementSICAndShareholderChange.xml", FIXTURES_DIR), "utf8");

const VERIFIED_OFFICER = { identityVerificationDetails: { appointment_verification_end_on: "9999-12-31" } };
const UNVERIFIED_OFFICER = { identityVerificationDetails: { appointment_verification_end_on: null } };

const BASE_INPUT = {
  reviewDate: "2024-08-30",
  directors: [
    {
      title: "MR",
      forename: "PERSON",
      otherForenames: "OTHER",
      surname: "NAME",
      dob: "1967-08-13",
      personalCode: "12345678951",
      nameMismatchReason: "LEGALLY_CHANGED",
    },
  ],
};

describe("services/companiesHouseConfirmationStatementXml", () => {
  describe("readConfirmationStatementElementOrder", () => {
    test("reads the element order from the checked-in ConfirmationAndVerificationStatement-v1-0.xsd", () => {
      expect(readConfirmationStatementElementOrder(CONFIRMATION_AND_VERIFICATION_STATEMENT_XSD)).toEqual(
        CONFIRMATION_STATEMENT_ELEMENT_ORDER,
      );
    });

    test("throws when the schema carries no ConfirmationAndVerificationStatement element", () => {
      expect(() => readConfirmationStatementElementOrder('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>')).toThrow(
        "ConfirmationAndVerificationStatement element not found in schema",
      );
    });
  });

  describe("assertConfirmationStatementElementOrder", () => {
    test("passes a body whose elements are a subsequence of the schema order", () => {
      const bodyXml = `<ConfirmationAndVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk"><ReviewDate>2024-08-30</ReviewDate><StateConfirmation>true</StateConfirmation></ConfirmationAndVerificationStatement>`;
      expect(() => assertConfirmationStatementElementOrder(bodyXml)).not.toThrow();
    });

    test("throws when an element appears before one that must precede it", () => {
      const bodyXml = `<ConfirmationAndVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk"><StateConfirmation>true</StateConfirmation><ReviewDate>2024-08-30</ReviewDate></ConfirmationAndVerificationStatement>`;
      expect(() => assertConfirmationStatementElementOrder(bodyXml)).toThrow("Element ReviewDate is out of schema order");
    });

    test("throws on an element the schema does not carry", () => {
      const bodyXml = `<ConfirmationAndVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk"><NotARealElement>x</NotARealElement></ConfirmationAndVerificationStatement>`;
      expect(() => assertConfirmationStatementElementOrder(bodyXml)).toThrow(
        "Unexpected element NotARealElement in confirmation statement body",
      );
    });
  });

  describe("buildConfirmationStatementBody", () => {
    test("matches the shape of the published ConfirmationAndVerificationStatement.xml example: a no-change statement with one director", () => {
      const xml = buildConfirmationStatementBody(BASE_INPUT);
      const document = parseXmlDocument(xml);
      const exampleDocument = parseXmlDocument(CONFIRMATION_AND_VERIFICATION_STATEMENT_EXAMPLE);

      expect(document.documentElement.tagName).toBe(firstElement(exampleDocument, "ConfirmationAndVerificationStatement").tagName);
      expect(firstElementText(document, "ReviewDate")).toBe("2024-08-30");
      expect(firstElementText(document, "AcceptLawfulPurposeStatement")).toBe("true");
      expect(firstElementText(document, "StateConfirmation")).toBe("true");

      const director = firstElement(document, "Director");
      const exampleDirector = firstElement(exampleDocument, "Director");
      expect(firstElementText(director, "Title")).toBe(firstElementText(exampleDirector, "Title"));
      expect(firstElementText(director, "Forename")).toBe(firstElementText(exampleDirector, "Forename"));
      expect(firstElementText(director, "OtherForenames")).toBe(firstElementText(exampleDirector, "OtherForenames"));
      expect(firstElementText(director, "Surname")).toBe(firstElementText(exampleDirector, "Surname"));
      expect(firstElementText(director, "DOB")).toBe(firstElementText(exampleDirector, "DOB"));
      expect(firstElementText(director, "CompaniesHousePersonalCode")).toBe(
        firstElementText(exampleDirector, "CompaniesHousePersonalCode"),
      );
      expect(firstElementText(director, "VerificationStatementForIndividual")).toBe("INDIVIDUAL_VERIFIED");
      expect(firstElementText(director, "NameMismatchReason")).toBe(firstElementText(exampleDirector, "NameMismatchReason"));
    });

    test("carries the namespace and schema location the published example carries", () => {
      const xml = buildConfirmationStatementBody(BASE_INPUT);
      expect(xml).toContain('xmlns="http://xmlgw.companieshouse.gov.uk"');
      expect(xml).toContain("http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/ConfirmationAndVerificationStatement-v1-0.xsd");
    });

    test("omits RegisteredEmailAddress, SICCodes, StatementOfCapital and Shareholdings when not given", () => {
      const xml = buildConfirmationStatementBody(BASE_INPUT);
      const document = parseXmlDocument(xml);
      expect(document.getElementsByTagName("RegisteredEmailAddress")).toHaveLength(0);
      expect(document.getElementsByTagName("SICCodes")).toHaveLength(0);
      expect(document.getElementsByTagName("StatementOfCapital")).toHaveLength(0);
      expect(document.getElementsByTagName("Shareholdings")).toHaveLength(0);
    });

    test("sends TradingOnMarket and DTR5Applies false for a private company", () => {
      const xml = buildConfirmationStatementBody(BASE_INPUT);
      const document = parseXmlDocument(xml);
      expect(firstElementText(document, "TradingOnMarket")).toBe("false");
      expect(firstElementText(document, "DTR5Applies")).toBe("false");
    });

    test("sends RegisteredEmailAddress only when given", () => {
      const xml = buildConfirmationStatementBody({ ...BASE_INPUT, registeredEmailAddress: "test@test.com" });
      expect(firstElementText(parseXmlDocument(xml), "RegisteredEmailAddress")).toBe("test@test.com");
    });

    test("matches the SIC codes, statement of capital and shareholdings shape of ConfirmationStatementSICAndShareholderChange.xml", () => {
      const xml = buildConfirmationStatementBody({
        ...BASE_INPUT,
        sicCodes: ["15200", "41100"],
        statementOfCapital: {
          totalAmountUnpaid: "0",
          totalNumberOfIssuedShares: "100",
          shareCurrency: "GBP",
          totalAggregateNominalValue: "100",
          shares: [{ shareClass: "ORDINARY", prescribedParticulars: "ORDINARY SHARES", numShares: "100", aggregateNominalValue: "100" }],
        },
        shareholdings: [
          { shareClass: "ORDINARY", numberHeld: "10", shareholders: [{ surname: "CONGRESSPERSONLIQUOR", forename: "JACKET" }] },
          {
            shareClass: "ORDINARY",
            numberHeld: "80",
            transfers: [{ dateOfTransfer: "2016-01-01", numberSharesTransferred: "10" }],
            shareholders: [{ surname: "CONGRESSPERSONLIQUOR", forename: "FAXRIVULET" }],
          },
        ],
      });
      const document = parseXmlDocument(xml);
      const exampleDocument = parseXmlDocument(SIC_AND_SHAREHOLDER_CHANGE_EXAMPLE);

      expect(allElements(document, "SICCode").map((el) => el.textContent)).toEqual(
        allElements(exampleDocument, "SICCode").map((el) => el.textContent),
      );

      const capital = firstElement(document, "Capital");
      const exampleCapital = firstElement(exampleDocument, "Capital");
      expect(firstElementText(capital, "TotalAmountUnpaid")).toBe(firstElementText(exampleCapital, "TotalAmountUnpaid"));
      expect(firstElementText(capital, "TotalNumberOfIssuedShares")).toBe(firstElementText(exampleCapital, "TotalNumberOfIssuedShares"));
      expect(firstElementText(capital, "ShareCurrency")).toBe(firstElementText(exampleCapital, "ShareCurrency"));

      const shareholdings = allElements(document, "Shareholdings");
      expect(shareholdings).toHaveLength(2);
      expect(firstElementText(shareholdings[1], "DateOfTransfer")).toBe("2016-01-01");
      expect(firstElementText(shareholdings[1], "NumberSharesTransferred")).toBe("10");
    });

    test("sends an AmalgamatedName shareholder when no surname can be given", () => {
      const xml = buildConfirmationStatementBody({
        ...BASE_INPUT,
        shareholdings: [{ shareClass: "ORDINARY", numberHeld: "5", shareholders: [{ amalgamatedName: "The Family Trust" }] }],
      });
      expect(firstElementText(parseXmlDocument(xml), "AmalgamatedName")).toBe("The Family Trust");
    });

    test("the built body passes its own element-order check against the schema's order", () => {
      const xml = buildConfirmationStatementBody({
        ...BASE_INPUT,
        sicCodes: ["15200"],
        statementOfCapital: {
          totalAmountUnpaid: "0",
          totalNumberOfIssuedShares: "1",
          shareCurrency: "GBP",
          totalAggregateNominalValue: "1",
          shares: [{ shareClass: "ORDINARY", prescribedParticulars: "x", numShares: "1", aggregateNominalValue: "1" }],
        },
        shareholdings: [{ shareClass: "ORDINARY", numberHeld: "1", shareholders: [{ surname: "A", forename: "B" }] }],
        registeredEmailAddress: "test@test.com",
      });
      const schemaOrder = readConfirmationStatementElementOrder(CONFIRMATION_AND_VERIFICATION_STATEMENT_XSD);
      expect(() => assertConfirmationStatementElementOrder(xml, schemaOrder)).not.toThrow();
    });

    test("rejects a reordered body: RegisteredEmailAddress placed before ReviewDate", () => {
      const reordered = `<ConfirmationAndVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk"><RegisteredEmailAddress>test@test.com</RegisteredEmailAddress><ReviewDate>2024-08-30</ReviewDate><StateConfirmation>true</StateConfirmation></ConfirmationAndVerificationStatement>`;
      const schemaOrder = readConfirmationStatementElementOrder(CONFIRMATION_AND_VERIFICATION_STATEMENT_XSD);
      expect(() => assertConfirmationStatementElementOrder(reordered, schemaOrder)).toThrow("Element ReviewDate is out of schema order");
    });

    describe("validation", () => {
      test("throws when reviewDate is missing", () => {
        expect(() => buildConfirmationStatementBody({ ...BASE_INPUT, reviewDate: undefined })).toThrow("reviewDate is required");
      });

      test("throws when reviewDate is in the future", () => {
        expect(() => buildConfirmationStatementBody({ ...BASE_INPUT, reviewDate: "2999-01-01" })).toThrow("must not be in the future");
      });

      test("throws when more than four SIC codes are given", () => {
        expect(() => buildConfirmationStatementBody({ ...BASE_INPUT, sicCodes: ["1", "2", "3", "4", "5"] })).toThrow(
          "at most four SIC codes are allowed",
        );
      });

      test("throws when no directors are given", () => {
        expect(() => buildConfirmationStatementBody({ ...BASE_INPUT, directors: [] })).toThrow(
          "at least one director's verification statement is required",
        );
      });

      test("throws when a director's personal code is not 11 characters", () => {
        expect(() =>
          buildConfirmationStatementBody({ ...BASE_INPUT, directors: [{ ...BASE_INPUT.directors[0], personalCode: "TOOSHORT" }] }),
        ).toThrow("Companies House personal code must be 11 characters");
      });

      test("throws when a director has no code at all", () => {
        expect(() =>
          buildConfirmationStatementBody({ ...BASE_INPUT, directors: [{ ...BASE_INPUT.directors[0], personalCode: undefined }] }),
        ).toThrow("Companies House personal code must be 11 characters");
      });

      test("throws when a shareholding carries no share class", () => {
        expect(() =>
          buildConfirmationStatementBody({ ...BASE_INPUT, shareholdings: [{ numberHeld: "1", shareholders: [{ surname: "A" }] }] }),
        ).toThrow("a shareholding must carry a share class");
      });

      test("throws when a director carries no OtherForenames", () => {
        expect(() =>
          buildConfirmationStatementBody({ ...BASE_INPUT, directors: [{ ...BASE_INPUT.directors[0], otherForenames: undefined }] }),
        ).toThrow("OtherForenames is required");
      });

      test("throws when a shareholding carries more than ten joint holders", () => {
        const shareholders = Array.from({ length: 11 }, (_unused, index) => ({ surname: `HOLDER${index}` }));
        expect(() =>
          buildConfirmationStatementBody({ ...BASE_INPUT, shareholdings: [{ shareClass: "ORDINARY", numberHeld: "11", shareholders }] }),
        ).toThrow("at most 10 joint holders are allowed per shareholding");
      });
    });

    describe("joint holders", () => {
      test("carries every joint holder of a shareholding as its own Shareholders element", () => {
        const xml = buildConfirmationStatementBody({
          ...BASE_INPUT,
          shareholdings: [
            {
              shareClass: "ORDINARY",
              numberHeld: "10",
              shareholders: [
                { surname: "CARTWRIGHT", forename: "ANTONY" },
                { surname: "CARTWRIGHT", forename: "SAMANTHA" },
              ],
            },
          ],
        });
        const document = parseXmlDocument(xml);
        const holders = allElements(document, "Shareholders");
        expect(holders).toHaveLength(2);
        expect(firstElementText(holders[0], "Forename")).toBe("ANTONY");
        expect(firstElementText(holders[1], "Forename")).toBe("SAMANTHA");
      });
    });

    describe("schema choice", () => {
      test("isOfficerIdentityVerified reads appointment_verification_end_on 9999-12-31 as verified", () => {
        expect(isOfficerIdentityVerified(VERIFIED_OFFICER)).toBe(true);
        expect(isOfficerIdentityVerified(UNVERIFIED_OFFICER)).toBe(false);
        expect(isOfficerIdentityVerified({})).toBe(false);
        expect(isOfficerIdentityVerified(undefined)).toBe(false);
      });

      test("selectConfirmationStatementSchema picks ConfirmationAndVerificationStatement-v1-0 while any officer is unverified", () => {
        expect(selectConfirmationStatementSchema([VERIFIED_OFFICER, UNVERIFIED_OFFICER])).toEqual({
          rootElement: "ConfirmationAndVerificationStatement",
          xsdFile: "ConfirmationAndVerificationStatement-v1-0.xsd",
        });
      });

      test("selectConfirmationStatementSchema picks ConfirmationAndVerificationStatement-v1-0 when no officers are given", () => {
        expect(selectConfirmationStatementSchema(undefined)).toEqual({
          rootElement: "ConfirmationAndVerificationStatement",
          xsdFile: "ConfirmationAndVerificationStatement-v1-0.xsd",
        });
        expect(selectConfirmationStatementSchema([])).toEqual({
          rootElement: "ConfirmationAndVerificationStatement",
          xsdFile: "ConfirmationAndVerificationStatement-v1-0.xsd",
        });
      });

      test("selectConfirmationStatementSchema picks ConfirmationStatement-v1-3 once every officer is verified", () => {
        expect(selectConfirmationStatementSchema([VERIFIED_OFFICER, VERIFIED_OFFICER])).toEqual({
          rootElement: "ConfirmationStatement",
          xsdFile: "ConfirmationStatement-v1-3.xsd",
        });
      });

      test("builds ConfirmationAndVerificationStatement with a VerificationStatement when an officer is unverified", () => {
        const xml = buildConfirmationStatementBody({ ...BASE_INPUT, officers: [VERIFIED_OFFICER, UNVERIFIED_OFFICER] });
        const document = parseXmlDocument(xml);
        expect(document.documentElement.tagName).toBe("ConfirmationAndVerificationStatement");
        expect(xml).toContain("ConfirmationAndVerificationStatement-v1-0.xsd");
        expect(document.getElementsByTagName("VerificationStatement")).toHaveLength(1);
      });

      test("builds ConfirmationStatement with no VerificationStatement once every officer is verified, and needs no directors", () => {
        const xml = buildConfirmationStatementBody({
          reviewDate: "2024-08-30",
          officers: [VERIFIED_OFFICER, VERIFIED_OFFICER],
        });
        const document = parseXmlDocument(xml);
        expect(document.documentElement.tagName).toBe("ConfirmationStatement");
        expect(xml).toContain("ConfirmationStatement-v1-3.xsd");
        expect(document.getElementsByTagName("VerificationStatement")).toHaveLength(0);
      });

      test("the ConfirmationStatement-v1-3 body passes its own element order, read from the checked-in XSD", () => {
        const xml = buildConfirmationStatementBody({
          reviewDate: "2024-08-30",
          officers: [VERIFIED_OFFICER],
        });
        expect(readConfirmationStatementElementOrder(CONFIRMATION_STATEMENT_V1_3_XSD, "ConfirmationStatement")).toEqual(
          CONFIRMATION_STATEMENT_V1_3_ELEMENT_ORDER,
        );
        expect(() => assertConfirmationStatementElementOrder(xml, CONFIRMATION_STATEMENT_V1_3_ELEMENT_ORDER)).not.toThrow();
      });
    });
  });
});
