// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/ga4BigQueryDatasetIdEnvFiles.test.js
//
// The "Deploy Ingestion stack" step in deploy-environment.yml dotenv-loads .env.<env> before
// running cdk deploy, so a GA4_BIGQUERY_DATASET_ID set here overrides cdk-environment/cdk.json's
// shared default — the only way one Lambda env var can differ between ci and prod without a
// second cdk.json or a code branch.

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

function readEnvValue(envFileName, key) {
  const text = fs.readFileSync(path.join(process.cwd(), envFileName), "utf-8");
  const prefix = `${key}=`;
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return undefined;
}

describe("GA4_BIGQUERY_DATASET_ID per environment", () => {
  test("ci overrides cdk.json's default with its own property's dataset", () => {
    expect(readEnvValue(".env.ci", "GA4_BIGQUERY_DATASET_ID")).toBe("analytics_552917343");
  });

  test("prod carries the shared property's dataset, matching cdk-environment/cdk.json", () => {
    expect(readEnvValue(".env.prod", "GA4_BIGQUERY_DATASET_ID")).toBe("analytics_523400333");
  });
});
