// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/filing-history.test.js

import { describe, test, expect } from "vitest";
import { getFilingHistory, getFiling, getDocumentMetadata, getDocumentContent } from "@app/http-simulator/scenarios/filing-history.js";
import { documentIdFromMetadataLink } from "@app/services/companiesHouseDocumentApi.js";
import { registerDates, REGISTER_COMPANY_NUMBERS } from "@app/http-simulator/fixtures/register.js";
import { getCompany } from "@app/http-simulator/scenarios/companies.js";

const DATES = registerDates();
const FILED = `SIMTX00000001AA${DATES.filed.end.slice(0, 4)}`;
const EARLIER = `SIMTX00000001AA${DATES.earlier.end.slice(0, 4)}`;

describe("simulator filing history", () => {
  test("00000001 holds a software-filed set, a confirmation statement and a paper-filed set, newest first", () => {
    const history = getFilingHistory("00000001");
    expect(history.total_count).toBe(3);
    expect(history.items.map((item) => item.type)).toEqual(["AA", "CS01", "AA"]);
    expect(history.items[2].paper_filed).toBe(true);
  });

  test("narrows to a category and pages by start index and page size", () => {
    expect(getFilingHistory("00000001", { category: "accounts" }).items.map((item) => item.transaction_id)).toEqual([FILED, EARLIER]);
    const page = getFilingHistory("00000001", { itemsPerPage: 1, startIndex: 1 });
    expect(page.total_count).toBe(3);
    expect(page.items.map((item) => item.type)).toEqual(["CS01"]);
  });

  test("00000007 holds more filings than five pages of 100, newest first, and no accounts", () => {
    const history = getFilingHistory("00000007", { itemsPerPage: 100, startIndex: 500 });
    expect(history.total_count).toBe(621);
    expect(history.items).toHaveLength(100);
    expect(getFilingHistory("00000007").items[0].date).toBe(DATES.filed.end);
    expect(getFilingHistory("00000007", { category: "accounts" }).total_count).toBe(0);
  });

  test("00000003 holds the notice of an inspection location and of records moved to it, each with the address", () => {
    const notices = getFilingHistory("00000003", { category: "address" }).items;
    expect(notices.map((item) => item.type)).toEqual(["AD03", "AD02"]);
    expect(notices.map((item) => item.description)).toEqual([
      "move-registers-to-sail-company-with-new-address",
      "change-sail-address-company-with-new-address",
    ]);
    for (const item of notices) expect(item.description_values.new_address).toBe("Unit 4, Harbour House 12 Quay Street Bristol BS1 4DJ");
  });

  test("00000003 holds one set of accounts, filed on paper as a PDF only", () => {
    const [set] = getFilingHistory("00000003", { category: "accounts" }).items;
    expect(set).toEqual(expect.objectContaining({ type: "AA", paper_filed: true, description_values: { made_up_date: DATES.filed.end } }));
    const documentId = set.links.document_metadata.split("/document/")[1];
    expect(Object.keys(getDocumentMetadata(documentId, "http://localhost").resources)).toEqual(["application/pdf"]);
  });

  test("SC000001 holds one set of small company accounts filed by software, held as iXBRL", () => {
    const [set] = getFilingHistory("SC000001", { category: "accounts" }).items;
    expect(set).toEqual(
      expect.objectContaining({
        type: "AA",
        description: "accounts-with-accounts-type-total-exemption-full",
        description_values: { made_up_date: DATES.filed.end },
      }),
    );
    expect(set.paper_filed).toBeUndefined();
    const documentId = set.links.document_metadata.split("/document/")[1];
    const { content } = getDocumentContent(documentId, "application/xhtml+xml");
    expect(content).toContain("GLENMORE ENGINEERING LIMITED");
    expect(content).toContain("Profit and loss account");
  });

  test("00000004 holds the micro-entity accounts the register gives it, as a PDF with no iXBRL document", () => {
    const [set, incorporation] = getFilingHistory("00000004").items;
    expect(set).toEqual(
      expect.objectContaining({
        category: "accounts",
        type: "AA",
        description: "accounts-with-accounts-type-micro-entity",
        description_values: { made_up_date: DATES.filed.end },
      }),
    );
    expect(set.paper_filed).toBeUndefined();
    expect(incorporation.type).toBe("NEWINC");
    const documentId = set.links.document_metadata.split("/document/")[1];
    expect(getDocumentContent(documentId, "application/pdf").content).toContain("%PDF");
    expect(getDocumentContent(documentId, "application/xhtml+xml")).toEqual({ notAcceptable: true });
  });

  test("another known company holds its incorporation, and an unknown one has no history", () => {
    expect(getFilingHistory("00000010").items.map((item) => item.type)).toEqual(["NEWINC"]);
    expect(getFilingHistory("99999999")).toBeNull();
    expect(getFilingHistory("42942942")).toBeNull();
  });

  test("answers one filing by its transaction id", () => {
    expect(getFiling("00000001", FILED).description).toBe("accounts-with-accounts-type-micro-entity");
    expect(getFiling("00000001", "SIMTX-NONE")).toBeNull();
  });
});

describe("simulator Document API", () => {
  const softwareId = documentIdFromMetadataLink(getFiling("00000001", FILED).links.document_metadata);
  const paperId = documentIdFromMetadataLink(getFiling("00000001", EARLIER).links.document_metadata);

  test("the software-filed set is held as a PDF and as iXBRL, the paper set as a PDF only", () => {
    expect(Object.keys(getDocumentMetadata(softwareId, "http://simulator").resources).sort()).toEqual([
      "application/pdf",
      "application/xhtml+xml",
    ]);
    expect(Object.keys(getDocumentMetadata(paperId, "http://simulator").resources)).toEqual(["application/pdf"]);
  });

  test("serves the iXBRL the micro-entity accounts builder writes for the company", () => {
    const { content } = getDocumentContent(softwareId, "application/xhtml+xml");
    expect(content).toContain("HARBOUR LANE JOINERY LIMITED");
    expect(content).toContain("ix:nonNumeric");
    expect(getDocumentMetadata(softwareId, "http://simulator").resources["application/xhtml+xml"].content_length).toBe(
      Buffer.byteLength(content),
    );
  });

  test("answers not acceptable for a type the document is not held in, and null for an unknown document", () => {
    expect(getDocumentContent(paperId, "application/xhtml+xml")).toEqual({ notAcceptable: true });
    expect(getDocumentContent("SIMDOC-NONE", "application/pdf")).toBeNull();
    expect(getDocumentMetadata("SIMDOC-NONE", "http://simulator")).toBeNull();
  });

  test.each(REGISTER_COMPANY_NUMBERS)("%s's profile and filing history agree on its last accounts", (companyNumber) => {
    const last = getCompany(companyNumber).accounts.last_accounts;
    const sets = getFilingHistory(companyNumber, { category: "accounts" }).items;
    if (!last) {
      expect(sets).toEqual([]);
      return;
    }
    expect(sets[0].description_values.made_up_date).toBe(last.made_up_to);
    const documentId = sets[0].links.document_metadata.split("/document/")[1];
    expect(getDocumentMetadata(documentId, "https://document-api.company-information.service.gov.uk")).not.toBeNull();
  });
});
