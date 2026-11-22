// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseOfficerAppointmentPost.test.js
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

import { ingestHandler } from "@app/functions/companies-house/companiesHouseOfficerAppointmentPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const CARDIFF = { premise: "16", street: "Heol y Bont", postTown: "Cardiff", country: "GB-WLS", postcode: "CF10 1AA" };

function buildAppointmentBody(overrides = {}) {
  return {
    companyNumber: "06846849",
    companyName: "EXAMPLE OFFICERS LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-11-20",
    officerRole: "director",
    corporate: false,
    appointmentDate: "2026-11-02",
    consentToAct: true,
    title: "MRS",
    forename: "CARYS",
    surname: "LLEWELYN",
    serviceAddress: { sameAsRegisteredOffice: true },
    dateOfBirth: "1981-06-23",
    nationality: "Welsh",
    countryOfResidence: "Wales",
    residentialAddress: { address: CARDIFF },
    personalCode: "CWMPS832223",
    identityVerified: true,
    ...overrides,
  };
}

const CORPORATE = {
  corporate: true,
  corporateName: "DIRECTORCO LIMITED",
  address: { premise: "1", street: "Station Road", postTown: "Leeds", country: "GB-ENG", postcode: "LS1 4AP" },
  companyIdentification: { uk: { registrationNumber: "01234567" } },
};

