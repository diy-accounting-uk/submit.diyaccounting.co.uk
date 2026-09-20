// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/alarmRemedies.test.js

import { describe, test, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";

const REPO_ROOT = process.cwd();
const REMEDIES_PATH = join(REPO_ROOT, "app", "data", "alarm-remedies.json");
const WORKFLOWS_DIR = join(REPO_ROOT, ".github", "workflows");

const REMEDY_KINDS = ["dispatch", "close-when-gone", "draft-pr", "none"];

const remedies = JSON.parse(readFileSync(REMEDIES_PATH, "utf8"));

function loadWorkflowDispatchInputs(workflowFile) {
  const workflowPath = join(WORKFLOWS_DIR, workflowFile);
  const doc = parse(readFileSync(workflowPath, "utf8"));
  return Object.keys(doc?.on?.workflow_dispatch?.inputs ?? {});
}

describe("app/data/alarm-remedies.json", () => {
  test("carries at least one row", () => {
    expect(Array.isArray(remedies)).toBe(true);
    expect(remedies.length).toBeGreaterThan(0);
  });

  test("every row's remedy is one of the four kinds", () => {
    for (const row of remedies) {
      expect(REMEDY_KINDS, `family ${row.family} has an unknown remedy: ${row.remedy}`).toContain(row.remedy);
    }
  });

  test("families are unique", () => {
    const families = remedies.map((row) => row.family);
    const seen = new Set();
    const duplicates = families.filter((family) => (seen.has(family) ? true : (seen.add(family), false)));
    expect(duplicates).toEqual([]);
  });

  test("budgetPerDay is a non-negative integer, and 0 for a none row", () => {
    for (const row of remedies) {
      expect(Number.isInteger(row.budgetPerDay), `family ${row.family} has a non-integer budgetPerDay: ${row.budgetPerDay}`).toBe(true);
      expect(row.budgetPerDay, `family ${row.family} has a negative budgetPerDay`).toBeGreaterThanOrEqual(0);
      if (row.remedy === "none") {
        expect(row.budgetPerDay, `family ${row.family} is remedy "none" but budgetPerDay is not 0`).toBe(0);
      }
    }
  });

  describe("dispatch rows", () => {
    const dispatchRows = remedies.filter((row) => row.remedy === "dispatch");

    test("at least the row this table was built for is present", () => {
      expect(dispatchRows.length).toBeGreaterThan(0);
    });

    for (const row of dispatchRows) {
      test(`${row.family} names a workflow file under .github/workflows/`, () => {
        expect(typeof row.workflow, `family ${row.family} has no workflow`).toBe("string");
        expect(existsSync(join(WORKFLOWS_DIR, row.workflow)), `${row.workflow} does not exist under .github/workflows/`).toBe(true);
      });

      test(`${row.family}'s inputs are all declared on ${row.workflow}'s workflow_dispatch`, () => {
        const declaredInputs = loadWorkflowDispatchInputs(row.workflow);
        for (const key of Object.keys(row.inputs ?? {})) {
          expect(declaredInputs, `${row.workflow} has no workflow_dispatch input named "${key}"`).toContain(key);
        }
      });
    }
  });

  describe("draft-pr rows", () => {
    const draftPrRows = remedies.filter((row) => row.remedy === "draft-pr");

    test("at least one draft-pr row is present", () => {
      expect(draftPrRows.length).toBeGreaterThan(0);
    });

    for (const row of draftPrRows) {
      test(`${row.family} names a non-empty list of paths that exist in the repository`, () => {
        expect(Array.isArray(row.paths), `family ${row.family} has no paths array`).toBe(true);
        expect(row.paths.length, `family ${row.family} has an empty paths array`).toBeGreaterThan(0);
        for (const path of row.paths) {
          expect(existsSync(join(REPO_ROOT, path)), `${path} does not exist in the repository`).toBe(true);
        }
      });
    }
  });
});
