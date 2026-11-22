// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  testSubmissionCases,
  buildTestSubmission,
  validateTestSubmission,
  validationSubmissionNumbers,
  fileDecision,
  DEFAULT_TEST_COMPANY,
} from "../../../scripts/companies-house-test-submissions.mjs";
import { GATEWAY_FORM_BUILDERS } from "../../services/companiesHouseForms.js";
import { COMPANIES_HOUSE_FORMS } from "../../../web/public/lib/companies-house-forms.js";

const TODAY = "2026-11-22";
const cases = testSubmissionCases({ today: TODAY });
const numbers = validationSubmissionNumbers(cases.length, 123456);

const countBy = (kind) => cases.filter((testCase) => testCase.kind === kind).length;
const elementText = (xml, name) => xml.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1];

describe("the Companies House test submissions", () => {
  test("give every form kind of the shared filing route its cases, and no other kind", () => {
    expect(new Set(cases.map((testCase) => testCase.kind))).toEqual(
      new Set(Object.keys(GATEWAY_FORM_BUILDERS).filter((kind) => kind !== "psc-verification-statement")),
    );
    expect(countBy("psc-cessation")).toBe(2);
    expect(countBy("psc-change-details")).toBe(2);
    expect(countBy("accounting-reference-date")).toBe(3);
    expect(countBy("officer-resignation")).toBe(2);
    expect(countBy("sail-address")).toBe(1);
    expect(countBy("record-location")).toBe(2);
    expect(countBy("change-of-name")).toBe(2);
    expect(countBy("psc-statement-notification")).toBe(5);
    expect(countBy("psc-statement-withdrawal")).toBe(1);
  });

  test("expect a rejection only for the extension past 18 months", () => {
    expect(cases.filter((testCase) => testCase.expectedOutcome === "REJECT").map((testCase) => testCase.caseName)).toEqual([
      "an extension past 18 months",
    ]);
  });

  test("name each case once within its form kind", () => {
    const names = cases.map((testCase) => `${testCase.kind}: ${testCase.caseName}`);
    expect(new Set(names).size).toBe(names.length);
  });

  test("file on the test company by default", () => {
    for (const testCase of cases) {
      expect(testCase.body.companyNumber).toBe(DEFAULT_TEST_COMPANY.companyNumber);
      expect(testCase.body.companyName).toBe(DEFAULT_TEST_COMPANY.companyName);
    }
  });

  test("give each case a six-character submission number of its own", () => {
    expect(new Set(numbers).size).toBe(cases.length);
    for (const number of numbers) expect(number).toMatch(/^[0-9A-Z]{6}$/);
    expect(validationSubmissionNumbers(2, 36 ** 6 - 1)).toEqual(["ZZZZZZ", "000000"]);
  });

  test("build every envelope with the test flag, its form's identifier and its own submission number", () => {
    const sent = cases.map((testCase, index) => {
      const { envelopeXml, requestErrors } = buildTestSubmission(testCase, { submissionNumber: numbers[index] });
      expect(requestErrors).toEqual([]);
      expect(elementText(envelopeXml, "GatewayTest")).toBe("1");
      expect(elementText(envelopeXml, "FormIdentifier")).toBe(COMPANIES_HOUSE_FORMS[testCase.kind].formIdentifier);
      expect(elementText(envelopeXml, "Class")).toBe(COMPANIES_HOUSE_FORMS[testCase.kind].formIdentifier);
      return elementText(envelopeXml, "SubmissionNumber");
    });
    expect(sent).toEqual(numbers);
  });

  test("attach the letter of permission to the sensitive-word change of name only", () => {
    const withDocument = cases.filter((testCase, index) =>
      buildTestSubmission(testCase, { submissionNumber: numbers[index] }).envelopeXml.includes("<Document>"),
    );
    expect(withDocument.map((testCase) => testCase.caseName)).toEqual(["a sensitive word with its letter of permission"]);
  });

  test("report a request the form's own check refuses, and build nothing for it", () => {
    const refused = { ...cases[0], body: { ...cases[0].body, surname: "" } };
    const built = buildTestSubmission(refused, { submissionNumber: "000001" });
    expect(built.requestErrors).toContain("Missing surname");
    expect(built.envelopeXml).toBe("");
  });

  test("skip a form with a fee unless fee forms are included, and say why", () => {
    const nameChange = cases.find((testCase) => testCase.kind === "change-of-name");
    expect(fileDecision(nameChange, false)).toEqual({ send: false, reason: expect.stringContaining("--include-fee-forms") });
    expect(fileDecision(nameChange, true)).toEqual({ send: true });
    expect(fileDecision(cases[0], false)).toEqual({ send: true });
  });
});

describe("the schema check of a test submission", () => {
  const testCase = cases.find((candidate) => candidate.kind === "psc-cessation");
  const { schema } = COMPANIES_HOUSE_FORMS[testCase.kind];
  const built = buildTestSubmission(testCase, { submissionNumber: "000001" });

  test("passes a body and an envelope that match their schemas", async () => {
    expect(await validateTestSubmission(built, schema)).toEqual({ bodyErrors: [], envelopeErrors: [] });
  });

  test("fails a body that breaks the form's schema, in the body and inside the envelope", async () => {
    const broken = (xml) => xml.replace("<CessationDate>", "<CessationDay>").replace("</CessationDate>", "</CessationDay>");
    expect(built.formXml).toContain("<CessationDate>");
    const result = await validateTestSubmission({ formXml: broken(built.formXml), envelopeXml: broken(built.envelopeXml) }, schema);
    expect(result.bodyErrors.length).toBeGreaterThan(0);
    expect(result.envelopeErrors.length).toBeGreaterThan(0);
  });

  test("fails an envelope whose submission number breaks FormSubmission's schema", async () => {
    const result = await validateTestSubmission(
      { formXml: built.formXml, envelopeXml: built.envelopeXml.replace("<SubmissionNumber>000001<", "<SubmissionNumber>1<") },
      schema,
    );
    expect(result.bodyErrors).toEqual([]);
    expect(result.envelopeErrors.join(" ")).toContain("SubmissionNumber");
  });

  test("fails an envelope whose GovTalk header breaks the envelope's schema", async () => {
    const result = await validateTestSubmission(
      { formXml: built.formXml, envelopeXml: built.envelopeXml.replace("<EnvelopeVersion>1.0</EnvelopeVersion>", "") },
      schema,
    );
    expect(result.envelopeErrors.length).toBeGreaterThan(0);
  });
});
