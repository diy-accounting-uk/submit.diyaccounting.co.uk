// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/http-simulator/scenarios/penalties.test.js

import { describe, test, expect } from "vitest";
import { getPenaltiesForScenario } from "@app/http-simulator/scenarios/penalties.js";

describe("http-simulator/scenarios/penalties", () => {
  describe("getPenaltiesForScenario", () => {
    test("returns the zeroed no-penalties shape for the default scenario (no scenario header)", () => {
      const result = getPenaltiesForScenario(undefined);
      expect(result.lateSubmissionPenalty.details).toHaveLength(0);
      expect(result.latePaymentPenalty.details).toHaveLength(0);
      expect(result.lateSubmissionPenalty.summary.activePenaltyPoints).toBe(0);
    });

    test("returns HMRC's own DEFAULT scenario with penalties present", () => {
      const result = getPenaltiesForScenario("DEFAULT");
      expect(result.lateSubmissionPenalty.details.length).toBeGreaterThan(0);
      expect(result.latePaymentPenalty.details.length).toBeGreaterThan(0);
    });

    test("returns the zeroed shape for the NO_PENALTIES scenario", () => {
      const result = getPenaltiesForScenario("NO_PENALTIES");
      expect(result.lateSubmissionPenalty.details).toHaveLength(0);
      expect(result.latePaymentPenalty.details).toHaveLength(0);
    });

    test("returns a single late submission penalty for LATE_SUBMISSION scenario", () => {
      const result = getPenaltiesForScenario("LATE_SUBMISSION");
      expect(result.lateSubmissionPenalty.details).toHaveLength(1);
      expect(result.latePaymentPenalty.details).toHaveLength(0);
    });

    test("returns a single late payment penalty for LATE_PAYMENT scenario", () => {
      const result = getPenaltiesForScenario("LATE_PAYMENT");
      expect(result.lateSubmissionPenalty.details).toHaveLength(0);
      expect(result.latePaymentPenalty.details).toHaveLength(1);
    });

    test("returns one of each for MULTIPLE_PENALTIES scenario", () => {
      const result = getPenaltiesForScenario("MULTIPLE_PENALTIES");
      expect(result.lateSubmissionPenalty.details.length).toBeGreaterThanOrEqual(1);
      expect(result.latePaymentPenalty.details.length).toBeGreaterThanOrEqual(1);
    });

    test("returns multiple late payment penalties for MULTIPLE_LATE_PAYMENT_PENALTIES scenario", () => {
      const result = getPenaltiesForScenario("MULTIPLE_LATE_PAYMENT_PENALTIES");
      expect(result.latePaymentPenalty.details.length).toBeGreaterThan(1);
    });

    test("returns multiple late submission penalties for MULTIPLE_LATE_SUBMISSION_PENALTIES scenario", () => {
      const result = getPenaltiesForScenario("MULTIPLE_LATE_SUBMISSION_PENALTIES");
      expect(result.lateSubmissionPenalty.details.length).toBeGreaterThan(1);
      result.lateSubmissionPenalty.details.forEach((d) => expect(d.penaltyStatus).toBe("active"));
    });

    test("returns inactive penalty points for MULTIPLE_INACTIVE_LATE_SUBMISSION_PENALTIES scenario", () => {
      const result = getPenaltiesForScenario("MULTIPLE_INACTIVE_LATE_SUBMISSION_PENALTIES");
      expect(result.lateSubmissionPenalty.summary.inactivePenaltyPoints).toBeGreaterThan(0);
      result.lateSubmissionPenalty.details.forEach((d) => expect(d.penaltyStatus).toBe("inactive"));
    });

    test("returns a threshold penalty for THRESHOLD_LATE_SUBMISSION_PENALTIES scenario", () => {
      const result = getPenaltiesForScenario("THRESHOLD_LATE_SUBMISSION_PENALTIES");
      expect(result.lateSubmissionPenalty.details.some((d) => d.penaltyCategory === "threshold")).toBe(true);
    });

    test("returns a charge penalty for CHARGE_LATE_SUBMISSION_PENALTIES scenario", () => {
      const result = getPenaltiesForScenario("CHARGE_LATE_SUBMISSION_PENALTIES");
      expect(result.lateSubmissionPenalty.details.some((d) => d.penaltyCategory === "charge")).toBe(true);
    });

    test("returns error for NOT_FOUND scenario", () => {
      const result = getPenaltiesForScenario("NOT_FOUND");
      expect(result).toHaveProperty("status", 404);
      expect(result.body.code).toBe("NOT_FOUND");
    });

    test("returns error for INSOLVENT_TRADER scenario", () => {
      const result = getPenaltiesForScenario("INSOLVENT_TRADER");
      expect(result).toHaveProperty("status", 403);
      expect(result.body.code).toBe("RULE_INSOLVENT_TRADER");
    });

    test("returns error for VRN_INVALID scenario", () => {
      const result = getPenaltiesForScenario("VRN_INVALID");
      expect(result).toHaveProperty("status", 400);
      expect(result.body.code).toBe("VRN_INVALID");
    });

    test("handles case-insensitive scenario names", () => {
      const result1 = getPenaltiesForScenario("late_submission");
      const result2 = getPenaltiesForScenario("LATE_SUBMISSION");
      expect(result1.lateSubmissionPenalty.details.length).toBe(result2.lateSubmissionPenalty.details.length);
    });

    test("returns the zeroed no-penalties shape for an unknown scenario", () => {
      const result = getPenaltiesForScenario("UNKNOWN_SCENARIO_XYZ");
      expect(result.lateSubmissionPenalty.details).toHaveLength(0);
      expect(result.latePaymentPenalty.details).toHaveLength(0);
    });
  });
});
