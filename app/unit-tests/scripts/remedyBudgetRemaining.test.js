// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/remedyBudgetRemaining.test.js

import { describe, test, expect } from "vitest";
import { remainingBudget, alarmNameFromIssueTitle, issueFamily } from "../../../scripts/remedy-budget-remaining.mjs";

const FAMILY = "prod-env-activity-stack-health";
const OTHER_FAMILY = "prod-env-analytics-stack-health";
const NOW = new Date("2026-09-21T12:00:00.000Z");

function labeledAt(isoTimestamp, name = "remedy:draft-pr") {
  return { event: "labeled", label: { name }, created_at: isoTimestamp };
}

function unlabeledAt(isoTimestamp, name = "remedy:draft-pr") {
  return { event: "unlabeled", label: { name }, created_at: isoTimestamp };
}

function row(title, labelEvents) {
  return { title: `[ALARM] ${title}`, labelEvents };
}

describe("alarmNameFromIssueTitle", () => {
  test("strips the fixed issue-title prefix", () => {
    expect(alarmNameFromIssueTitle("[ALARM] prod-env-activity-stack-health")).toBe("prod-env-activity-stack-health");
  });

  test("leaves a title without the prefix unchanged", () => {
    expect(alarmNameFromIssueTitle("prod-env-activity-stack-health")).toBe("prod-env-activity-stack-health");
  });
});

describe("issueFamily", () => {
  test("collapses a deployment-scoped alarm name to its family key", () => {
    expect(issueFamily("[ALARM] prod-a0f41c7-app-api-5xx")).toBe("prod-app-api-5xx");
  });

  test("is idempotent on a title that already carries a family key", () => {
    expect(issueFamily(`[ALARM] ${FAMILY}`)).toBe(FAMILY);
  });
});

describe("remainingBudget", () => {
  test("returns the full budget when no rows carry a remedy label event", () => {
    const rows = [row(FAMILY, [])];
    expect(remainingBudget({ rows, family: FAMILY, now: NOW, budgetPerDay: 2 })).toBe(2);
  });

  test("returns the full budget when there are no rows at all", () => {
    expect(remainingBudget({ rows: [], family: FAMILY, now: NOW, budgetPerDay: 2 })).toBe(2);
  });

  test("counts two remedy label events inside the last 24 hours down to zero left", () => {
    const rows = [row(FAMILY, [labeledAt("2026-09-21T09:00:00.000Z"), labeledAt("2026-09-21T11:00:00.000Z")])];
    expect(remainingBudget({ rows, family: FAMILY, now: NOW, budgetPerDay: 2 })).toBe(0);
  });

  test("ignores a remedy label event older than 24 hours", () => {
    const rows = [row(FAMILY, [labeledAt("2026-09-20T11:00:00.000Z"), labeledAt("2026-09-21T11:00:00.000Z")])];
    expect(remainingBudget({ rows, family: FAMILY, now: NOW, budgetPerDay: 2 })).toBe(1);
  });

  test("ignores remedy label events on a different family", () => {
    const rows = [row(FAMILY, [labeledAt("2026-09-21T11:00:00.000Z")]), row(OTHER_FAMILY, [labeledAt("2026-09-21T11:30:00.000Z"), labeledAt("2026-09-21T11:45:00.000Z")])];
    expect(remainingBudget({ rows, family: FAMILY, now: NOW, budgetPerDay: 2 })).toBe(1);
  });

  test("still counts a remedy label that was added then removed", () => {
    const rows = [row(FAMILY, [labeledAt("2026-09-21T11:00:00.000Z"), unlabeledAt("2026-09-21T11:30:00.000Z")])];
    expect(remainingBudget({ rows, family: FAMILY, now: NOW, budgetPerDay: 2 })).toBe(1);
  });
});
