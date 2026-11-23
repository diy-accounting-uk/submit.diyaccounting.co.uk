// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHousePscVerificationStatementPost.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import {
  INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE,
  INVALID_COMPANY_AUTHENTICATION_CODE_REASON,
} from "@app/lib/companiesHouseGatewayErrors.js";

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

import { ingestHandler as companiesHousePscVerificationStatementPostHandler } from "@app/functions/companies-house/companiesHousePscVerificationStatementPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildStatementBody(overrides = {}) {
  return {
    companyNumber: "00000004",
    companyName: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-09-24",
    title: "MR",
    forename: "ALICE",
    otherForenames: "MARGARET",
    surname: "EXAMPLE",
    dobMonth: 1,
    dobYear: 1970,
    personalCode: "CWMPS832223",
    ...overrides,
  };
}

function buildEvent({ body = buildStatementBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/psc-verification-statement",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHousePscVerificationStatementPost ingestHandler", () => {
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
    mockParseGatewayResponse.mockReturnValue({ errors: [], statuses: [], gatewayTimestamp: "2026-09-24T10:00:00Z", pollInterval: 1 });
  });

  test("builds the statement body, submits the envelope and returns the submission number", async () => {
    const response = await companiesHousePscVerificationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(201);
    const body = parseResponseBody(response);
    expect(body.submissionNumber).toBe("00001A");
    expect(body.gatewayTimestamp).toBe("2026-09-24T10:00:00Z");
    expect(body.pollInterval).toBe(1);

    expect(mockBuildFormSubmission).toHaveBeenCalledTimes(1);
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      presenterId: "presenter-id",
      presenterCode: "presenter-code",
      companyNumber: "00000004",
      companyName: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
      companyAuthenticationCode: "SIMCS01",
      packageReference: "0012",
      submissionNumber: "00001A",
      formIdentifier: "PSCVerificationStatement",
      dateSigned: "2026-09-24",
      gatewayTest: false,
    });
    expect(submissionArgs.formXml).toContain("<Surname>EXAMPLE</Surname>");
    expect(submissionArgs.formXml).toContain("<CompaniesHousePersonalCode>CWMPS832223</CompaniesHousePersonalCode>");

    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>submission</GovTalkMessage>", {});
  });

  test("presents under the customer's own presenter without resolving ours", async () => {
    const response = await companiesHousePscVerificationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ ownPresenter: { id: "OWN-PRES-7731", code: "OwnSecretCode#42" } }) }),
    );
    expect(response.statusCode).toBe(201);
    expect(mockResolvePresenterCredentials).not.toHaveBeenCalled();
    expect(mockBuildFormSubmission).toHaveBeenCalledWith(
      expect.objectContaining({ presenterId: "OWN-PRES-7731", presenterCode: "OwnSecretCode#42" }),
    );
  });

  test("keeps the filing pending and answers its number when the gateway never answers the sent envelope", async () => {
    mockPostToGateway.mockImplementation(async (xml) => {
      if (xml === "<GovTalkMessage>submission</GovTalkMessage>") throw new Error("The operation was aborted due to timeout");
      return { ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 };
    });

    const response = await companiesHousePscVerificationStatementPostHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response).submissionNumber).toBe("00001A");
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"])
      .map((cmd) => cmd.input.ExpressionAttributeValues);
    expect(writes.map((values) => values[":status"])).toEqual(["pending", "pending"]);
    expect(writes.at(-1)[":data"]).toMatchObject({ kind: "psc-verification-statement", outcomeUnknown: true });
  });

  test("marks the filing failed when the connection to the gateway was refused, so nothing was delivered", async () => {
    mockPostToGateway.mockImplementation(async (xml) => {
      if (xml === "<GovTalkMessage>submission</GovTalkMessage>") {
        throw Object.assign(new TypeError("fetch failed"), {
          cause: Object.assign(new Error("connect ECONNREFUSED 10.0.0.1:443"), { code: "ECONNREFUSED", syscall: "connect" }),
        });
      }
      return { ok: true, status: 200, data: "<GovTalkMessage>ack</GovTalkMessage>", headers: {}, duration: 1 };
    });

    const response = await companiesHousePscVerificationStatementPostHandler(buildEvent());

    expect(response.statusCode).toBe(500);
    const lib = await import("@aws-sdk/lib-dynamodb");
    const statuses = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"])
      .map((cmd) => cmd.input.ExpressionAttributeValues[":status"]);
    expect(statuses).toEqual(["pending", "failed"]);
  });

  test("forwards a Gov-Test-Scenario header to the gateway call", async () => {
    await companiesHousePscVerificationStatementPostHandler(buildEvent({ headers: { "Gov-Test-Scenario": "AUTH_FAILURE" } }));
    expect(mockPostToGateway).toHaveBeenCalledWith("<GovTalkMessage>submission</GovTalkMessage>", {
      "Gov-Test-Scenario": "AUTH_FAILURE",
    });
  });

  test("sets gatewayTest true when COMPANIES_HOUSE_GATEWAY_TEST is true", async () => {
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
    await companiesHousePscVerificationStatementPostHandler(buildEvent());
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs.gatewayTest).toBe(true);
  });

  test("rejects a company authentication code that is too short", async () => {
    const response = await companiesHousePscVerificationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ companyAuthCode: "AB" }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects a personal code that is not 11 characters", async () => {
    const response = await companiesHousePscVerificationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ personalCode: "TOOSHORT" }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects a personal code that is all digits", async () => {
    const response = await companiesHousePscVerificationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ personalCode: "12345678951" }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects a missing surname", async () => {
    const response = await companiesHousePscVerificationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ surname: undefined }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("rejects an invalid company number", async () => {
    const response = await companiesHousePscVerificationStatementPostHandler(
      buildEvent({ body: buildStatementBody({ companyNumber: "X" }) }),
    );
    expect(response.statusCode).toBe(400);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("marks the submission failed and returns 500 when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [{ raisedBy: "Gateway", number: 604, type: "fatal", text: "Invalid Request" }],
      statuses: [],
    });
    const response = await companiesHousePscVerificationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    const body = parseResponseBody(response);
    expect(body.submissionNumber).toBe("00001A");
    expect(body.errors[0].number).toBe(604);
  });

  test("returns 400 with the gateway errors when the gateway reports the company authentication code as invalid", async () => {
    mockParseGatewayResponse.mockReturnValue({
      errors: [{ raisedBy: "CompanyDataRequest", number: 9999, type: "fatal", text: "Invalid CompanyAuthenticationCode", location: "" }],
      statuses: [],
    });
    const response = await companiesHousePscVerificationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.reason).toBe(INVALID_COMPANY_AUTHENTICATION_CODE_REASON);
    expect(body.message).toBe(INVALID_COMPANY_AUTHENTICATION_CODE_MESSAGE);
    expect(body.errors[0].text).toBe("Invalid CompanyAuthenticationCode");
    expect(body.submissionNumber).toBe("00001A");
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await companiesHousePscVerificationStatementPostHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "not-a-listed-environment";
    const response = await companiesHousePscVerificationStatementPostHandler(buildEvent());
    expect(response.statusCode).toBe(403);
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("refuses a synthetic preview request on prod, where the statement is unlisted and the gateway is live, and sends nothing", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    delete process.env.COMPANIES_HOUSE_GATEWAY_TEST;
    process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api.company-information.service.gov.uk";
    const response = await companiesHousePscVerificationStatementPostHandler(
      buildEvent({ headers: { "x-preview-features": "on", "hmrcAccount": "synthetic" } }),
    );
    expect(response.statusCode).toBe(403);
    expect(response.headers["Content-Type"]).toBe("application/json");
    expect(parseResponseBody(response)).toMatchObject({
      code: "ACTIVITY_ENVIRONMENT_RESTRICTED",
      activityId: "file-psc-verification-statement",
    });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("lets a preview request file the statement on prod where the gateway is the test service", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    process.env.COMPANIES_HOUSE_GATEWAY_TEST = "true";
    process.env.COMPANIES_HOUSE_FILING_BASE_URI = "https://api.company-information.service.gov.uk";
    const response = await companiesHousePscVerificationStatementPostHandler(buildEvent({ headers: { "x-preview-features": "on" } }));
    expect(response.statusCode).not.toBe(403);
    expect(mockPostToGateway).toHaveBeenCalled();
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHousePscVerificationStatementPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
