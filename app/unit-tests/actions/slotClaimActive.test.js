// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/slotClaimActive.test.js

import { describe, test, expect } from "vitest";

import { claimIsActive } from "../../../.github/actions/claim-ci-slot/slot-claim-active.mjs";

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
