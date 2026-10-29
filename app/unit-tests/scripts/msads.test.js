// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import zlib from "node:zlib";
import {
  parseConfig,
  parseArgs,
  parseDeveloperToken,
  refreshAccessToken,
  buildHeaders,
  callApi,
  discoverCustomer,
  shapeCampaign,
  shapeKeyword,
  shapeAd,
  shapeCriterion,
  parseCsv,
  unzipFirstEntry,
  buildCampaignReportRequest,
  shapeReportRows,
  runCampaignReport,
  buildTrafficEstimateRequest,
  shapeTrafficEstimates,
  earliestStart,
  defaultReportRange,
} from "../../../infra/microsoft/ads/msads.js";

const config = parseConfig(fs.readFileSync("infra/microsoft/ads/msads.toml", "utf8"));

function jsonResponse(body, status = 200) {
  return { ok: status < 400, status, json: async () => body, text: async () => JSON.stringify(body) };
}

function session(responses) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    return typeof next === "function" ? next(url, init) : next;
  };
  return { config, accessToken: "ya29.access", developerToken: "DEVTOKEN", fetchImpl, calls };
}

function zipOf(name, content) {
  const data = zlib.deflateRawSync(Buffer.from(content));
  const local = Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50, 0);
  local.writeUInt16LE(8, 8);
  local.writeUInt32LE(data.length, 18);
  local.writeUInt16LE(name.length, 26);
  const central = Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50, 0);
  central.writeUInt16LE(8, 10);
  central.writeUInt32LE(data.length, 20);
  central.writeUInt16LE(name.length, 28);
  central.writeUInt32LE(0, 42);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  const centralOffset = 30 + name.length + data.length;
  eocd.writeUInt32LE(centralOffset, 16);
  return Buffer.concat([local, Buffer.from(name), data, central, Buffer.from(name), eocd]);
}

describe("msads config and arguments", () => {
  it("reads every setting from msads.toml", () => {
    expect(config.accountId).toBe("188495572");
    expect(config.accountNumber).toBe("G1202SF9");
    expect(config.identityProvider).toBe("Google");
    expect(config.scope).toBe("openid profile email");
    expect(config.refreshTokenSecretName).toBe("prod/submit/microsoft-ads/google_refresh_token");
  });
  it("names the missing settings", () => {
    expect(() => parseConfig('[account]\naccount_id = "1"')).toThrow(/missing: .*oauthClientSecretName/);
  });
  it("requires exactly one mode", () => {
    expect(() => parseArgs([])).toThrow(/mode is required/);
    expect(() => parseArgs(["--whoami", "--report"])).toThrow(/Only one mode/);
    expect(parseArgs(["--inventory", "--json"])).toMatchObject({ mode: "inventory", json: true, campaignTypes: "Search" });
  });
  it("requires --from and --to together", () => {
    expect(() => parseArgs(["--report", "--from", "2026-10-01"])).toThrow(/together/);
    expect(parseArgs(["--report", "--from", "2026-10-01", "--to", "2026-10-28"])).toMatchObject({ from: "2026-10-01", to: "2026-10-28" });
  });
  it("rejects unknown arguments", () => {
    expect(() => parseArgs(["--create"])).toThrow(/Unknown argument/);
  });
  it("reads the developer token as a bare string or as JSON", () => {
    expect(parseDeveloperToken(" ABC123\n")).toBe("ABC123");
    expect(parseDeveloperToken('{"developer_token":"XYZ"}')).toBe("XYZ");
    expect(() => parseDeveloperToken("{}")).toThrow();
  });
});

describe("msads token refresh and headers", () => {
  it("posts a refresh_token grant to Google and returns the access token", async () => {
    const s = session([jsonResponse({ access_token: "ya29.new", expires_in: 3599 })]);
    const token = await refreshAccessToken({
      config,
      clientCredentials: { client_id: "cid", client_secret: "csecret" },
      refreshToken: "1//refresh",
      fetchImpl: s.fetchImpl,
    });
    expect(token).toBe("ya29.new");
    expect(s.calls[0].url).toBe("https://oauth2.googleapis.com/token");
    const body = s.calls[0].init.body.toString();
    expect(body).toContain("grant_type=refresh_token");
    expect(body).toContain("refresh_token=1%2F%2Frefresh");
  });
  it("tells the operator to consent again when Google refuses the token", async () => {
    const s = session([jsonResponse({ error: "invalid_grant" }, 400)]);
    await expect(
      refreshAccessToken({ config, clientCredentials: { client_id: "a", client_secret: "b" }, refreshToken: "r", fetchImpl: s.fetchImpl }),
    ).rejects.toThrow(/invalid_grant.*--consent/);
  });
  it("sends bearer, developer token, identity provider, customer and account", () => {
    const headers = buildHeaders({ ...session([]), customerId: "42" });
    expect(headers).toMatchObject({
      Authorization: "Bearer ya29.access",
      DeveloperToken: "DEVTOKEN",
      IdentityProvider: "Google",
      CustomerId: "42",
      CustomerAccountId: "188495572",
    });
  });
  it("omits the account header before the customer is known", () => {
    const headers = buildHeaders({ ...session([]), withAccount: false });
    expect(headers.CustomerAccountId).toBeUndefined();
    expect(headers.CustomerId).toBeUndefined();
  });
  it("redacts tokens from an API error", async () => {
    const s = session([{ ok: false, status: 401, text: async () => "bad token ya29.access and DEVTOKEN" }]);
    await expect(callApi(s, "https://x", "/Op", {})).rejects.toThrow(/\[redacted\] and \[redacted\]/);
  });
});

