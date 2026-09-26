// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/ga4BigQuerySync.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

import {
  parseArgs,
  parseConfig,
  loadQueries,
  buildPlan,
  transferConfigBody,
  SCHEDULE_TIME_ZONE,
  CONFIG_PATH,
} from "../../../infra/google/ga4/ga4-bigquery-sync.js";

const REPO_ROOT = process.cwd();

const FIXTURE_TOML = `
[dataset]
project_id = "diyaccounting-ga4"
dataset_id = "ga4_daily"
location = "europe-west2"
description = "test dataset"

[[queries]]
name = "sessions_by_host_source_daily"
panel = "Sessions by host and source"
description = "Sessions by hostname and source"
sql_file = "infra/google/gcp/bigquery/sessions_by_host_source_daily.sql"
destination_table = "sessions_by_host_source_daily"
partition_field = "day"
write_disposition = "WRITE_TRUNCATE"
schedule = "every day 04:30"
`;

describe("parseArgs", () => {
  test("defaults to not applying", () => {
    expect(parseArgs([])).toEqual({ apply: false });
  });

  test("recognises --apply", () => {
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
  });

  test("rejects an unknown argument", () => {
    expect(() => parseArgs(["--bogus"])).toThrow("Unknown argument: --bogus");
  });
});

describe("parseConfig", () => {
  test("parses the dataset and the queries", () => {
    const config = parseConfig(FIXTURE_TOML);
    expect(config.dataset).toEqual({
      projectId: "diyaccounting-ga4",
      datasetId: "ga4_daily",
      location: "europe-west2",
      description: "test dataset",
    });
    expect(config.queries).toEqual([
      {
        name: "sessions_by_host_source_daily",
        panel: "Sessions by host and source",
        description: "Sessions by hostname and source",
        sqlFile: "infra/google/gcp/bigquery/sessions_by_host_source_daily.sql",
        destinationTable: "sessions_by_host_source_daily",
        partitionField: "day",
        writeDisposition: "WRITE_TRUNCATE",
        schedule: "every day 04:30",
      },
    ]);
  });

  test("throws when [dataset] is missing a required field", () => {
    expect(() => parseConfig('[dataset]\nproject_id = "x"\n')).toThrow("dataset");
  });

  test("throws on a query entry missing a required field", () => {
    const bad = `
[dataset]
project_id = "diyaccounting-ga4"
dataset_id = "ga4_daily"
location = "europe-west2"

[[queries]]
name = "incomplete"
sql_file = "infra/google/gcp/bigquery/incomplete.sql"
`;
    expect(() => parseConfig(bad)).toThrow('Invalid [[queries]] entry, missing "destination_table"');
  });

  test("throws on a duplicate query name", () => {
    const dup = `
[dataset]
project_id = "diyaccounting-ga4"
dataset_id = "ga4_daily"
location = "europe-west2"

[[queries]]
name = "same_name"
sql_file = "infra/google/gcp/bigquery/a.sql"
destination_table = "a"
partition_field = "day"
write_disposition = "WRITE_TRUNCATE"
schedule = "every day 04:30"

[[queries]]
name = "same_name"
sql_file = "infra/google/gcp/bigquery/b.sql"
destination_table = "b"
partition_field = "day"
write_disposition = "WRITE_TRUNCATE"
schedule = "every day 04:30"
`;
    expect(() => parseConfig(dup)).toThrow("Duplicate query name");
  });
});

describe("loadQueries", () => {
  test("attaches each query's sql text, read from the repo root", () => {
    const config = parseConfig(FIXTURE_TOML);
    const [query] = loadQueries(config, REPO_ROOT);
    expect(query.sql).toContain("Sessions for one day of the GA4 export");
    expect(query.name).toBe("sessions_by_host_source_daily");
  });
});

