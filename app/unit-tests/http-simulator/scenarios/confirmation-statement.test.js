// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/confirmation-statement.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { createHash } from "crypto";
import { SIMULATOR_PRESENTER_ID, SIMULATOR_PRESENTER_CODE } from "@app/http-simulator/scenarios/accounts-filing.js";
import {
  requestCompanyData,
  requestPaymentPeriods,
  submitConfirmationStatement,
  pollConfirmationStatement,
  resetConfirmationStatementFilings,
  FIXTURE_COMPANY_NUMBER,
  FIXTURE_COMPANY_AUTHENTICATION_CODE,
  FIXTURE_COMPANY,
} from "@app/http-simulator/scenarios/confirmation-statement.js";

function md5Lowercase(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex").toLowerCase();
}

const VALID = { senderIdHash: md5Lowercase(SIMULATOR_PRESENTER_ID), authValueHash: md5Lowercase(SIMULATOR_PRESENTER_CODE) };
const WRONG_HASH = md5Lowercase("wrong");

describe("http-simulator/scenarios/confirmation-statement", () => {
  beforeEach(() => {
    resetConfirmationStatementFilings();
  });

  describe("requestCompanyData", () => {
    test("answers the fixture company for the fixture company number and authentication code", () => {
      const result = requestCompanyData({
        ...VALID,
        companyNumber: FIXTURE_COMPANY_NUMBER,
        companyAuthenticationCode: FIXTURE_COMPANY_AUTHENTICATION_CODE,
      });
      expect(result.company).toBe(FIXTURE_COMPANY);
    });

    test("the fixture company carries two directors and one share class", () => {
      expect(FIXTURE_COMPANY.officers).toHaveLength(2);
      expect(FIXTURE_COMPANY.officers.every((officer) => officer.role === "director")).toBe(true);
      expect(FIXTURE_COMPANY.shareholdings.every((holding) => holding.shareClass === "ORDINARY")).toBe(true);
    });

    test("rejects a company number that does not match the fixture", () => {
      const result = requestCompanyData({
        ...VALID,
        companyNumber: "00000000",
        companyAuthenticationCode: FIXTURE_COMPANY_AUTHENTICATION_CODE,
      });
      expect(result.errors[0]).toMatchObject({ number: 604, location: "CompanyAuthenticationCode" });
    });

    test("rejects a company authentication code that does not match the fixture", () => {
      const result = requestCompanyData({ ...VALID, companyNumber: FIXTURE_COMPANY_NUMBER, companyAuthenticationCode: "WRONGCODE" });
      expect(result.errors[0]).toMatchObject({ number: 604 });
    });

    test("returns a 502 fatal authorisation failure for an unknown SenderID", () => {
      const result = requestCompanyData({
        senderIdHash: WRONG_HASH,
        authValueHash: VALID.authValueHash,
        companyNumber: FIXTURE_COMPANY_NUMBER,
        companyAuthenticationCode: FIXTURE_COMPANY_AUTHENTICATION_CODE,
      });
      expect(result.errors[0]).toMatchObject({ number: 502, type: "fatal" });
    });

    test("Gov-Test-Scenario AUTH_FAILURE overrides otherwise-valid credentials", () => {
      const result = requestCompanyData({
        ...VALID,
        companyNumber: FIXTURE_COMPANY_NUMBER,
        companyAuthenticationCode: FIXTURE_COMPANY_AUTHENTICATION_CODE,
        scenario: "AUTH_FAILURE",
      });
      expect(result.errors[0]).toMatchObject({ number: 502 });
    });
  });

  describe("requestPaymentPeriods", () => {
    test("answers periodPaid false by default", () => {
      const result = requestPaymentPeriods({
        ...VALID,
        companyNumber: FIXTURE_COMPANY_NUMBER,
        companyAuthenticationCode: FIXTURE_COMPANY_AUTHENTICATION_CODE,
      });
      expect(result.periodPaid).toBe(false);
    });

    test("Gov-Test-Scenario CS_PERIOD_PAID answers periodPaid true", () => {
      const result = requestPaymentPeriods({
        ...VALID,
        companyNumber: FIXTURE_COMPANY_NUMBER,
        companyAuthenticationCode: FIXTURE_COMPANY_AUTHENTICATION_CODE,
        scenario: "CS_PERIOD_PAID",
      });
      expect(result.periodPaid).toBe(true);
    });

    test("rejects a company authentication code that does not match the fixture", () => {
      const result = requestPaymentPeriods({ ...VALID, companyNumber: FIXTURE_COMPANY_NUMBER, companyAuthenticationCode: "WRONGCODE" });
      expect(result.errors[0]).toMatchObject({ number: 604 });
    });
  });

  describe("submitConfirmationStatement", () => {
    test("acknowledges a valid submission with a 1 second poll interval", () => {
      const result = submitConfirmationStatement({ ...VALID, submissionNumber: "CS0001", companyNumber: FIXTURE_COMPANY_NUMBER });
      expect(result.acknowledged).toBe(true);
      expect(result.pollInterval).toBe(1);
      expect(result.gatewayTimestamp).toBeTruthy();
    });

    test("returns a 502 fatal authorisation failure for an unknown authentication Value", () => {
      const result = submitConfirmationStatement({
        senderIdHash: VALID.senderIdHash,
        authValueHash: WRONG_HASH,
        submissionNumber: "CS0001",
      });
      expect(result.errors[0]).toMatchObject({ number: 502, type: "fatal" });
    });

    test("rejects a SubmissionNumber that is not 6 characters", () => {
      const result = submitConfirmationStatement({ ...VALID, submissionNumber: "AB1" });
      expect(result.errors[0]).toMatchObject({ number: 604, location: "SubmissionNumber" });
    });

    test("rejects a SubmissionNumber that has already been used", () => {
      submitConfirmationStatement({ ...VALID, submissionNumber: "REUSE1" });
      const result = submitConfirmationStatement({ ...VALID, submissionNumber: "REUSE1" });
      expect(result.errors[0]).toMatchObject({ number: 604, location: "SubmissionNumber" });
    });

    test("Gov-Test-Scenario SCHEMA_FAILURE returns a parser error", () => {
      const result = submitConfirmationStatement({ ...VALID, submissionNumber: "CS0002", scenario: "SCHEMA_FAILURE" });
      expect(result.errors[0]).toMatchObject({ number: 604 });
    });

    test("Gov-Test-Scenario CS_DUPLICATE_SHAREHOLDING returns a fatal 9999", () => {
      const result = submitConfirmationStatement({ ...VALID, submissionNumber: "CS0003", scenario: "CS_DUPLICATE_SHAREHOLDING" });
      expect(result.errors[0]).toMatchObject({ number: 9999, type: "fatal", text: "Duplicate ShareholdingId" });
    });

    test("Gov-Test-Scenario CS_INSUFFICIENT_FUNDS returns a fatal 5006", () => {
      const result = submitConfirmationStatement({ ...VALID, submissionNumber: "CS0004", scenario: "CS_INSUFFICIENT_FUNDS" });
      expect(result.errors[0]).toMatchObject({ number: 5006, type: "fatal" });
    });
  });

  describe("pollConfirmationStatement", () => {
    test("answers PENDING on the first poll and ACCEPT on every poll after that", () => {
      submitConfirmationStatement({ ...VALID, submissionNumber: "CS0005", companyNumber: FIXTURE_COMPANY_NUMBER });
      expect(pollConfirmationStatement({ ...VALID, submissionNumber: "CS0005" }).statusCode).toBe("PENDING");
      expect(pollConfirmationStatement({ ...VALID, submissionNumber: "CS0005" }).statusCode).toBe("ACCEPT");
      expect(pollConfirmationStatement({ ...VALID, submissionNumber: "CS0005" }).statusCode).toBe("ACCEPT");
    });

    test("returns undefined for a submission number this module never registered", () => {
      expect(pollConfirmationStatement({ ...VALID, submissionNumber: "NEVER1" })).toBeUndefined();
    });

    test("Gov-Test-Scenario CS_SHAREHOLDERS_REQUIRED answers REJECT with RejectCode 11686", () => {
      submitConfirmationStatement({ ...VALID, submissionNumber: "CS0006" });
      const result = pollConfirmationStatement({ ...VALID, submissionNumber: "CS0006", scenario: "CS_SHAREHOLDERS_REQUIRED" });
      expect(result.statusCode).toBe("REJECT");
      expect(result.rejections[0]).toMatchObject({ rejectCode: "11686" });
    });

    test("Gov-Test-Scenario CS_DIRECTOR_NOT_VERIFIED answers REJECT naming the first fixture director", () => {
      submitConfirmationStatement({ ...VALID, submissionNumber: "CS0007" });
      const result = pollConfirmationStatement({ ...VALID, submissionNumber: "CS0007", scenario: "CS_DIRECTOR_NOT_VERIFIED" });
      expect(result.statusCode).toBe("REJECT");
      expect(result.rejections[0]).toMatchObject({ rejectCode: "12604" });
      expect(result.rejections[0].description).toContain("ALICE EXAMPLE");
    });

    test("Gov-Test-Scenario PENDING_FOREVER never advances to ACCEPT", () => {
      submitConfirmationStatement({ ...VALID, submissionNumber: "CS0008" });
      pollConfirmationStatement({ ...VALID, submissionNumber: "CS0008", scenario: "PENDING_FOREVER" });
      const result = pollConfirmationStatement({ ...VALID, submissionNumber: "CS0008", scenario: "PENDING_FOREVER" });
      expect(result.statusCode).toBe("PENDING");
    });

    test("Gov-Test-Scenario AUTH_FAILURE overrides otherwise-valid credentials", () => {
      submitConfirmationStatement({ ...VALID, submissionNumber: "CS0009" });
      const result = pollConfirmationStatement({ ...VALID, submissionNumber: "CS0009", scenario: "AUTH_FAILURE" });
      expect(result.errors[0]).toMatchObject({ number: 502 });
    });
  });
});