describe("msads customer discovery", () => {
  it("reads the customer id from the account's parent customer", async () => {
    const s = session([
      jsonResponse({
        User: { Id: 7, UserName: "u", CustomerId: 99 },
        CustomerRoles: [{ CustomerId: 99, RoleId: 16, AccountIds: [188495572] }],
      }),
      jsonResponse({ Accounts: [{ Id: 188495572, Number: "G1202SF9", Name: "DIY", CurrencyCode: "GBP", ParentCustomerId: 555 }] }),
    ]);
    const who = await discoverCustomer(s);
    expect(who.customerId).toBe("555");
    expect(who.account.number).toBe("G1202SF9");
    expect(s.customerId).toBe("555");
    expect(s.calls[0].url).toBe("https://clientcenter.api.bingads.microsoft.com/CustomerManagement/v13/User/Query");
    expect(JSON.parse(s.calls[1].init.body).Predicates[0]).toEqual({ Field: "AccountId", Operator: "Equals", Value: "188495572" });
  });
  it("fails when the account is not visible", async () => {
    const s = session([jsonResponse({ User: { Id: 7 } }), jsonResponse({ Accounts: [] })]);
    await expect(discoverCustomer(s)).rejects.toThrow(/not visible/);
  });
});

describe("msads inventory shaping", () => {
  it("shapes a campaign, a keyword, an ad and a criterion", () => {
    expect(
      shapeCampaign({
        Id: 1,
        Name: "VAT",
        Status: "Active",
        BudgetId: 5,
        DailyBudget: 10,
        BiddingScheme: { Type: "MaxClicksBiddingScheme" },
      }),
    ).toMatchObject({
      id: "1",
      budgetId: "5",
      dailyBudget: 10,
    });
    expect(shapeKeyword({ Id: 3, Text: "vat return", MatchType: "Exact", Status: "Active", Bid: { Amount: 0.5 } })).toMatchObject({
      bid: 0.5,
    });
    expect(
      shapeAd({
        Id: 4,
        Type: "ResponsiveSearch",
        Headlines: [{ Asset: { Text: "H1" } }],
        Descriptions: [{ Asset: { Text: "D1" } }],
        FinalUrls: ["https://x"],
      }),
    ).toMatchObject({
      headlines: ["H1"],
      descriptions: ["D1"],
    });
    expect(shapeAd({ Id: 4, Type: "ExpandedText", TitlePart1: "T1", TitlePart2: "T2", Text: "Body" })).toMatchObject({
      headlines: ["T1", "T2"],
      descriptions: ["Body"],
    });
    expect(
      shapeCriterion({
        Id: 9,
        Type: "BiddableCampaignCriterion",
        Criterion: { Type: "LocationCriterion", LocationId: 188 },
        CriterionBid: { Multiplier: 10 },
      }),
    ).toEqual({
      id: "9",
      type: "LocationCriterion",
      negative: false,
      status: undefined,
      bidMultiplier: 10,
      detail: { LocationId: 188 },
    });
  });
  it("starts the spend range at the earliest campaign start", () => {
    const campaigns = [{ startDate: { Year: 2026, Month: 10, Day: 29 } }, { startDate: "2026-10-01T00:00:00" }];
    expect(earliestStart(campaigns, "2026-09-01")).toBe("2026-10-01");
    expect(earliestStart([], "2026-09-01")).toBe("2026-09-01");
  });
});

