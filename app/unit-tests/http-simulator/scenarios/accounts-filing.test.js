// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/http-simulator/scenarios/accounts-filing.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { createHash } from "crypto";
import {
  submitAccounts,
  pollStatus,
  resetAccountsFilings,
  SIMULATOR_PRESENTER_ID,
  SIMULATOR_PRESENTER_CODE,
} from "@app/http-simulator/scenarios/accounts-filing.js";

function md5Lowercase(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex").toLowerCase();
}

const VALID = { senderIdHash: md5Lowercase(SIMULATOR_PRESENTER_ID), authValueHash: md5Lowercase(SIMULATOR_PRESENTER_CODE) };
const WRONG_HASH = md5Lowercase("wrong");

describe("http-simulator/scenarios/accounts-filing", () => {
  beforeEach(() => {
    resetAccountsFilings();
  });

  describe("submitAccounts", () => {
    test("acknowledges a valid submission with a 1 second poll interval", () => {
      const result = submitAccounts({ ...VALID, submissionNumber: "AAA001", companyNumber: "02706061" });
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
  });
});
