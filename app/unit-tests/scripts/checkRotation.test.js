// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/checkRotation.test.js

import { describe, test, expect } from "vitest";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { evaluateRotation, issueBody } from "../../../scripts/check-rotation.js";
import { readRotationToml, rotationSchedule } from "../../functions/security/securityLakeNightly.js";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

describe("evaluateRotation", () => {
  const rows = [
    { secret_name: "a", console: "Stripe", status: "ok", days_to_due: 200, rotated_at: "2026-09-01" },
    { secret_name: "b", console: "GitHub", status: "due-soon", days_to_due: 12, rotated_at: "2026-01-01" },
    { secret_name: "c", console: "Google", status: "overdue", days_to_due: -3, rotated_at: "2025-01-01" },
    { secret_name: "d", console: "Google", status: "unrecorded", days_to_due: null, rotated_at: null },
    { secret_name: "e", console: "Nowhere", status: "missing" },
    { secret_name: "f", console: "Generated", status: "unscheduled", days_to_due: null, rotated_at: "2026-02-19" },
  ];

  test("fails on an overdue key and on a key due within 30 days", () => {
    expect(evaluateRotation(rows).failing.map((row) => row.secret_name)).toEqual(["b", "c"]);
  });

  test("lists a missing key and a key with no roll date as notices that do not fail", () => {
    expect(evaluateRotation(rows).notices.map((row) => row.secret_name)).toEqual(["d", "e"]);
  });

  test("passes when every key is ok or unscheduled", () => {
    expect(evaluateRotation([rows[0], rows[5], { zero_findings: true }]).failing).toEqual([]);
  });

  test("the issue body names each failing key and no value", () => {
    const body = issueBody("prod", evaluateRotation(rows).failing, "2026-11-04");
    expect(body).toContain("`b` (GitHub): due-soon, 12 days to due");
    expect(body).toContain("`c` (Google): overdue, -3 days to due");
    expect(body).not.toContain("`a`");
  });
});

describe("secrets-rotation.toml", () => {
  const entries = readRotationToml(resolve(ROOT, "secrets-rotation.toml"));

  test("holds no duplicate name for one environment", () => {
    const seen = new Set();
    for (const entry of entries) {
      for (const env of entry.environments ?? ["ci", "prod"]) {
        const key = `${env}:${entry.name}`;
        expect(seen.has(key), key).toBe(false);
        seen.add(key);
      }
    }
  });

  test("gives every schedule field a usable value", () => {
    for (const entry of entries) {
      if ("max_age_days" in entry) expect(Number.isInteger(entry.max_age_days) && entry.max_age_days > 0, entry.name).toBe(true);
      if ("expires_at" in entry) expect(String(entry.expires_at), entry.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (entry.last_rotated) expect(entry.last_rotated, entry.name).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  test("names where each github-store entry lives", () => {
    for (const entry of entries.filter((item) => item.store === "github")) expect(entry.location, entry.name).toBeTruthy();
  });

  test("is not red on its recorded dates today", () => {
    const now = new Date("2026-11-04T00:00:00Z");
    const red = entries
      .filter((entry) => entry.last_rotated || entry.expires_at)
      .map((entry) => ({ name: entry.name, status: rotationSchedule(entry, entry.last_rotated || null, now).status }))
      .filter((row) => row.status === "overdue" || row.status === "due-soon");
    expect(red).toEqual([]);
  });

  test("is red on every key with an end date after the last end date", () => {
    const now = new Date("2027-09-25T00:00:00Z");
    const red = entries.filter((entry) => entry.expires_at).map((entry) => rotationSchedule(entry, entry.last_rotated || null, now).status);
    expect(red.length).toBeGreaterThan(0);
    expect(red.every((status) => status === "due-soon" || status === "overdue")).toBe(true);
  });
});