describe("buildPlan", () => {
  const dataset = { projectId: "diyaccounting-ga4", datasetId: "ga4_daily", location: "europe-west2", description: "" };
  const query = {
    name: "sessions_by_host_source_daily",
    panel: "Sessions by host and source",
    destinationTable: "sessions_by_host_source_daily",
    partitionField: "day",
    writeDisposition: "WRITE_TRUNCATE",
    schedule: "every day 04:30",
    sql: "SELECT 1",
  };

  test("plans to create the dataset and every query when nothing exists", () => {
    const plan = buildPlan({ dataset, queries: [query], datasetExists: false, transferConfigs: [] });
    expect(plan.dataset).toEqual({ action: "create", projectId: "diyaccounting-ga4", datasetId: "ga4_daily", location: "europe-west2" });
    expect(plan.queries).toEqual([
      { action: "create", name: query.name, panel: query.panel, destinationTable: query.destinationTable, schedule: query.schedule },
    ]);
  });

  test("leaves the dataset alone once it exists", () => {
    const plan = buildPlan({ dataset, queries: [query], datasetExists: true, transferConfigs: [] });
    expect(plan.dataset).toEqual({ action: "noop", projectId: "diyaccounting-ga4", datasetId: "ga4_daily" });
  });

  test("reports a query already in sync as a noop", () => {
    const transferConfigs = [
      {
        name: "projects/diyaccounting-ga4/locations/europe-west2/transferConfigs/abc",
        displayName: query.name,
        schedule: query.schedule,
        scheduleOptions: { timeZone: SCHEDULE_TIME_ZONE },
        params: {
          query: query.sql,
          destination_table_name_template: query.destinationTable,
          write_disposition: query.writeDisposition,
          partitioning_field: query.partitionField,
        },
      },
    ];
    const plan = buildPlan({ dataset, queries: [query], datasetExists: true, transferConfigs });
    expect(plan.queries).toEqual([
      {
        action: "noop",
        name: query.name,
        panel: query.panel,
        destinationTable: query.destinationTable,
        schedule: query.schedule,
        transferConfigName: transferConfigs[0].name,
      },
    ]);
  });

  test("plans an update when the live config has no pinned time zone", () => {
    const transferConfigs = [
      {
        name: "projects/diyaccounting-ga4/locations/europe-west2/transferConfigs/abc",
        displayName: query.name,
        schedule: query.schedule,
        params: {
          query: query.sql,
          destination_table_name_template: query.destinationTable,
          write_disposition: query.writeDisposition,
          partitioning_field: query.partitionField,
        },
      },
    ];
    const plan = buildPlan({ dataset, queries: [query], datasetExists: true, transferConfigs });
    expect(plan.queries[0].action).toBe("update");
  });

  test("plans an update when the live query text has drifted from the file", () => {
    const transferConfigs = [
      {
        name: "projects/diyaccounting-ga4/locations/europe-west2/transferConfigs/abc",
        displayName: query.name,
        schedule: query.schedule,
        params: {
          query: "SELECT 2",
          destination_table_name_template: query.destinationTable,
          write_disposition: query.writeDisposition,
          partitioning_field: query.partitionField,
        },
      },
    ];
    const plan = buildPlan({ dataset, queries: [query], datasetExists: true, transferConfigs });
    expect(plan.queries[0].action).toBe("update");
    expect(plan.queries[0].transferConfigName).toBe(transferConfigs[0].name);
  });

  test("plans an update when the schedule has drifted", () => {
    const transferConfigs = [
      {
        name: "projects/diyaccounting-ga4/locations/europe-west2/transferConfigs/abc",
        displayName: query.name,
        schedule: "every day 06:00",
        params: {
          query: query.sql,
          destination_table_name_template: query.destinationTable,
          write_disposition: query.writeDisposition,
          partitioning_field: query.partitionField,
        },
      },
    ];
    const plan = buildPlan({ dataset, queries: [query], datasetExists: true, transferConfigs });
    expect(plan.queries[0].action).toBe("update");
  });
});

describe("transferConfigBody", () => {
  test("pins the schedule to UTC", () => {
    const dataset = { projectId: "diyaccounting-ga4", datasetId: "ga4_daily", location: "europe-west2", description: "" };
    const query = {
      name: "sessions_by_host_source_daily",
      destinationTable: "sessions_by_host_source_daily",
      partitionField: "day",
      writeDisposition: "WRITE_TRUNCATE",
      schedule: "every day 01:00",
      sql: "SELECT 1",
    };
    const body = transferConfigBody(dataset, query);
    expect(body.schedule).toBe("every day 01:00");
    expect(body.scheduleOptions).toEqual({ timeZone: SCHEDULE_TIME_ZONE });
  });
});

describe("the real config file", () => {
  const config = parseConfig(fs.readFileSync(path.join(REPO_ROOT, CONFIG_PATH), "utf-8"));

  test("names one query per one-stop-dashboard GA4 panel", () => {
    expect(config.queries.map((q) => q.name)).toEqual([
      "sessions_by_host_source_daily",
      "funnel_steps_daily",
      "key_events_daily",
      "downloads_by_product_daily",
    ]);
  });

  test("every query's sql file exists and is named after its destination table", () => {
    for (const query of config.queries) {
      expect(path.basename(query.sqlFile)).toBe(`${query.destinationTable}.sql`);
      expect(fs.existsSync(path.join(REPO_ROOT, query.sqlFile))).toBe(true);
    }
  });

  test("every query reads the shared property's export and writes nothing outside ga4_daily", () => {
    const loaded = loadQueries(config, REPO_ROOT);
    for (const query of loaded) {
      expect(query.sql).toContain("diyaccounting-ga4.analytics_523400333.events_*");
    }
  });

  test("every query truncates its own day's partition on each run", () => {
    for (const query of config.queries) {
      expect(query.writeDisposition).toBe("WRITE_TRUNCATE");
      expect(query.partitionField).toBe("day");
    }
  });

  // The AWS nightly pull (infra/main/java/.../NightlyIngestionWorkflow.java) reads whatever this
  // query has already written for its target day. Scheduled to run later in the UTC day, it
  // would read that target day's write before this query ever makes it, and would never look
  // again: this query never revisits a day once its own current_date() moves past it.
  const AWS_NIGHTLY_PULL_UTC_MINUTES = 2 * 60 + 15;

  function scheduleUtcMinutes(schedule) {
    const match = /^every day (\d{2}):(\d{2})$/.exec(schedule);
    expect(match, `unrecognised schedule string "${schedule}"`).not.toBeNull();
    const [, hour, minute] = match;
    return Number(hour) * 60 + Number(minute);
  }

  test("every query's UTC schedule runs before the AWS nightly pull's 02:15 UTC", () => {
    for (const query of config.queries) {
      expect(scheduleUtcMinutes(query.schedule)).toBeLessThan(AWS_NIGHTLY_PULL_UTC_MINUTES);
    }
  });
});
