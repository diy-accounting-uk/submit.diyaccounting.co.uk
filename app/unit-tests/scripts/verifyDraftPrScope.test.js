// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/verifyDraftPrScope.test.js

import { describe, test, expect } from "vitest";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { touchesOnlyAllowedPaths, loadRemedyRow, evaluate } from "../../../scripts/verify-draft-pr-scope.mjs";

const FAMILY = "prod-env-activity-stack-health";
const ALLOWED_PATHS = ["app/functions/ops/activityTelegramForwarder.js", "app/unit-tests/functions/activityTelegramForwarder.test.js"];

describe("touchesOnlyAllowedPaths", () => {
  test("true when every changed path is allowed", () => {
    expect(touchesOnlyAllowedPaths([ALLOWED_PATHS[0]], ALLOWED_PATHS)).toBe(true);
  });

  test("false when a changed path is outside the allowed set", () => {
    expect(touchesOnlyAllowedPaths([ALLOWED_PATHS[0], "app/functions/ops/other.js"], ALLOWED_PATHS)).toBe(false);
  });

  test("false for an empty changed-path list", () => {
    expect(touchesOnlyAllowedPaths([], ALLOWED_PATHS)).toBe(false);
  });

  test("false for an empty allowed-path list", () => {
    expect(touchesOnlyAllowedPaths([ALLOWED_PATHS[0]], [])).toBe(false);
  });
});

describe("loadRemedyRow", () => {
  test("finds the real draft-pr row for a known family", () => {
    const row = loadRemedyRow(FAMILY);
    expect(row.remedy).toBe("draft-pr");
    expect(row.paths).toEqual(expect.arrayContaining(ALLOWED_PATHS));
  });

  test("returns null for an unknown family", () => {
    expect(loadRemedyRow("not-a-real-family")).toBeNull();
  });
});

describe("evaluate", () => {
  test("allows a PR that only touches the family's own remedy paths", () => {
    const result = evaluate({ family: FAMILY, changedPaths: [ALLOWED_PATHS[0]] });
    expect(result.allowed).toBe(true);
  });

  test("refuses a PR that touches a path outside the family's remedy paths", () => {
    const result = evaluate({ family: FAMILY, changedPaths: [ALLOWED_PATHS[0], "infra/main/java/Something.java"] });
    expect(result.allowed).toBe(false);
  });

  test("refuses when the family has no remedy row", () => {
    const result = evaluate({ family: "not-a-real-family", changedPaths: [ALLOWED_PATHS[0]] });
    expect(result.allowed).toBe(false);
  });

  test("refuses when the family's remedy is not draft-pr", () => {
    const result = evaluate({ family: "prod-env-github-probe-failed", changedPaths: ["probe-test.yml"] });
    expect(result.allowed).toBe(false);
  });

  test("refuses when no family is given", () => {
    const result = evaluate({ family: undefined, changedPaths: [ALLOWED_PATHS[0]] });
    expect(result.allowed).toBe(false);
  });

  test("works against a custom remedies file", () => {
    const dir = mkdtempSync(join(tmpdir(), "remedies-"));
    const remediesPath = join(dir, "alarm-remedies.json");
    writeFileSync(remediesPath, JSON.stringify([{ family: "test-family", remedy: "draft-pr", paths: ["a.js"], budgetPerDay: 1 }]));
    const result = evaluate({ family: "test-family", changedPaths: ["a.js"], remediesPath });
    expect(result.allowed).toBe(true);
  });
});
