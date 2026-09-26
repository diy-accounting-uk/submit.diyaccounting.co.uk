// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/ga4DailyAggregateEventNames.test.js
//
// infra/google/ga4/analytics.toml's [[property]].key_events is the single declared mapping from
// a dashboard label to the GA4 event name that actually fires (infra/google/ga4/ga4-sync.js reads
// it to create the live GA4 key events). The ga4_daily aggregate queries in
// infra/google/gcp/bigquery/*.sql filter on event_name literals of their own, so a literal that
// drifts from analytics.toml's declared name silently zeroes that bucket: the scheduled query
// still runs and still succeeds, it just never matches a row.

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import { loadConfigFromRoot } from "../../../infra/google/ga4/ga4-sync.js";

const REPO_ROOT = process.cwd();

function readSqlFile(relativePath) {
  return fs.readFileSync(path.join(REPO_ROOT, relativePath), "utf-8");
}

describe("ga4_daily aggregate queries use analytics.toml's declared event names", () => {
  const config = loadConfigFromRoot();
  const sharedProperty = config.properties.find((property) => property.id === "523400333");
  const downloadEventName = sharedProperty.keyEvents.download;

  test("analytics.toml declares a download event name", () => {
    expect(downloadEventName).toBeTruthy();
  });

  test("key_events_daily.sql filters on the declared download event name", () => {
    const sql = readSqlFile("infra/google/gcp/bigquery/key_events_daily.sql");
    expect(sql).toContain(`'${downloadEventName}'`);
    expect(sql).not.toContain("'file_download'");
  });

  test("downloads_by_product_daily.sql filters on the declared download event name", () => {
    const sql = readSqlFile("infra/google/gcp/bigquery/downloads_by_product_daily.sql");
    expect(sql).toContain(`event_name = '${downloadEventName}'`);
    expect(sql).not.toContain("'file_download'");
  });
});
