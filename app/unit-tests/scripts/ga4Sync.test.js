// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/ga4Sync.test.js

import { describe, test, expect } from "vitest";

import {
  parseArgs,
  parseConfig,
  matchProperty,
  buildStreamPlan,
  buildEnhancedMeasurementPlan,
  groupKeyEventsByName,
  buildKeyEventPlan,
  extractBigQueryLinks,
  buildBigQueryLinkPlan,
  buildGithubVariablePlan,
  buildPropertyPlan,
  GITHUB_VARIABLE_NAME,
} from "../../../scripts/ga4-sync.js";

describe("parseArgs", () => {
  test("defaults to plan mode", () => {
    expect(parseArgs([])).toEqual({ apply: false });
  });
  test("reads --apply", () => {
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
  });
  test("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

const SAMPLE_TOML = `
[account]
id = "1035014"
display_name = "DIY Accounting"

[[property]]
id = "523400333"
display_name = "DIY Accounting"
time_zone = "Europe/London"
currency = "GBP"
key_events = { subscribe = "purchase", submit = "submit_vat_return", donate = "purchase", download = "runner_download" }

  [[property.stream]]
  name = "Submit"
  uri = "https://submit.diyaccounting.co.uk"
  measurement_id = "G-T81V5NL5MB"
  enhanced_measurement = true

  [property.bigquery_link]
  project = "diyaccounting-ga4"
  location = "europe-west2"
  daily_export = true
  streaming_export = false

[[property]]
display_name = "DIY Accounting Submit (ci)"
github_environment = "ci"

  [[property.stream]]
  name = "ci"
  uri = "https://ci-submit.diyaccounting.co.uk"
  measurement_id = "G-DV0SDVEZWC"
`;

describe("parseConfig", () => {
  test("reads the account and every property", () => {
    const config = parseConfig(SAMPLE_TOML);
    expect(config.account).toEqual({ id: "1035014", displayName: "DIY Accounting" });
    expect(config.properties).toHaveLength(2);

    const shared = config.properties[0];
    expect(shared.id).toBe("523400333");
    expect(shared.timeZone).toBe("Europe/London");
    expect(shared.currency).toBe("GBP");
    expect(shared.keyEvents).toEqual({ subscribe: "purchase", submit: "submit_vat_return", donate: "purchase", download: "runner_download" });
    expect(shared.streams).toEqual([{ name: "Submit", uri: "https://submit.diyaccounting.co.uk", measurementId: "G-T81V5NL5MB", enhancedMeasurement: true }]);
    expect(shared.bigQueryLink).toEqual({ project: "diyaccounting-ga4", location: "europe-west2", dailyExport: true, streamingExport: false });

    const ci = config.properties[1];
    expect(ci.id).toBeNull();
    expect(ci.githubEnvironment).toBe("ci");
    expect(ci.keyEvents).toBeNull();
    expect(ci.bigQueryLink).toBeNull();
  });

  test("throws when [account] is missing id or display_name", () => {
    expect(() => parseConfig('[account]\nid = "1"\n')).toThrow(/\[account\]/);
  });

  test("throws when there are no [[property]] entries", () => {
    expect(() => parseConfig('[account]\nid = "1"\ndisplay_name = "x"\n')).toThrow(/\[\[property\]\]/);
  });

  test("throws when a property has no display_name", () => {
    const toml = `[account]\nid = "1"\ndisplay_name = "x"\n\n[[property]]\nid = "2"\n`;
    expect(() => parseConfig(toml)).toThrow(/display_name/);
  });

  test("throws when a property has no streams", () => {
    const toml = `[account]\nid = "1"\ndisplay_name = "x"\n\n[[property]]\ndisplay_name = "y"\n`;
    expect(() => parseConfig(toml)).toThrow(/\[\[property\.stream\]\]/);
  });
});

describe("matchProperty", () => {
  test("matches by id and fails when the id isn't found live", () => {
    const configProperty = { id: "523400333", displayName: "DIY Accounting" };
    expect(() => matchProperty(configProperty, [])).toThrow(/records id 523400333/);
  });

  test("finds a property by id among others", () => {
    const configProperty = { id: "523400333", displayName: "DIY Accounting" };
    const live = [{ name: "properties/1", displayName: "other" }, { name: "properties/523400333", displayName: "DIY Accounting" }];
    expect(matchProperty(configProperty, live)).toEqual({ name: "properties/523400333", displayName: "DIY Accounting" });
  });

  test("matches a property with no id by display_name", () => {
    const configProperty = { id: null, displayName: "DIY Accounting Submit (ci)" };
    const live = [{ name: "properties/999", displayName: "DIY Accounting Submit (ci)" }];
    expect(matchProperty(configProperty, live)).toEqual(live[0]);
  });

  test("returns null when a property with no id isn't found live", () => {
    const configProperty = { id: null, displayName: "DIY Accounting Submit (ci)" };
    expect(matchProperty(configProperty, [])).toBeNull();
  });

  test("ignores a trashed property with a matching display name", () => {
    const configProperty = { id: null, displayName: "DIY Accounting Submit (ci)" };
    const live = [{ name: "properties/1", displayName: "DIY Accounting Submit (ci)", deleteTime: "2026-01-01T00:00:00Z" }];
    expect(matchProperty(configProperty, live)).toBeNull();
  });
});

describe("buildStreamPlan", () => {
  test("proposes creating a stream that doesn't exist yet", () => {
    const plan = buildStreamPlan({ name: "ci", uri: "https://ci-submit.diyaccounting.co.uk", measurementId: null }, []);
    expect(plan).toEqual({ action: "create", name: null, uri: "https://ci-submit.diyaccounting.co.uk", measurementId: null });
  });

  test("finds an existing stream by uri when no measurement_id is recorded", () => {
    const liveStreams = [{ name: "properties/1/dataStreams/1", webStreamData: { defaultUri: "https://ci-submit.diyaccounting.co.uk", measurementId: "G-CI1234" } }];
    const plan = buildStreamPlan({ name: "ci", uri: "https://ci-submit.diyaccounting.co.uk", measurementId: null }, liveStreams);
    expect(plan).toEqual({ action: "noop", name: "properties/1/dataStreams/1", uri: "https://ci-submit.diyaccounting.co.uk", measurementId: "G-CI1234" });
  });

  test("finds an existing stream by measurement_id", () => {
    const liveStreams = [{ name: "properties/1/dataStreams/1", webStreamData: { defaultUri: "https://submit.diyaccounting.co.uk", measurementId: "G-T81V5NL5MB" } }];
    const plan = buildStreamPlan({ name: "Submit", uri: "https://submit.diyaccounting.co.uk", measurementId: "G-T81V5NL5MB" }, liveStreams);
    expect(plan.action).toBe("noop");
  });

  test("fails when the recorded measurement_id doesn't match any live stream", () => {
    const configStream = { name: "Submit", uri: "https://submit.diyaccounting.co.uk", measurementId: "G-WRONG0000" };
    expect(() => buildStreamPlan(configStream, [])).toThrow(/records measurement_id G-WRONG0000/);
  });

  test("fails and names the live mismatch when the uri already resolves to a different id", () => {
    const liveStreams = [{ name: "properties/1/dataStreams/1", webStreamData: { defaultUri: "https://submit.diyaccounting.co.uk", measurementId: "G-LIVE00000" } }];
    const configStream = { name: "Submit", uri: "https://submit.diyaccounting.co.uk", measurementId: "G-WRONG0000" };
    expect(() => buildStreamPlan(configStream, liveStreams)).toThrow(/live stream at that uri is G-LIVE00000/);
  });
});

describe("buildEnhancedMeasurementPlan", () => {
  test("skips when the file doesn't declare a setting", () => {
    expect(buildEnhancedMeasurementPlan({ enhancedMeasurement: null }, { action: "noop" }, {})).toEqual({ action: "skip" });
  });

  test("skips when the stream itself is still pending creation", () => {
    expect(buildEnhancedMeasurementPlan({ enhancedMeasurement: true }, { action: "create" }, undefined)).toEqual({ action: "skip" });
  });

  test("reports noop when live already matches", () => {
    const plan = buildEnhancedMeasurementPlan({ enhancedMeasurement: true }, { action: "noop" }, { streamEnabled: true });
    expect(plan).toEqual({ action: "noop" });
  });

  test("proposes an update when live doesn't match", () => {
    const plan = buildEnhancedMeasurementPlan({ enhancedMeasurement: true }, { action: "noop" }, { streamEnabled: false });
    expect(plan).toEqual({ action: "update", streamEnabled: true });
  });

  test("treats missing live settings as disabled", () => {
    const plan = buildEnhancedMeasurementPlan({ enhancedMeasurement: false }, { action: "noop" }, undefined);
    expect(plan).toEqual({ action: "noop" });
  });
});

describe("groupKeyEventsByName", () => {
  test("groups two labels that share one event name", () => {
    const grouped = groupKeyEventsByName({ subscribe: "purchase", donate: "purchase", submit: "submit_vat_return" });
    expect(grouped.get("purchase")).toEqual(["subscribe", "donate"]);
    expect(grouped.get("submit_vat_return")).toEqual(["submit"]);
  });
});

describe("buildKeyEventPlan", () => {
  test("marks an existing key event as noop and covers both labels sharing it", () => {
    const keyEvents = { subscribe: "purchase", donate: "purchase" };
    const existing = [{ name: "properties/1/keyEvents/1", eventName: "purchase" }];
    const plan = buildKeyEventPlan(keyEvents, existing);
    expect(plan).toEqual([{ eventName: "purchase", labels: ["subscribe", "donate"], action: "noop", existingName: "properties/1/keyEvents/1" }]);
  });

  test("proposes creating a key event that doesn't exist yet", () => {
    const plan = buildKeyEventPlan({ submit: "submit_vat_return" }, []);
    expect(plan).toEqual([{ eventName: "submit_vat_return", labels: ["submit"], action: "create" }]);
  });
});

describe("extractBigQueryLinks", () => {
  test("reads the lowercase-q field the Analytics Admin API actually returns", () => {
    const links = [{ name: "properties/999/bigQueryLinks/1", project: "projects/123456789" }];
    expect(extractBigQueryLinks({ bigqueryLinks: links })).toEqual(links);
  });

  test("returns an empty list when the property has no BigQuery link yet", () => {
    expect(extractBigQueryLinks({})).toEqual([]);
  });

  test("ignores a camelCase bigQueryLinks field, since the API never sends one", () => {
    expect(extractBigQueryLinks({ bigQueryLinks: [{ name: "properties/999/bigQueryLinks/1" }] })).toEqual([]);
  });
});

describe("buildBigQueryLinkPlan", () => {
  const configLink = { project: "diyaccounting-ga4", location: "europe-west2", dailyExport: true, streamingExport: false };

  test("skips when the property declares no BigQuery link", () => {
    expect(buildBigQueryLinkPlan(null, [], null)).toEqual({ action: "skip" });
  });

  test("proposes creating a link that doesn't exist yet", () => {
    const plan = buildBigQueryLinkPlan(configLink, [], null);
    expect(plan).toMatchObject({ action: "create", project: "diyaccounting-ga4", location: "europe-west2" });
  });

  test("matches a link by resolved project number, not just project id", () => {
    const liveLinks = [{ name: "properties/1/bigQueryLinks/1", project: "projects/123456789", datasetLocation: "europe-west2", dailyExportEnabled: true, streamingExportEnabled: false }];
    const plan = buildBigQueryLinkPlan(configLink, liveLinks, "123456789");
    expect(plan.action).toBe("noop");
  });

  test("proposes an update when the location or export flags don't match", () => {
    const liveLinks = [{ name: "properties/1/bigQueryLinks/1", project: "projects/diyaccounting-ga4", datasetLocation: "us", dailyExportEnabled: true, streamingExportEnabled: false }];
    const plan = buildBigQueryLinkPlan(configLink, liveLinks, null);
    expect(plan).toMatchObject({ action: "update", location: "europe-west2" });
  });
});

describe("buildGithubVariablePlan", () => {
  test("skips when the property has no github_environment", () => {
    expect(buildGithubVariablePlan({ githubEnvironment: null, measurementId: "G-1", currentValue: null })).toEqual({ action: "skip" });
  });

  test("is pending when the measurement id isn't known yet", () => {
    const plan = buildGithubVariablePlan({ githubEnvironment: "ci", measurementId: null, currentValue: "G-STALE" });
    expect(plan).toMatchObject({ action: "pending", value: null, previousValue: "G-STALE" });
  });

  test("proposes setting the variable when it changed", () => {
    const plan = buildGithubVariablePlan({ githubEnvironment: "ci", measurementId: "G-NEW", currentValue: "G-OLD" });
    expect(plan).toEqual({ action: "set", name: GITHUB_VARIABLE_NAME, environment: "ci", value: "G-NEW", previousValue: "G-OLD" });
  });

  test("reports noop when the variable already matches", () => {
    const plan = buildGithubVariablePlan({ githubEnvironment: "ci", measurementId: "G-SAME", currentValue: "G-SAME" });
    expect(plan).toEqual({ action: "noop", name: GITHUB_VARIABLE_NAME, environment: "ci", value: "G-SAME" });
  });
});

describe("buildPropertyPlan", () => {
  test("proposes creating everything when nothing exists yet, cascading blockedOnProperty", () => {
    const configProperty = {
      id: null,
      displayName: "DIY Accounting Submit (ci)",
      githubEnvironment: "ci",
      keyEvents: null,
      bigQueryLink: { project: "diyaccounting-ga4", location: "europe-west2", dailyExport: true, streamingExport: false },
      streams: [{ name: "ci", uri: "https://ci-submit.diyaccounting.co.uk", measurementId: null, enhancedMeasurement: null }],
    };

    const plan = buildPropertyPlan({ configProperty, liveProperty: null, currentGithubVariableValue: null });

    expect(plan.property).toMatchObject({ action: "create", name: null });
    expect(plan.streams[0].plan).toMatchObject({ action: "create", blockedOnProperty: true });
    expect(plan.bigQueryLink).toMatchObject({ action: "create", blockedOnProperty: true });
    expect(plan.githubVariable).toMatchObject({ action: "pending" });
  });

  test("reports an existing property, stream, key events and BigQuery link as in sync", () => {
    const configProperty = {
      id: "523400333",
      displayName: "DIY Accounting",
      githubEnvironment: null,
      keyEvents: { submit: "submit_vat_return" },
      bigQueryLink: { project: "diyaccounting-ga4", location: "europe-west2", dailyExport: true, streamingExport: false },
      streams: [{ name: "Submit", uri: "https://submit.diyaccounting.co.uk", measurementId: "G-T81V5NL5MB", enhancedMeasurement: true }],
    };
    const liveProperty = { name: "properties/523400333", displayName: "DIY Accounting" };
    const liveStreams = [{ name: "properties/523400333/dataStreams/1", webStreamData: { defaultUri: "https://submit.diyaccounting.co.uk", measurementId: "G-T81V5NL5MB" } }];
    const liveBigQueryLinks = [{ name: "properties/523400333/bigQueryLinks/1", project: "projects/diyaccounting-ga4", datasetLocation: "europe-west2", dailyExportEnabled: true, streamingExportEnabled: false }];
    const liveKeyEvents = [{ name: "properties/523400333/keyEvents/1", eventName: "submit_vat_return" }];
    const liveEnhancedMeasurementByStreamName = { "properties/523400333/dataStreams/1": { streamEnabled: true } };

    const plan = buildPropertyPlan({
      configProperty,
      liveProperty,
      liveStreams,
      liveBigQueryLinks,
      liveKeyEvents,
      liveEnhancedMeasurementByStreamName,
    });

    expect(plan.property.action).toBe("noop");
    expect(plan.streams[0].plan.action).toBe("noop");
    expect(plan.streams[0].enhancedMeasurement.action).toBe("noop");
    expect(plan.keyEvents).toEqual([{ eventName: "submit_vat_return", labels: ["submit"], action: "noop", existingName: "properties/523400333/keyEvents/1" }]);
    expect(plan.bigQueryLink.action).toBe("noop");
    expect(plan.githubVariable).toEqual({ action: "skip" });
  });
});
