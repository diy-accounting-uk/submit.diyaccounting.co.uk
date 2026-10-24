// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcCtReturnRequest.test.js
import { describe, test, beforeAll, expect } from "vitest";
import { buildCtReturnBodyFromBook, buildMicroCtReturnBodyFromBook } from "@app/test-helpers/ctReturnFixture.js";
import { extractAndValidateCtReturnParameters, buildCtReturnDocuments, boxesThatDiffer } from "@app/services/hmrcCtReturnRequest.js";
import { parseXmlDocument, firstElementText } from "@app/lib/xmlDom.js";

let baseBody;

function withReviewedBoxes(body) {
  const request = extractAndValidateCtReturnParameters({ body: JSON.stringify(body) }, [], {
    requireGatewayCredentials: false,
    requireReviewedBoxes: false,
  });
  return { ...body, reviewedBoxes: buildCtReturnDocuments(request).boxes };
}

function extract(overrides = {}, options) {
  const errors = [];
  const request = extractAndValidateCtReturnParameters(
    { body: JSON.stringify({ ...baseBody, gatewayUserId: "user", gatewayPassword: "pass", ...overrides }) },
    errors,
    options,
  );
  return { request, errors };
}

describe("extractAndValidateCtReturnParameters", () => {
  beforeAll(async () => {
    baseBody = await withReviewedBoxes(await buildCtReturnBodyFromBook());
  });

  test("accepts a request built from a book export", () => {
    const { request, errors } = extract();
    expect(errors).toEqual([]);
    expect(request.utr).toBe(baseBody.utr);
    expect(request.gatewayUserId).toBe("user");
    expect(request.figures.periodEnd).toBe(baseBody.periodEnd);
    expect(request.figures.utr).toBe(baseBody.utr);
  });

  test("takes no Government Gateway credentials for a preview", () => {
    const { request, errors } = extract({ gatewayUserId: undefined, gatewayPassword: undefined }, { requireGatewayCredentials: false });
    expect(errors).toEqual([]);
    expect(request.gatewayPassword).toBeUndefined();
  });

  test("requires reviewedBoxes on the submit and accepts their absence on the preview", () => {
    expect(extract({ reviewedBoxes: undefined }).errors.join("\n")).toMatch(/reviewedBoxes/);
    expect(extract({ reviewedBoxes: undefined }, { requireReviewedBoxes: false }).errors).toEqual([]);
    expect(extract({ reviewedBoxes: [1] }).errors.join("\n")).toMatch(/reviewedBoxes/);
    expect(extract({ reviewedBoxes: { abc: 1 } }).errors.join("\n")).toMatch(/box abc/);
  });

  test("lists the boxes that differ, in ascending order", () => {
    expect(boxesThatDiffer({ 10: 1, 5: "a", 7: 3 }, { 10: 2, 5: "a", 8: 1 })).toEqual(["7", "8", "10"]);
    expect(boxesThatDiffer({ 1: 1 }, { 1: 1 })).toEqual([]);
  });

  test("reports figures that are missing", () => {
    expect(extract({ figures: undefined }).errors).toContain("Missing figures - the CT600 figures from the book export or the form");
  });

  test.each([
    ["a bank interest figure that is not whole pounds", { nonTradingLoanRelationshipCredits: 1.5 }, /bank interest/],
    ["a negative depreciation", { depreciation: -1 }, /Depreciation/],
    ["a company type other than 0", { companyType: 6 }, /Company type 6/],
    ["a period over 12 months", { periodStart: "2025-04-01", periodEnd: "2026-04-30" }, /longer than 12 months/],
    ["a working sheet without numbers", { workingSheet: { tradingProfit: "1" } }, /workingSheet/],
  ])("reports %s", (_label, changes, message) => {
    const { errors } = extract({ figures: { ...baseBody.figures, ...changes } });
    expect(errors.join("\n")).toMatch(message);
  });

  test("refuses a filleted accounts copy", () => {
    const smallCompany = { ...baseBody.smallCompany, filleted: true };
    expect(extract({ smallCompany }).errors).toContain("smallCompany.filleted must be false: HMRC takes the full accounts");
  });

  test("refuses a password over 128 characters", () => {
    expect(extract({ gatewayPassword: "x".repeat(129) }).errors).toContain("Invalid gatewayPassword");
  });
});

