// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "node:fs";
import { gunzipSync } from "zlib";

const mockS3Send = vi.fn();
vi.mock("@aws-sdk/client-s3", () => ({
  S3Client: class {
    send(...args) {
      return mockS3Send(...args);
    }
  },
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockSecretsSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(...args) {
      return mockSecretsSend(...args);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const {
  handler,
  adsCostRows,
  buildCampaignQuery,
  buildAdGroupQuery,
  searchAllPages,
  fetchAdsAccessToken,
  readAdsAccount,
  objectKey,
  conversionWindowDays,
  CONVERSION_WINDOW_DAYS,
} = await import("../../functions/analytics/adsCostPull.js");

const campaignSearch = JSON.parse(readFileSync(new URL("./fixtures/adsCostCampaignSearch.json", import.meta.url), "utf-8"));
const adGroupSearch = JSON.parse(readFileSync(new URL("./fixtures/adsCostAdGroupSearch.json", import.meta.url), "utf-8"));
const conversionsCampaignSearch = JSON.parse(
  readFileSync(new URL("./fixtures/adsConversionsCampaignSearch.json", import.meta.url), "utf-8"),
);
const conversionsAdGroupSearch = JSON.parse(readFileSync(new URL("./fixtures/adsConversionsAdGroupSearch.json", import.meta.url), "utf-8"));

function jsonResponse(body) {
  return { ok: true, json: async () => body, text: async () => JSON.stringify(body) };
}

describe("adsCostRows", () => {
  test("keeps each ad group row and adds one empty-ad-group row for a campaign with none", () => {
    const rows = adsCostRows(campaignSearch.results, adGroupSearch.results);

    expect(rows).toEqual([
      {
        date: "2026-09-28",
        campaign_id: "24295022766",
        campaign_name: "Search: MTD VAT",
        ad_group_id: "198457346577",
        ad_group_name: "Own brand",
        impressions: 25,
        clicks: 2,
        cost_gbp: 0.6,
        conversions: 0,
      },
      {
        date: "2026-09-28",
        campaign_id: "24295022766",
        campaign_name: "Search: MTD VAT",
        ad_group_id: "200929043735",
        ad_group_name: "Submit VAT return online free",
        impressions: 15,
        clicks: 1,
        cost_gbp: 0.3,
        conversions: 0,
      },
      {
        date: "2026-09-28",
        campaign_id: "24265222030",
        campaign_name: "Campaign #1",
        ad_group_id: "",
        ad_group_name: "",
        impressions: 289,
        clicks: 5,
        cost_gbp: 1.252199,
        conversions: 0,
      },
    ]);
  });

  test("the day's rows sum to the campaigns' totals", () => {
    const rows = adsCostRows(campaignSearch.results, adGroupSearch.results);
    const rowCost = rows.reduce((sum, row) => sum + row.cost_gbp, 0);
    const campaignCost = campaignSearch.results.reduce((sum, r) => sum + Number(r.metrics.costMicros) / 1e6, 0);
    expect(rowCost).toBeCloseTo(campaignCost, 6);
  });

  test("carries each row's conversions and keeps a campaign whose only metric that day is a conversion", () => {
    const rows = adsCostRows(conversionsCampaignSearch.results, conversionsAdGroupSearch.results);

    expect(rows.map((row) => [row.campaign_id, row.ad_group_id, row.clicks, row.conversions])).toEqual([
      ["24295022766", "198457346577", 3, 2.5],
      ["24295022766", "200929043735", 1, 0],
      ["24265222030", "", 0, 1],
    ]);
  });

  test("the day's conversions sum to the campaigns' totals", () => {
    const rows = adsCostRows(conversionsCampaignSearch.results, conversionsAdGroupSearch.results);
    const rowConversions = rows.reduce((sum, row) => sum + row.conversions, 0);
    const campaignConversions = conversionsCampaignSearch.results.reduce((sum, r) => sum + Number(r.metrics.conversions), 0);
    expect(rowConversions).toBe(campaignConversions);
  });

  test("gives a campaign its own row on a day it has no ad group rows, even when it has them on another day", () => {
    const campaign = { id: "24295022766", name: "Search: MTD VAT" };
    const adGroupResults = [
      {
        campaign,
        adGroup: { id: "1", name: "Own brand" },
        metrics: { clicks: "2", impressions: "20", costMicros: "500000" },
        segments: { date: "2026-09-27" },
      },
    ];
    const campaignResults = [
      { campaign, metrics: { clicks: "2", impressions: "20", costMicros: "500000" }, segments: { date: "2026-09-27" } },
      { campaign, metrics: { conversions: 1 }, segments: { date: "2026-09-28" } },
    ];
    expect(adsCostRows(campaignResults, adGroupResults).map((row) => [row.date, row.ad_group_id, row.clicks, row.conversions])).toEqual([
      ["2026-09-27", "1", 2, 0],
      ["2026-09-28", "", 0, 1],
    ]);
  });

  test("leaves out a row with no impressions, clicks, cost or conversions", () => {
    const empty = { campaign: { id: "1", name: "Idle" }, metrics: {}, segments: { date: "2026-09-28" } };
    expect(adsCostRows([empty], [])).toEqual([]);
  });
});

describe("queries", () => {
  test("select the day's metrics by campaign and by ad group", () => {
    expect(buildCampaignQuery("2026-09-28")).toBe(
      "SELECT segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date = '2026-09-28'",
    );
    expect(buildAdGroupQuery("2026-09-28")).toBe(
      "SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group WHERE segments.date = '2026-09-28'",
    );
  });

  test("select every day of a range, each row carrying its own date", () => {
    expect(buildCampaignQuery("2026-08-30", "2026-09-29")).toBe(
      "SELECT segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN '2026-08-30' AND '2026-09-29'",
    );
    expect(buildAdGroupQuery("2026-08-30", "2026-09-29")).toContain(
      "FROM ad_group WHERE segments.date BETWEEN '2026-08-30' AND '2026-09-29'",
    );
  });
});

describe("conversionWindowDays", () => {
  test("is today and the 30 days before it, oldest first", () => {
    const days = conversionWindowDays(new Date("2026-09-29T02:15:00Z"));
    expect(CONVERSION_WINDOW_DAYS).toBe(30);
    expect(days).toHaveLength(31);
    expect(days[0]).toBe("2026-08-30");
    expect(days.at(-1)).toBe("2026-09-29");
    expect(new Set(days).size).toBe(31);
  });
});

describe("searchAllPages", () => {
  test("follows nextPageToken until the last page", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ results: [{ n: 1 }], nextPageToken: "p2" }))
      .mockResolvedValueOnce(jsonResponse({ results: [{ n: 2 }] }));

    const rows = await searchAllPages({ accessToken: "t", customerId: "123", apiVersion: "v25", query: "q", fetchImpl });

    expect(rows).toEqual([{ n: 1 }, { n: 2 }]);
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)).toEqual({ query: "q", pageToken: "p2" });
    expect(fetchImpl.mock.calls[0][0]).toBe("https://googleads.googleapis.com/v25/customers/123/googleAds:search");
  });

  test("throws on a non-200 response", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 403, text: async () => "denied" });
    await expect(searchAllPages({ accessToken: "t", customerId: "1", apiVersion: "v25", query: "q", fetchImpl })).rejects.toThrow(
      "403 from googleAds:search: denied",
    );
  });
});

