// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/googleInventory.test.js

import { describe, test, expect } from "vitest";

import {
  DEFAULT_PROJECT,
  DEFAULT_GA4_ACCOUNT_ID,
  DEFAULT_SERVICE_ACCOUNT_EMAIL,
  DEFAULT_BIGQUERY_LOCATION,
  parseArgs,
  shapeEnabledServices,
  shapeIamPolicy,
  shapeBudgets,
  shapeGa4Accounts,
  shapeGa4Properties,
  shapeDataStreams,
  shapeKeyEvents,
  shapeBigQueryLinks,
  shapeServiceAccountKeys,
  shapeIapBrand,
  shapeBigQueryDatasets,
  shapeTransferConfigs,
  buildInventoryReport,
} from "../../../scripts/google-inventory.js";

describe("parseArgs", () => {
  test("defaults to the known project, account, service account and location", () => {
    expect(parseArgs([])).toEqual({
      project: DEFAULT_PROJECT,
      ga4AccountId: DEFAULT_GA4_ACCOUNT_ID,
      serviceAccountEmail: DEFAULT_SERVICE_ACCOUNT_EMAIL,
      location: DEFAULT_BIGQUERY_LOCATION,
    });
  });

  test("overrides every flag", () => {
    const opts = parseArgs([
      "--project",
      "other-project",
      "--ga4-account",
      "999",
      "--service-account",
      "someone@example.com",
      "--location",
      "us-central1",
    ]);
    expect(opts).toEqual({ project: "other-project", ga4AccountId: "999", serviceAccountEmail: "someone@example.com", location: "us-central1" });
  });

  test("rejects an unknown argument", () => {
    expect(() => parseArgs(["--bogus"])).toThrow("Unknown argument: --bogus");
  });
});

describe("shapeEnabledServices", () => {
  test("reads the service id off each entry and sorts", () => {
    const body = { services: [{ config: { name: "bigquery.googleapis.com" } }, { config: { name: "analyticsadmin.googleapis.com" } }] };
    expect(shapeEnabledServices(body)).toEqual(["analyticsadmin.googleapis.com", "bigquery.googleapis.com"]);
  });

  test("falls back to the resource name's last segment when config is missing", () => {
    const body = { services: [{ name: "projects/123/services/bigquery.googleapis.com" }] };
    expect(shapeEnabledServices(body)).toEqual(["bigquery.googleapis.com"]);
  });

  test("returns an empty list when nothing is enabled", () => {
    expect(shapeEnabledServices({})).toEqual([]);
  });
});

describe("shapeIamPolicy", () => {
  test("carries each role's members across", () => {
    const body = { bindings: [{ role: "roles/owner", members: ["serviceAccount:a@x.iam.gserviceaccount.com"] }] };
    expect(shapeIamPolicy(body)).toEqual([{ role: "roles/owner", members: ["serviceAccount:a@x.iam.gserviceaccount.com"] }]);
  });

  test("returns an empty list when the policy has no bindings", () => {
    expect(shapeIamPolicy({})).toEqual([]);
  });
});

describe("shapeBudgets", () => {
  test("formats the specified amount and the threshold percentages", () => {
    const body = {
      budgets: [
        {
          name: "billingAccounts/123/budgets/abc",
          displayName: "diyaccounting-ga4 monthly budget",
          amount: { specifiedAmount: { units: "10", currencyCode: "GBP" } },
          thresholdRules: [{ thresholdPercent: 0.5 }, { thresholdPercent: 0.9 }],
        },
      ],
    };
    expect(shapeBudgets(body)).toEqual([
      { name: "billingAccounts/123/budgets/abc", displayName: "diyaccounting-ga4 monthly budget", amount: "10 GBP", thresholds: [0.5, 0.9] },
    ]);
  });

  test("reports an unspecified amount and empty thresholds when both are missing", () => {
    const body = { budgets: [{ name: "billingAccounts/123/budgets/abc", displayName: "no amount" }] };
    expect(shapeBudgets(body)).toEqual([{ name: "billingAccounts/123/budgets/abc", displayName: "no amount", amount: "unspecified", thresholds: [] }]);
  });
});

