// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHousePscStatementNotificationPost.test.js
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

import { ingestHandler } from "@app/functions/companies-house/companiesHousePscStatementNotificationPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const PATH = "/api/v1/companies-house/psc-statement-notification";

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

const notification = (overrides = {}) => ({
  ...COMPANY,
  statement: "NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL",
  relevantDate: "2026-11-01",
  ...overrides,
});

describe("companiesHousePscStatementNotificationPost ingestHandler", () => {
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

  test("a company statement is built as PSCStatementNotification and sent in a PSCStatementNotification envelope", async () => {
    const response = await ingestHandler(buildEvent({ body: notification() }));

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response)).toMatchObject({ submissionNumber: "00001A", pollInterval: 1 });
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      formIdentifier: "PSCStatementNotification",
      companyNumber: "06846849",
      submissionNumber: "00001A",
    });
    expect(submissionArgs.formXml).toContain(
      "<CompanyStatement>NO_INDIVIDUAL_OR_ENTITY_WITH_SIGNFICANT_CONTROL</CompanyStatement><RelevantDate>2026-11-01</RelevantDate>",
    );
    expect(await writtenKinds()).toContain('"kind":"psc-statement-notification"');
  });

  test("a statement linked to a PSC sends the PSC's particulars", async () => {
    const response = await ingestHandler(
      buildEvent({ body: notification({ statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS", ...ELEANOR }) }),
    );
    expect(response.statusCode).toBe(201);
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs.formXml).toContain(
      "<PSCLinkedStatement><Statement>PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS</Statement><Individual><Title>MRS</Title><Surname>BRAMWELL</Surname>",
    );
  });

  test("a PSC statement that names no PSC sends none of a PSC's particulars", async () => {
    await ingestHandler(buildEvent({ body: notification({ statement: "AWAITING_CONFIRMATION_FROM_PSC", ...ELEANOR }) }));
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs.formXml).toContain("<PSCStatement>AWAITING_CONFIRMATION_FROM_PSC</PSCStatement>");
    expect(submissionArgs.formXml).not.toContain("<Surname>");
  });

  test("answers 400 in JSON, sending nothing, for a statement only withdrawable, a missing PSC or a bad date", async () => {
    for (const [overrides, message] of [
      [{ statement: "PSC_EXISTS_BUT_NOT_IDENTIFIED" }, "Invalid statement"],
      [{ statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS" }, "Invalid pscKind"],
      [{ statement: "PSC_HAS_FAILED_TO_CONFIRM_CHANGED_DETAILS", ...ELEANOR, surname: "" }, "Missing surname"],
      [{ relevantDate: "01/11/2026" }, "Invalid or missing relevantDate"],
      [{ companyAuthCode: "AB" }, "Invalid companyAuthCode"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: notification(overrides) }));
      expect(response.statusCode, message).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(JSON.stringify(parseResponseBody(response))).toContain(message);
    }
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("answers 500 in JSON when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({ errors: [{ number: "604", text: "Invalid Request" }], statuses: [] });
    const response = await ingestHandler(buildEvent({ body: notification() }));
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).message).toBe("Companies House rejected the PSC statement submission envelope");
  });

  test("answers 400 in JSON, sending nothing, for a relevantDate after today in the United Kingdom, and takes today", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 23:30 UTC on 30 June is 00:30 on 1 July in the United Kingdom.
      vi.setSystemTime(new Date("2026-06-30T23:30:00Z"));
      const tomorrow = await ingestHandler(buildEvent({ body: notification({ relevantDate: "2026-07-02", dateSigned: "2026-07-01" }) }));
      expect(tomorrow.statusCode).toBe(400);
      expect(tomorrow.headers["Content-Type"]).toBe("application/json");
      expect(JSON.stringify(parseResponseBody(tomorrow))).toContain("Invalid relevantDate - must not be in the future");
      expect(mockPostToGateway).not.toHaveBeenCalled();
      const today = await ingestHandler(buildEvent({ body: notification({ relevantDate: "2026-07-01", dateSigned: "2026-07-01" }) }));
      expect(today.statusCode).toBe(201);
    } finally {
      vi.useRealTimers();
    }
  });

  test("refuses the form on prod, where it is not listed, and sends nothing", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
    const response = await ingestHandler(buildEvent({ body: notification() }));
    expect(response.statusCode).toBe(403);
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "psc-statements" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});
