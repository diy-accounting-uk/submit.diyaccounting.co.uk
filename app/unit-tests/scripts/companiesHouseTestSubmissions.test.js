// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  testSubmissionCases,
  buildTestSubmission,
  validateTestSubmission,
  validationSubmissionNumbers,
  fileDecision,
  firstNewFiling,
  measureLag,
  LAG_READ_INTERVAL_MS,
  LAG_READ_LIMIT_MS,
  DEFAULT_TEST_COMPANY,
  FICTIONAL_COMPANY_NUMBER,
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
    expect(countBy("change-of-name")).toBe(3);
    expect(countBy("psc-statement-notification")).toBe(5);
    expect(countBy("psc-statement-withdrawal")).toBe(1);
    expect(countBy("psc-notification")).toBe(6);
    expect(countBy("officer-appointment")).toBe(4);
    expect(countBy("officer-change")).toBe(4);
    expect(countBy("allotment-of-shares")).toBe(4);
  });

  test("hold PSC01's firm and trust influence beside another control held the same way, and a personal code typed in groups", () => {
    const notifications = cases.filter((testCase) => testCase.kind === "psc-notification").map((testCase) => testCase.body);
    expect(notifications.map((body) => body.naturesOfControl)).toContainEqual([
      "SIGINFLUENCECONTROL_AS_FIRM",
      "OWNERSHIPOFSHARES_25TO50PERCENT_AS_FIRM",
    ]);
    expect(notifications.map((body) => body.naturesOfControl)).toContainEqual([
      "SIGINFLUENCECONTROL_AS_TRUST",
      "VOTINGRIGHTS_50TO75PERCENT_AS_TRUST",
    ]);
    expect(notifications.map((body) => body.personalCode)).toContain("CWMP S832 223");
  });

  test("expect a rejection only for the extension past 18 months and the Welsh name ending on an English company", () => {
    expect(cases.filter((testCase) => testCase.expectedOutcome === "REJECT").map((testCase) => testCase.caseName)).toEqual([
      "an extension past 18 months",
      "a Welsh company's name ending CYFYNGEDIG",
    ]);
    const welsh = cases.find((testCase) => testCase.caseName === "a Welsh company's name ending CYFYNGEDIG");
    expect(welsh.note).toMatch(/registered in Wales/);
    expect(welsh.note).toMatch(/first test-service run checks/);
  });

  test("name each case once within its form kind", () => {
    const names = cases.map((testCase) => `${testCase.kind}: ${testCase.caseName}`);
    expect(new Set(names).size).toBe(names.length);
  });

  test("name no real company: each registration number a fictional company carries matches no company on the register", () => {
    const numbersIn = (value) =>
      value && typeof value === "object"
        ? Object.entries(value).flatMap(([key, inner]) =>
            key === "registrationNumber" && typeof inner === "string" ? [inner] : numbersIn(inner),
          )
        : [];
    const given = cases.flatMap((testCase) => numbersIn(testCase.body));
    expect(given.length).toBeGreaterThan(0);
    expect([...new Set(given)]).toEqual([FICTIONAL_COMPANY_NUMBER]);
  });

  test("name no company or public body the live register or the country holds, and ask for no name already registered", () => {
    // Each is a register entry (HARBOUR HOLDINGS LIMITED 00333059, SECRETARIAT
    // LIMITED 04947224, MORGAN TECHNICAL SERVICES LIMITED SC114128) or a real council.
    const sent = JSON.stringify(cases.map((testCase) => testCase.body));
    for (const name of [
      "HARBOUR HOLDINGS LIMITED",
      '"SECRETARIAT LIMITED"',
      "MORGAN TECHNICAL SERVICES LIMITED",
      "CEREDIGION COUNTY COUNCIL",
    ]) {
      expect(sent, name).not.toContain(name);
    }
  });

  test("send the late return of allotment with the capital confirmed, as its name says", () => {
    const late = cases.find((testCase) => testCase.caseName.startsWith("a late return"));
    expect(late.body.capitalDifferenceConfirmed).toBe(true);
    const plain = cases.find((testCase) => testCase.caseName === "an allotment of ordinary shares (SH01)");
    expect(plain.body).not.toHaveProperty("capitalDifferenceConfirmed");
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
      expect(elementText(envelopeXml, "Class")).toBe(COMPANIES_HOUSE_FORMS[testCase.kind].gatewayClass);
      return elementText(envelopeXml, "SubmissionNumber");
    });
    expect(sent).toEqual(numbers);
  });

  test("give every form a FormIdentifier that names the root element of the XML its builder writes", () => {
    for (const kind of new Set(cases.map((testCase) => testCase.kind))) {
      const testCase = cases.find((candidate) => candidate.kind === kind);
      const { formXml } = buildTestSubmission(testCase, { submissionNumber: "ROOT01" });
      const [, rootElement] = /^<([A-Za-z]+)[\s>]/.exec(formXml);
      expect(rootElement, kind).toBe(COMPANIES_HOUSE_FORMS[kind].formIdentifier);
    }
  });

  test("attach the letter of permission to the sensitive-word change of name only", () => {
    const withDocument = cases.filter((testCase, index) =>
      buildTestSubmission(testCase, { submissionNumber: numbers[index] }).envelopeXml.includes("<Document>"),
    );
    expect(withDocument.map((testCase) => testCase.caseName)).toEqual(["a sensitive word with its letter of permission"]);
  });

  test("state each currency's capital in its own Capital, and allot each class in its own currency", async () => {
    const names = ["a company with pounds capital allots dollar shares", "a company with pounds and euro capital allots in both"];
    const allotmentCases = names.map((name) =>
      cases.find((testCase) => testCase.kind === "allotment-of-shares" && testCase.caseName === name),
    );
    expect(allotmentCases.every(Boolean)).toBe(true);
    const built = allotmentCases.map((testCase) => buildTestSubmission(testCase, { submissionNumber: "SH0001" }));
    const currenciesOf = (xml, element) =>
      [...xml.matchAll(new RegExp(`<${element}>[\\s\\S]*?<ShareCurrency>(\\w+)</ShareCurrency>`, "g"))].map((match) => match[1]);
    expect(built.map(({ requestErrors }) => requestErrors)).toEqual([[], []]);
    expect(currenciesOf(built[0].formXml, "Capital")).toEqual(["GBP", "USD"]);
    expect(currenciesOf(built[0].formXml, "Allotment")).toEqual(["USD"]);
    expect(currenciesOf(built[1].formXml, "Capital")).toEqual(["GBP", "EUR"]);
    expect(currenciesOf(built[1].formXml, "Allotment")).toEqual(["GBP", "EUR"]);
    expect(built[1].formXml).toContain("<TotalNumberOfIssuedShares>120</TotalNumberOfIssuedShares><ShareCurrency>GBP</ShareCurrency>");
    expect(built[1].formXml).toContain("<TotalNumberOfIssuedShares>15</TotalNumberOfIssuedShares><ShareCurrency>EUR</ShareCurrency>");
    for (const submission of built) {
      expect(await validateTestSubmission(submission, "ReturnofAllotmentShares-v3-0.xsd")).toEqual({ bodyErrors: [], envelopeErrors: [] });
    }
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

describe("the measure of the register's lag after an acceptance", () => {
  const EARLIER = new Set(["T1", "T2"]);
  const history = (...ids) => ({ filings: ids.map((transactionId) => ({ transactionId, type: "PSC07" })) });

  // A clock that moves only when the measure waits.
  function clock() {
    let ms = 0;
    return { now: () => ms, wait: async (waitMs) => (ms += waitMs) };
  }

  test("finds the first filing that was not in the history before", () => {
    expect(firstNewFiling(EARLIER, history("T3", "T1").filings)).toEqual({ transactionId: "T3", type: "PSC07" });
    expect(firstNewFiling(EARLIER, history("T1", "T2").filings)).toBeUndefined();
  });

  test("reads every 30 seconds and gives the minutes until the filing shows", async () => {
    const { now, wait } = clock();
    const answers = [history("T1", "T2"), null, history("T1", "T2"), history("T3", "T1", "T2")];
    const result = await measureLag({ readHistory: async () => answers.shift(), earlierIds: EARLIER, acceptedAtMs: 0, now, wait });
    expect(LAG_READ_INTERVAL_MS).toBe(30_000);
    expect(result).toEqual({ shown: true, minutes: 1.5, reads: 4, failedReads: 1, transactionId: "T3", type: "PSC07" });
  });

  test("a filing already on the register at the first read has no lag", async () => {
    const { now, wait } = clock();
    const result = await measureLag({ readHistory: async () => history("T3"), earlierIds: EARLIER, acceptedAtMs: 0, now, wait });
    expect(result).toMatchObject({ shown: true, minutes: 0, reads: 1 });
  });

  test("stops after 30 minutes when the filing never shows", async () => {
    const { now, wait } = clock();
    const result = await measureLag({ readHistory: async () => history("T1"), earlierIds: EARLIER, acceptedAtMs: 0, now, wait });
    expect(LAG_READ_LIMIT_MS).toBe(30 * 60 * 1000);
    expect(result).toEqual({ shown: false, minutes: 30.5, reads: 61, failedReads: 0 });
  });
});
