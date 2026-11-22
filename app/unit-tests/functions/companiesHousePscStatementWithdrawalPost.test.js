// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHousePscStatementWithdrawalPost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";

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

const mockBuildFormSubmission = vi.fn();
const mockAllocateSubmissionNumber = vi.fn();
const mockResolvePresenterCredentials = vi.fn();
const mockPostToGateway = vi.fn();
const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", async (importOriginal) => ({
  gatewayRequestNotDelivered: (await importOriginal()).gatewayRequestNotDelivered,
  buildFormSubmission: (...args) => mockBuildFormSubmission(...args),
  allocateSubmissionNumber: (...args) => mockAllocateSubmissionNumber(...args),
  postToGateway: (...args) => mockPostToGateway(...args),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
}));

import { ingestHandler } from "@app/functions/companies-house/companiesHousePscStatementWithdrawalPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PATH = "/api/v1/companies-house/psc-statement-withdrawal";

const COMPANY = {
  companyNumber: "06846849",
  companyName: "EXAMPLE PSC LIMITED",
  companyAuthCode: "SIMCS01",
  dateSigned: "2026-11-20",
};
const ELEANOR = { pscKind: "individual-person-with-significant-control", title: "MRS", forename: "ELEANOR", surname: "BRAMWELL" };

function buildEvent({ body, headers = {}, authorizer, method = "POST" }) {
  const options = { method, path: PATH, body, headers: { Authorization: "Bearer test-cognito-token", ...headers } };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

const writtenKinds = async () => {
  const lib = await import("@aws-sdk/lib-dynamodb");
  const writes = mockSend.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd instanceof lib.UpdateCommand || cmd instanceof lib.PutCommand);
  return JSON.stringify(writes.map((cmd) => cmd.input));
};

const withdrawal = (overrides = {}) => ({
  ...COMPANY,
  statement: "PSC_CONTACTED_BUT_NO_RESPONSE",
  withdrawalDate: "2026-11-05",
  ...overrides,
});

describe("companiesHousePscStatementWithdrawalPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        COMPANIES_HOUSE_PACKAGE_REFERENCE: "0012",
        ENVIRONMENT_NAME: "test",
      }),
    );
    vi.clearAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active" }], Count: 1 };
      }
      return {};
    });
    mockAllocateSubmissionNumber.mockResolvedValue("00001A");
    mockResolvePresenterCredentials.mockResolvedValue({ presenterId: "presenter-id", presenterCode: "presenter-code" });
    mockBuildFormSubmission.mockReturnValue("<GovTalkMessage>submission</GovTalkMessage>");
    mockPostToGateway.mockResolvedValue({ ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 });
    mockParseGatewayResponse.mockReturnValue({ errors: [], statuses: [], gatewayTimestamp: "2026-11-20T10:00:00Z", pollInterval: 1 });
  });

  test("a withdrawal is built as PSCStatementWithdrawal and sent in a PSCStatementWithdrawal envelope", async () => {
    const response = await ingestHandler(buildEvent({ body: withdrawal() }));

    expect(response.statusCode).toBe(201);
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      formIdentifier: "PSCStatementWithdrawal",
      companyNumber: "06846849",
      submissionNumber: "00001A",
    });
    expect(submissionArgs.formXml).toContain(
      "<PSCStatement>PSC_CONTACTED_BUT_NO_RESPONSE</PSCStatement><WithdrawalDate>2026-11-05</WithdrawalDate></PSCStatementWithdrawal>",
    );
    expect(await writtenKinds()).toContain('"kind":"psc-statement-withdrawal"');
  });

  test("a statement only withdrawable from before is taken", async () => {
    const response = await ingestHandler(buildEvent({ body: withdrawal({ statement: "STEPS_TO_FIND_PSC_NOT_YET_COMPLETED" }) }));
    expect(response.statusCode).toBe(201);
    expect(mockBuildFormSubmission.mock.calls[0][0].formXml).toContain(
      "<CompanyStatement>STEPS_TO_FIND_PSC_NOT_YET_COMPLETED</CompanyStatement>",
    );
  });

  test("a restrictions notice withdrawal sends why it was withdrawn", async () => {
    const response = await ingestHandler(
      buildEvent({
        body: withdrawal({
          statement: "RESTRICTIONS_NOTICE_ISSUED_TO_PSC",
          restrictionsWithdrawalReason: "RESTRICTIONS_NOTICE_WITHDRAWN_BY_COURT_ORDER",
        }),
      }),
    );
    expect(response.statusCode).toBe(201);
    expect(mockBuildFormSubmission.mock.calls[0][0].formXml).toContain(
      "<RestrictionsNoticeWithdrawalReason>RESTRICTIONS_NOTICE_WITHDRAWN_BY_COURT_ORDER</RestrictionsNoticeWithdrawalReason>",
    );
  });

  test("answers 400 in JSON, sending nothing, for a missing reason, a stray reason, an unknown statement or a bad date", async () => {
    for (const [overrides, message] of [
      [{ statement: "RESTRICTIONS_NOTICE_ISSUED_TO_PSC" }, "Invalid restrictionsWithdrawalReason - must be one of"],
      [{ restrictionsWithdrawalReason: "RESTRICTIONS_NOTICE_WITHDRAWN_BY_COMPANY" }, "only for RESTRICTIONS_NOTICE_ISSUED_TO_PSC"],
      [{ statement: "NO_SUCH_STATEMENT" }, "Invalid statement"],
      [{ withdrawalDate: "" }, "Invalid or missing withdrawalDate"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: withdrawal(overrides) }));
      expect(response.statusCode, message).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain(message);
    }
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await ingestHandler(buildEvent({ body: withdrawal(), authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("refuses the form on prod, where it is not listed, and sends nothing", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
    const response = await ingestHandler(buildEvent({ body: withdrawal() }));
    expect(response.statusCode).toBe(403);
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "psc-statements" });
  });
});
