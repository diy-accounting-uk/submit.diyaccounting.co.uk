// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/accounts-filing.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { createHash } from "crypto";
import {
  submitAccounts,
  pollStatus,
  resetAccountsFilings,
  breaksRevisedAccountsRule,
  REVISED_ACCOUNTS_RULE_ERROR,
  SIMULATOR_PRESENTER_ID,
  SIMULATOR_PRESENTER_CODE,
} from "@app/http-simulator/scenarios/accounts-filing.js";

function md5Lowercase(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex").toLowerCase();
}

const VALID = { senderIdHash: md5Lowercase(SIMULATOR_PRESENTER_ID), authValueHash: md5Lowercase(SIMULATOR_PRESENTER_CODE) };
const WRONG_HASH = md5Lowercase("wrong");

const REVISED_FLAG = "bus:ReportAnAmendedRevisedVersionPreviouslyFiledReportTruefalse";
const REVISION_STATEMENTS = {
  "bus:StatementThatRevisedReportReplacesPreviouslyFiledReportForPeriod":
    "These revised accounts replace the original accounts for the year ended 30 June 2026.",
  "bus:StatementThatThisReportNowStatutoryAccountsForPeriod": "They are now the statutory accounts of the company for that year.",
  "bus:StatementThatThisReportHasBeenPreparedAsDatePreviouslyFiledReport": "They are prepared as at the date of the original accounts.",
  "bus:StatementRespectsInWhichPreviouslyFiledReportDidNotComplyWithCompaniesAct2006":
    "The original balance sheet omitted the share capital.",
  "bus:StatementSignificantAmendmentsToPreviouslyFiledReport": "The share capital is now shown.",
  "bus:DateApprovalRevisionReport": "1 October 2026",
};

