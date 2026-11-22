// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHousePscCessationPost.test.js
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

import { ingestHandler } from "@app/functions/companies-house/companiesHousePscCessationPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildCessationBody(overrides = {}) {
  return {
    companyNumber: "06846849",
    companyName: "EXAMPLE PSC LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-11-20",
    pscKind: "individual-person-with-significant-control",
    title: "MRS",
    forename: "ELEANOR",
    surname: "BRAMWELL",
    dobMonth: 1,
    dobYear: 1970,
    cessationDate: "2026-11-01",
    confirmationDate: "2026-11-03",
    ...overrides,
  };
}

function buildEvent({ body = buildCessationBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/psc-cessation",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHousePscCessationPost ingestHandler", () => {
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

  test("an individual ceasing is built as PSCCessation, sent in a PSCCessation envelope and answered with its submission number", async () => {
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response)).toMatchObject({ submissionNumber: "00001A", pollInterval: 1 });
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      formIdentifier: "PSCCessation",
      companyNumber: "06846849",
      companyAuthenticationCode: "SIMCS01",
      submissionNumber: "00001A",
      dateSigned: "2026-11-20",
    });
    expect(submissionArgs.formXml).toContain("<Individual><Title>MRS</Title><Surname>BRAMWELL</Surname><Forename>ELEANOR</Forename>");
    expect(submissionArgs.formXml).toContain("<CessationDate>2026-11-01</CessationDate><ConfirmationDate>2026-11-03</ConfirmationDate>");
  });

  test("a corporate entity ceasing sends its name and none of an individual's particulars", async () => {
    const response = await ingestHandler(
      buildEvent({ body: buildCessationBody({ pscKind: "corporate-entity-person-with-significant-control", name: "HOLDCO LIMITED" }) }),
    );

    expect(response.statusCode).toBe(201);
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs.formXml).toContain("<Corporate><CorporateName>HOLDCO LIMITED</CorporateName></Corporate>");
    expect(submissionArgs.formXml).not.toContain("<Surname>");
  });

  test("records the filing in progress as psc-cessation", async () => {
    await ingestHandler(buildEvent());
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand || cmd instanceof lib.PutCommand);
    expect(JSON.stringify(writes.map((cmd) => cmd.input))).toContain('"kind":"psc-cessation"');
  });

  test("answers 400 in JSON, sending nothing, for a missing kind, a missing name, bad dates or a confirmation before the cessation", async () => {
    for (const [overrides, message] of [
      [{ pscKind: "super-secure-person-with-significant-control" }, "Invalid pscKind"],
      [{ surname: "" }, "Missing surname"],
      [{ pscKind: "legal-person-person-with-significant-control" }, "Missing name"],
      [{ cessationDate: "01/11/2026" }, "Invalid or missing cessationDate"],
      [{ confirmationDate: "2026-10-31" }, "must not be before cessationDate"],
      [{ dobMonth: 13 }, "Invalid dobMonth"],
      [{ companyAuthCode: "AB" }, "Invalid companyAuthCode"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: buildCessationBody(overrides) }));
      expect(response.statusCode, message).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(JSON.stringify(parseResponseBody(response))).toContain(message);
    }
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("answers 500 in JSON and marks the filing failed when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({ errors: [{ number: "604", text: "Invalid Request" }], statuses: [] });
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).message).toBe("Companies House rejected the PSC cessation submission envelope");
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await ingestHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("refuses the form on prod, where it is not listed, and sends nothing", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "cease-psc" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});
