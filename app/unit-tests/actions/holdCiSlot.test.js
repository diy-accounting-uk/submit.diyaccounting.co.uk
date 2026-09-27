// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/holdCiSlot.test.js

import { describe, test, expect } from "vitest";

import { isSlotSafeToHold, parameterName } from "../../../.github/actions/claim-ci-slot/hold-ci-slot.mjs";

const DELETED_REF = "refs/heads/claude/ricochet-probe";
const OTHER_REF = "refs/heads/claude/tempest-video";

function record(ref, runId = "36289825325") {
  return { ref, runId, claimedAt: "2026-09-27T02:53:36.000Z" };
}

describe("isSlotSafeToHold", () => {
  test("is safe when no claim record exists", () => {
    expect(isSlotSafeToHold(null, { deletedRef: DELETED_REF, runFinished: null })).toBe(true);
  });

  test("is safe when the claim names the ref this destroy is retiring", () => {
    expect(isSlotSafeToHold(record(DELETED_REF), { deletedRef: DELETED_REF, runFinished: null })).toBe(true);
  });

  test("is safe when the claim names a different ref whose run has finished", () => {
    expect(isSlotSafeToHold(record(OTHER_REF), { deletedRef: DELETED_REF, runFinished: true })).toBe(true);
  });

  test("is not safe when the claim names a different ref whose run is still active", () => {
    expect(isSlotSafeToHold(record(OTHER_REF), { deletedRef: DELETED_REF, runFinished: false })).toBe(false);
  });

  test("is not safe when the claiming run's status could not be determined", () => {
    expect(isSlotSafeToHold(record(OTHER_REF), { deletedRef: DELETED_REF, runFinished: null })).toBe(false);
  });

  test("ignores the ref match with no deleted ref given (the sweep and dispatch paths)", () => {
    expect(isSlotSafeToHold(record(OTHER_REF), { deletedRef: null, runFinished: false })).toBe(false);
    expect(isSlotSafeToHold(record(OTHER_REF), { deletedRef: null, runFinished: true })).toBe(true);
  });
});

describe("parameterName", () => {
  test("prefixes the slot name with the slots path", () => {
    expect(parameterName("ci-set1")).toBe("/submit/ci/slots/ci-set1");
  });
});
