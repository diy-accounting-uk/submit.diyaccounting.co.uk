// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";
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

const mockOpenSession = vi.fn();
const mockDiscoverCustomer = vi.fn();
const mockRunCampaignReport = vi.fn();
vi.mock("../../lib/microsoftAdsReporting.js", async (importOriginal) => ({
  ...(await importOriginal()),
  openSession: (...args) => mockOpenSession(...args),
  discoverCustomer: (...args) => mockDiscoverCustomer(...args),
  runCampaignReport: (...args) => mockRunCampaignReport(...args),
}));

const { handler, msAdsCostRows, objectKey } = await import("../../functions/analytics/msAdsCostPull.js");

const reportRow = (date, campaignId, extra = {}) => ({
  date,
  campaignId,
  campaign: `Search ${campaignId}`,
  impressions: 100,
  clicks: 4,
  spend: 2.5,
  conversions: 1,
  ...extra,
});

describe("msAdsCostRows", () => {
  test("makes one microsoft row per campaign with no ad group, and leaves out a row with nothing in it", () => {
    const rows = msAdsCostRows([reportRow("2026-10-28", "1"), reportRow("2026-10-28", "2", { impressions: 0, clicks: 0, spend: 0 })]);

    expect(rows).toEqual([
      {
        date: "2026-10-28",
        platform: "microsoft",
        campaign_id: "1",
        campaign_name: "Search 1",
        ad_group_id: "",
        ad_group_name: "",
        impressions: 100,
        clicks: 4,
        cost_gbp: 2.5,
        conversions: 1,
      },
    ]);
  });

  test("writes under the day's partition beside the Google rows", () => {
    expect(objectKey("2026-10-28")).toBe("curated/ads/ads_cost/dt=2026-10-28/ms_ads_cost.json.gz");
  });
});

describe("handler", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "lake";
    mockSecretsSend.mockResolvedValue({ SecretString: JSON.stringify({ installed: { client_id: "id", client_secret: "secret" } }) });
    mockOpenSession.mockResolvedValue({ config: {} });
    mockDiscoverCustomer.mockResolvedValue({ account: { currency: "GBP" } });
    mockS3Send.mockResolvedValue({});
  });

  test("with no date asks for yesterday through today and writes one object for each", async () => {
    mockRunCampaignReport.mockResolvedValue([reportRow("2026-10-28", "1"), reportRow("2026-10-29", "1")]);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-29T10:15:00Z"));
    let result;
    try {
      result = await handler({});
    } finally {
      vi.useRealTimers();
    }

    expect(mockRunCampaignReport.mock.calls[0][1]).toEqual({ from: "2026-10-28", to: "2026-10-29", aggregation: "Daily" });
    expect(result.days.map((d) => d.key)).toEqual([
      "curated/ads/ads_cost/dt=2026-10-28/ms_ads_cost.json.gz",
      "curated/ads/ads_cost/dt=2026-10-29/ms_ads_cost.json.gz",
    ]);
  });

  test("asks for one daily report over the range and writes one object per day", async () => {
    mockRunCampaignReport.mockResolvedValue([reportRow("2026-10-27", "1"), reportRow("2026-10-28", "1")]);

    const result = await handler({ from: "2026-10-27", to: "2026-10-29" });

    expect(mockRunCampaignReport).toHaveBeenCalledTimes(1);
    expect(mockRunCampaignReport.mock.calls[0][1]).toEqual({ from: "2026-10-27", to: "2026-10-29", aggregation: "Daily" });
    expect(result.days).toEqual([
      { date: "2026-10-27", key: "curated/ads/ads_cost/dt=2026-10-27/ms_ads_cost.json.gz", count: 1 },
      { date: "2026-10-28", key: "curated/ads/ads_cost/dt=2026-10-28/ms_ads_cost.json.gz", count: 1 },
      { date: "2026-10-29", key: "curated/ads/ads_cost/dt=2026-10-29/ms_ads_cost.json.gz", count: 0 },
    ]);
    const first = mockS3Send.mock.calls[0][0].input;
    expect(first.Bucket).toBe("lake");
    expect(JSON.parse(gunzipSync(first.Body).toString().trim())).toMatchObject({ platform: "microsoft", cost_gbp: 2.5, conversions: 1 });
  });

  test("an empty report still writes an empty object for the day", async () => {
    mockRunCampaignReport.mockResolvedValue([]);

    const result = await handler({ date: "2026-10-28" });

    expect(result.days).toEqual([{ date: "2026-10-28", key: objectKey("2026-10-28"), count: 0 }]);
    expect(mockS3Send).toHaveBeenCalledTimes(1);
  });

  test("stops when the account does not report in pounds", async () => {
    mockDiscoverCustomer.mockResolvedValue({ account: { currency: "USD" } });

    await expect(handler({ date: "2026-10-28" })).rejects.toThrow(/reports in USD, not GBP/);
    expect(mockS3Send).not.toHaveBeenCalled();
  });

  test("requires the lake bucket", async () => {
    delete process.env.ANALYTICS_LAKE_BUCKET_NAME;
    await expect(handler({})).rejects.toThrow(/ANALYTICS_LAKE_BUCKET_NAME/);
  });
});
