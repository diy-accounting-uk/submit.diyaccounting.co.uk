// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/holdNativeAuth.test.js

import { describe, test, expect } from "vitest";

import {
  holdersParameterName,
  isHolderStale,
  addHolder,
  removeHolder,
} from "../../../.github/actions/hold-native-auth/hold-native-auth.mjs";

const NOW_MS = Date.parse("2026-09-27T00:00:00.000Z");
const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

function holder(id, since = "2026-09-26T23:59:00.000Z", runId = "36278688448") {
  return { id, runId, workflow: "probe-test", since };
}

describe("holdersParameterName", () => {
  test("scopes the parameter to the environment", () => {
    expect(holdersParameterName("prod")).toBe("/submit/prod/native-auth-holders");
    expect(holdersParameterName("ci")).toBe("/submit/ci/native-auth-holders");
  });
});

describe("isHolderStale", () => {
  test("is held just inside the staleness window with its run still unfinished", () => {
    expect(isHolderStale(holder("run-1"), { nowMs: NOW_MS, staleAfterMs: STALE_AFTER_MS, runFinished: false })).toBe(false);
  });

  test("is stale once it has outlived the staleness window even with its run unfinished", () => {
    const oldHolder = holder("run-1", "2026-09-26T19:00:00.000Z");
    expect(isHolderStale(oldHolder, { nowMs: NOW_MS, staleAfterMs: STALE_AFTER_MS, runFinished: false })).toBe(true);
  });

  test("is stale once its run has finished, even inside the staleness window", () => {
    expect(isHolderStale(holder("run-1"), { nowMs: NOW_MS, staleAfterMs: STALE_AFTER_MS, runFinished: true })).toBe(true);
  });

  test("is held while its run's status could not be determined", () => {
    expect(isHolderStale(holder("run-1"), { nowMs: NOW_MS, staleAfterMs: STALE_AFTER_MS, runFinished: null })).toBe(false);
  });

  test("is stale when its timestamp cannot be parsed", () => {
    expect(isHolderStale(holder("run-1", "not-a-timestamp"), { nowMs: NOW_MS, staleAfterMs: STALE_AFTER_MS, runFinished: false })).toBe(
      true,
    );
  });
});

describe("addHolder", () => {
  test("appends a new holder", () => {
    const holders = addHolder([holder("run-1")], holder("run-2"));
    expect(holders.map((h) => h.id)).toEqual(["run-1", "run-2"]);
  });

  test("is idempotent against a holder with the same id already present", () => {
    const existing = [holder("run-1")];
    expect(addHolder(existing, holder("run-1", "2026-09-27T00:00:00.000Z"))).toEqual(existing);
  });

  test("appends to an empty list", () => {
    expect(addHolder([], holder("run-1"))).toEqual([holder("run-1")]);
  });
});

describe("removeHolder", () => {
  test("removes the holder matching the given id", () => {
    const holders = removeHolder([holder("run-1"), holder("run-2")], "run-1");
    expect(holders.map((h) => h.id)).toEqual(["run-2"]);
  });

  test("is a no-op when no holder matches the given id", () => {
    const holders = [holder("run-1")];
    expect(removeHolder(holders, "run-2")).toEqual(holders);
  });

  test("against an empty list returns an empty list", () => {
    expect(removeHolder([], "run-1")).toEqual([]);
  });
});
