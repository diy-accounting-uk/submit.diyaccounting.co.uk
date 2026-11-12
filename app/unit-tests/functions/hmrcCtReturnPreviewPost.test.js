// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcCtReturnPreviewPost.test.js
import { describe, test, beforeAll, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import {
  buildCtReturnBodyFromBook,
  buildLongPeriodRequestBody,
  LOANS_FIXTURE_ANSWERS,
  LOANS_FIXTURE_BOOK_DIRECTORY,
} from "@app/test-helpers/ctReturnFixture.js";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    QueryCommand,
    PutCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    GetCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    UpdateCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

const mockEventBridgeSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockPostToTransactionEngine = vi.fn();
vi.mock("@app/services/hmrcTransactionEngine.js", async (importOriginal) => ({
  ...(await importOriginal()),
  postToTransactionEngine: (...args) => mockPostToTransactionEngine(...args),
}));

import { ingestHandler as hmrcCtReturnPreviewPostHandler } from "@app/functions/hmrc/hmrcCtReturnPreviewPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let baseBody;

function buildEvent({ body = baseBody, headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/hmrc/ct/return/preview",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("hmrcCtReturnPreviewPost ingestHandler", () => {
  beforeAll(async () => {
    baseBody = await buildCtReturnBodyFromBook();
  });

  beforeEach(() => {
    Object.assign(process.env, setupTestEnv({ ENVIRONMENT_NAME: "test" }));
    vi.clearAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active" }], Count: 1 };
      }
      return {};
    });
  });

  test("returns the CT600, the computations and the accounts without calling HMRC or needing credentials", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.ct600Xml).toContain("<IRenvelope");
    expect(body.ct600Xml).toContain(`<Key Type="UTR">${baseBody.utr}</Key>`);
    expect(body.ct600Xml).toContain('<IRmark Type="generic"></IRmark>');
    expect(body.computationsIxbrl).toContain("ct-comp:AdjustedProfitForThePeriod");
    expect(body.accountsIxbrl).toContain("ix:header");
    expect(body.boxes["3"]).toBe(baseBody.utr);
    expect(body.boxes["975"]).toBe(baseBody.declarant.name);
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
  });

  describe("a period of account longer than 12 months", () => {
    test("returns both returns, each with its boxes, computations and due dates, and the accounts once", async () => {
      const { longPeriod: _longPeriod, ...body } = buildLongPeriodRequestBody(1);
      const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(200);
      const data = parseResponseBody(response);
      expect(data.periodOfAccount).toEqual({ periodStart: "2025-01-01", periodEnd: "2026-03-31" });
      expect(data.accountsIxbrl).toContain("ix:header");
      expect(data).not.toHaveProperty("boxes");
      expect(data.returns.map((part) => [part.part, part.periodStart, part.periodEnd])).toEqual([
        [1, "2025-01-01", "2025-12-31"],
        [2, "2026-01-01", "2026-03-31"],
      ]);
      expect(data.returns.map((part) => part.taxDueDate)).toEqual(["2026-10-01", "2027-01-01"]);
      expect(data.returns.map((part) => part.returnDueDate)).toEqual(["2027-03-31", "2027-03-31"]);
      expect(data.returns.map((part) => part.boxes[440])).toEqual([19273.46, 5688.68]);
      expect(data.returns[1].boxes[480]).toBe(5062.5);
      expect(data.returns[0].ct600Xml).toContain("<To>2025-12-31</To>");
      expect(data.returns[1].ct600Xml).toContain("<From>2026-01-01</From>");
      expect(data.returns[0].computationsIxbrl).toContain("ct-comp:AdjustedProfitForThePeriod");
      expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
    });

    test("answers the same two returns when the request names a part", async () => {
      const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ body: buildLongPeriodRequestBody(2) }));
      expect(parseResponseBody(response).returns).toHaveLength(2);
    });

    test("answers 400 when the first accounting period does not start on the first day of the accounts", async () => {
      const body = buildLongPeriodRequestBody(1);
      body.figures.periodStart = "2025-02-01";
      const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain(
        "Submit files a long period when the first accounting period starts on the first day of the accounts.",
      );
    });

    test("answers 400 for a period over 18 months", async () => {
      const body = buildLongPeriodRequestBody(1);
      body.figures.periodEnd = "2026-07-01";
      body.periodEnd = "2026-07-01";
      const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("18 months at most");
    });

    test("answers 400 for a return longer than 12 months that carries no accounting periods", async () => {
      const body = buildLongPeriodRequestBody(1);
      delete body.longPeriod;
      delete body.figures.accountingPeriods;
      const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("a long period of account files two returns");
    });

    test("answers 400 when the annual investment allowance of a part is over its maximum", async () => {
      const body = buildLongPeriodRequestBody(1);
      body.figures.accountingPeriods[1].annualInvestmentAllowance = 300000;
      const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ body }));
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("annual investment allowance");
    });
  });

  test("takes the typed company facts over the book export's", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(
      buildEvent({ body: { ...baseBody, utr: "1234567890", declarant: { name: "Pat Typed", status: "Secretary" } } }),
    );
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.boxes["3"]).toBe("1234567890");
    expect(body.ct600Xml).toContain("<Name>Pat Typed</Name>");
    expect(body.ct600Xml).toContain("<Status>Secretary</Status>");
    expect(body.computationsIxbrl).toContain("1234567890");
  });

  test.each([
    ["an unaccepted declaration", { declarationAccepted: false }, /accept the declaration/],
    ["a UTR that is not 10 digits", { utr: "123" }, /utr/],
    ["a missing trade name", { tradeName: "" }, /tradeName/],
    ["a missing declarant", { declarant: { name: "", status: "" } }, /declarant/],
    ["no figures", { figures: undefined }, /Missing figures/],
    ["accounts of neither regime", { smallCompany: undefined }, /Missing profitAndLoss.currentYear/],
  ])("answers 400 for %s", async (_label, overrides, message) => {
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ body: { ...baseBody, ...overrides } }));
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).toMatch(message);
  });

  test("answers 400 when the accounts period does not overlap the return period", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(
      buildEvent({ body: { ...baseBody, figures: { ...baseBody.figures, periodStart: "2001-01-01", periodEnd: "2001-12-31" } } }),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).toMatch(/does not overlap/);
  });

  test("answers 400 when Income Tax deducted exceeds the Corporation Tax charged", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(
      buildEvent({ body: { ...baseBody, figures: { ...baseBody.figures, incomeTaxDeducted: 40000 } } }),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).toMatch(/Income Tax deducted/);
  });

  test("answers 400 when the book's director's loan account is more overdrawn at the end than at the start and no loans are given", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(
      buildEvent({
        body: { ...baseBody, figures: { ...baseBody.figures, directorsLoanOverdrawn: 10000, directorsLoanOpeningOverdrawn: 0 } },
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).toMatch(/so the company lent in the period/);
  });

  test("returns supplementary page CT600A, box 480 and the page in the return for a book whose director's loan account is overdrawn", async () => {
    const body = await buildCtReturnBodyFromBook({
      bookDirectory: LOANS_FIXTURE_BOOK_DIRECTORY,
      loansToParticipators: LOANS_FIXTURE_ANSWERS,
    });
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ body }));
    expect(response.statusCode).toBe(200);
    const preview = parseResponseBody(response);
    expect(preview.boxes["95"]).toBe("yes");
    expect(preview.boxes["480"]).toBe(3375);
    expect(preview.ct600a).toMatchObject({ totalLoans: 12000, taxChargeable: 4050, taxPayable: 3375 });
    expect(preview.ct600Xml).toContain("<LoansByCloseCompanies>");
    expect(preview.ct600Xml).toContain("<LoansToParticipators>3375.00</LoansToParticipators>");
    expect(Buffer.from(preview.accountsIxbrl, "utf8").toString()).toContain("Advances and credits to directors");
  });

  test("returns the losses and the carry-back repayment with the boxes", async () => {
    const body = parseResponseBody(await hmrcCtReturnPreviewPostHandler(buildEvent()));
    expect(body.losses).toMatchObject({ arising: 0, totalCarriedForward: 0 });
    expect(body.carryBack).toBeUndefined();
  });

  test("returns the computation lines and the worked boxes with the boxes", async () => {
    const body = parseResponseBody(await hmrcCtReturnPreviewPostHandler(buildEvent()));
    expect(body.computationLines.adjustedProfit).toBe(body.boxes["155"]);
    expect(body.worked["705"].sources).toContain("annualInvestmentAllowance");
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent());
    expect(response.statusCode).toBe(403);
  });

  describe("a client filing by a practice", () => {
    const CLIENT_TABLE = "test-practice-clients-table";
    const CLIENT_ROW = { clientId: "client-1", identifiers: { utr: "1234567890", companyNumber: "00000099" }, archivedAt: null };
    const AGENT = { practiceName: "Example Practice LLP", authorisationConfirmed: true };

    beforeEach(() => {
      process.env.PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME = CLIENT_TABLE;
      mockSend.mockImplementation(async (cmd) => {
        const lib = await import("@aws-sdk/lib-dynamodb");
        if (cmd instanceof lib.QueryCommand) return { Items: [{ bundleId: "resident-tax-agent", subscriptionStatus: "active" }], Count: 1 };
        if (cmd instanceof lib.GetCommand && cmd.input?.TableName === CLIENT_TABLE) return { Item: CLIENT_ROW };
        return {};
      });
    });

    test("writes the Agent block and takes the UTR from the client row", async () => {
      const response = await hmrcCtReturnPreviewPostHandler(
        buildEvent({ body: { ...baseBody, utr: "9999999999", clientId: "client-1", agent: AGENT } }),
      );
      expect(response.statusCode).toBe(200);
      const body = parseResponseBody(response);
      expect(body.ct600Xml).toContain("<Sender>Agent</Sender>");
      expect(body.ct600Xml).toContain("<Agent><AgentID>client-1</AgentID><Company>Example Practice LLP</Company></Agent>");
      expect(body.ct600Xml).toContain('<Key Type="UTR">1234567890</Key>');
      expect(body.boxes["3"]).toBe("1234567890");
    });

    test("needs the practice to confirm the company's authorisation", async () => {
      const response = await hmrcCtReturnPreviewPostHandler(
        buildEvent({ body: { ...baseBody, clientId: "client-1", agent: { ...AGENT, authorisationConfirmed: false } } }),
      );
      expect(response.statusCode).toBe(400);
    });

    test("answers 403 CLIENT_SCOPE_ENVIRONMENT_RESTRICTED where the practice activity is not listed", async () => {
      process.env.ENVIRONMENT_NAME = "prod";
      const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ body: { ...baseBody, clientId: "client-1", agent: AGENT } }));
      expect(response.statusCode).toBe(403);
      expect(parseResponseBody(response).code).toBe("CLIENT_SCOPE_ENVIRONMENT_RESTRICTED");
    });
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
