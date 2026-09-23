// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import {
  parseArgs,
  buildDateRangeClause,
  buildCampaignQuery,
  buildAdGroupQuery,
  buildKeywordQuery,
  defaultDateRange,
  shapeCampaignRows,
  shapeAdGroupRows,
  shapeKeywordRows,
  buildReport,
} from "../../../infra/google/ads/ads-report.js";

describe("ads-report parseArgs", () => {
  it("defaults to no explicit range, no json and no client file", () => {
    expect(parseArgs([])).toEqual({ from: undefined, to: undefined, json: false, clientFile: undefined });
  });
  it("reads --from and --to together", () => {
    expect(parseArgs(["--from", "2026-08-01", "--to", "2026-08-28"])).toEqual({
      from: "2026-08-01",
      to: "2026-08-28",
      json: false,
      clientFile: undefined,
    });
  });
  it("reads --json", () => {
    expect(parseArgs(["--json"]).json).toBe(true);
  });
  it("reads --client-file with its path", () => {
    expect(parseArgs(["--client-file", "/tmp/client.json"]).clientFile).toBe("/tmp/client.json");
  });
  it("fails when --from has no value", () => {
    expect(() => parseArgs(["--from"])).toThrow(/--from requires/);
  });
  it("fails when --to has no value", () => {
    expect(() => parseArgs(["--from", "2026-08-01", "--to"])).toThrow(/--to requires/);
  });
  it("fails when only --from is given", () => {
    expect(() => parseArgs(["--from", "2026-08-01"])).toThrow(/--from and --to must be given together/);
  });
  it("fails when only --to is given", () => {
    expect(() => parseArgs(["--to", "2026-08-28"])).toThrow(/--from and --to must be given together/);
  });
  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("ads-report defaultDateRange", () => {
  it("is the 28 days ending yesterday", () => {
    expect(defaultDateRange(new Date("2026-09-23T10:00:00Z"))).toEqual({ from: "2026-08-26", to: "2026-09-22" });
  });

  it("crosses a year boundary", () => {
    expect(defaultDateRange(new Date("2026-01-05T00:00:00Z"))).toEqual({ from: "2025-12-08", to: "2026-01-04" });
  });
});

describe("ads-report buildDateRangeClause", () => {
  it("builds the segments.date BETWEEN clause", () => {
    expect(buildDateRangeClause("2026-08-01", "2026-08-28")).toBe("segments.date BETWEEN '2026-08-01' AND '2026-08-28'");
  });

  it("rejects a non YYYY-MM-DD date", () => {
    expect(() => buildDateRangeClause("1 Aug 2026", "2026-08-28")).toThrow(/YYYY-MM-DD/);
  });
});

describe("ads-report GAQL builders", () => {
  it("selects campaign metrics from the campaign resource", () => {
    const query = buildCampaignQuery("2026-08-01", "2026-08-28");
    expect(query).toContain("FROM campaign WHERE segments.date BETWEEN '2026-08-01' AND '2026-08-28'");
    expect(query).toContain("metrics.conversions_value");
  });

  it("selects ad group metrics from the ad_group resource", () => {
    const query = buildAdGroupQuery("2026-08-01", "2026-08-28");
    expect(query).toContain("FROM ad_group WHERE");
    expect(query).toContain("ad_group.name");
  });

  it("selects keyword metrics from the keyword_view resource", () => {
    const query = buildKeywordQuery("2026-08-01", "2026-08-28");
    expect(query).toContain("FROM keyword_view WHERE");
    expect(query).toContain("ad_group_criterion.keyword.text");
    expect(query).toContain("ad_group_criterion.keyword.match_type");
  });
});

const METRICS_FIXTURE = {
  impressions: "1000",
  clicks: "40",
  costMicros: "25500000",
  averageCpc: "637500",
  ctr: "0.04",
  conversions: 3.5,
  conversionsValue: 210,
};

describe("ads-report shapeCampaignRows", () => {
  it("converts micros to pounds and leaves ratios alone", () => {
    const body = { results: [{ campaign: { id: "111", name: "Campaign #1" }, metrics: METRICS_FIXTURE }] };
    expect(shapeCampaignRows(body)).toEqual([
      {
        id: "111",
        name: "Campaign #1",
        impressions: 1000,
        clicks: 40,
        costGbp: 25.5,
        averageCpcGbp: 0.6375,
        ctr: 0.04,
        conversions: 3.5,
        conversionsValueGbp: 210,
      },
    ]);
  });

  it("answers an empty array when there are no results", () => {
    expect(shapeCampaignRows({})).toEqual([]);
  });
});

describe("ads-report shapeAdGroupRows", () => {
  it("joins the ad group row with its campaign name", () => {
    const body = {
      results: [{ campaign: { name: "Campaign #1" }, adGroup: { id: "222", name: "Asset Group 1" }, metrics: METRICS_FIXTURE }],
    };
    const rows = shapeAdGroupRows(body);
    expect(rows[0].campaignName).toBe("Campaign #1");
    expect(rows[0].name).toBe("Asset Group 1");
    expect(rows[0].costGbp).toBe(25.5);
  });

  it("answers an empty array when there are no results", () => {
    expect(shapeAdGroupRows({})).toEqual([]);
  });
});

describe("ads-report shapeKeywordRows", () => {
  it("joins the keyword row with its campaign, ad group and keyword text", () => {
    const body = {
      results: [
        {
          campaign: { name: "Campaign #1" },
          adGroup: { name: "Asset Group 1" },
          adGroupCriterion: { keyword: { text: "submit vat return", matchType: "BROAD" } },
          metrics: METRICS_FIXTURE,
        },
      ],
    };
    const rows = shapeKeywordRows(body);
    expect(rows[0]).toMatchObject({
      campaignName: "Campaign #1",
      adGroupName: "Asset Group 1",
      text: "submit vat return",
      matchType: "BROAD",
      clicks: 40,
    });
  });

  it("answers an empty array when there are no results", () => {
    expect(shapeKeywordRows({})).toEqual([]);
  });
});

describe("ads-report buildReport", () => {
  it("carries the range and the three row sets through unchanged", () => {
    const report = buildReport({ from: "2026-08-01", to: "2026-08-28", campaigns: [1], adGroups: [2], keywords: [3] });
    expect(report).toEqual({ from: "2026-08-01", to: "2026-08-28", campaigns: [1], adGroups: [2], keywords: [3] });
  });
});
