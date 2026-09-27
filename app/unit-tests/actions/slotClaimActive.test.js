// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/slotClaimActive.test.js

import { describe, test, expect } from "vitest";

import {
  claimIsActive,
  selfDestructClaimIsActive,
  SELF_DESTRUCT_MAX_RUNTIME_MS,
  SELF_DESTRUCT_REF,
} from "../../../.github/actions/claim-ci-slot/slot-claim-active.mjs";

describe("claimIsActive", () => {
  test.each(["in_progress", "queued", "pending", "waiting", "requested"])("treats a run in status '%s' as active", (status) => {
    expect(claimIsActive(status)).toBe(true);
  });

  test("treats a completed run as not active", () => {
    expect(claimIsActive("completed")).toBe(false);
  });

  test("treats a missing run as not active", () => {
    expect(claimIsActive(null)).toBe(false);
    expect(claimIsActive(undefined)).toBe(false);
  });
});

describe("selfDestructClaimIsActive", () => {
  const NOW_MS = Date.parse("2026-09-27T12:00:00.000Z");

  function record(claimedAt) {
    return { ref: SELF_DESTRUCT_REF, runId: "req-1234:ci-set1", claimedAt };
  }

  test("is active just inside its own maximum runtime", () => {
    const claimedAt = new Date(NOW_MS - (SELF_DESTRUCT_MAX_RUNTIME_MS - 1000)).toISOString();
    expect(selfDestructClaimIsActive(record(claimedAt), NOW_MS)).toBe(true);
  });

  test("is not active once it has outlived its own maximum runtime", () => {
    const claimedAt = new Date(NOW_MS - (SELF_DESTRUCT_MAX_RUNTIME_MS + 1000)).toISOString();
    expect(selfDestructClaimIsActive(record(claimedAt), NOW_MS)).toBe(false);
  });

  test("is not active when claimedAt cannot be parsed", () => {
    expect(selfDestructClaimIsActive(record("not-a-timestamp"), NOW_MS)).toBe(false);
  });
});
