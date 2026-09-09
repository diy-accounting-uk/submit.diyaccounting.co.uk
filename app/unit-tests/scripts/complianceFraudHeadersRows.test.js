// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { readDecisions, toRow, toNdjson } from "../../../scripts/compliance-fraud-headers-rows.js";

describe("compliance-fraud-headers-rows", () => {
  let dir;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), "fraud-headers-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("readDecisions returns an empty array for a missing directory", () => {
    expect(readDecisions(path.join(dir, "does-not-exist"))).toEqual([]);
  });

  test("readDecisions reads only <YYYY-MM>.json files, sorted", () => {
    writeFileSync(path.join(dir, "2026-08.json"), JSON.stringify({ status: "correct", needsAction: false }));
    writeFileSync(path.join(dir, "2026-07.json"), JSON.stringify({ status: "correct", needsAction: false }));
    writeFileSync(path.join(dir, "README.md"), "not a decision file");

    const decisions = readDecisions(dir);
    expect(decisions.map((d) => d.month)).toEqual(["2026-07", "2026-08"]);
  });

  test("toRow projects a decision record into the compliance_fraud_headers row shape", () => {
    const row = toRow(
      {
        month: "2026-08",
        decision: {
          status: "advisories",
          needsAction: true,
          trafficCount: null,
          advisories: ["Fraud prevention headers have advisories to review for August 2026."],
          errors: [],
        },
      },
      "2026-09-05T02:15:00Z",
    );
    expect(row).toEqual({
      month: "2026-08",
      status: "advisories",
      needs_action: true,
      traffic_count: null,
      advisories_count: 1,
      errors_count: 0,
      checked_at: "2026-09-05T02:15:00Z",
    });
  });

  test("toRow defaults missing arrays to zero counts", () => {
    const row = toRow({ month: "2026-08", decision: { status: "correct", needsAction: false } }, "2026-09-05T02:15:00Z");
    expect(row.advisories_count).toBe(0);
    expect(row.errors_count).toBe(0);
    expect(row.traffic_count).toBeNull();
  });

  test("toNdjson renders one JSON object per line and an empty body for no rows", () => {
    expect(toNdjson([])).toBe("");
    expect(toNdjson([{ a: 1 }])).toBe('{"a":1}\n');
  });
});
