// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/psc-verification-statement.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { createHash } from "crypto";
import { SIMULATOR_PRESENTER_ID, SIMULATOR_PRESENTER_CODE } from "@app/http-simulator/scenarios/accounts-filing.js";
import {
  submitPscVerificationStatement,
  pollPscVerificationStatement,
  resetPscVerificationStatementFilings,
} from "@app/http-simulator/scenarios/psc-verification-statement.js";

function md5Lowercase(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex").toLowerCase();
}

const VALID = { senderIdHash: md5Lowercase(SIMULATOR_PRESENTER_ID), authValueHash: md5Lowercase(SIMULATOR_PRESENTER_CODE) };
const WRONG_HASH = md5Lowercase("wrong");

describe("http-simulator/scenarios/psc-verification-statement", () => {
  beforeEach(() => {
    resetPscVerificationStatementFilings();
  });

  describe("submitPscVerificationStatement", () => {
    test("acknowledges a valid submission with a 1 second poll interval", () => {
      const result = submitPscVerificationStatement({ ...VALID, submissionNumber: "VS0001", companyNumber: "06846849" });
      expect(result.acknowledged).toBe(true);
      expect(result.pollInterval).toBe(1);
      expect(result.gatewayTimestamp).toBeTruthy();
    });

    test("returns a 502 fatal authorisation failure for an unknown authentication Value", () => {
      const result = submitPscVerificationStatement({
        senderIdHash: VALID.senderIdHash,
        authValueHash: WRONG_HASH,
        submissionNumber: "VS0001",
      });
      expect(result.errors[0]).toMatchObject({ number: 502, type: "fatal" });
    });

    test("rejects a SubmissionNumber that is not 6 characters", () => {
      const result = submitPscVerificationStatement({ ...VALID, submissionNumber: "AB1" });
      expect(result.errors[0]).toMatchObject({ number: 604, location: "SubmissionNumber" });
    });

    test("rejects a SubmissionNumber that has already been used", () => {
      submitPscVerificationStatement({ ...VALID, submissionNumber: "REUSE1" });
      const result = submitPscVerificationStatement({ ...VALID, submissionNumber: "REUSE1" });
      expect(result.errors[0]).toMatchObject({ number: 604, location: "SubmissionNumber" });
    });

    test("Gov-Test-Scenario SCHEMA_FAILURE returns a parser error", () => {
      const result = submitPscVerificationStatement({ ...VALID, submissionNumber: "VS0002", scenario: "SCHEMA_FAILURE" });
      expect(result.errors[0]).toMatchObject({ number: 604 });
    });

    test("Gov-Test-Scenario AUTH_FAILURE overrides otherwise-valid credentials", () => {
      const result = submitPscVerificationStatement({ ...VALID, submissionNumber: "VS0003", scenario: "AUTH_FAILURE" });
      expect(result.errors[0]).toMatchObject({ number: 502 });
    });
  });

  describe("pollPscVerificationStatement", () => {
    test("answers PENDING on the first poll and ACCEPT on every poll after that", () => {
      submitPscVerificationStatement({ ...VALID, submissionNumber: "VS0004", companyNumber: "06846849" });
      expect(pollPscVerificationStatement({ ...VALID, submissionNumber: "VS0004" }).statusCode).toBe("PENDING");
      expect(pollPscVerificationStatement({ ...VALID, submissionNumber: "VS0004" }).statusCode).toBe("ACCEPT");
      expect(pollPscVerificationStatement({ ...VALID, submissionNumber: "VS0004" }).statusCode).toBe("ACCEPT");
    });

    test("returns undefined for a submission number this module never registered", () => {
      expect(pollPscVerificationStatement({ ...VALID, submissionNumber: "NEVER1" })).toBeUndefined();
    });

    test("Gov-Test-Scenario PENDING_FOREVER never advances to ACCEPT", () => {
      submitPscVerificationStatement({ ...VALID, submissionNumber: "VS0005" });
      pollPscVerificationStatement({ ...VALID, submissionNumber: "VS0005", scenario: "PENDING_FOREVER" });
      const result = pollPscVerificationStatement({ ...VALID, submissionNumber: "VS0005", scenario: "PENDING_FOREVER" });
      expect(result.statusCode).toBe("PENDING");
    });

    test("Gov-Test-Scenario AUTH_FAILURE overrides otherwise-valid credentials", () => {
      submitPscVerificationStatement({ ...VALID, submissionNumber: "VS0006" });
      const result = pollPscVerificationStatement({ ...VALID, submissionNumber: "VS0006", scenario: "AUTH_FAILURE" });
      expect(result.errors[0]).toMatchObject({ number: 502 });
    });
  });
});