describe("shapeGa4Accounts", () => {
  test("marks an account carrying deleteTime as deleted", () => {
    const body = {
      accounts: [
        { name: "accounts/1035014", displayName: "DIY Accounting" },
        { name: "accounts/999", displayName: "Trashed account", deleteTime: "2026-01-01T00:00:00Z" },
      ],
    };
    expect(shapeGa4Accounts(body)).toEqual([
      { name: "accounts/1035014", displayName: "DIY Accounting", deleted: false },
      { name: "accounts/999", displayName: "Trashed account", deleted: true },
    ]);
  });
});

describe("shapeGa4Properties", () => {
  test("carries the parent account and the trashed flag", () => {
    const body = {
      properties: [
        { name: "properties/523400333", displayName: "DIY Accounting", parent: "accounts/1035014" },
        { name: "properties/395628828", displayName: "Old property", parent: "accounts/1035014", deleteTime: "2026-09-05T00:00:00Z" },
      ],
    };
    expect(shapeGa4Properties(body)).toEqual([
      { name: "properties/523400333", displayName: "DIY Accounting", parent: "accounts/1035014", deleted: false },
      { name: "properties/395628828", displayName: "Old property", parent: "accounts/1035014", deleted: true },
    ]);
  });
});

describe("shapeDataStreams", () => {
  test("pulls the measurement id and default uri out of webStreamData", () => {
    const body = { dataStreams: [{ name: "properties/523400333/dataStreams/1", displayName: "Submit", webStreamData: { measurementId: "G-T81V5NL5MB", defaultUri: "https://submit.diyaccounting.co.uk" } }] };
    expect(shapeDataStreams(body)).toEqual([
      { name: "properties/523400333/dataStreams/1", displayName: "Submit", measurementId: "G-T81V5NL5MB", defaultUri: "https://submit.diyaccounting.co.uk" },
    ]);
  });

  test("reports null measurement id and uri when webStreamData is missing", () => {
    const body = { dataStreams: [{ name: "properties/1/dataStreams/2", displayName: "App stream" }] };
    expect(shapeDataStreams(body)).toEqual([{ name: "properties/1/dataStreams/2", displayName: "App stream", measurementId: null, defaultUri: null }]);
  });
});

describe("shapeKeyEvents", () => {
  test("reads the event name off each key event", () => {
    const body = { keyEvents: [{ name: "properties/523400333/keyEvents/1", eventName: "purchase" }] };
    expect(shapeKeyEvents(body)).toEqual([{ name: "properties/523400333/keyEvents/1", eventName: "purchase" }]);
  });
});

describe("shapeBigQueryLinks", () => {
  test("reads the lowercase-q bigqueryLinks field the API actually returns", () => {
    const body = { bigqueryLinks: [{ name: "properties/523400333/bigQueryLinks/1", project: "projects/diyaccounting-ga4", datasetLocation: "europe-west2", dailyExportEnabled: true }] };
    expect(shapeBigQueryLinks(body)).toEqual([
      { name: "properties/523400333/bigQueryLinks/1", project: "projects/diyaccounting-ga4", datasetLocation: "europe-west2", dailyExportEnabled: true },
    ]);
  });

  test("returns an empty list when the field is absent", () => {
    expect(shapeBigQueryLinks({})).toEqual([]);
  });
});