function buildEvent({ body = buildAppointmentBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/officer-appointment",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

async function sentFormXml(body) {
  const response = await ingestHandler(buildEvent({ body }));
  expect(response.statusCode).toBe(201);
  const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
  return submissionArgs.formXml;
}

describe("companiesHouseOfficerAppointmentPost ingestHandler", () => {
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

  test("a director who is a person is built as OfficerAppointment with the personal code, sent in an OfficerAppointment envelope and answered with its submission number", async () => {
    const response = await ingestHandler(buildEvent({ body: buildAppointmentBody({ personalCode: "cwmps-832223" }) }));

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response)).toMatchObject({ submissionNumber: "00001A", pollInterval: 1 });
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      formIdentifier: "OfficerAppointment",
      companyNumber: "06846849",
      companyAuthenticationCode: "SIMCS01",
      submissionNumber: "00001A",
      dateSigned: "2026-11-20",
    });
    expect(submissionArgs.formXml).toContain(
      "<AppointmentDate>2026-11-02</AppointmentDate><ConsentToAct>true</ConsentToAct><Director><Person><Title>MRS</Title>" +
        "<Forename>CARYS</Forename><Surname>LLEWELYN</Surname>",
    );
    expect(submissionArgs.formXml).toContain(
      "<VerificationDetails><CompaniesHousePersonalCode>CWMPS832223</CompaniesHousePersonalCode><VerificationStatements>" +
        "<VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual></VerificationStatements></VerificationDetails>",
    );
  });

  test("a corporate director sends its name, address and registration number and no personal code", async () => {
    const formXml = await sentFormXml(buildAppointmentBody({ ...CORPORATE, personalCode: undefined, identityVerified: undefined }));
    expect(formXml).toContain("<Director><Corporate><CorporateName>DIRECTORCO LIMITED</CorporateName>");
    expect(formXml).toContain("<CompanyIdentification><UK><RegistrationNumber>01234567</RegistrationNumber></UK></CompanyIdentification>");
    expect(formXml).not.toContain("CompaniesHousePersonalCode");
    expect(formXml).not.toContain("<DOB>");
  });

  test("a secretary who is a person is sent with a service address and no date of birth or personal code", async () => {
    const formXml = await sentFormXml(
      buildAppointmentBody({
        officerRole: "secretary",
        serviceAddress: { address: CARDIFF },
        previousNames: [{ surname: "REES" }],
        dateOfBirth: undefined,
        personalCode: undefined,
        identityVerified: undefined,
      }),
    );
    expect(formXml).toContain(
      "<Secretary><Person><Title>MRS</Title><Forename>CARYS</Forename><Surname>LLEWELYN</Surname><ServiceAddress><Address>" +
        "<Premise>16</Premise><Street>Heol y Bont</Street><PostTown>Cardiff</PostTown><Country>GB-WLS</Country><Postcode>CF10 1AA</Postcode>" +
        "</Address></ServiceAddress><PreviousNames><Surname>REES</Surname></PreviousNames></Person></Secretary>",
    );
    expect(formXml).not.toContain("<DOB>");
    expect(formXml).not.toContain("CompaniesHousePersonalCode");
  });

  test("a corporate secretary registered outside the UK sends its legal form and governing law", async () => {
    const formXml = await sentFormXml(
      buildAppointmentBody({
        ...CORPORATE,
        officerRole: "secretary",
        corporateName: "SECRETARIAT B.V.",
        companyIdentification: { nonUk: { lawGoverned: "Netherlands", legalForm: "Besloten vennootschap" } },
      }),
    );
    expect(formXml).toContain(
      "<CompanyIdentification><NonUK><LawGoverned>Netherlands</LawGoverned><LegalForm>Besloten vennootschap</LegalForm></NonUK></CompanyIdentification></Corporate></Secretary>",
    );
  });

  test("records the filing in progress as officer-appointment", async () => {
    await ingestHandler(buildEvent());
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand || cmd instanceof lib.PutCommand);
    expect(JSON.stringify(writes.map((cmd) => cmd.input))).toContain('"kind":"officer-appointment"');
  });

  test("answers 400 in JSON, sending nothing, for a bad role, no consent, a missing personal code or particular, or bad dates", async () => {
    for (const [overrides, message] of [
      [{ officerRole: "member" }, "Invalid officerRole"],
      [{ corporate: "no" }, "Invalid corporate"],
      [{ consentToAct: false }, "Missing consentToAct"],
      [{ surname: "" }, "Missing surname"],
      [{ personalCode: undefined }, "Invalid personalCode"],
      [{ personalCode: "C1W2M3P4S5X" }, "Invalid personalCode"],
      [{ identityVerified: false }, "Missing identityVerified"],
      [{ nationality: "" }, "Missing nationality"],
      [{ nameMismatchReason: "OTHER" }, "Invalid nameMismatchReason"],
      [{ dateOfBirth: undefined }, "Invalid or missing dateOfBirth"],
      [{ dateOfBirth: "2026-11-03" }, "must be before appointmentDate"],
      [{ appointmentDate: "02/11/2026" }, "Invalid or missing appointmentDate"],
      [{ appointmentDate: "2026-11-21" }, "must not be after dateSigned"],
      [{ residentialAddress: undefined }, "Missing residentialAddress.address"],
      [{ residentialAddress: { address: { ...CARDIFF, postTown: "" } } }, "Missing residentialAddress.address.postTown"],
      [{ serviceAddress: { address: { ...CARDIFF, country: "WLS" } } }, "Invalid serviceAddress.address.country"],
      [{ ...CORPORATE, corporateName: "" }, "Missing corporateName"],
      [{ ...CORPORATE, companyIdentification: undefined }, "Missing companyIdentification"],
      [{ ...CORPORATE, companyIdentification: { nonUk: { legalForm: "LLC" } } }, "Missing companyIdentification.nonUk.lawGoverned"],
      [{ companyAuthCode: "AB" }, "Invalid companyAuthCode"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: buildAppointmentBody(overrides) }));
      expect(response.statusCode, message).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(JSON.stringify(parseResponseBody(response))).toContain(message);
    }
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("a 400 names the personal code field without echoing its value", async () => {
    const response = await ingestHandler(buildEvent({ body: buildAppointmentBody({ personalCode: "C1W2M3P4S5X" }) }));
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).not.toContain("C1W2M3P4S5X");
  });

  test("answers 500 in JSON and marks the filing failed when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({ errors: [{ number: "604", text: "Invalid Request" }], statuses: [] });
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).message).toBe("Companies House rejected the officer appointment submission envelope");
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
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "appoint-officer" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});
