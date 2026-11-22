// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/scenarios/filing-history.test.js

import { describe, test, expect } from "vitest";
import { getFilingHistory, getFiling, getDocumentMetadata, getDocumentContent } from "@app/http-simulator/scenarios/filing-history.js";
import { documentIdFromMetadataLink } from "@app/services/companiesHouseDocumentApi.js";

describe("simulator filing history", () => {
  test("00000001 holds a software-filed set, a confirmation statement and a paper-filed set, newest first", () => {
    const history = getFilingHistory("00000001");
    expect(history.total_count).toBe(3);
    expect(history.items.map((item) => item.type)).toEqual(["AA", "CS01", "AA"]);
    expect(history.items[2].paper_filed).toBe(true);
  });

  test("narrows to a category and pages by start index and page size", () => {
    expect(getFilingHistory("00000001", { category: "accounts" }).items.map((item) => item.transaction_id)).toEqual([
      "SIMTX00000001AA2098",
      "SIMTX00000001AA2097",
    ]);
    const page = getFilingHistory("00000001", { itemsPerPage: 1, startIndex: 1 });
    expect(page.total_count).toBe(3);
    expect(page.items.map((item) => item.type)).toEqual(["CS01"]);
  });

  test("00000003 holds one set of accounts, filed on paper as a PDF only", () => {
    const [set] = getFilingHistory("00000003", { category: "accounts" }).items;
    expect(set).toEqual(expect.objectContaining({ type: "AA", paper_filed: true, description_values: { made_up_date: "2098-03-31" } }));
    const documentId = set.links.document_metadata.split("/document/")[1];
    expect(Object.keys(getDocumentMetadata(documentId, "http://localhost").resources)).toEqual(["application/pdf"]);
  });

  test("another known company holds its incorporation, and an unknown one has no history", () => {
    expect(getFilingHistory("06846849").items.map((item) => item.type)).toEqual(["NEWINC"]);
    expect(getFilingHistory("99999999")).toBeNull();
    expect(getFilingHistory("42942942")).toBeNull();
  });

  test("answers one filing by its transaction id", () => {
    expect(getFiling("00000001", "SIMTX00000001AA2098").description).toBe("accounts-with-accounts-type-micro-entity");
    expect(getFiling("00000001", "SIMTX-NONE")).toBeNull();
  });
});

describe("simulator Document API", () => {
  const softwareId = documentIdFromMetadataLink(getFiling("00000001", "SIMTX00000001AA2098").links.document_metadata);
  const paperId = documentIdFromMetadataLink(getFiling("00000001", "SIMTX00000001AA2097").links.document_metadata);

  test("the software-filed set is held as a PDF and as iXBRL, the paper set as a PDF only", () => {
    expect(Object.keys(getDocumentMetadata(softwareId, "http://simulator").resources).sort()).toEqual([
      "application/pdf",
      "application/xhtml+xml",
    ]);
    expect(Object.keys(getDocumentMetadata(paperId, "http://simulator").resources)).toEqual(["application/pdf"]);
  });

  test("serves the iXBRL the micro-entity accounts builder writes for the company", () => {
    const { content } = getDocumentContent(softwareId, "application/xhtml+xml");
    expect(content).toContain("SIMULATOR EXAMPLE COMPANY LIMITED");
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
});
