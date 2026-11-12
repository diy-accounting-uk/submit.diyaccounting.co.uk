// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcCtReturnRequest.test.js
import { describe, test, beforeAll, expect } from "vitest";
import {
  buildCtReturnBodyFromBook,
  buildLongPeriodRequestBody,
  buildMicroCtReturnBodyFromBook,
} from "@app/test-helpers/ctReturnFixture.js";
import {
  extractAndValidateCtReturnParameters,
  buildCtReturnDocuments,
  buildLongPeriodReturnDocuments,
  boxesThatDiffer,
} from "@app/services/hmrcCtReturnRequest.js";
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

  describe("a client request", () => {
    const client = { clientId: "client-1", identifiers: { utr: "1234567890", companyNumber: "00000099" } };
    const agent = { practiceName: "Example Practice LLP", authorisationConfirmed: true };

    test("takes the UTR and company number from the client row and builds the agent", () => {
      const { request, errors } = extract({ utr: "9999999999", companyNumber: "11111111", agent }, { client });
      expect(errors).toEqual([]);
      expect(request.utr).toBe("1234567890");
      expect(request.accounts.companyNumber).toBe("00000099");
      expect(request.agent).toEqual({ reference: "client-1", practiceName: "Example Practice LLP" });
    });

    test("is refused unless the practice confirms the authorisation", () => {
      const { errors } = extract({ agent: { ...agent, authorisationConfirmed: undefined } }, { client });
      expect(errors.join(" ")).toContain("authorised it for Corporation Tax");
    });

    test("is refused without a practice name", () => {
      const { errors } = extract({ agent: { ...agent, practiceName: " " } }, { client });
      expect(errors.join(" ")).toContain("agent.practiceName");
    });

    test("is refused for a client with no UTR", () => {
      const { errors } = extract({ agent }, { client: { ...client, identifiers: { companyNumber: "00000099", utr: null } } });
      expect(errors.join(" ")).toContain("no valid UTR");
    });

    test("builds a return with Sender Agent and the Agent block", () => {
      const { request } = extract({ agent }, { client });
      const { irEnvelopeXml } = buildCtReturnDocuments(request);
      expect(irEnvelopeXml).toContain("<Sender>Agent</Sender>");
      expect(irEnvelopeXml).toContain("<AgentID>client-1</AgentID>");
    });
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

describe("a period of account longer than 12 months", () => {
  const FILING_ID = "0b8f3a52-6f1e-4c8e-9a47-5d2f7c1e4b10";

  function extractLong(part, change = () => {}, options = {}) {
    const body = { ...buildLongPeriodRequestBody(part), gatewayUserId: "user", gatewayPassword: "pass" };
    change(body);
    const errors = [];
    const request = extractAndValidateCtReturnParameters({ body: JSON.stringify(body) }, errors, {
      requireReviewedBoxes: false,
      ...options,
    });
    return { request, errors };
  }

  test("reads the long period and the figures of both accounting periods", () => {
    const { request, errors } = extractLong(2);
    expect(errors).toEqual([]);
    expect(request.longPeriod).toEqual({ filingId: FILING_ID, part: 2 });
    expect(request.figures.periodStart).toBe("2025-01-01");
    expect(request.figures.periodEnd).toBe("2026-03-31");
    expect(request.figures.accountingPeriods).toHaveLength(2);
  });

  test("builds both returns, with the same accounts in each, and answers the part the request names", () => {
    const { request } = extractLong(2);
    const [first, second] = buildLongPeriodReturnDocuments(request);
    expect([first.part, first.periodStart, first.periodEnd]).toEqual([1, "2025-01-01", "2025-12-31"]);
    expect([second.part, second.periodStart, second.periodEnd]).toEqual([2, "2026-01-01", "2026-03-31"]);
    expect(first.accountsIxbrl).toBe(second.accountsIxbrl);
    expect([first.boxes[440], second.boxes[440]]).toEqual([19273.46, 5688.68]);
    expect(buildCtReturnDocuments(request).boxes).toEqual(second.boxes);
    expect(buildCtReturnDocuments(extractLong(1).request).boxes).toEqual(first.boxes);
  });

  test("works out the tax due date of each return and one return due date for both", () => {
    const [first, second] = buildLongPeriodReturnDocuments(extractLong(1).request);
    expect([first.taxDueDate, second.taxDueDate]).toEqual(["2026-10-01", "2027-01-01"]);
    expect([first.returnDueDate, second.returnDueDate]).toEqual(["2027-03-31", "2027-03-31"]);
  });

  test("a part carries boxes 50 and 85A and its own period in boxes 30 and 35", () => {
    const [first, second] = buildLongPeriodReturnDocuments(extractLong(1).request);
    expect([first.boxes[50], first.boxes["85A"], first.boxes[30], first.boxes[35]]).toEqual(["yes", "yes", "2025-01-01", "2025-12-31"]);
    expect([second.boxes[30], second.boxes[35]]).toEqual(["2026-01-01", "2026-03-31"]);
  });

  test("the submit names the filing and part; the preview does not need them", () => {
    const missing = extractLong(1, (body) => delete body.longPeriod);
    expect(missing.errors.join(" ")).toContain("Missing longPeriod");
    expect(extractLong(1, (body) => delete body.longPeriod, { requireLongPeriod: false }).errors).toEqual([]);
  });

  test("an invalid longPeriod is reported once", () => {
    const { errors } = extractLong(1, (body) => {
      body.longPeriod = { filingId: FILING_ID, part: 3 };
    });
    expect(errors).toEqual(["Invalid longPeriod.part - must be 1 or 2"]);
  });

  test("refuses a long period with no accounting periods", () => {
    const { errors } = extractLong(1, (body) => delete body.figures.accountingPeriods);
    expect(errors.join(" ")).toContain("Missing figures.accountingPeriods");
  });

  test("refuses a period of account of 12 months or less", () => {
    const { errors } = extractLong(1, (body) => {
      body.periodEnd = "2025-12-31";
      body.figures.periodEnd = "2025-12-31";
    });
    expect(errors.join(" ")).toContain("for a period of account longer than 12 months");
  });

  test("refuses a period over 18 months", () => {
    const { errors } = extractLong(1, (body) => {
      body.periodEnd = "2026-07-01";
      body.figures.periodEnd = "2026-07-01";
    });
    expect(errors.join(" ")).toContain("A period of account can be 18 months at most (Companies Act 2006 s392).");
  });

  test("refuses a first accounting period that starts after the first day of the accounts", () => {
    const { errors } = extractLong(1, (body) => {
      body.figures.periodStart = "2025-02-01";
    });
    expect(errors).toContain("Submit files a long period when the first accounting period starts on the first day of the accounts.");
  });

  test("refuses a return over 12 months sent without accounting periods or a long period", () => {
    const { errors } = extractLong(1, (body) => {
      delete body.longPeriod;
      delete body.figures.accountingPeriods;
    });
    expect(errors.join(" ")).toContain("a long period of account files two returns");
  });

  test("builds nothing for an accounting period figure typed for the whole period", () => {
    const { request } = extractLong(1, (body) => {
      body.figures.mainPoolAllowances = 100;
    });
    expect(() => buildLongPeriodReturnDocuments(request)).toThrow(/typed for each accounting period/);
  });

  test("a return of 12 months or less builds as before and shows no time apportionment", () => {
    const small = buildCtReturnDocuments(extract().request);
    expect(small.computationsIxbrl).not.toContain("Time apportionment");
    expect(extract().request.longPeriod).toBeUndefined();
  });

  test("a box number with a letter is a reviewed box", () => {
    const { errors } = extractLong(
      1,
      (body) => {
        body.reviewedBoxes = { "50": "yes", "85A": "yes" };
      },
      { requireReviewedBoxes: true },
    );
    expect(errors).toEqual([]);
  });
});
