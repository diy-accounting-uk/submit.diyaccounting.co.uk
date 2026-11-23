// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/loggedOutboundUrl.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const sent = [];
const answer = { ok: true, status: 200, data: {}, headers: {} };
vi.mock("@app/services/companiesHouseSend.js", () => ({
  sendJsonToCompaniesHouse: async (url) => {
    sent.push(url);
    return answer;
  },
  sendTextToCompaniesHouse: async (url) => {
    sent.push(url);
    return { ...answer, data: "<html/>" };
  },
}));

const { loggedUrlOf, loggedOutboundPathOf } = await import("@app/lib/loggedPath.js");
const { companiesHouseGetJson } = await import("@app/services/companiesHouseApi.js");
const { companiesHouseFilingRequest } = await import("@app/services/companiesHouseFilingApi.js");
const { companiesHouseDocumentContent } = await import("@app/services/companiesHouseDocumentApi.js");

const COMPANY = "SC123456";
const TRANSACTION = "174052-912358-801533";
const DOCUMENT = "aBcD3fGh1JkLmN0pQrStUvWxYz";

let lines;
let write;
beforeEach(() => {
  process.env.COMPANIES_HOUSE_API_KEY = "test-key";
  process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://filing.example";
  process.env.COMPANIES_HOUSE_DOCUMENT_BASE_URI = "https://doc.example";
  sent.length = 0;
  lines = [];
  write = vi.spyOn(process.stdout, "write").mockImplementation((chunk) => lines.push(String(chunk)) > 0);
});
afterEach(() => write.mockRestore());

const logged = () => lines.join("");

