// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  parseArgs,
  parseUploadConfig,
  defaultSince,
  buildLakeQuery,
  shapeAthenaRows,
  shapeConversionEvents,
  buildIngestRequests,
  buildConversionActionQuery,
  shapeConversionActionId,
  MAX_EVENTS_PER_REQUEST,
} from "../../../infra/google/ads/ads-conversions-upload.js";

const athenaPages = JSON.parse(fs.readFileSync(path.join(import.meta.dirname, "fixtures/adsConversionsUploadAthenaPages.json"), "utf-8"));

describe("ads-conversions-upload parseArgs", () => {
  it("defaults to prod, no window, no send", () => {
    expect(parseArgs([])).toEqual({
      env: "prod",
      since: undefined,
      eventsFile: undefined,
      validateOnly: false,
      apply: false,
      clientFile: undefined,
    });
  });
  it("reads every flag", () => {
    expect(parseArgs(["--env", "ci", "--since", "2026-09-01", "--events-file", "rows.json", "--apply", "--client-file", "c.json"])).toEqual(
      {
        env: "ci",
        since: "2026-09-01",
        eventsFile: "rows.json",
        validateOnly: false,
        apply: true,
        clientFile: "c.json",
      },
    );
  });
  it("rejects an unknown environment", () => {
    expect(() => parseArgs(["--env", "dev"])).toThrow(/--env must be one of/);
  });
  it("rejects a malformed --since", () => {
    expect(() => parseArgs(["--since", "yesterday"])).toThrow(/YYYY-MM-DD/);
  });
  it("rejects --validate-only with --apply", () => {
    expect(() => parseArgs(["--validate-only", "--apply"])).toThrow(/cannot be combined/);
  });
  it("rejects an unknown argument", () => {
    expect(() => parseArgs(["--nope"])).toThrow(/Unknown argument/);
  });
});

describe("ads-conversions-upload config and window", () => {
  it("reads the [upload] table", () => {
    const toml = '[upload]\nconversion_action_name = "Upload purchase"\nscope = "https://example/scope"\n';
    expect(parseUploadConfig(toml)).toEqual({ conversionActionName: "Upload purchase", scope: "https://example/scope" });
  });
  it("fails when [upload] is missing", () => {
    expect(() => parseUploadConfig("[account]\ncustomer_id = 1\n")).toThrow(/\[upload\]/);
  });
  it("starts the window three days before now", () => {
    expect(defaultSince(new Date("2026-10-01T12:00:00Z"))).toBe("2026-09-28");
  });
});

describe("ads-conversions-upload buildLakeQuery", () => {
  it("selects live paid unrefunded subscription charges with a stored gclid since the date", () => {
    const query = buildLakeQuery("2026-09-28");
    expect(query).toContain("c.livemode = true");
    expect(query).toContain("c.refunded = false");
    expect(query).toContain("acq_gclid IS NOT NULL");
    expect(query).toContain("c.bundle_id IN ('resident-vat', 'resident', 'resident-pro')");
    expect(query).toContain("date '2026-09-28'");
  });
  it("rejects a malformed date", () => {
    expect(() => buildLakeQuery("2026-09-28' OR 1=1")).toThrow(/YYYY-MM-DD/);
  });
});

describe("ads-conversions-upload shaping", () => {
  it("turns Athena result pages into keyed rows, dropping the header", () => {
    expect(shapeAthenaRows(athenaPages)).toEqual([
      { invoice_id: "in_1TestAAA", gclid: "Cj0KCQtestA", net_minor: "1200", currency: "GBP", created: "1790000000" },
      { invoice_id: "in_1TestBBB", gclid: "Cj0KCQtestB", net_minor: "4900", currency: "GBP", created: "1790086400" },
    ]);
  });
  it("returns no rows for an empty result", () => {
    expect(shapeAthenaRows([{ ResultSet: { Rows: [] } }])).toEqual([]);
  });
  it("builds one consented event per row with the invoice id as transactionId", () => {
    const events = shapeConversionEvents(shapeAthenaRows(athenaPages));
    expect(events).toEqual([
      {
        eventTimestamp: "2026-09-21T14:13:20.000Z",
        transactionId: "in_1TestAAA",
        conversionValue: 12,
        currency: "GBP",
        eventSource: "WEB",
        adIdentifiers: { gclid: "Cj0KCQtestA" },
        consent: { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_DENIED" },
      },
      {
        eventTimestamp: "2026-09-22T14:13:20.000Z",
        transactionId: "in_1TestBBB",
        conversionValue: 49,
        currency: "GBP",
        eventSource: "WEB",
        adIdentifiers: { gclid: "Cj0KCQtestB" },
        consent: { adUserData: "CONSENT_GRANTED", adPersonalization: "CONSENT_DENIED" },
      },
    ]);
  });
  it("fails on a row with no gclid", () => {
    expect(() => shapeConversionEvents([{ invoice_id: "in_1", net_minor: "100", currency: "GBP", created: "1790000000" }])).toThrow(
      /missing invoice_id, gclid/,
    );
  });
});

describe("ads-conversions-upload requests", () => {
  const events = shapeConversionEvents(shapeAthenaRows(athenaPages));

  it("addresses the Google Ads account and the conversion action", () => {
    const [request] = buildIngestRequests({ customerId: "8142685080", conversionActionId: "987", events, validateOnly: true });
    expect(request.destinations).toEqual([
      { operatingAccount: { accountType: "GOOGLE_ADS", accountId: "8142685080" }, productDestinationId: "987" },
    ]);
    expect(request.validateOnly).toBe(true);
    expect(request.events).toHaveLength(2);
  });
  it("splits events into requests of at most the API limit", () => {
    const many = Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, () => events[0]);
    const requests = buildIngestRequests({ customerId: "1", conversionActionId: "2", events: many, validateOnly: false });
    expect(requests.map((r) => r.events.length)).toEqual([MAX_EVENTS_PER_REQUEST, 1]);
  });
  it("finds the conversion action id by name", () => {
    const body = { results: [{ conversionAction: { id: "555", name: "DIY Accounting (upload) purchase" } }] };
    expect(shapeConversionActionId(body, "DIY Accounting (upload) purchase")).toBe("555");
  });
  it("fails when the account has no conversion action of that name", () => {
    expect(() => shapeConversionActionId({ results: [] }, "Missing")).toThrow(/no conversion action named "Missing"/);
  });
  it("rejects a quote in the conversion action name", () => {
    expect(() => buildConversionActionQuery("a'b")).toThrow(/quote/);
  });
});
