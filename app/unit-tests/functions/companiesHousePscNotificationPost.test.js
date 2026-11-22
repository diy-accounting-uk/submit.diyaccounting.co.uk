// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHousePscNotificationPost.test.js
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

import { ingestHandler } from "@app/functions/companies-house/companiesHousePscNotificationPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const HOME = { premise: "14", street: "Heol y Bont", postTown: "Aberystwyth", country: "GB-WLS", postcode: "SY23 1PZ" };
const OFFICE = { premise: "Ty Teifi", street: "Stryd Fawr", postTown: "Cardigan", country: "GB-WLS", postcode: "SA43 1HJ" };

function buildNotificationBody(overrides = {}) {
  return {
    companyNumber: "06846849",
    companyName: "EXAMPLE PSC LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-11-20",
    pscKind: "individual-person-with-significant-control",
    title: "DR",
    forename: "GWENLLIAN",
    surname: "PRYCE",
    dateOfBirth: "1978-03-14",
    nationality: "British",
    countryOfResidence: "Wales",
    serviceAddress: { sameAsRegisteredOffice: true },
    residentialAddress: { address: HOME },
    naturesOfControl: ["OWNERSHIPOFSHARES_50TO75PERCENT", "VOTINGRIGHTS_50TO75PERCENT"],
    notificationDate: "2026-10-28",
    confirmationDate: "2026-11-04",
    ...overrides,
  };
}

const ENTITY = {
  pscKind: "corporate-entity-person-with-significant-control",
  title: undefined,
  forename: undefined,
  surname: undefined,
  dateOfBirth: undefined,
  nationality: undefined,
  countryOfResidence: undefined,
  serviceAddress: undefined,
  residentialAddress: undefined,
  name: "TEIFI VALLEY HOLDINGS LIMITED",
  address: OFFICE,
  legalForm: "Private company limited by shares",
  lawGoverned: "Companies Act 2006",
  placeRegistered: "Companies House",
  registrationNumber: "09876543",
};

