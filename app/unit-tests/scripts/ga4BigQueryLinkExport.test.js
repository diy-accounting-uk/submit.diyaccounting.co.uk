// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/ga4BigQueryLinkExport.test.js

import { describe, test, expect } from "vitest";

import { parseArgs, extractBigQueryLinks, selectSingleLink, buildPatch } from "../../../scripts/ga4-bigquery-link-export.js";

describe("parseArgs", () => {
  test("reads property-id, streaming, daily and dry-run", () => {
    const opts = parseArgs(["--property-id", "523400333", "--streaming", "true", "--daily", "false", "--dry-run"]);
    expect(opts).toEqual({ propertyId: "523400333", streaming: true, daily: false, dryRun: true });
  });

  test("defaults streaming, daily and dry-run when omitted", () => {
    const opts = parseArgs(["--property-id", "523400333"]);
    expect(opts).toEqual({ propertyId: "523400333", streaming: undefined, daily: undefined, dryRun: false });
  });

  test("rejects a missing --property-id", () => {
    expect(() => parseArgs(["--dry-run"])).toThrow(/--property-id/);
  });

  test("rejects a --streaming value that isn't true or false", () => {
    expect(() => parseArgs(["--property-id", "1", "--streaming", "yes"])).toThrow(/--streaming/);
  });

  test("rejects a --daily value that isn't true or false", () => {
    expect(() => parseArgs(["--property-id", "1", "--daily", "1"])).toThrow(/--daily/);
  });

  test("rejects an unknown argument", () => {
    expect(() => parseArgs(["--property-id", "1", "--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("extractBigQueryLinks", () => {
  test("reads the lowercase-q field the Analytics Admin API actually returns", () => {
    const links = [{ name: "properties/523400333/bigQueryLinks/1" }];
    expect(extractBigQueryLinks({ bigqueryLinks: links })).toEqual(links);
  });

  test("returns an empty list when there are no links", () => {
    expect(extractBigQueryLinks({})).toEqual([]);
  });

  test("ignores a camelCase bigQueryLinks field, since the API never sends one", () => {
    expect(extractBigQueryLinks({ bigQueryLinks: [{ name: "properties/523400333/bigQueryLinks/1" }] })).toEqual([]);
  });
});

describe("selectSingleLink", () => {
  test("returns the only link", () => {
    const link = { name: "properties/523400333/bigQueryLinks/1" };
    expect(selectSingleLink([link], "523400333")).toBe(link);
  });

  test("throws loudly when the property has no link", () => {
    expect(() => selectSingleLink([], "523400333")).toThrow(/no BigQuery link/);
  });

  test("throws loudly when the property has more than one link", () => {
    const links = [{ name: "properties/523400333/bigQueryLinks/1" }, { name: "properties/523400333/bigQueryLinks/2" }];
    expect(() => selectSingleLink(links, "523400333")).toThrow(/2 BigQuery links/);
  });
});

describe("buildPatch", () => {
  const link = {
    name: "properties/523400333/bigQueryLinks/1",
    project: "projects/diyaccounting-ga4",
    datasetLocation: "europe-west2",
    dailyExportEnabled: true,
    streamingExportEnabled: false,
  };

  test("names only streamingExportEnabled in the update mask when only --streaming is given", () => {
    const patch = buildPatch(link, { streaming: true, daily: undefined });
    expect(patch.updateMask).toEqual(["streamingExportEnabled"]);
    expect(patch.data).toEqual({ streamingExportEnabled: true });
  });

  test("names only dailyExportEnabled in the update mask when only --daily is given", () => {
    const patch = buildPatch(link, { streaming: undefined, daily: false });
    expect(patch.updateMask).toEqual(["dailyExportEnabled"]);
    expect(patch.data).toEqual({ dailyExportEnabled: false });
  });

  test("names both fields when both flags are given", () => {
    const patch = buildPatch(link, { streaming: true, daily: true });
    expect(patch.updateMask).toEqual(["streamingExportEnabled", "dailyExportEnabled"]);
    expect(patch.data).toEqual({ streamingExportEnabled: true, dailyExportEnabled: true });
  });

  test("produces an empty update mask when neither flag is given", () => {
    const patch = buildPatch(link, {});
    expect(patch.updateMask).toEqual([]);
    expect(patch.data).toEqual({});
  });
});
