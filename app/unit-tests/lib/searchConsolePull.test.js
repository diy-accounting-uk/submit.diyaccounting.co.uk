// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { gunzipSync } from "zlib";

const mockGetAccessToken = vi.fn();
const mockAuthOptions = [];
vi.mock("@app/lib/googleWorkloadIdentity.js", () => ({
  federationSettings: () => ({ audience: "aud", serviceAccountEmail: "sa@example.iam.gserviceaccount.com" }),
  createFederatedGoogleAuth: (options) => {
    mockAuthOptions.push(options);
    return { getClient: async () => ({ getAccessToken: mockGetAccessToken }) };
  },
}));

vi.mock("@aws-sdk/client-s3", () => ({
  PutObjectCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  ROW_LIMIT,
  PROPERTIES,
  pullPropertyDay,
  pullSearchConsole,
  rowToRecord,
  searchConsoleObjectKey,
  searchConsolePullDays,
} from "@app/lib/searchConsolePull.js";

const fetchMock = vi.fn();

function row(n) {
  return { keys: ["2026-08-18", `https://x/${n}`, "q", "gbr", "MOBILE"], clicks: 1, impressions: 2, ctr: 0.5, position: 3 };
}

function ok(rows) {
  return { ok: true, status: 200, json: async () => ({ rows }), text: async () => "" };
}

describe("searchConsolePull", () => {
  beforeEach(() => {
    fetchMock.mockReset();
    mockGetAccessToken.mockReset();
    mockGetAccessToken.mockResolvedValue({ token: "tok" });
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test("the window is the three days that end two days before the run date", () => {
    expect(searchConsolePullDays(new Date("2026-08-21T03:00:00Z"))).toEqual(["2026-08-17", "2026-08-18", "2026-08-19"]);
  });

  test("a row becomes a flat record with the property name without its prefix", () => {
    expect(rowToRecord("sc-domain:diyaccounting.co.uk", row(1))).toEqual({
      property: "diyaccounting.co.uk",
      date: "2026-08-18",
      page: "https://x/1",
      query: "q",
      country: "gbr",
      device: "MOBILE",
      clicks: 1,
      impressions: 2,
      ctr: 0.5,
      position: 3,
    });
  });

  test("the object key holds the day and the property", () => {
    expect(searchConsoleObjectKey("sc-domain:diya-gl.co.uk", "2026-08-18")).toBe(
      "curated/searchconsole/report=queries/dt=2026-08-18/diya-gl.co.uk.json.gz",
    );
  });

  test("pages with startRow until a page is short", async () => {
    fetchMock.mockResolvedValueOnce(ok(Array.from({ length: ROW_LIMIT }, (_, n) => row(n))));
    fetchMock.mockResolvedValueOnce(ok([row(ROW_LIMIT)]));

    const records = await pullPropertyDay("tok", PROPERTIES[0], "2026-08-18");

    expect(records).toHaveLength(ROW_LIMIT + 1);
    const bodies = fetchMock.mock.calls.map((call) => JSON.parse(call[1].body));
    expect(bodies.map((body) => body.startRow)).toEqual([0, ROW_LIMIT]);
    expect(bodies[0]).toMatchObject({
      startDate: "2026-08-18",
      endDate: "2026-08-18",
      dimensions: ["date", "page", "query", "country", "device"],
      rowLimit: ROW_LIMIT,
    });
    expect(fetchMock.mock.calls[0][0]).toContain(encodeURIComponent("sc-domain:diyaccounting.co.uk"));
  });

  test("writes one object per property and day, and asks for the webmasters scope", async () => {
    fetchMock.mockResolvedValue(ok([row(1)]));
    const send = vi.fn().mockResolvedValue({});

    const result = await pullSearchConsole({ s3Client: { send }, bucket: "lake", days: ["2026-08-17", "2026-08-18"] });

    expect(result.errors).toEqual([]);
    expect(send).toHaveBeenCalledTimes(4);
    expect(send.mock.calls.map((call) => call[0].input.Key)).toEqual([
      "curated/searchconsole/report=queries/dt=2026-08-17/diyaccounting.co.uk.json.gz",
      "curated/searchconsole/report=queries/dt=2026-08-17/diya-gl.co.uk.json.gz",
      "curated/searchconsole/report=queries/dt=2026-08-18/diyaccounting.co.uk.json.gz",
      "curated/searchconsole/report=queries/dt=2026-08-18/diya-gl.co.uk.json.gz",
    ]);
    const first = send.mock.calls[0][0].input;
    expect(first.Bucket).toBe("lake");
    expect(JSON.parse(gunzipSync(first.Body).toString("utf8").trim()).property).toBe("diyaccounting.co.uk");
    expect(mockAuthOptions.at(-1).scopes).toEqual(["https://www.googleapis.com/auth/webmasters.readonly"]);
  });

  test("a failed property and day is reported and the others are still written", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, text: async () => "denied" });
    fetchMock.mockResolvedValue(ok([row(1)]));
    const send = vi.fn().mockResolvedValue({});

    const result = await pullSearchConsole({ s3Client: { send }, bucket: "lake", days: ["2026-08-18"] });

    expect(send).toHaveBeenCalledTimes(1);
    expect(result.written).toHaveLength(1);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]).toContain("sc-domain:diyaccounting.co.uk 2026-08-18");
    expect(result.errors[0]).toContain("403");
  });
});
