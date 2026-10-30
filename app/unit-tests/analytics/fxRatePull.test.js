// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
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

const { handler, parseEcbRates, objectKey, ECB_NINETY_DAY_FEED_URL } = await import("../../functions/analytics/fxRatePull.js");

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<gesmes:Envelope xmlns:gesmes="http://www.gesmes.org/xml/2002-08-01" xmlns="http://www.ecb.int/vocabulary/2002-08-01/eurofxref">
  <Cube>
    <Cube time='2026-10-29'>
      <Cube currency='USD' rate='1.1600'/>
      <Cube currency='JPY' rate='170.12'/>
      <Cube currency='GBP' rate='0.8700'/>
    </Cube>
    <Cube time='2026-10-28'>
      <Cube currency='USD' rate='1.2000'/>
      <Cube currency='GBP' rate='0.9000'/>
    </Cube>
    <Cube time='2026-10-27'>
      <Cube currency='JPY' rate='170.50'/>
    </Cube>
  </Cube>
</gesmes:Envelope>`;

describe("fxRatePull", () => {
  beforeEach(() => {
    mockS3Send.mockReset();
    mockS3Send.mockResolvedValue({});
    process.env.ANALYTICS_LAKE_BUCKET_NAME = "lake";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("parseEcbRates crosses the USD and GBP rates into pounds per dollar and skips a date without both", () => {
    const rows = parseEcbRates(FEED);

    expect(rows.map((row) => row.date)).toEqual(["2026-10-29", "2026-10-28"]);
    expect(rows[0].usd_per_eur).toBe(1.16);
    expect(rows[0].gbp_per_eur).toBe(0.87);
    expect(rows[0].gbp_per_usd).toBeCloseTo(0.75, 10);
    expect(rows[1].gbp_per_usd).toBeCloseTo(0.75, 10);
  });

  test("handler writes one gzipped object per rate date under curated/fx/fx_rates", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: true, text: async () => FEED });
    vi.stubGlobal("fetch", fetchImpl);

    const result = await handler({}, { awsRequestId: "lambda-context" });

    expect(fetchImpl).toHaveBeenCalledWith(ECB_NINETY_DAY_FEED_URL);
    expect(result).toEqual({ days: 2 });
    const puts = mockS3Send.mock.calls.map(([command]) => command.input);
    expect(puts.map((put) => put.Key)).toEqual([objectKey("2026-10-29"), objectKey("2026-10-28")]);
    expect(objectKey("2026-10-29")).toBe("curated/fx/fx_rates/dt=2026-10-29/fx_rates.json.gz");
    const line = JSON.parse(gunzipSync(puts[0].Body).toString("utf8").trim());
    expect(line).toMatchObject({ date: "2026-10-29", usd_per_eur: 1.16, gbp_per_eur: 0.87 });
    expect(puts[0].Bucket).toBe("lake");
  });

  test("handler throws when the feed answers an error or holds no usable rate", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(handler()).rejects.toThrow(/503/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: async () => "<Cube/>" }));
    await expect(handler()).rejects.toThrow(/no USD and GBP/);
    expect(mockS3Send).not.toHaveBeenCalled();
  });
});