// A minimal iXBRL accounts document holding the given facts, each as visible text.
function ixbrlDocument(facts) {
  const factsXml = Object.entries(facts)
    .map(([name, text]) => `<p><ix:nonNumeric name="${name}" contextRef="current">${text}</ix:nonNumeric></p>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body>${factsXml}</body></html>`;
}

const REVISED_BY_REPLACEMENT = ixbrlDocument({ [REVISED_FLAG]: "true", ...REVISION_STATEMENTS });
const REVISED_BY_SUPPLEMENTARY_NOTE = ixbrlDocument({
  [REVISED_FLAG]: "true",
  "bus:SupplementaryNote": "Note 3 omitted the share capital, which is £100.",
});
const REVISED_WITH_NEITHER = ixbrlDocument({ [REVISED_FLAG]: "true" });
const ORIGINAL = ixbrlDocument({ [REVISED_FLAG]: "false" });

describe("http-simulator/scenarios/accounts-filing", () => {
  beforeEach(() => {
    resetAccountsFilings();
  });

  describe("the revised accounts rule", () => {
    test("acknowledges a revised document that states every fact of a revision by replacement", () => {
      const result = submitAccounts({ ...VALID, submissionNumber: "REV001", companyNumber: "00000009", ixbrl: REVISED_BY_REPLACEMENT });
      expect(result.acknowledged).toBe(true);
    });

    test("acknowledges a revised document with a non-empty supplementary note", () => {
      const result = submitAccounts({
        ...VALID,
        submissionNumber: "REV002",
        companyNumber: "00000009",
        ixbrl: REVISED_BY_SUPPLEMENTARY_NOTE,
      });
      expect(result.acknowledged).toBe(true);
    });

    test("refuses a revised document with neither form of revision, with the validator's text", () => {
      const result = submitAccounts({ ...VALID, submissionNumber: "REV003", companyNumber: "00000009", ixbrl: REVISED_WITH_NEITHER });
      expect(result.errors).toEqual([REVISED_ACCOUNTS_RULE_ERROR]);
      expect(result.errors[0]).toMatchObject({ raisedBy: "Accounts", number: 9999, type: "fatal" });
      expect(result.errors[0].text).toContain("either SupplementaryNote must be provided and be non-empty");
    });

    test("leaves the submission number of a refused revision free for the corrected document", () => {
      submitAccounts({ ...VALID, submissionNumber: "REV004", companyNumber: "00000009", ixbrl: REVISED_WITH_NEITHER });
      const corrected = submitAccounts({ ...VALID, submissionNumber: "REV004", companyNumber: "00000009", ixbrl: REVISED_BY_REPLACEMENT });
      expect(corrected.acknowledged).toBe(true);
    });

    test("refuses a revised document that lacks one fact of a revision by replacement", () => {
      const { "bus:DateApprovalRevisionReport": _date, ...fiveStatements } = REVISION_STATEMENTS;
      expect(breaksRevisedAccountsRule(ixbrlDocument({ [REVISED_FLAG]: "true", ...fiveStatements }))).toBe(true);
    });

    test("refuses a revised document whose statements or note are empty", () => {
      const emptyStatements = Object.fromEntries(Object.keys(REVISION_STATEMENTS).map((name) => [name, " "]));
      expect(breaksRevisedAccountsRule(ixbrlDocument({ [REVISED_FLAG]: "true", ...emptyStatements }))).toBe(true);
      expect(breaksRevisedAccountsRule(ixbrlDocument({ [REVISED_FLAG]: "true", "bus:SupplementaryNote": "" }))).toBe(true);
    });

    test("acknowledges an original document, whether its revised fact is false or absent", () => {
      expect(submitAccounts({ ...VALID, submissionNumber: "ORI001", companyNumber: "00000009", ixbrl: ORIGINAL }).acknowledged).toBe(true);
      expect(breaksRevisedAccountsRule(ixbrlDocument({}))).toBe(false);
    });

    test("does not apply to a document that is not XML", () => {
      expect(breaksRevisedAccountsRule("not an accounts document")).toBe(false);
    });
  });

  describe("submitAccounts", () => {
    test("acknowledges a valid submission with a 1 second poll interval", () => {
      const result = submitAccounts({ ...VALID, submissionNumber: "AAA001", companyNumber: "00000009" });
      expect(result.acknowledged).toBe(true);
      expect(result.pollInterval).toBe(1);
      expect(result.gatewayTimestamp).toBeTruthy();
    });

    test("returns a 502 fatal authorisation failure for an unknown SenderID", () => {
      const result = submitAccounts({ senderIdHash: WRONG_HASH, authValueHash: VALID.authValueHash, submissionNumber: "AAA001" });
      expect(result.errors[0]).toMatchObject({ number: 502, type: "fatal" });
    });

    test("returns a 502 fatal authorisation failure for an unknown authentication Value", () => {
      const result = submitAccounts({ senderIdHash: VALID.senderIdHash, authValueHash: WRONG_HASH, submissionNumber: "AAA001" });
      expect(result.errors[0]).toMatchObject({ number: 502, type: "fatal" });
    });

    test("rejects a SubmissionNumber that is not 6 characters", () => {
      const result = submitAccounts({ ...VALID, submissionNumber: "AB1" });
      expect(result.errors[0]).toMatchObject({ number: 604, location: "SubmissionNumber" });
    });

    test("rejects a SubmissionNumber that has already been used", () => {
      submitAccounts({ ...VALID, submissionNumber: "REUSE1" });
      const result = submitAccounts({ ...VALID, submissionNumber: "REUSE1" });
      expect(result.errors[0]).toMatchObject({ number: 604, location: "SubmissionNumber" });
    });

    test("Gov-Test-Scenario AUTH_FAILURE overrides otherwise-valid credentials", () => {
      const result = submitAccounts({ ...VALID, submissionNumber: "AAA002", scenario: "AUTH_FAILURE" });
      expect(result.errors[0]).toMatchObject({ number: 502 });
    });

    test("Gov-Test-Scenario SCHEMA_FAILURE returns a parser error", () => {
      const result = submitAccounts({ ...VALID, submissionNumber: "AAA003", scenario: "SCHEMA_FAILURE" });
      expect(result.errors[0]).toMatchObject({ number: 604 });
    });

    test("Gov-Test-Scenario INVALID_SCHEMA_URI answers error 505, as the test service did for a FormSubmission with no outer schemaLocation", () => {
      const result = submitAccounts({ ...VALID, submissionNumber: "AAA005", scenario: "INVALID_SCHEMA_URI" });
      expect(result.errors[0]).toMatchObject({ number: 505, text: "Invalid schema URI supplied" });
    });

    test("Gov-Test-Scenario AUTH_CODE_TOO_LONG answers error 100, as the test service did for an 11-character company authentication code", () => {
      const result = submitAccounts({ ...VALID, submissionNumber: "AAA006", scenario: "AUTH_CODE_TOO_LONG" });
      expect(result.errors[0]).toMatchObject({ number: 100 });
    });
  });

  describe("pollStatus", () => {
    test("answers PENDING on the first poll and ACCEPT on every poll after that", () => {
      submitAccounts({ ...VALID, submissionNumber: "POLL01" });
      expect(pollStatus({ ...VALID, submissionNumber: "POLL01" }).statusCode).toBe("PENDING");
      expect(pollStatus({ ...VALID, submissionNumber: "POLL01" }).statusCode).toBe("ACCEPT");
      expect(pollStatus({ ...VALID, submissionNumber: "POLL01" }).statusCode).toBe("ACCEPT");
    });

    test("answers a business error for a submission number that was never submitted", () => {
      const result = pollStatus({ ...VALID, submissionNumber: "NEVER1" });
      expect(result.errors[0]).toMatchObject({ type: "business", text: "No Transaction Found" });
    });

    test("Gov-Test-Scenario ACCOUNTS_REJECTED answers REJECT with a reject reason", () => {
      submitAccounts({ ...VALID, submissionNumber: "REJCT1" });
      const result = pollStatus({ ...VALID, submissionNumber: "REJCT1", scenario: "ACCOUNTS_REJECTED" });
      expect(result.statusCode).toBe("REJECT");
      expect(result.rejections[0]).toMatchObject({ rejectCode: "1" });
    });

    test("Gov-Test-Scenario PENDING_FOREVER never advances to ACCEPT", () => {
      submitAccounts({ ...VALID, submissionNumber: "STUCK1" });
      pollStatus({ ...VALID, submissionNumber: "STUCK1", scenario: "PENDING_FOREVER" });
      const result = pollStatus({ ...VALID, submissionNumber: "STUCK1", scenario: "PENDING_FOREVER" });
      expect(result.statusCode).toBe("PENDING");
    });

    test("Gov-Test-Scenario AUTH_FAILURE overrides otherwise-valid credentials", () => {
      submitAccounts({ ...VALID, submissionNumber: "AAA004" });
      const result = pollStatus({ ...VALID, submissionNumber: "AAA004", scenario: "AUTH_FAILURE" });
      expect(result.errors[0]).toMatchObject({ number: 502 });
    });

    test("Gov-Test-Scenario PRESENTER_ID_MISSING answers error 9999, as the test presenter's broken account does (B34.6c)", () => {
      submitAccounts({ ...VALID, submissionNumber: "AAA007" });
      const result = pollStatus({ ...VALID, submissionNumber: "AAA007", scenario: "PRESENTER_ID_MISSING" });
      expect(result.errors[0]).toMatchObject({ number: 9999, text: "No presenter ID supplied" });
    });
  });
});
