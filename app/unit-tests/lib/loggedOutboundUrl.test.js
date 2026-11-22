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
