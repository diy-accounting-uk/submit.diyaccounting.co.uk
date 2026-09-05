// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/scripts/ga4PropertySync.test.js

import { describe, test, expect } from "vitest";

import {
  parseArgs,
  displayNameForEnvironment,
  streamUriForHostname,
  buildPlan,
  GA4_BIGQUERY_PROJECT_ID,
  GA4_BIGQUERY_LOCATION,
  GITHUB_VARIABLE_NAME,
} from "../../../scripts/ga4-property-sync.js";

const ACCOUNT = { name: "accounts/1035014", displayName: "DIY Accounting" };

describe("parseArgs", () => {
  test("reads environment, hostname and dry-run", () => {
    const opts = parseArgs(["--environment", "ci", "--hostname", "ci-submit.diyaccounting.co.uk", "--dry-run"]);
    expect(opts).toEqual({ environment: "ci", hostname: "ci-submit.diyaccounting.co.uk", dryRun: true });
  });

  test("defaults dry-run to false", () => {
    const opts = parseArgs(["--environment", "prod", "--hostname", "submit.diyaccounting.co.uk"]);
    expect(opts.dryRun).toBe(false);
  });

  test("rejects a missing --environment", () => {
    expect(() => parseArgs(["--hostname", "submit.diyaccounting.co.uk"])).toThrow(/--environment/);
  });

  test("rejects an --environment that isn't ci or prod", () => {
    expect(() => parseArgs(["--environment", "staging", "--hostname", "x"])).toThrow(/--environment/);
  });

  test("rejects a missing --hostname", () => {
    expect(() => parseArgs(["--environment", "ci"])).toThrow(/--hostname/);
  });

  test("rejects an unknown argument", () => {
    expect(() => parseArgs(["--environment", "ci", "--hostname", "x", "--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("displayNameForEnvironment", () => {
  test("names the ci property", () => {
    expect(displayNameForEnvironment("ci")).toBe("DIY Accounting Submit (ci)");
  });

  test("names the prod property", () => {
    expect(displayNameForEnvironment("prod")).toBe("DIY Accounting Submit (prod)");
  });
});

describe("streamUriForHostname", () => {
  test("prefixes the hostname with https", () => {
    expect(streamUriForHostname("ci-submit.diyaccounting.co.uk")).toBe("https://ci-submit.diyaccounting.co.uk");
  });
});

describe("buildPlan", () => {
  test("proposes creating everything when nothing exists yet", () => {
    const plan = buildPlan({
      environment: "ci",
      hostname: "ci-submit.diyaccounting.co.uk",
      account: ACCOUNT,
      properties: [],
      dataStreams: [],
      bigQueryLinks: [],
      currentGithubVariableValue: null,
    });

    expect(plan.displayName).toBe("DIY Accounting Submit (ci)");
    expect(plan.property).toMatchObject({ action: "create", name: null });
    expect(plan.dataStream).toMatchObject({ action: "create", blockedOnProperty: true });
    expect(plan.bigQueryLink).toMatchObject({ action: "create", blockedOnProperty: true, project: GA4_BIGQUERY_PROJECT_ID });
    expect(plan.githubVariable).toMatchObject({ action: "pending", name: GITHUB_VARIABLE_NAME });
  });

  test("does not match a property belonging to a different environment", () => {
    const plan = buildPlan({
      environment: "ci",
      hostname: "ci-submit.diyaccounting.co.uk",
      account: ACCOUNT,
      properties: [{ name: "properties/1", displayName: "DIY Accounting Submit (prod)" }],
      dataStreams: [],
      bigQueryLinks: [],
    });

    expect(plan.property.action).toBe("create");
  });

  test("ignores a trashed property with a matching display name", () => {
    const plan = buildPlan({
      environment: "ci",
      hostname: "ci-submit.diyaccounting.co.uk",
      account: ACCOUNT,
      properties: [{ name: "properties/1", displayName: "DIY Accounting Submit (ci)", deleteTime: "2026-01-01T00:00:00Z" }],
      dataStreams: [],
      bigQueryLinks: [],
    });

    expect(plan.property.action).toBe("create");
  });

  test("finds an existing property, stream and BigQuery link, and reports them in sync", () => {
    const plan = buildPlan({
      environment: "ci",
      hostname: "ci-submit.diyaccounting.co.uk",
      account: ACCOUNT,
      properties: [{ name: "properties/999", displayName: "DIY Accounting Submit (ci)" }],
      dataStreams: [
        {
          name: "properties/999/dataStreams/1",
          webStreamData: { defaultUri: "https://ci-submit.diyaccounting.co.uk", measurementId: "G-CIABCD1234" },
        },
      ],
      bigQueryLinks: [
        {
          name: "properties/999/bigQueryLinks/1",
          project: `projects/${GA4_BIGQUERY_PROJECT_ID}`,
          datasetLocation: GA4_BIGQUERY_LOCATION,
          dailyExportEnabled: true,
        },
      ],
      currentGithubVariableValue: "G-CIABCD1234",
    });

    expect(plan.property).toMatchObject({ action: "noop", name: "properties/999" });
    expect(plan.dataStream).toMatchObject({ action: "noop", measurementId: "G-CIABCD1234" });
    expect(plan.bigQueryLink).toMatchObject({ action: "noop" });
    expect(plan.githubVariable).toMatchObject({ action: "noop", value: "G-CIABCD1234" });
  });

  test("matches a BigQuery link by resolved project number, not just project id", () => {
    const plan = buildPlan({
      environment: "prod",
      hostname: "submit.diyaccounting.co.uk",
      account: ACCOUNT,
      properties: [{ name: "properties/999", displayName: "DIY Accounting Submit (prod)" }],
      dataStreams: [],
      bigQueryLinks: [{ name: "properties/999/bigQueryLinks/1", project: "projects/123456789", datasetLocation: GA4_BIGQUERY_LOCATION, dailyExportEnabled: true }],
      projectNumber: "123456789",
    });

    expect(plan.bigQueryLink.action).toBe("noop");
  });

  test("proposes updating a BigQuery link whose location or export flag doesn't match", () => {
    const plan = buildPlan({
      environment: "prod",
      hostname: "submit.diyaccounting.co.uk",
      account: ACCOUNT,
      properties: [{ name: "properties/999", displayName: "DIY Accounting Submit (prod)" }],
      dataStreams: [],
      bigQueryLinks: [{ name: "properties/999/bigQueryLinks/1", project: `projects/${GA4_BIGQUERY_PROJECT_ID}`, datasetLocation: "us", dailyExportEnabled: true }],
    });

    expect(plan.bigQueryLink).toMatchObject({ action: "update", datasetLocation: GA4_BIGQUERY_LOCATION });
  });

  test("proposes setting the GitHub variable when the measurement id changed", () => {
    const plan = buildPlan({
      environment: "prod",
      hostname: "submit.diyaccounting.co.uk",
      account: ACCOUNT,
      properties: [{ name: "properties/999", displayName: "DIY Accounting Submit (prod)" }],
      dataStreams: [{ name: "properties/999/dataStreams/1", webStreamData: { defaultUri: "https://submit.diyaccounting.co.uk", measurementId: "G-NEWVALUE1" } }],
      bigQueryLinks: [],
      currentGithubVariableValue: "G-OLDVALUE0",
    });

    expect(plan.githubVariable).toMatchObject({ action: "set", value: "G-NEWVALUE1", previousValue: "G-OLDVALUE0" });
  });

  test("marks the GitHub variable pending when the property and stream don't exist yet", () => {
    const plan = buildPlan({
      environment: "ci",
      hostname: "ci-submit.diyaccounting.co.uk",
      account: ACCOUNT,
      properties: [],
      dataStreams: [],
      bigQueryLinks: [],
      currentGithubVariableValue: "G-STALE0000",
    });

    expect(plan.githubVariable).toMatchObject({ action: "pending", value: null, previousValue: "G-STALE0000" });
  });
});
