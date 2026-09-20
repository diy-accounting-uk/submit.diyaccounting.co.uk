// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/slotForRef.test.js

import { describe, test, expect } from "vitest";

import { slotForRef } from "../../../.github/actions/claim-ci-slot/slot-for-ref.mjs";

function record(name, ref, runId = "1", claimedAt = "2026-09-20T22:00:00.000Z") {
  return { name: `/submit/ci/slots/${name}`, value: JSON.stringify({ ref, runId, claimedAt }) };
}

describe("slotForRef", () => {
  test("returns the slot name whose record ref matches", () => {
    const records = [record("ci-set1", "refs/heads/claude/dg-1h-callbacks"), record("ci-set2", "refs/heads/claude/dg-2a-retention")];

    expect(slotForRef(records, "refs/heads/claude/dg-2a-retention")).toBe("ci-set2");
  });

  test("returns null when no record matches the ref", () => {
    const records = [record("ci-set1", "refs/heads/claude/dg-1h-callbacks")];

    expect(slotForRef(records, "refs/heads/claude/some-other-branch")).toBeNull();
  });

  test("returns null against an empty record set", () => {
    expect(slotForRef([], "refs/heads/claude/b62-board")).toBeNull();
  });

  test("skips a record with malformed JSON and still finds a later match", () => {
    const records = [{ name: "/submit/ci/slots/ci-set1", value: "{not json" }, record("ci-set2", "refs/heads/claude/b62-board")];

    expect(slotForRef(records, "refs/heads/claude/b62-board")).toBe("ci-set2");
  });

  test("ignores a parameter path outside the slots prefix", () => {
    const records = [{ name: "/submit/ci/last-known-good-deployment", value: "ci-set1" }, record("ci-set2", "refs/heads/claude/b62-board")];

    expect(slotForRef(records, "refs/heads/claude/b62-board")).toBe("ci-set2");
  });
});