describe("an outbound URL in a log line", () => {
  test("names the company number, the transaction and the document, and gives the query's names only", () => {
    expect(loggedUrlOf(`https://api.example/company/${COMPANY}/filing-history/${TRANSACTION}?items_per_page=100&category=accounts`)).toBe(
      "https://api.example/company/{companyNumber}/filing-history/{transactionId}?items_per_page={items_per_page}&category={category}",
    );
    expect(loggedUrlOf(`https://api.example/transactions/${TRANSACTION}/registered-office-address`)).toBe(
      "https://api.example/transactions/{transactionId}/registered-office-address",
    );
    expect(loggedUrlOf(`https://doc.example/document/${DOCUMENT}/content`)).toBe("https://doc.example/document/{documentId}/content");
    expect(loggedUrlOf("https://hmrc.example/agents/AARN1234567/invitations/ABBBBBBBBBBCA")).toBe(
      "https://hmrc.example/agents/{arn}/invitations/{invitationId}",
    );
    expect(loggedOutboundPathOf(`/company/${COMPANY}/officers?register_view=true`)).toBe("/company/{companyNumber}/officers");
    expect(loggedUrlOf("not a url")).toBe("[unparsable URL]");
  });

  test.each([
    ["/organisations/vat/123456789/returns/18A1", "/organisations/vat/{vrn}/returns/{periodKey}"],
    ["/organisations/vat/123456789/returns/%2318A1", "/organisations/vat/{vrn}/returns/{periodKey}"],
    ["/organisations/vat/123456789/obligations", "/organisations/vat/{vrn}/obligations"],
    ["/individuals/business/details/AA123456A/list", "/individuals/business/details/{nino}/list"],
    [
      "/individuals/business/property/foreign/AA123456A/XAIS12345678901/period/2025-26/0a1b2c3d-1111-2222-3333-444455556666",
      "/individuals/business/property/foreign/{nino}/{businessId}/period/2025-26/{submissionId}",
    ],
    [
      "/individuals/calculations/AA123456A/self-assessment/2025-26/0a1b2c3d-1111-2222-3333-444455556666",
      "/individuals/calculations/{nino}/self-assessment/2025-26/{calculationId}",
    ],
    ["/test/fraud-prevention-headers/validate", "/test/fraud-prevention-headers/validate"],
    [
      `/organisations/vat-assist/acknowledge/123456789/0a1b2c3d-1111-2222-3333-444455556666/${"c0ffee".repeat(10)}abcd`,
      "/organisations/vat-assist/acknowledge/{vrn}/{reportId}/{correlationId}",
    ],
    [
      `/individuals/self-assessment/assist/reports/acknowledge/AA123456A/0a1b2c3d-1111-2222-3333-444455556666/${"ab".repeat(32)}`,
      "/individuals/self-assessment/assist/reports/acknowledge/{nino}/{reportId}/{correlationId}",
    ],
    ["/organisations/vat-assist/feedback/123456789", "/organisations/vat-assist/feedback/{vrn}"],
    [
      "/individuals/self-assessment/assist/reports/AA123456A/2025-26/0a1b2c3d-1111-2222-3333-444455556666",
      "/individuals/self-assessment/assist/reports/{nino}/2025-26/{calculationId}",
    ],
    [
      "/individuals/business/self-employment/AA123456A/XAIS12345678901/period/2025-26/2025-04-06_2025-07-05",
      "/individuals/business/self-employment/{nino}/{businessId}/period/2025-26/2025-04-06_2025-07-05",
    ],
    ["/individuals/person/itsa-status/AA123456A/2025-26", "/individuals/person/itsa-status/{nino}/2025-26"],
    ["/obligations/details/AA123456A/income-and-expenditure", "/obligations/details/{nino}/income-and-expenditure"],
    ["/test/fraud-prevention-headers/vat-mtd/validation-feedback", "/test/fraud-prevention-headers/vat-mtd/validation-feedback"],
    [
      "/individuals/business/self-employment/AA123456A/XAIS12345678901/period/2025-26/4557ecb5-fd32-48cc-81f5-e6acd1099f3c",
      "/individuals/business/self-employment/{nino}/{businessId}/period/2025-26/{submissionId}",
    ],
    [
      "/individuals/business/self-employment/AA123456A/XAIS12345678901/period/2023-04-06_2023-07-05",
      "/individuals/business/self-employment/{nino}/{businessId}/period/2023-04-06_2023-07-05",
    ],
    [
      "/individuals/business/self-employment/AA123456A/XAIS12345678901/annual/2025-26",
      "/individuals/business/self-employment/{nino}/{businessId}/annual/2025-26",
    ],
    [
      "/individuals/business/property/uk/AA123456A/XAIS12345678901/period/2025-26/4557ecb5-fd32-48cc-81f5-e6acd1099f3c",
      "/individuals/business/property/uk/{nino}/{businessId}/period/2025-26/{submissionId}",
    ],
    [
      "/individuals/business/property/uk/AA123456A/XAIS12345678901/cumulative/2025-26",
      "/individuals/business/property/uk/{nino}/{businessId}/cumulative/2025-26",
    ],
    [
      "/individuals/business/property/foreign/AA123456A/details/P1234567890ABCD/2025-26",
      "/individuals/business/property/foreign/{nino}/details/{propertyId}/2025-26",
    ],
    [
      "/individuals/business/property/foreign/AA123456A/details/8e8b8450-dc1b-4360-8109-7067337b42cb/2025-26",
      "/individuals/business/property/foreign/{nino}/details/{propertyId}/2025-26",
    ],
    [
      "/individuals/calculations/AA123456A/self-assessment/2025-26/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/final-declaration",
      "/individuals/calculations/{nino}/self-assessment/2025-26/{calculationId}/final-declaration",
    ],
    [
      "/individuals/self-assessment/adjustable-summary/AA123456A/uk-property/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c/adjust/2025-26",
      "/individuals/self-assessment/adjustable-summary/{nino}/uk-property/{calculationId}/adjust/2025-26",
    ],
    ["/individuals/self-assessment/adjustable-summary/AA123456A/trigger", "/individuals/self-assessment/adjustable-summary/{nino}/trigger"],
    [
      "/individuals/self-assessment/assist/reports/AA123456A/2025-26/f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c",
      "/individuals/self-assessment/assist/reports/{nino}/2025-26/{calculationId}",
    ],
    [
      "/individuals/losses/AA123456A/businesses/XAIS12345678901/loss-claims/2025-26",
      "/individuals/losses/{nino}/businesses/{businessId}/loss-claims/2025-26",
    ],
  ])("names the ids of the HMRC path %s", (path, named) => {
    expect(loggedUrlOf(`https://test-api.service.hmrc.gov.uk${path}`)).toBe(`https://test-api.service.hmrc.gov.uk${named}`);
  });

  test("the public data API's request and response lines hold no company number, transaction or query value", async () => {
    await companiesHouseGetJson("https://api.example", `/company/${COMPANY}/filing-history/${TRANSACTION}`, { category: "accounts" });

    expect(sent).toEqual([`https://api.example/company/${COMPANY}/filing-history/${TRANSACTION}?category=accounts`]);
    expect(logged()).toContain("/company/{companyNumber}/filing-history/{transactionId}?category={category}");
    for (const value of [COMPANY, TRANSACTION, "category=accounts"]) expect(logged()).not.toContain(value);
  });

  test("a search's query value stays out of the lines", async () => {
    await companiesHouseGetJson("https://api.example", "/search/companies", { q: "Jane Smith Plumbing" });

    expect(logged()).toContain("/search/companies?q={q}");
    expect(logged()).not.toContain("Jane");
  });

  test("the filing API's request and response lines hold no company number or transaction", async () => {
    await companiesHouseFilingRequest("GET", `/registered-email-address/company/${COMPANY}/eligibility`, { accessToken: "token" });
    await companiesHouseFilingRequest("POST", `/transactions/${TRANSACTION}/registered-office-address`, { accessToken: "token", body: {} });

    expect(logged()).toContain("/registered-email-address/company/{companyNumber}/eligibility");
    expect(logged()).toContain("/transactions/{transactionId}/registered-office-address");
    for (const value of [COMPANY, TRANSACTION]) expect(logged()).not.toContain(value);
  });

  test("the cache's line for an answer it does not keep names the company number", async () => {
    const { loggedOutboundPathOf: pathOf } = await import("@app/lib/loggedPath.js");
    expect(pathOf(`/company/${COMPANY}/persons-with-significant-control`)).toBe(
      "/company/{companyNumber}/persons-with-significant-control",
    );
  });

  test("the Document API's request and response lines hold no document id", async () => {
    await companiesHouseDocumentContent(DOCUMENT, "application/xhtml+xml", { maxBytes: 1000 });

    expect(logged()).toContain("/document/{documentId}/content");
    expect(logged()).not.toContain(DOCUMENT);
  });
});
