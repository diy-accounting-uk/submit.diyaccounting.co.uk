// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseConfirmationStatementPreviewPost.test.js
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

import { ingestHandler as companiesHouseConfirmationStatementPreviewPostHandler } from "@app/functions/companies-house/companiesHouseConfirmationStatementPreviewPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildStatementBody(overrides = {}) {
  return {
    companyNumber: "06846849",
    companyName: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
    dateSigned: "2026-09-24",
    reviewDate: "2025-09-21",
    lawfulPurposeStatementAccepted: true,
    directors: [{ personalCode: "AB1234CD56E", forename: "ALICE", otherForenames: "MARGARET", surname: "EXAMPLE", dob: "1970-01-01" }],
    ...overrides,
  };
}

const VERIFIED_OFFICER = { identityVerificationDetails: { appointment_verification_end_on: "9999-12-31" } };
const UNVERIFIED_OFFICER = { identityVerificationDetails: { appointment_verification_end_on: null } };

function buildEvent({ body = buildStatementBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/confirmation-statement/preview",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseConfirmationStatementPreviewPost ingestHandler", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv({ ENVIRONMENT_NAME: "test" }));
    vi.clearAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [], Count: 0 };
      }
      return {};
    });
  });

  test("renders the confirmation statement body with the personal code masked", async () => {
    const response = await companiesHouseConfirmationStatementPreviewPostHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.confirmationStatementXml).toContain("<ConfirmationAndVerificationStatement");
    expect(body.confirmationStatementXml).toContain("<ReviewDate>2025-09-21</ReviewDate>");
    expect(body.confirmationStatementXml).not.toContain("AB1234CD56E");
    expect(body.confirmationStatementXml).toContain("<CompaniesHousePersonalCode>***********</CompaniesHousePersonalCode>");
  });

  test("does not require a companyAuthCode", async () => {
    const response = await companiesHouseConfirmationStatementPreviewPostHandler(
      buildEvent({ body: buildStatementBody({ companyAuthCode: undefined }) }),
    );
    expect(response.statusCode).toBe(200);
  });

  test("rejects a review date in the future", async () => {
    const futureDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const response = await companiesHouseConfirmationStatementPreviewPostHandler(
      buildEvent({ body: buildStatementBody({ reviewDate: futureDate }) }),
    );
    expect(response.statusCode).toBe(400);
  });

  test("rejects a director with no personal code", async () => {
    const response = await companiesHouseConfirmationStatementPreviewPostHandler(
      buildEvent({ body: buildStatementBody({ directors: [{ forename: "ALICE", surname: "EXAMPLE", dob: "1970-01-01" }] }) }),
    );
    expect(response.statusCode).toBe(400);
  });

  test("rejects when the lawful purpose statement is not accepted", async () => {
    const response = await companiesHouseConfirmationStatementPreviewPostHandler(
      buildEvent({ body: buildStatementBody({ lawfulPurposeStatementAccepted: false }) }),
    );
    expect(response.statusCode).toBe(400);
  });

  test("renders ConfirmationStatement (v1-3) with no directors when every officer is already verified", async () => {
    const response = await companiesHouseConfirmationStatementPreviewPostHandler(
      buildEvent({ body: buildStatementBody({ directors: undefined, officers: [VERIFIED_OFFICER, VERIFIED_OFFICER] }) }),
    );
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.confirmationStatementXml).toMatch(/^<ConfirmationStatement /);
    expect(body.confirmationStatementXml).not.toContain("VerificationStatement");
  });

  test("renders ConfirmationAndVerificationStatement (v1-0) when an officer is unverified", async () => {
    const response = await companiesHouseConfirmationStatementPreviewPostHandler(
      buildEvent({ body: buildStatementBody({ officers: [VERIFIED_OFFICER, UNVERIFIED_OFFICER] }) }),
    );
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.confirmationStatementXml).toMatch(/^<ConfirmationAndVerificationStatement /);
    expect(body.confirmationStatementXml).toContain("<VerificationStatement>");
  });

  test("rejects officers that are not an array", async () => {
    const response = await companiesHouseConfirmationStatementPreviewPostHandler(
      buildEvent({ body: buildStatementBody({ officers: "not-an-array" }) }),
    );
    expect(response.statusCode).toBe(400);
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await companiesHouseConfirmationStatementPreviewPostHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await companiesHouseConfirmationStatementPreviewPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