describe("readAdsAccount", () => {
  test("reads the customer id and API version from ads.toml", () => {
    expect(readAdsAccount()).toEqual({ customerId: "8142685080", apiVersion: expect.stringMatching(/^v\d+$/) });
  });
});

describe("handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "lake";
    process.env.ADS_OAUTH_CLIENT_SECRET_ARN = "arn:client";
    process.env.ADS_REFRESH_TOKEN_SECRET_ARN = "arn:refresh";
    mockSecretsSend.mockImplementation(async ({ input }) => ({
      SecretString:
        input.SecretId === "arn:client"
          ? JSON.stringify({ installed: { client_id: "cid", client_secret: "csecret" } })
          : JSON.stringify({ refresh_token: "rt" }),
    }));
    mockS3Send.mockResolvedValue({});
  });

  test("reads both secrets by ARN, exchanges the refresh token and writes the day's gzipped rows", async () => {
    const fetchMock = vi.fn(async (url, options) => {
      if (String(url).startsWith("https://oauth2.googleapis.com/token")) return jsonResponse({ access_token: "at" });
      const query = JSON.parse(options.body).query;
      return jsonResponse(query.includes("FROM ad_group") ? adGroupSearch : campaignSearch);
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await handler({ date: "2026-09-28" });

    expect(result).toEqual({ days: [{ date: "2026-09-28", key: objectKey("2026-09-28"), count: 3 }] });
    const secretIds = mockSecretsSend.mock.calls.map(([command]) => command.input.SecretId).sort();
    expect(secretIds).toEqual(["arn:client", "arn:refresh"]);
    const tokenCall = fetchMock.mock.calls.find(([url]) => String(url).includes("oauth2.googleapis.com"));
    expect(String(tokenCall[1].body)).toContain("grant_type=refresh_token");
    const put = mockS3Send.mock.calls[0][0].input;
    expect(put.Bucket).toBe("lake");
    expect(put.Key).toBe("curated/ads/ads_cost/dt=2026-09-28/ads_cost.json.gz");
    const lines = gunzipSync(put.Body).toString("utf-8").trim().split("\n").map(JSON.parse);
    expect(lines).toHaveLength(3);
    expect(lines.map((line) => line.ad_group_id)).toEqual(["198457346577", "200929043735", ""]);
    vi.unstubAllGlobals();
  });

  test("writes the day's conversions in each lake row", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (String(url).startsWith("https://oauth2.googleapis.com/token")) return jsonResponse({ access_token: "at" });
        const query = JSON.parse(options.body).query;
        expect(query).toContain("metrics.conversions");
        return jsonResponse(query.includes("FROM ad_group") ? conversionsAdGroupSearch : conversionsCampaignSearch);
      }),
    );
    try {
      await handler({ date: "2026-11-17" });
    } finally {
      vi.unstubAllGlobals();
    }

    const put = mockS3Send.mock.calls[0][0].input;
    expect(put.Key).toBe("curated/ads/ads_cost/dt=2026-11-17/ads_cost.json.gz");
    const lines = gunzipSync(put.Body).toString("utf-8").trim().split("\n").map(JSON.parse);
    expect(lines.map((line) => line.conversions)).toEqual([2.5, 0, 1]);
  });

  async function runAt(isoNow, searches) {
    const queries = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url, options) => {
        if (String(url).startsWith("https://oauth2.googleapis.com/token")) return jsonResponse({ access_token: "at" });
        const query = JSON.parse(options.body).query;
        queries.push(query);
        return jsonResponse(query.includes("FROM ad_group") ? searches.adGroup : searches.campaign);
      }),
    );
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(isoNow));
    try {
      return { result: await handler({}), queries };
    } finally {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    }
  }

  function putsByKey() {
    return new Map(mockS3Send.mock.calls.map(([command]) => [command.input.Key, command.input.Body]));
  }

  function linesOf(body) {
    const text = gunzipSync(body).toString("utf-8").trim();
    return text ? text.split("\n").map(JSON.parse) : [];
  }

  test("with no date asks for today and the 30 days before it in one search per query, and writes one object per day", async () => {
    const { result, queries } = await runAt("2026-09-29T02:15:00Z", { campaign: campaignSearch, adGroup: adGroupSearch });

    expect(queries).toHaveLength(2);
    for (const query of queries) expect(query).toContain("segments.date BETWEEN '2026-08-30' AND '2026-09-29'");
    expect(result.days).toHaveLength(31);
    expect(result.days.map((day) => day.key)).toEqual(conversionWindowDays(new Date("2026-09-29T02:15:00Z")).map(objectKey));
    expect(mockS3Send).toHaveBeenCalledTimes(31);
    const puts = putsByKey();
    expect(puts.size).toBe(31);
    expect(linesOf(puts.get(objectKey("2026-09-28")))).toHaveLength(3);
    expect(linesOf(puts.get(objectKey("2026-09-27")))).toEqual([]);
    expect(result.days.find((day) => day.date === "2026-09-28").count).toBe(3);
  });

  test("a day pulled again inside the window replaces its object with the later conversions, and keeps its cost", async () => {
    await runAt("2026-11-17T20:15:00Z", { campaign: conversionsCampaignSearch, adGroup: conversionsAdGroupSearch });
    const first = linesOf(putsByKey().get(objectKey("2026-11-17")));

    mockS3Send.mockClear();
    const moreConversions = structuredClone(conversionsAdGroupSearch);
    moreConversions.results[1].metrics.conversions = 2.0;
    const moreCampaign = structuredClone(conversionsCampaignSearch);
    moreCampaign.results[1].metrics.conversions = 4.5;
    await runAt("2026-11-19T02:15:00Z", { campaign: moreCampaign, adGroup: moreConversions });
    const puts = putsByKey();
    const second = linesOf(puts.get(objectKey("2026-11-17")));

    expect(mockS3Send.mock.calls.filter(([command]) => command.input.Key === objectKey("2026-11-17"))).toHaveLength(1);
    expect(second.map((line) => line.conversions)).toEqual([2.5, 2, 1]);
    expect(second.map((line) => [line.impressions, line.clicks, line.cost_gbp])).toEqual(
      first.map((line) => [line.impressions, line.clicks, line.cost_gbp]),
    );
  });

  test("throws when a required environment variable is missing", async () => {
    delete process.env.ADS_REFRESH_TOKEN_SECRET_ARN;
    await expect(handler({ date: "2026-09-28" })).rejects.toThrow("ADS_REFRESH_TOKEN_SECRET_ARN environment variable is required");
  });
});

describe("fetchAdsAccessToken", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  test("throws when the token endpoint refuses the refresh token", async () => {
    mockSecretsSend.mockImplementation(async ({ input }) => ({
      SecretString:
        input.SecretId === "c"
          ? JSON.stringify({ installed: { client_id: "a", client_secret: "b" } })
          : JSON.stringify({ refresh_token: "r" }),
    }));
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 400, text: async () => "invalid_grant" });

    await expect(fetchAdsAccessToken({ oauthClientSecretArn: "c", refreshTokenSecretArn: "r" }, fetchImpl)).rejects.toThrow(
      "400 from Google token endpoint: invalid_grant",
    );
  });
});