describe("shapeServiceAccountKeys", () => {
  test("maps validAfterTime to createTime and sorts oldest first", () => {
    const body = {
      keys: [
        { name: "projects/x/serviceAccounts/y/keys/2", validAfterTime: "2026-06-01T00:00:00Z", keyType: "USER_MANAGED" },
        { name: "projects/x/serviceAccounts/y/keys/1", validAfterTime: "2026-01-01T00:00:00Z", keyType: "USER_MANAGED" },
      ],
    };
    expect(shapeServiceAccountKeys(body)).toEqual([
      { name: "projects/x/serviceAccounts/y/keys/1", createTime: "2026-01-01T00:00:00Z", keyType: "USER_MANAGED" },
      { name: "projects/x/serviceAccounts/y/keys/2", createTime: "2026-06-01T00:00:00Z", keyType: "USER_MANAGED" },
    ]);
  });

  test("returns an empty list when the service account has no keys", () => {
    expect(shapeServiceAccountKeys({})).toEqual([]);
  });
});

describe("shapeIapBrand", () => {
  test("returns the first brand when one exists", () => {
    const body = { brands: [{ name: "projects/123/brands/123", applicationTitle: "DIY Accounting", supportEmail: "support@diyaccounting.co.uk" }] };
    expect(shapeIapBrand(body)).toEqual({ name: "projects/123/brands/123", applicationTitle: "DIY Accounting", supportEmail: "support@diyaccounting.co.uk" });
  });

  test("returns null when no brand has been created", () => {
    expect(shapeIapBrand({ brands: [] })).toBeNull();
    expect(shapeIapBrand({})).toBeNull();
  });
});

describe("shapeBigQueryDatasets", () => {
  test("reads the dataset id off each entry and sorts", () => {
    const body = { datasets: [{ datasetReference: { datasetId: "ga4_daily" } }, { datasetReference: { datasetId: "analytics_523400333" } }] };
    expect(shapeBigQueryDatasets(body)).toEqual(["analytics_523400333", "ga4_daily"]);
  });
});

describe("shapeTransferConfigs", () => {
  test("carries the display name, schedule and disabled flag", () => {
    const body = { transferConfigs: [{ name: "projects/x/locations/y/transferConfigs/1", displayName: "sessions_by_host_source_daily", schedule: "every day 04:30" }] };
    expect(shapeTransferConfigs(body)).toEqual([
      { name: "projects/x/locations/y/transferConfigs/1", displayName: "sessions_by_host_source_daily", schedule: "every day 04:30", disabled: false },
    ]);
  });
});

describe("buildInventoryReport", () => {
  test("attaches each property's data streams, key events and BigQuery links by property name", () => {
    const report = buildInventoryReport({
      project: "diyaccounting-ga4",
      enabledServices: ["bigquery.googleapis.com"],
      iamPolicy: [],
      budgets: [],
      ga4Accounts: [{ name: "accounts/1035014", displayName: "DIY Accounting", deleted: false }],
      ga4Properties: [
        { name: "properties/523400333", displayName: "DIY Accounting", parent: "accounts/1035014", deleted: false },
        { name: "properties/395628828", displayName: "Old property", parent: "accounts/1035014", deleted: true },
      ],
      dataStreamsByProperty: { "properties/523400333": [{ name: "properties/523400333/dataStreams/1", displayName: "Submit", measurementId: "G-T81V5NL5MB", defaultUri: null }] },
      keyEventsByProperty: { "properties/523400333": [{ name: "properties/523400333/keyEvents/1", eventName: "purchase" }] },
      bigQueryLinksByProperty: { "properties/523400333": [{ name: "properties/523400333/bigQueryLinks/1", project: "projects/diyaccounting-ga4", datasetLocation: "europe-west2", dailyExportEnabled: true }] },
      serviceAccountKeys: [],
      iapBrand: null,
      bigQueryDatasets: ["ga4_daily"],
      transferConfigs: [],
    });

    const [live, trashed] = report.ga4Properties;
    expect(live.dataStreams).toHaveLength(1);
    expect(live.keyEvents).toHaveLength(1);
    expect(live.bigQueryLinks).toHaveLength(1);
    expect(trashed.deleted).toBe(true);
    expect(trashed.dataStreams).toEqual([]);
  });
});