function buildEvent({ body = buildNotificationBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/psc-notification",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHousePscNotificationPost ingestHandler", () => {
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

  test("an individual's notice is built as PSCNotification and sent in a PSCNotification envelope", async () => {
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response)).toMatchObject({ submissionNumber: "00001A", pollInterval: 1 });
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      formIdentifier: "PSCNotification",
      companyNumber: "06846849",
      companyAuthenticationCode: "SIMCS01",
      submissionNumber: "00001A",
      dateSigned: "2026-11-20",
    });
    expect(submissionArgs.formXml).toContain(
      "<Individual><Title>DR</Title><Forename>GWENLLIAN</Forename><Surname>PRYCE</Surname>" +
        "<ServiceAddress><SameAsRegisteredOffice>true</SameAsRegisteredOffice></ServiceAddress><DOB>1978-03-14</DOB>",
    );
    expect(submissionArgs.formXml).toContain(
      "<NotificationDate>2026-10-28</NotificationDate><ConfirmationDate>2026-11-04</ConfirmationDate>",
    );
  });

  test("a verified individual's personal code is sent in capitals with the verification statement", async () => {
    await ingestHandler(
      buildEvent({ body: buildNotificationBody({ personalCode: " abc12345xyz ", nameMismatchReason: "LEGALLY_CHANGED" }) }),
    );
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs.formXml).toContain(
      "<VerificationDetails><CompaniesHousePersonalCode>ABC12345XYZ</CompaniesHousePersonalCode>" +
        "<VerificationStatements><VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual>" +
        "</VerificationStatements><NameMismatchReason>LEGALLY_CHANGED</NameMismatchReason></VerificationDetails>",
    );
  });

  test("a relevant legal entity's notice sends its principal office, trimmed, and none of an individual's particulars", async () => {
    const response = await ingestHandler(
      buildEvent({ body: buildNotificationBody({ ...ENTITY, address: { ...OFFICE, street: "  Stryd Fawr  ", county: "" } }) }),
    );
    expect(response.statusCode).toBe(201);
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs.formXml).toContain(
      "<Corporate><CorporateName>TEIFI VALLEY HOLDINGS LIMITED</CorporateName><Address><Premise>Ty Teifi</Premise>" +
        "<Street>Stryd Fawr</Street><PostTown>Cardigan</PostTown><Country>GB-WLS</Country><Postcode>SA43 1HJ</Postcode></Address>",
    );
    expect(submissionArgs.formXml).not.toContain("<Surname>");
  });

  test("an other registrable person's notice names it as a legal person, with no register", async () => {
    const response = await ingestHandler(
      buildEvent({
        body: buildNotificationBody({
          ...ENTITY,
          pscKind: "legal-person-person-with-significant-control",
          name: "Ceredigion County Council",
          legalForm: "Local authority",
          lawGoverned: "Local Government (Wales) Act 1994",
          naturesOfControl: ["SIGINFLUENCECONTROL"],
        }),
      }),
    );
    expect(response.statusCode).toBe(201);
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs.formXml).toContain("<LegalPerson><LegalPersonName>Ceredigion County Council</LegalPersonName>");
    expect(submissionArgs.formXml).not.toContain("PSCPlaceRegistered");
  });

  test("records the filing in progress as psc-notification", async () => {
    await ingestHandler(buildEvent());
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand || cmd instanceof lib.PutCommand);
    expect(JSON.stringify(writes.map((cmd) => cmd.input))).toContain('"kind":"psc-notification"');
  });

  test("answers 400 in JSON, sending nothing, for each particular PSC01 to PSC03 ask for and each date rule", async () => {
    for (const [overrides, message] of [
      [{ pscKind: "unknown" }, "Invalid pscKind"],
      [{ surname: "" }, "an individual PSC needs a surname"],
      [{ dateOfBirth: "14/03/1978" }, "dateOfBirth must be YYYY-MM-DD"],
      [{ nationality: " " }, "an individual PSC needs a nationality"],
      [{ residentialAddress: { sameAsServiceAddress: true } }, "cannot be the service address when that is the registered office"],
      [{ residentialAddress: { address: { ...HOME, street: "Ffordd Glyndŵr" } } }, "characters Companies House does not accept: ŵ"],
      [{ personalCode: "SHORT" }, "a personal code is 11 letters and digits"],
      [{ ...ENTITY, legalForm: "" }, "legalForm is needed"],
      [{ ...ENTITY, registrationNumber: "" }, "needs its registration number there"],
      [{ naturesOfControl: ["SIGINFLUENCECONTROL", "VOTINGRIGHTS_25TO50PERCENT"] }, "Invalid naturesOfControl - SIGINFLUENCECONTROL only"],
      [{ naturesOfControl: undefined }, "Invalid naturesOfControl - at least one nature of control is needed"],
      [{ notificationDate: "2016-04-05", confirmationDate: "2016-04-06" }, "must not be before 2016-04-06"],
      [{ confirmationDate: "2026-10-27" }, "must not be before notificationDate"],
      [{ companyAuthCode: "AB" }, "Invalid companyAuthCode"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: buildNotificationBody(overrides) }));
      expect(response.statusCode, message).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(JSON.stringify(parseResponseBody(response))).toContain(message);
    }
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  test("the home address and date of birth go into the envelope only: not the filing state, an event or a refusal", async () => {
    const home = { premise: "9", street: "Lôn Gudd", postTown: "Bangor", country: "GB-WLS" };
    await ingestHandler(buildEvent({ body: buildNotificationBody({ residentialAddress: { address: { ...home, street: "Lon Gudd" } } }) }));
    expect(mockBuildFormSubmission.mock.calls[0][0].formXml).toContain("<Street>Lon Gudd</Street>");
    const stored = JSON.stringify(mockSend.mock.calls.map(([cmd]) => cmd.input));
    const published = JSON.stringify(mockEventBridgeSend.mock.calls.map(([cmd]) => cmd.input));
    for (const held of [stored, published]) {
      expect(held).not.toContain("Lon Gudd");
      expect(held).not.toContain("1978-03-14");
    }

    const refused = await ingestHandler(
      buildEvent({ body: buildNotificationBody({ residentialAddress: { address: { ...home, street: "Ffordd Glyndŵr" } } }) }),
    );
    expect(refused.statusCode).toBe(400);
    const message = JSON.stringify(parseResponseBody(refused));
    expect(message).toContain("usual residential address street has characters Companies House does not accept: ŵ");
    expect(message).not.toContain("Glynd");
  });

  test("answers 500 in JSON when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockReturnValue({ errors: [{ number: "604", text: "Invalid Request" }], statuses: [] });
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).message).toBe("Companies House rejected the PSC notification submission envelope");
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
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "notify-psc" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});
