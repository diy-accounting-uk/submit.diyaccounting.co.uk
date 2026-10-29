// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import {
  parseArgs,
  parseUploadConfig,
  buildLakeQuery,
  shapeAthenaRows,
  shapeOfflineConversions,
  buildApplyRequests,
  assertGoalExists,
  sendConversions,
  APPLY_PATH,
  MAX_CONVERSIONS_PER_REQUEST,
} from "../../../infra/microsoft/ads/msads-conversions-upload.js";
import { parseConfig } from "../../../app/lib/microsoftAdsReporting.js";

const config = parseConfig(fs.readFileSync("infra/microsoft/ads/msads.toml", "utf8"));
const athenaPages = JSON.parse(fs.readFileSync("app/unit-tests/scripts/fixtures/adsConversionsUploadAthenaPages.json", "utf8"));

function recordingSession(responder) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, method: init.method, headers: init.headers, body: JSON.parse(init.body) });
    const body = responder(url, calls.at(-1).body);
    return { ok: true, status: 200, text: async () => JSON.stringify(body) };
  };
  return { session: { config, accessToken: "ya29.access", developerToken: "DEVTOKEN", customerId: "255112240", fetchImpl }, calls };
}

const lakeRows = [
  { invoice_id: "in_1", msclkid: "abc123def456", net_minor: "99", currency: "GBP", created: "1790000000" },
  { invoice_id: "in_2", msclkid: "fed654cba321", net_minor: "1188", currency: "GBP", created: "1790086400" },
];

describe("msads conversions upload config and arguments", () => {
  it("reads the offline goal name from ads.toml", () => {
    expect(parseUploadConfig(fs.readFileSync("infra/microsoft/ads/ads.toml", "utf8"))).toEqual({
      goalName: "DIY Accounting (upload) purchase",
    });
    expect(() => parseUploadConfig("[account]\nauto_tagging = true\n")).toThrow(/conversion_goal_name/);
  });

  it("defaults to prod, a dry run and no window", () => {
    expect(parseArgs([])).toMatchObject({ env: "prod", apply: false, since: undefined });
    expect(parseArgs(["--env", "ci", "--since", "2026-10-01", "--apply"])).toMatchObject({ env: "ci", since: "2026-10-01", apply: true });
  });

  it("rejects a bad date, an unknown environment and an unknown flag", () => {
    expect(() => parseArgs(["--since", "yesterday"])).toThrow(/YYYY-MM-DD/);
    expect(() => parseArgs(["--env", "dev"])).toThrow(/--env/);
    expect(() => parseArgs(["--validate-only"])).toThrow(/Unknown argument/);
  });
});

describe("msads conversions upload lake query", () => {
  it("selects paid, unrefunded subscription charges whose account holds a msclkid", () => {
    const sql = buildLakeQuery("2026-10-01");
    expect(sql).toContain("min_by(acq_msclkid, change_ts) AS msclkid");
    expect(sql).toContain("c.paid = true");
    expect(sql).toContain("c.refunded = false");
    expect(sql).toContain("date '2026-10-01'");
    expect(sql).not.toContain("gclid");
  });

  it("refuses a since value that is not a date", () => {
    expect(() => buildLakeQuery("2026-10-01'; drop table x")).toThrow(/YYYY-MM-DD/);
  });

  it("reads Athena pages into row objects", () => {
    expect(shapeAthenaRows(athenaPages).length).toBeGreaterThan(0);
  });
});

describe("msads offline conversions", () => {
  it("shapes one offline conversion per row, in UTC and major units", () => {
    expect(shapeOfflineConversions(lakeRows, "DIY Accounting (upload) purchase")).toEqual([
      {
        ConversionName: "DIY Accounting (upload) purchase",
        ConversionTime: "2026-09-21T14:13:20Z",
        ConversionValue: 0.99,
        ConversionCurrencyCode: "GBP",
        MicrosoftClickId: "abc123def456",
      },
      {
        ConversionName: "DIY Accounting (upload) purchase",
        ConversionTime: "2026-09-22T14:13:20Z",
        ConversionValue: 11.88,
        ConversionCurrencyCode: "GBP",
        MicrosoftClickId: "fed654cba321",
      },
    ]);
  });

  it("fails on a row with no msclkid", () => {
    expect(() => shapeOfflineConversions([{ ...lakeRows[0], msclkid: undefined }], "g")).toThrow(/missing msclkid/);
  });

  it("splits requests at 1000 conversions", () => {
    const many = Array.from({ length: MAX_CONVERSIONS_PER_REQUEST + 1 }, (_, i) => ({ MicrosoftClickId: String(i) }));
    const requests = buildApplyRequests(many);
    expect(requests.map((r) => r.OfflineConversions.length)).toEqual([MAX_CONVERSIONS_PER_REQUEST, 1]);
  });

  it("posts each request to OfflineConversions/Apply with the account headers", async () => {
    const { session, calls } = recordingSession(() => ({ PartialErrors: [] }));
    const conversions = shapeOfflineConversions(lakeRows, "g");
    vi.spyOn(console, "log").mockImplementation(() => {});
    await sendConversions(session, buildApplyRequests(conversions));
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${config.campaignManagementUrl}${APPLY_PATH}`);
    expect(calls[0].method).toBe("POST");
    expect(calls[0].headers.CustomerAccountId).toBe("188495572");
    expect(calls[0].body.OfflineConversions).toEqual(conversions);
  });

  it("fails with the error code when Microsoft refuses a conversion", async () => {
    const { session } = recordingSession(() => ({ PartialErrors: [{ ErrorCode: "OfflineConversionGoalNotFound", Message: "no goal" }] }));
    await expect(sendConversions(session, buildApplyRequests(shapeOfflineConversions(lakeRows, "g")))).rejects.toThrow(
      /OfflineConversionGoalNotFound/,
    );
  });

  it("asks the account for its offline goals and fails when the named one is absent", async () => {
    const { session, calls } = recordingSession(() => ({ ConversionGoals: [{ Name: "Other goal" }] }));
    await expect(assertGoalExists(session, "DIY Accounting (upload) purchase")).rejects.toThrow(/msads.js --apply/);
    expect(calls[0].body.ConversionGoalTypes).toBe("OfflineConversion");
  });

  it("accepts the account when the named goal exists", async () => {
    const { session } = recordingSession(() => ({ ConversionGoals: [{ Name: "DIY Accounting (upload) purchase" }] }));
    await expect(assertGoalExists(session, "DIY Accounting (upload) purchase")).resolves.toBeUndefined();
  });
});
