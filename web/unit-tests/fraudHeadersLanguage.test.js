// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @vitest-environment happy-dom

// The fraud prevention headers describe the device and the connection, so the reader's language
// choice changes none of them, and a VAT return sends HMRC the same request in English and Welsh.

import { describe, test, expect, vi, beforeEach } from "vitest";

vi.mock("../public/lib/services/api-client.js", () => ({ authorizedFetch: vi.fn() }));

import { authorizedFetch } from "../public/lib/services/api-client.js";
import { getGovClientHeaders, submitVat } from "../public/lib/services/hmrc-service.js";

function chooseLanguage(language) {
  globalThis.siteLanguage = { current: () => language, chrome: () => language, store: () => true };
}

const vatData = {
  periodStart: "2017-04-01",
  periodEnd: "2017-06-30",
  vatDueSales: 100,
  vatDueAcquisitions: 0,
  totalVatDue: 100,
  vatReclaimedCurrPeriod: 0,
  netVatDue: 100,
  totalValueSalesExVAT: 500,
  totalValuePurchasesExVAT: 0,
  totalValueGoodsSuppliedExVAT: 0,
  totalAcquisitionsExVAT: 0,
  finalised: true,
};

describe("fraud prevention headers and the language choice", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();
    delete globalThis.siteLanguage;
    // The public IP lookup answers the same address in both runs, with no network.
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, json: () => Promise.resolve({ ip: "203.0.113.6" }), text: () => Promise.resolve("203.0.113.6") }),
      ),
    );
  });

  test("the Gov-Client headers are the same in English and Welsh", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
    chooseLanguage("en");
    const english = await getGovClientHeaders();
    chooseLanguage("cy");
    const welsh = await getGovClientHeaders();
    vi.useRealTimers();
    expect(Object.keys(english).length).toBeGreaterThan(0);
    expect(welsh).toEqual(english);
  });

  test("a VAT return sends the same headers and figures in English and Welsh; only the language field differs", async () => {
    authorizedFetch.mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ formBundleNumber: "FB1" }) });
    const headers = { "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER", "Gov-Client-Device-ID": "device-1" };

    chooseLanguage("en");
    await submitVat("111222333", vatData, "grant-1", headers, true);
    chooseLanguage("cy");
    await submitVat("111222333", vatData, "grant-1", headers, true);

    const [[, english], [, welsh]] = authorizedFetch.mock.calls;
    expect(welsh.headers).toEqual(english.headers);
    const { language: englishLanguage, ...englishBody } = JSON.parse(english.body);
    const { language: welshLanguage, ...welshBody } = JSON.parse(welsh.body);
    expect(welshBody).toEqual(englishBody);
    expect([englishLanguage, welshLanguage]).toEqual(["en", "cy"]);
  });
});
