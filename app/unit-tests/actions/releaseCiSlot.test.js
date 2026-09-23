// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/releaseCiSlot.test.js

import { describe, test, expect } from "vitest";

import { shouldReleaseSlot } from "../../../.github/actions/claim-ci-slot/release-ci-slot.mjs";

function record(runId, ref = "refs/heads/claude/b62-board", claimedAt = "2026-09-20T22:00:00.000Z") {
  return { ref, runId, claimedAt };
}

describe("shouldReleaseSlot", () => {
  test("releases a claim that still names this run", () => {
    expect(shouldReleaseSlot(record("35761188691"), "35761188691")).toBe(true);
  });

  test("leaves a claim that names a different run", () => {
    expect(shouldReleaseSlot(record("35767761916"), "35761188691")).toBe(false);
  });

  test("is a no-op against an absent claim", () => {
    expect(shouldReleaseSlot(null, "35761188691")).toBe(false);
  });
});
