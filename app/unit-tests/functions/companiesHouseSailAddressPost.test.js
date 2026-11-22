// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseSailAddressPost.test.js
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

const mockCachedCompaniesHouseGet = vi.fn();
vi.mock("@app/services/companiesHouseCache.js", () => ({
  cachedCompaniesHouseGet: (...args) => mockCachedCompaniesHouseGet(...args),
}));

import { ingestHandler } from "@app/functions/companies-house/companiesHouseSailAddressPost.js";

const profileIn = (jurisdiction) => ({ ok: true, data: { company_number: "06846849", jurisdiction }, fromCache: true });

dotenvConfigIfNotBlank({ path: ".env.test" });

function buildFormBody(overrides = {}) {
  return {
    companyNumber: "06846849",
    companyName: "EXAMPLE RECORDS LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-11-20",
    address: {
      premise: "Unit 4, Harbour House",
      street: "12 Quay Street",
      postTown: "Bristol",
      country: "GB-ENG",
      postcode: "BS1 4DJ",
    },
    ...overrides,
  };
}

function buildEvent({ body = buildFormBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/sail-address",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseSailAddressPost ingestHandler", () => {
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
    mockCachedCompaniesHouseGet.mockResolvedValue(profileIn("england-wales"));
  });

  describe("the country, against the part of the UK the company is registered in", () => {
    const withCountry = (country) => buildFormBody({ address: { ...buildFormBody().address, country } });

    test.each([
      ["england-wales", ["GB-ENG", "GB-WLS"], ["GB-SCT", "GB-NIR"]],
      ["wales", ["GB-ENG", "GB-WLS"], ["GB-SCT", "GB-NIR"]],
      ["scotland", ["GB-SCT"], ["GB-ENG", "GB-WLS", "GB-NIR"]],
      ["northern-ireland", ["GB-NIR"], ["GB-ENG", "GB-WLS", "GB-SCT"]],
    ])("a company with jurisdiction %s files a SAIL in %j and is refused one in %j", async (jurisdiction, allowed, refused) => {
      mockCachedCompaniesHouseGet.mockResolvedValue(profileIn(jurisdiction));
      for (const country of allowed) {
        const response = await ingestHandler(buildEvent({ body: withCountry(country) }));
        expect(response.statusCode, country).toBe(201);
      }
      for (const country of refused) {
        mockPostToGateway.mockClear();
        const response = await ingestHandler(buildEvent({ body: withCountry(country) }));
        expect(response.statusCode, country).toBe(400);
        expect(response.headers["Content-Type"]).toBe("application/json");
        expect(JSON.stringify(parseResponseBody(response))).toContain(
          "the SAIL must be in the part of the UK the company is registered in",
        );
        expect(mockPostToGateway).not.toHaveBeenCalled();
      }
      expect(mockCachedCompaniesHouseGet).toHaveBeenCalledWith("06846849", "/company/06846849", {}, { kind: "profile" });
    });

    test("a company the profile gives no part of the UK is refused, naming its jurisdiction", async () => {
      mockCachedCompaniesHouseGet.mockResolvedValue(profileIn("european-union"));
      const response = await ingestHandler(buildEvent());
      expect(response.statusCode).toBe(400);
      expect(JSON.stringify(parseResponseBody(response))).toContain("jurisdiction european-union");
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("a profile Companies House does not answer stops the filing with a JSON 502, and nothing is sent or recorded", async () => {
      mockCachedCompaniesHouseGet.mockResolvedValue({ ok: false, status: 429, retryAfterSeconds: 60 });
      const response = await ingestHandler(buildEvent());
      expect(response.statusCode).toBe(502);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(parseResponseBody(response)).toMatchObject({ code: "company-unread", status: 429 });
      expect(mockAllocateSubmissionNumber).not.toHaveBeenCalled();
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("a profile read that throws stops the filing with a JSON 502 too", async () => {
      mockCachedCompaniesHouseGet.mockRejectedValue(new Error("Missing required environment variable COMPANIES_HOUSE_BASE_URI"));
      const response = await ingestHandler(buildEvent());
      expect(response.statusCode).toBe(502);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(parseResponseBody(response)).toMatchObject({ code: "company-unread" });
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });

    test("a request whose own fields are wrong is refused before the profile is read", async () => {
      const response = await ingestHandler(buildEvent({ body: withCountry("GBR") }));
      expect(response.statusCode).toBe(400);
      expect(mockCachedCompaniesHouseGet).not.toHaveBeenCalled();
    });
  });

  test("a SAIL address is built as SailAddress, sent in a SailAddress envelope and answered with its submission number", async () => {
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response)).toMatchObject({ submissionNumber: "00001A", pollInterval: 1 });
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      formIdentifier: "SailAddress",
      companyNumber: "06846849",
      companyAuthenticationCode: "SIMCS01",
      submissionNumber: "00001A",
      dateSigned: "2026-11-20",
    });
    expect(submissionArgs.formXml).toContain(
      "<Address><Premise>Unit 4, Harbour House</Premise><Street>12 Quay Street</Street><PostTown>Bristol</PostTown>" +
        "<Country>GB-ENG</Country><Postcode>BS1 4DJ</Postcode></Address>",
    );
  });

  test("an address with every part, trimmed, is sent in the schema's order", async () => {
    const address = {
      poBox: " PO Box 12 ",
      careOfName: "Bramwell & Co",
      postcode: "CF10 1AA",
      country: "GB-WLS",
      county: "South Glamorgan",
      postTown: " Cardiff",
      thoroughfare: "Cathays",
      street: "2 Park Place",
      premise: "Suite 9 ",
    };
    const response = await ingestHandler(buildEvent({ body: buildFormBody({ address }) }));
    expect(response.statusCode).toBe(201);
    expect(mockBuildFormSubmission.mock.calls[0][0].formXml).toContain(
      "<Address><Premise>Suite 9</Premise><Street>2 Park Place</Street><Thoroughfare>Cathays</Thoroughfare><PostTown>Cardiff</PostTown>" +
        "<County>South Glamorgan</County><Country>GB-WLS</Country><Postcode>CF10 1AA</Postcode><CareofName>Bramwell &amp; Co</CareofName>" +
        "<PoBox>PO Box 12</PoBox></Address>",
    );
  });

  test("records the filing in progress as sail-address", async () => {
    await ingestHandler(buildEvent());
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand || cmd instanceof lib.PutCommand);
    expect(JSON.stringify(writes.map((cmd) => cmd.input))).toContain('"kind":"sail-address"');
  });

  test("answers 400 in JSON, sending nothing, for a missing or malformed address", async () => {
    const address = buildFormBody().address;
    for (const [overrides, message] of [
      [{ address: undefined }, "Missing address"],
      [{ address: "1 High Street" }, "Missing address"],
      [{ address: { ...address, premise: " " } }, "Missing address.premise"],
      [{ address: { ...address, postTown: undefined } }, "Missing address.postTown"],
      [{ address: { ...address, country: "FR" } }, "Invalid address.country"],
      [{ address: { ...address, country: "GBR" } }, "Invalid address.country"],
      [{ address: { ...address, country: "constructor" } }, "Invalid address.country"],
      [{ address: { ...address, country: "__proto__" } }, "Invalid address.country"],
      [{ address: { ...address, country: ["GB-ENG"] } }, "Invalid address.country"],
      [{ address: { ...address, street: "x".repeat(51) } }, "Invalid address.street - must be at most 50 characters"],
      [{ address: { ...address, postcode: "x".repeat(16) } }, "Invalid address.postcode - must be at most 15 characters"],
      [{ address: { ...address, street: "12 Quay Street | rear" } }, "address.street has characters Companies House does not accept: |"],
      [{ address: { ...address, premise: 12 } }, "Missing address.premise"],
      [{ companyAuthCode: "AB" }, "Invalid companyAuthCode"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: buildFormBody(overrides) }));
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
    expect(parseResponseBody(response).message).toBe("Companies House rejected the SAIL address submission envelope");
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
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "change-records-location" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});
