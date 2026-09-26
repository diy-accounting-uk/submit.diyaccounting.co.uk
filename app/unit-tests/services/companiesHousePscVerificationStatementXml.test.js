// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHousePscVerificationStatementXml.test.js

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { parseXmlDocument, firstElement, firstElementText } from "@app/lib/xmlDom.js";
import {
  buildPscVerificationStatementBody,
  readPscVerificationIndividualElementOrder,
  assertPscVerificationStatementElementOrder,
  PSC_VERIFICATION_INDIVIDUAL_ELEMENT_ORDER,
} from "@app/services/companiesHousePscVerificationStatementXml.js";

const FIXTURES_DIR = new URL("../../../fixtures/companies-house-xmlgw/", import.meta.url);
const PSC_BASE_TYPES_XSD = readFileSync(new URL("PSCBaseTypes-v1-4.xsd", FIXTURES_DIR), "utf8");

const BASE_INPUT = {
  title: "MR",
  forename: "ALICE",
  otherForenames: "MARGARET",
  surname: "EXAMPLE",
  dobMonth: 1,
  dobYear: 1970,
  personalCode: "AB1234CD56E",
};

describe("services/companiesHousePscVerificationStatementXml", () => {
  describe("readPscVerificationIndividualElementOrder", () => {
    test("reads the Individual element order from the checked-in PSCBaseTypes-v1-4.xsd", () => {
      expect(readPscVerificationIndividualElementOrder(PSC_BASE_TYPES_XSD)).toEqual(PSC_VERIFICATION_INDIVIDUAL_ELEMENT_ORDER);
    });

    test("throws when the schema carries no PSCIdentificationType", () => {
      expect(() => readPscVerificationIndividualElementOrder('<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"/>')).toThrow(
        "PSCIdentificationType complex type not found in schema",
      );
    });
  });

  describe("assertPscVerificationStatementElementOrder", () => {
    test("passes a body whose elements are a subsequence of the schema order", () => {
      const bodyXml = `<PSCVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk"><Individual><Surname>EXAMPLE</Surname><Change/></Individual></PSCVerificationStatement>`;
      expect(() => assertPscVerificationStatementElementOrder(bodyXml)).not.toThrow();
    });

    test("throws when an element appears before one that must precede it", () => {
      const bodyXml = `<PSCVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk"><Individual><Change/><Surname>EXAMPLE</Surname></Individual></PSCVerificationStatement>`;
      expect(() => assertPscVerificationStatementElementOrder(bodyXml)).toThrow("Element Surname is out of schema order");
    });

    test("throws on an element the schema does not carry", () => {
      const bodyXml = `<PSCVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk"><Individual><NotARealElement>x</NotARealElement></Individual></PSCVerificationStatement>`;
      expect(() => assertPscVerificationStatementElementOrder(bodyXml)).toThrow(
        "Unexpected element NotARealElement in PSC verification statement body",
      );
    });

    test("throws when the body carries no Individual element", () => {
      expect(() =>
        assertPscVerificationStatementElementOrder(`<PSCVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk"/>`),
      ).toThrow("Individual element not found in PSC verification statement body");
    });
  });

  describe("buildPscVerificationStatementBody", () => {
    test("builds an Individual whose elements match the schema order read from PSCBaseTypes-v1-4.xsd", () => {
      const xml = buildPscVerificationStatementBody(BASE_INPUT);
      expect(() =>
        assertPscVerificationStatementElementOrder(xml, readPscVerificationIndividualElementOrder(PSC_BASE_TYPES_XSD)),
      ).not.toThrow();
    });

    test("carries the verification details and every identification field given", () => {
      const xml = buildPscVerificationStatementBody(BASE_INPUT);
      const document = parseXmlDocument(xml);

      expect(document.documentElement.tagName).toBe("PSCVerificationStatement");
      expect(firstElementText(document, "Title")).toBe("MR");
      expect(firstElementText(document, "Surname")).toBe("EXAMPLE");
      expect(firstElementText(document, "Forename")).toBe("ALICE");
      expect(firstElementText(document, "OtherForenames")).toBe("MARGARET");
      expect(firstElementText(document, "Month")).toBe("1");
      expect(firstElementText(document, "Year")).toBe("1970");
      expect(firstElementText(document, "CompaniesHousePersonalCode")).toBe("AB1234CD56E");
      expect(firstElementText(document, "VerificationStatementForIndividual")).toBe("INDIVIDUAL_VERIFIED");
      expect(firstElement(document, "NameMismatchReason")).toBeUndefined();
    });

    test("omits Title, Forename, OtherForenames, PartialDOB and NameMismatchReason when not given", () => {
      const xml = buildPscVerificationStatementBody({ surname: "EXAMPLE", personalCode: "AB1234CD56E" });
      const document = parseXmlDocument(xml);

      expect(firstElement(document, "Title")).toBeUndefined();
      expect(firstElement(document, "Forename")).toBeUndefined();
      expect(firstElement(document, "OtherForenames")).toBeUndefined();
      expect(firstElement(document, "PartialDOB")).toBeUndefined();
      expect(firstElement(document, "NameMismatchReason")).toBeUndefined();
      expect(firstElementText(document, "Surname")).toBe("EXAMPLE");
    });

    test("carries NameMismatchReason only when the verified name differs", () => {
      const xml = buildPscVerificationStatementBody({ ...BASE_INPUT, nameMismatchReason: "LEGALLY_CHANGED" });
      expect(firstElementText(parseXmlDocument(xml), "NameMismatchReason")).toBe("LEGALLY_CHANGED");
    });

    test("throws when surname is missing", () => {
      expect(() => buildPscVerificationStatementBody({ ...BASE_INPUT, surname: undefined })).toThrow("surname is required");
    });

    test("throws when the personal code is not 11 characters", () => {
      expect(() => buildPscVerificationStatementBody({ ...BASE_INPUT, personalCode: "TOOSHORT" })).toThrow(
        "the PSC's Companies House personal code must be 11 characters",
      );
    });
  });
});
