// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/claimCiSlot.test.js

import { describe, test, expect } from "vitest";

import { isSlotFree } from "../../../.github/actions/claim-ci-slot/claim-ci-slot.mjs";

const OWN_REF = "refs/heads/claude/ops-b30r-slots";
const OTHER_REF = "refs/heads/claude/ops-b30at1-second";
const NOW_MS = Date.parse("2026-09-26T02:00:00.000Z");
const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

function record(ref, claimedAt) {
  return { ref, runId: "36205802882", claimedAt };
}

function isFree(record, overrides = {}) {
  return isSlotFree(record, {
    ref: OWN_REF,
    nowMs: NOW_MS,
    staleAfterMs: STALE_AFTER_MS,
    slot: "ci-set2",
    runFinished: null,
    lastKnownGood: "ci-set1",
    ...overrides,
  });
}

describe("isSlotFree", () => {
  test("is free when no claim record exists", () => {
    expect(isFree(null)).toBe(true);
  });

  test("is free when the claim names this run's own ref", () => {
    expect(isFree(record(OWN_REF, "2026-09-26T01:59:00.000Z"))).toBe(true);
  });

  test("is free when the claim's timestamp cannot be parsed", () => {
    expect(isFree(record(OTHER_REF, "not-a-timestamp"))).toBe(true);
  });

  test("is free once the claim has outlived the staleness window", () => {
    expect(isFree(record(OTHER_REF, "2026-09-25T22:00:00.000Z"))).toBe(true);
  });

  test("is held just inside the staleness window", () => {
    expect(isFree(record(OTHER_REF, "2026-09-25T23:30:00.000Z"))).toBe(false);
  });

  test("is free once the claiming run has finished and the slot is not last-known-good", () => {
    expect(isFree(record(OTHER_REF, "2026-09-26T01:00:00.000Z"), { runFinished: true, lastKnownGood: "ci-set1" })).toBe(true);
  });

  test("is held once the claiming run has finished but the slot is last-known-good", () => {
    expect(isFree(record(OTHER_REF, "2026-09-26T01:00:00.000Z"), { runFinished: true, lastKnownGood: "ci-set2" })).toBe(false);
  });

  test("is held while the claiming run is still unfinished", () => {
    expect(isFree(record(OTHER_REF, "2026-09-26T01:00:00.000Z"), { runFinished: false, lastKnownGood: "ci-set1" })).toBe(false);
  });

  test("is held when the claiming run's status could not be determined", () => {
    expect(isFree(record(OTHER_REF, "2026-09-26T01:00:00.000Z"), { runFinished: null, lastKnownGood: "ci-set1" })).toBe(false);
  });

  test("is held when no last-known-good deployment is on record but the run is unfinished", () => {
    expect(isFree(record(OTHER_REF, "2026-09-26T01:00:00.000Z"), { runFinished: false, lastKnownGood: null })).toBe(false);
  });

  test("is free when the run has finished and no last-known-good deployment is on record", () => {
    expect(isFree(record(OTHER_REF, "2026-09-26T01:00:00.000Z"), { runFinished: true, lastKnownGood: null })).toBe(true);
  });
});