describe("msads reporting", () => {
  it("parses quoted CSV fields", () => {
    expect(parseCsv('a,b\n"x, y",2\r\n"say ""hi""",3\n')).toEqual([
      ["a", "b"],
      ["x, y", "2"],
      ['say "hi"', "3"],
    ]);
  });
  it("unzips a deflated entry", () => {
    expect(unzipFirstEntry(zipOf("r.csv", "a,b\n1,2\n")).toString()).toBe("a,b\n1,2\n");
  });
  it("builds a custom-range campaign report request", () => {
    const request = buildCampaignReportRequest({ accountId: "188495572", from: "2026-10-01", to: "2026-10-28" }).ReportRequest;
    expect(request.Type).toBe("CampaignPerformanceReportRequest");
    expect(request.Scope).toEqual({ AccountIds: ["188495572"] });
    expect(request.Time.CustomDateRangeStart).toEqual({ Year: 2026, Month: 10, Day: 1 });
    expect(request.Time.CustomDateRangeEnd).toEqual({ Year: 2026, Month: 10, Day: 28 });
  });
  it("shapes report rows and treats -- as zero", () => {
    const rows = shapeReportRows(
      'CampaignId,CampaignName,Impressions,Clicks,Ctr,AverageCpc,Spend,Conversions,Revenue\n1,VAT,"1,200",12,1.00%,0.40,4.80,--,--\n',
    );
    expect(rows).toEqual([
      {
        campaignId: "1",
        campaign: "VAT",
        impressions: 1200,
        clicks: 12,
        ctrPercent: 1,
        averageCpc: 0.4,
        spend: 4.8,
        conversions: 0,
        revenue: 0,
      },
    ]);
  });
  it("polls until the report is ready, then downloads and parses it", async () => {
    const csv = "CampaignId,CampaignName,Impressions,Clicks,Ctr,AverageCpc,Spend,Conversions,Revenue\n1,VAT,10,1,10,0.5,0.5,0,0\n";
    const zip = zipOf("r.csv", csv);
    const s = session([
      jsonResponse({ ReportRequestId: "req1" }),
      jsonResponse({ ReportRequestStatus: { Status: "Pending" } }),
      jsonResponse({ ReportRequestStatus: { Status: "Success", ReportDownloadUrl: "https://download/r.zip" } }),
      { ok: true, status: 200, arrayBuffer: async () => zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) },
    ]);
    const rows = await runCampaignReport(s, { from: "2026-10-01", to: "2026-10-28", sleep: async () => {} });
    expect(rows[0]).toMatchObject({ campaign: "VAT", clicks: 1, spend: 0.5 });
    expect(s.calls.map((c) => c.url.split("/v13")[1] ?? c.url)).toEqual([
      "/GenerateReport/Submit",
      "/GenerateReport/Poll",
      "/GenerateReport/Poll",
      "https://download/r.zip",
    ]);
  });
  it("defaults the range to the 28 days ending yesterday", () => {
    expect(defaultReportRange(new Date("2026-10-29T12:00:00Z"))).toEqual({ from: "2026-10-01", to: "2026-10-28" });
  });
});

describe("msads forecast", () => {
  const campaign = {
    id: "1",
    dailyBudget: 10,
    biddingScheme: { Type: "MaxClicksBiddingScheme", MaxCpc: { Amount: 2 } },
    languages: ["English"],
    criteria: [
      { type: "LocationCriterion", negative: false, detail: { LocationId: 188 } },
      { type: "LocationCriterion", negative: true, detail: { LocationId: 5 } },
      { type: "DayTimeCriterion", negative: false, detail: { Day: "Monday" } },
    ],
    adGroups: [
      { id: "2", cpcBid: undefined, keywords: [{ id: "3", text: "vat", matchType: "Exact", bid: 0.8 }] },
      { id: "4", keywords: [] },
    ],
  };
  it("builds an estimate request from the campaign's budget, bids and targeting", () => {
    const request = buildTrafficEstimateRequest({ campaign, extraKeywords: ["mtd vat"] });
    const estimator = request.CampaignEstimators[0];
    expect(estimator.DailyBudget).toBe(10);
    expect(estimator.Criteria).toEqual([
      { Type: "LocationCriterion", LocationId: 188 },
      { Type: "LanguageCriterion", Language: "English" },
    ]);
    expect(estimator.AdGroupEstimators[0].KeywordEstimators[0]).toEqual({
      Keyword: { Id: "3", MatchType: "Exact", Text: "vat" },
      MaxCpc: 0.8,
    });
    expect(estimator.AdGroupEstimators).toHaveLength(2);
    expect(estimator.AdGroupEstimators[1].KeywordEstimators[0]).toEqual({ Keyword: { MatchType: "Exact", Text: "mtd vat" }, MaxCpc: 2 });
  });
  it("shapes minimum and maximum estimates per keyword", () => {
    const rows = shapeTrafficEstimates({
      CampaignEstimates: [
        {
          CampaignId: 1,
          AdGroupEstimates: [
            {
              AdGroupId: 2,
              KeywordEstimates: [
                {
                  Keyword: { Text: "vat", MatchType: "Exact" },
                  Minimum: { Clicks: 1, Impressions: 10, AverageCpc: 0.5, TotalCost: 0.5 },
                  Maximum: { Clicks: 3, Impressions: 30, AverageCpc: 0.9, TotalCost: 2.7 },
                },
              ],
            },
          ],
        },
      ],
    });
    expect(rows[0]).toMatchObject({ keyword: "vat", minimum: { clicks: 1 }, maximum: { clicks: 3, totalCost: 2.7 } });
  });
});