describe("buildCtReturnDocuments", () => {
  beforeAll(async () => {
    baseBody = await withReviewedBoxes(await buildCtReturnBodyFromBook());
  });

  test("builds a return whose three documents name the same company, UTR and period", () => {
    const { request } = extract();
    const documents = buildCtReturnDocuments(request);
    const returnDocument = parseXmlDocument(documents.irEnvelopeXml);
    expect(firstElementText(returnDocument, "Reference")).toBe(baseBody.utr);
    expect(firstElementText(returnDocument, "RegistrationNumber")).toBe(baseBody.companyNumber);
    expect(documents.computationsIxbrl).toContain(baseBody.utr);
    expect(documents.computationsIxbrl).toContain(baseBody.figures.periodEnd);
    expect(documents.accountsIxbrl).toContain(baseBody.companyNumber);
    expect(documents.irEnvelopeXml).toContain(Buffer.from(documents.accountsIxbrl, "utf8").toString("base64"));
    expect(documents.irEnvelopeXml).toContain(Buffer.from(documents.computationsIxbrl, "utf8").toString("base64"));
  });

  test("works every box and computation line on the server from the figures", () => {
    const { request } = extract();
    const documents = buildCtReturnDocuments(request);
    expect(documents.boxes[155]).toBe(documents.computationLines.adjustedProfit);
    expect(documents.boxes[3]).toBe(baseBody.utr);
    expect(documents.boxes[4]).toBe(0);
    expect(documents.worked[705].rule).toMatch(/annual investment allowance/);
  });

  test("refuses Income Tax deducted beyond the Corporation Tax charged", () => {
    const { request } = extract({ figures: { ...baseBody.figures, incomeTaxDeducted: 40000 } });
    expect(() => buildCtReturnDocuments(request)).toThrow(/Income Tax deducted .* is more than the Corporation Tax charged/);
  });

  test("shows the prior year's profit and loss in the accounts when the request carries it", () => {
    const prior = { ...baseBody.smallCompany.profitAndLoss.currentYear };
    const withPrior = extract({
      smallCompany: { ...baseBody.smallCompany, profitAndLoss: { currentYear: prior, priorYear: prior } },
    });
    expect(withPrior.errors).toEqual([]);
    const turnover = prior.turnover.toLocaleString("en-GB");
    const occurrences = (document) => document.split(turnover).length - 1;
    const withoutPrior = buildCtReturnDocuments(extract().request).accountsIxbrl;
    expect(occurrences(buildCtReturnDocuments(withPrior.request).accountsIxbrl)).toBe(occurrences(withoutPrior) + 1);
    expect(withPrior.request.accounts.profitAndLoss.prior).toEqual(prior);
    expect(extract().request.accounts.profitAndLoss.prior).toBeUndefined();
  });
});

describe("a micro-entity's Company Tax Return", () => {
  let microBody;

  beforeAll(async () => {
    microBody = await buildMicroCtReturnBodyFromBook();
  });

  function extractMicro(overrides = {}) {
    const errors = [];
    const request = extractAndValidateCtReturnParameters(
      { body: JSON.stringify({ ...microBody, gatewayUserId: "user", gatewayPassword: "pass", reviewedBoxes: {}, ...overrides }) },
      errors,
      { requireReviewedBoxes: false },
    );
    return { request, errors };
  }

  test("accepts a micro-entity request and carries its profit and loss account", () => {
    const { request, errors } = extractMicro();
    expect(errors).toEqual([]);
    expect(request.accounts.regime).toBe("micro-entity");
    expect(request.figures.profitAndLoss.current.turnover).toBe(microBody.profitAndLoss.currentYear.turnover);
  });

  test("attaches the FRS 105 document with the profit and loss account and the same boxes as the small company's", () => {
    const { request } = extractMicro();
    const documents = buildCtReturnDocuments(request);
    expect(documents.accountsIxbrl).toContain("bus:Micro-entities");
    expect(documents.accountsIxbrl).toContain("core:RawMaterialsConsumablesUsed");
    expect(documents.accountsIxbrl).toContain("bus:FullAccounts");
    const small = buildCtReturnDocuments(extract().request);
    expect(documents.boxes).toEqual(small.boxes);
    expect(documents.irEnvelopeXml).toContain("EncodedInlineXBRLDocument");
  });

  test("needs the profit and loss account, and refuses lines that do not add up or a dormant company", () => {
    expect(extractMicro({ profitAndLoss: undefined }).errors.join("\n")).toMatch(/Missing profitAndLoss.currentYear/);
    const broken = { currentYear: { ...microBody.profitAndLoss.currentYear, profit: 1 } };
    expect(extractMicro({ profitAndLoss: broken }).errors.join("\n")).toMatch(/profit must equal profitBeforeTax less tax/);
    expect(extractMicro({ dormant: true }).errors.join("\n")).toMatch(/dormant/);
  });
});
