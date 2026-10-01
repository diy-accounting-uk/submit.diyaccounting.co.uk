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

const { handler, adsCostRows, buildCampaignQuery, buildAdGroupQuery, searchAllPages, fetchAdsAccessToken, readAdsAccount, objectKey } =
  await import("../../functions/analytics/adsCostPull.js");

const campaignSearch = JSON.parse(readFileSync(new URL("./fixtures/adsCostCampaignSearch.json", import.meta.url), "utf-8"));
const adGroupSearch = JSON.parse(readFileSync(new URL("./fixtures/adsCostAdGroupSearch.json", import.meta.url), "utf-8"));

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
      },
    ]);
  });

  test("the day's rows sum to the campaigns' totals", () => {
    const rows = adsCostRows(campaignSearch.results, adGroupSearch.results);
    const rowCost = rows.reduce((sum, row) => sum + row.cost_gbp, 0);
    const campaignCost = campaignSearch.results.reduce((sum, r) => sum + Number(r.metrics.costMicros) / 1e6, 0);
    expect(rowCost).toBeCloseTo(campaignCost, 6);
  });

  test("leaves out a row with no impressions, clicks or cost", () => {
    const empty = { campaign: { id: "1", name: "Idle" }, metrics: {}, segments: { date: "2026-09-28" } };
    expect(adsCostRows([empty], [])).toEqual([]);
  });
});

describe("queries", () => {
  test("select the day's metrics by campaign and by ad group", () => {
    expect(buildCampaignQuery("2026-09-28")).toBe(
      "SELECT segments.date, campaign.id, campaign.name, metrics.impressions, metrics.clicks, metrics.cost_micros FROM campaign WHERE segments.date = '2026-09-28'",
    );
    expect(buildAdGroupQuery("2026-09-28")).toBe(
      "SELECT segments.date, campaign.id, campaign.name, ad_group.id, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros FROM ad_group WHERE segments.date = '2026-09-28'",
    );
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
