// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseSend.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { putIntegrationCall } from "@app/data/dynamoDbIntegrationCallRepository.js";
import { sendJsonToCompaniesHouse, sendXmlToCompaniesHouse, companiesHouseCallTarget } from "@app/services/companiesHouseSend.js";

vi.mock("@app/data/dynamoDbIntegrationCallRepository.js", () => ({
  putIntegrationCall: vi.fn().mockResolvedValue(undefined),
}));

const GATEWAY_URL = "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway";
const envelope = ({ test, requestClass = "CompanyDataRequest" }) =>
  `<GovTalkMessage><Header><MessageDetails><Class>${requestClass}</Class><Qualifier>request</Qualifier>` +
  `${test ? "<GatewayTest>1</GatewayTest>" : ""}</MessageDetails></Header>` +
  "<Body><CompanyNumber>01234567</CompanyNumber></Body></GovTalkMessage>";

function recordedItem() {
  expect(putIntegrationCall).toHaveBeenCalledTimes(1);
  return putIntegrationCall.mock.calls[0][0];
}

describe("services/companiesHouseSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    putIntegrationCall.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("sendJsonToCompaniesHouse", () => {
    it("records a response, parses the JSON and keeps the result shape", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ company_name: "A LTD" }), { status: 200 })));

      const result = await sendJsonToCompaniesHouse(
        "https://api.company-information.service.gov.uk/company/01234567/filing-history?items_per_page=5",
        { method: "GET", headers: { Authorization: "Basic c2VjcmV0" } },
        5000,
      );

      expect(result).toMatchObject({ ok: true, status: 200, data: { company_name: "A LTD" } });
      expect(result.duration).toBeGreaterThanOrEqual(0);
      const item = recordedItem();
      expect(item).toMatchObject({
        pk: expect.stringMatching(/^call#companies-house#/),
        org: "companies-house",
        target: "live",
        api: "GET /company/{id}/filing-history",
        outcome: "response",
        status: 200,
      });
      expect(JSON.stringify(item)).not.toContain("01234567");
      expect(JSON.stringify(item)).not.toContain("c2VjcmV0");
    });

    it("records a sandbox host as test", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 201 })));

      await sendJsonToCompaniesHouse(
        "https://api-sandbox.company-information.service.gov.uk/transactions",
        { method: "POST", body: "{}" },
        5000,
      );

      expect(recordedItem()).toMatchObject({ target: "test", api: "POST /transactions", status: 201 });
    });

    it("records the token exchange under the given template and keeps the code out of the record", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 })));

      await sendJsonToCompaniesHouse(
        "https://identity-sandbox.company-information.service.gov.uk/oauth2/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: "grant_type=authorization_code&code=secretcode&client_secret=topsecret",
        },
        5000,
        { api: "POST /oauth2/token" },
      );

      const item = recordedItem();
      expect(item).toMatchObject({ api: "POST /oauth2/token", target: "test", status: 400 });
      expect(JSON.stringify(item)).not.toContain("secretcode");
      expect(JSON.stringify(item)).not.toContain("topsecret");
    });

    it("records a timeout and throws the timeout error", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockImplementation(
            (_url, { signal }) =>
              new Promise((_resolve, reject) =>
                signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" }))),
              ),
          ),
      );

      await expect(
        sendJsonToCompaniesHouse("https://api.company-information.service.gov.uk/company/01234567", { method: "GET" }, 20),
      ).rejects.toMatchObject({
        name: "HttpTimeoutError",
      });

      expect(recordedItem()).toMatchObject({ outcome: "timeout", api: "GET /company/{id}" });
    });

    it("records a network error and rethrows it", async () => {
      vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new TypeError("fetch failed")));

      await expect(
        sendJsonToCompaniesHouse("https://api.company-information.service.gov.uk/company/01234567", { method: "GET" }, 5000),
      ).rejects.toThrow("fetch failed");

      expect(recordedItem()).toMatchObject({ outcome: "network-error" });
    });

    it("returns the result when the record write fails", async () => {
      putIntegrationCall.mockRejectedValue(new Error("table unavailable"));
      vi.spyOn(console, "log").mockImplementation(() => {});
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{}", { status: 200 })));

      await expect(
        sendJsonToCompaniesHouse("https://api.company-information.service.gov.uk/search", { method: "GET" }, 5000),
      ).resolves.toMatchObject({
        ok: true,
      });
      vi.restoreAllMocks();
    });
  });

  describe("sendXmlToCompaniesHouse", () => {
    it("names the call by its message class and reads the test flag", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<GovTalkMessage/>", { status: 200 })));

      const result = await sendXmlToCompaniesHouse(
        GATEWAY_URL,
        { method: "POST", headers: { "Content-Type": "text/xml" }, body: envelope({ test: true }) },
        5000,
      );

      expect(result).toMatchObject({ ok: true, status: 200, data: "<GovTalkMessage/>" });
      expect(recordedItem()).toMatchObject({ org: "companies-house", target: "test", api: "XMLGW CompanyDataRequest", status: 200 });
    });

    it("records a live message as live", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<GovTalkMessage/>", { status: 200 })));

      await sendXmlToCompaniesHouse(GATEWAY_URL, { method: "POST", body: envelope({ test: false, requestClass: "Accounts" }) }, 5000);

      expect(recordedItem()).toMatchObject({ target: "live", api: "XMLGW Accounts" });
    });

    it("keeps the error number of a rejection that arrives inside HTTP 200", async () => {
      const rejection =
        "<GovTalkMessage><Header><MessageDetails><Class>Accounts</Class></MessageDetails></Header>" +
        "<GovTalkDetails><GovTalkErrors><Error><RaisedBy>CompaniesHouse</RaisedBy><Number>502</Number><Type>fatal</Type>" +
        "<Text>Authentication failure for 01234567</Text></Error></GovTalkErrors></GovTalkDetails></GovTalkMessage>";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(rejection, { status: 200, headers: { "Content-Type": "text/xml" } })));

      const result = await sendXmlToCompaniesHouse(
        GATEWAY_URL,
        { method: "POST", headers: { "Content-Type": "text/xml" }, body: envelope({ test: true }) },
        5000,
      );

      expect(result.data).toBe(rejection);
      const item = recordedItem();
      expect(item).toMatchObject({ outcome: "response", status: 200, appCode: "502" });
      expect(JSON.stringify(item)).not.toContain("01234567");
    });
  });

  describe("companiesHouseCallTarget", () => {
    it("reads the gateway test flag from the message and the host otherwise", () => {
      expect(companiesHouseCallTarget(GATEWAY_URL, { xml: envelope({ test: true }) })).toBe("test");
      expect(companiesHouseCallTarget(GATEWAY_URL, { xml: envelope({ test: false }) })).toBe("live");
      expect(companiesHouseCallTarget("https://api-sandbox.company-information.service.gov.uk/x")).toBe("test");
      expect(companiesHouseCallTarget("https://api.company-information.service.gov.uk/x")).toBe("live");
    });
  });
});
