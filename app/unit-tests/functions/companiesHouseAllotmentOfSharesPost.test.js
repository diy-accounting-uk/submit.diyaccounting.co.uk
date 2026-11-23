// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/companiesHouseAllotmentOfSharesPost.test.js
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
  buildCompanyDataRequest: (await importOriginal()).buildCompanyDataRequest,
  parseCompanyDataResponse: (await importOriginal()).parseCompanyDataResponse,
  buildFormSubmission: (...args) => mockBuildFormSubmission(...args),
  allocateSubmissionNumber: (...args) => mockAllocateSubmissionNumber(...args),
  postToGateway: (...args) => mockPostToGateway(...args),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
  resolvePresenterCredentials: (...args) => mockResolvePresenterCredentials(...args),
}));

import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";
import { readFileSync } from "node:fs";

const COMPANY_DATA_FIXTURE = readFileSync(
  new URL("../../../fixtures/companies-house-xmlgw/CompanyDataResponse_v3-6.xml", import.meta.url),
  "utf8",
);

// The register's capital, one Capital for each currency, in the published company data answer.
function companyDataAnswer(capitals) {
  const capitalXml = capitals
    .map(
      ({ currency, unpaid = "0", shares }) =>
        `<Capital><TotalAmountUnpaid>${unpaid}</TotalAmountUnpaid><TotalNumberOfIssuedShares>1</TotalNumberOfIssuedShares>` +
        `<ShareCurrency>${currency}</ShareCurrency><TotalAggregateNominalValue>1</TotalAggregateNominalValue>` +
        shares
          .map(
            ([shareClass, number, nominal]) =>
              `<Shares><ShareClass>${shareClass}</ShareClass><PrescribedParticulars>Rights</PrescribedParticulars>` +
              `<NumShares>${number}</NumShares><AggregateNominalValue>${nominal}</AggregateNominalValue></Shares>`,
          )
          .join("") +
        `</Capital>`,
    )
    .join("");
  const statement = capitals.length ? `<StatementOfCapital>${capitalXml}</StatementOfCapital>` : "";
  return COMPANY_DATA_FIXTURE.replace(/<StatementOfCapital>[\s\S]*?<\/StatementOfCapital>/, statement);
}

let registerAnswer;
let registerErrors;
import { ingestHandler } from "@app/functions/companies-house/companiesHouseAllotmentOfSharesPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const RIGHTS = "Each share has one vote, and ranks equally for dividends and on a return of capital. The shares are not redeemable.";
const ALLOTMENT = {
  shareClass: "Ordinary",
  numShares: "50",
  amountPaidPerShare: "2.5",
  amountUnpaidPerShare: "0",
  currency: "GBP",
  nominalValue: "1",
};
const ORDINARY = { shareClass: "Ordinary", prescribedParticulars: RIGHTS, numShares: "150", aggregateNominalValue: "150" };
const CAPITAL = { currency: "GBP", totalAmountUnpaid: "0", shares: [ORDINARY] };

function buildFormBody(overrides = {}) {
  return {
    companyNumber: "00000004",
    companyName: "EXAMPLE SHARES LIMITED",
    companyAuthCode: "SIMCS01",
    dateSigned: "2026-11-20",
    startDate: "2026-11-02",
    allotments: [ALLOTMENT],
    statementOfCapital: [CAPITAL],
    ...overrides,
  };
}

function buildEvent({ body = buildFormBody(), headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/companies-house/allotment-of-shares",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("companiesHouseAllotmentOfSharesPost ingestHandler", () => {
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
    registerAnswer = companyDataAnswer([{ currency: "GBP", shares: [["Ordinary", "100", "100"]] }]);
    registerErrors = [];
    mockPostToGateway.mockImplementation(async (xml) => ({
      ok: true,
      status: 200,
      data: xml.includes("CompanyDataRequest") ? registerAnswer : "<GovTalkMessage>ack</GovTalkMessage>",
      headers: {},
      duration: 1,
    }));
    mockParseGatewayResponse.mockImplementation((data) =>
      data === registerAnswer
        ? { errors: registerErrors, statuses: [] }
        : { errors: [], statuses: [], gatewayTimestamp: "2026-11-20T10:00:00Z", pollInterval: 1 },
    );
  });

  test("an allotment for cash is filed under the Class ReturnOfAllotmentShares with the FormIdentifier ReturnofAllotmentShares, and answered with its submission number", async () => {
    const response = await ingestHandler(buildEvent());

    expect(response.statusCode).toBe(201);
    expect(parseResponseBody(response)).toMatchObject({ submissionNumber: "00001A", pollInterval: 1 });
    const [submissionArgs] = mockBuildFormSubmission.mock.calls[0];
    expect(submissionArgs).toMatchObject({
      gatewayClass: "ReturnOfAllotmentShares",
      formIdentifier: "ReturnofAllotmentShares",
      companyNumber: "00000004",
      companyAuthenticationCode: "SIMCS01",
      submissionNumber: "00001A",
      dateSigned: "2026-11-20",
    });
    expect(submissionArgs.formXml).toContain("<StartPeriodSharesAllotted>2026-11-02</StartPeriodSharesAllotted><StatementOfCapital>");
    expect(submissionArgs.formXml).toContain("<TotalNumberOfIssuedShares>150</TotalNumberOfIssuedShares>");
    expect(submissionArgs.formXml).toContain(
      "<Allotment><ShareClass>Ordinary</ShareClass><NumShares>50</NumShares><AmountPaidDuePerShare>2.5</AmountPaidDuePerShare>",
    );
    expect(submissionArgs.formXml).not.toContain("Consideration");
  });

  test("the body the route builds for each case is valid against the schema", async () => {
    const preference = {
      shareClass: "A Preference",
      prescribedParticulars: "No vote. A fixed dividend of 5 pence a share each year.",
      numShares: "25",
      aggregateNominalValue: "2.5",
    };
    for (const overrides of [
      {},
      { allotments: [{ ...ALLOTMENT, amountPaidPerShare: 2.5, numShares: 50, consideration: " A delivery van, valued at 125 pounds. " }] },
      {
        endDate: "2026-11-09",
        allotments: [
          {
            ...ALLOTMENT,
            shareClass: "a preference",
            numShares: "25",
            nominalValue: "0.1",
            amountPaidPerShare: "0",
            amountUnpaidPerShare: "0.1",
          },
        ],
        statementOfCapital: [
          {
            currency: "GBP",
            totalAmountUnpaid: "2.5",
            shares: [{ ...ORDINARY, numShares: "100", aggregateNominalValue: "100" }, preference],
          },
        ],
      },
    ]) {
      mockBuildFormSubmission.mockClear();
      const response = await ingestHandler(buildEvent({ body: buildFormBody(overrides) }));
      expect(response.statusCode, JSON.stringify(parseResponseBody(response))).toBe(201);
      expect(await gatewayFormSchemaErrors(mockBuildFormSubmission.mock.calls[0][0].formXml, "ReturnofAllotmentShares-v3-0.xsd")).toEqual(
        [],
      );
    }
  });

  test("a consideration is trimmed and sent with its allotment", async () => {
    await ingestHandler(buildEvent({ body: buildFormBody({ allotments: [{ ...ALLOTMENT, consideration: " Plant & machinery " }] }) }));
    expect(mockBuildFormSubmission.mock.calls[0][0].formXml).toContain("<Consideration>Plant &amp; machinery</Consideration>");
  });

  test("records the filing in progress as allotment-of-shares", async () => {
    await ingestHandler(buildEvent());
    const lib = await import("@aws-sdk/lib-dynamodb");
    const writes = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand || cmd instanceof lib.PutCommand);
    expect(JSON.stringify(writes.map((cmd) => cmd.input))).toContain('"kind":"allotment-of-shares"');
  });

  test("answers 400 in JSON, sending nothing, for a return the form cannot state", async () => {
    for (const [overrides, message] of [
      [{ startDate: "02/11/2026" }, "Invalid or missing startDate"],
      [{ endDate: "2026-11-01" }, "Invalid endDate - must not be before startDate"],
      [{ endDate: "next week" }, "Invalid endDate - must be YYYY-MM-DD"],
      [{ allotments: [] }, "Missing allotments"],
      [{ allotments: "50 shares" }, "Missing allotments"],
      [{ statementOfCapital: undefined }, "Missing statementOfCapital"],
      [{ statementOfCapital: [{ ...CAPITAL, shares: [] }] }, "Missing statementOfCapital[0].shares"],
      [{ allotments: [{ ...ALLOTMENT, shareClass: " " }] }, "Missing allotments[0].shareClass"],
      [{ allotments: [{ ...ALLOTMENT, shareClass: "x".repeat(51) }] }, "allotments[0].shareClass - must be at most 50 characters"],
      [{ allotments: [{ ...ALLOTMENT, currency: "XXX" }] }, "Invalid allotments[0].currency - must be one of GBP, EUR, USD"],
      [{ allotments: [{ ...ALLOTMENT, numShares: "0" }] }, "Invalid allotments[0].numShares - must be a number above 0"],
      [{ allotments: [{ ...ALLOTMENT, numShares: "-5" }] }, "Invalid allotments[0].numShares"],
      [{ allotments: [{ ...ALLOTMENT, numShares: "1e3" }] }, "Invalid allotments[0].numShares"],
      [{ allotments: [{ ...ALLOTMENT, amountPaidPerShare: "2.5000001" }] }, "Invalid allotments[0].amountPaidPerShare"],
      [{ allotments: [{ ...ALLOTMENT, amountUnpaidPerShare: undefined }] }, "Invalid allotments[0].amountUnpaidPerShare"],
      [{ allotments: [{ ...ALLOTMENT, nominalValue: "0" }] }, "Invalid allotments[0].nominalValue"],
      [
        { allotments: [{ ...ALLOTMENT, nominalValue: "123456.123" }] },
        "Invalid allotments[0].nominalValue - must be a number above 0, with at most 8 digits",
      ],
      [{ allotments: [{ ...ALLOTMENT, amountPaidPerShare: "0.5" }] }, "add up to less than its nominal value of 1"],
      [
        { allotments: [{ ...ALLOTMENT, consideration: "x".repeat(2001) }] },
        "allotments[0].consideration - must be at most 2000 characters",
      ],
      [
        { allotments: [{ ...ALLOTMENT, consideration: "A van\nand a trailer" }] },
        "allotments[0].consideration has characters Companies House does not accept",
      ],
      [{ allotments: [{ ...ALLOTMENT, consideration: 125 }] }, "Invalid allotments[0].consideration - must be text"],
      [{ statementOfCapital: [{ ...CAPITAL, totalAmountUnpaid: "nil" }] }, "Invalid statementOfCapital[0].totalAmountUnpaid"],
      [
        { statementOfCapital: [{ ...CAPITAL, shares: [{ ...ORDINARY, prescribedParticulars: "" }] }] },
        "Missing statementOfCapital[0].shares[0].prescribedParticulars",
      ],
      [
        { statementOfCapital: [{ ...CAPITAL, shares: [{ ...ORDINARY, prescribedParticulars: "x".repeat(4001) }] }] },
        "prescribedParticulars - must be at most 4000 characters",
      ],
      [
        { statementOfCapital: [{ ...CAPITAL, shares: [{ ...ORDINARY, aggregateNominalValue: "0" }] }] },
        "Invalid statementOfCapital[0].shares[0].aggregateNominalValue",
      ],
      [{ statementOfCapital: [CAPITAL, CAPITAL] }, "GBP is stated twice"],
      [
        { statementOfCapital: [{ ...CAPITAL, shares: [ORDINARY, { ...ORDINARY, shareClass: "ORDINARY" }] }] },
        "the class ORDINARY is stated twice",
      ],
      [{ allotments: [{ ...ALLOTMENT, shareClass: "B Ordinary" }] }, "the statement of capital has no GBP class B Ordinary"],
      [{ allotments: [{ ...ALLOTMENT, currency: "EUR" }] }, "the statement of capital has no EUR class Ordinary"],
      [{ allotments: [{ ...ALLOTMENT, numShares: "151" }] }, "states fewer Ordinary shares, or less nominal value, than are allotted"],
      [
        { allotments: [ALLOTMENT, { ...ALLOTMENT, numShares: "101" }] },
        "Invalid allotments[1] - the statement of capital states fewer Ordinary shares",
      ],
      [
        { statementOfCapital: [{ ...CAPITAL, shares: [{ ...ORDINARY, aggregateNominalValue: "49" }] }] },
        "less nominal value, than are allotted",
      ],
      [
        { allotments: [{ ...ALLOTMENT, amountPaidPerShare: "0", amountUnpaidPerShare: "1" }] },
        "the total amount unpaid in GBP is less than the 50 unpaid on the shares allotted",
      ],
      [{ allotments: [{ ...ALLOTMENT, numShares: "0.5", nominalValue: "0.000001" }] }, "has more than 6 decimal places"],
      [{ companyAuthCode: "AB" }, "Invalid companyAuthCode"],
    ]) {
      const response = await ingestHandler(buildEvent({ body: buildFormBody(overrides) }));
      expect(response.statusCode, message).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(JSON.stringify(parseResponseBody(response))).toContain(message);
    }
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });

  describe("the capital before the allotment against the register", () => {
    test("reads the register's capital with the company authentication code, dated the day the return is signed", async () => {
      await ingestHandler(buildEvent());
      const read = mockPostToGateway.mock.calls.map(([xml]) => xml).find((xml) => xml.includes("CompanyDataRequest"));
      expect(read).toContain("<CompanyNumber>00000004</CompanyNumber>");
      expect(read).toContain("<CompanyAuthenticationCode>SIMCS01</CompanyAuthenticationCode>");
      expect(read).toContain("<MadeUpDate>2026-11-20</MadeUpDate>");
    });

    test("refuses a class whose shares before the allotment differ from the register, naming the class and both figures", async () => {
      registerAnswer = companyDataAnswer([{ currency: "GBP", shares: [["Ordinary", "120", "120"]] }]);
      const response = await ingestHandler(buildEvent());
      expect(response.statusCode).toBe(400);
      expect(response.headers["Content-Type"]).toBe("application/json");
      expect(parseResponseBody(response)).toMatchObject({
        message:
          "Before the allotment the GBP Ordinary shares are 100 shares of aggregate nominal value 100 in this return, " +
          "and 120 shares of aggregate nominal value 120 on the Companies House register. If the return is for an allotment made before one the register already shows, confirm the capital and file again.",
        mismatches: [
          {
            currency: "GBP",
            shareClass: "Ordinary",
            stated: { numShares: "100", aggregateNominalValue: "100" },
            register: { numShares: "120", aggregateNominalValue: "120" },
          },
        ],
        reason: "capital-before-differs-from-register",
      });
      expect(mockBuildFormSubmission).not.toHaveBeenCalled();
      expect(mockAllocateSubmissionNumber).not.toHaveBeenCalled();
    });

    test("refuses a class the register holds that the return leaves out, and a currency the register does not hold", async () => {
      registerAnswer = companyDataAnswer([
        {
          currency: "GBP",
          shares: [
            ["Ordinary", "100", "100"],
            ["B Ordinary", "5", "5"],
          ],
        },
      ]);
      const left = await ingestHandler(buildEvent());
      expect(parseResponseBody(left).message).toContain(
        "the GBP B Ordinary shares are 0 shares of aggregate nominal value 0 in this return, and 5 shares of aggregate nominal value 5 on the Companies House register",
      );
      registerAnswer = companyDataAnswer([{ currency: "EUR", shares: [["Ordinary", "100", "100"]] }]);
      const other = await ingestHandler(buildEvent());
      expect(other.statusCode).toBe(400);
      expect(parseResponseBody(other).mismatches).toEqual([
        {
          currency: "EUR",
          shareClass: "Ordinary",
          stated: { numShares: "0", aggregateNominalValue: "0" },
          register: { numShares: "100", aggregateNominalValue: "100" },
        },
        {
          currency: "GBP",
          shareClass: "Ordinary",
          stated: { numShares: "100", aggregateNominalValue: "100" },
          register: { numShares: "0", aggregateNominalValue: "0" },
        },
      ]);
      expect(mockBuildFormSubmission).not.toHaveBeenCalled();
    });

    test("refuses a total unpaid before the allotment that differs from the register's", async () => {
      registerAnswer = companyDataAnswer([{ currency: "GBP", unpaid: "10", shares: [["Ordinary", "100", "100"]] }]);
      const response = await ingestHandler(buildEvent());
      expect(parseResponseBody(response).mismatches).toEqual([
        { currency: "GBP", totalAmountUnpaid: true, stated: { totalAmountUnpaid: "0" }, register: { totalAmountUnpaid: "10" } },
      ]);
      expect(parseResponseBody(response).message).toBe(
        "Before the allotment the total amount unpaid in GBP is 0 in this return, and 10 on the Companies House register. If the return is for an allotment made before one the register already shows, confirm the capital and file again.",
      );
    });

    test("files a new class onto a company the register holds no shares for, and a class named in other letter case", async () => {
      registerAnswer = companyDataAnswer([]);
      const newClass = { ...ORDINARY, numShares: "50", aggregateNominalValue: "50" };
      expect(
        (await ingestHandler(buildEvent({ body: buildFormBody({ statementOfCapital: [{ ...CAPITAL, shares: [newClass] }] }) }))).statusCode,
      ).toBe(201);
      registerAnswer = companyDataAnswer([{ currency: "GBP", shares: [["ORDINARY", "100", "100"]] }]);
      expect((await ingestHandler(buildEvent())).statusCode).toBe(201);
    });

    test("refuses shares before the allotment for a company the register holds no shares for", async () => {
      registerAnswer = companyDataAnswer([]);
      const refused = await ingestHandler(buildEvent());
      expect(refused.statusCode).toBe(400);
      expect(parseResponseBody(refused).message).toContain("on the Companies House register");
    });

    test("two currencies each agree with the register's capital in that currency", async () => {
      registerAnswer = companyDataAnswer([
        { currency: "GBP", shares: [["Ordinary", "100", "100"]] },
        { currency: "EUR", shares: [["Euro Ordinary", "10", "10"]] },
      ]);
      const euro = {
        currency: "EUR",
        totalAmountUnpaid: "0",
        shares: [{ ...ORDINARY, shareClass: "Euro Ordinary", numShares: "10", aggregateNominalValue: "10" }],
      };
      const response = await ingestHandler(buildEvent({ body: buildFormBody({ statementOfCapital: [CAPITAL, euro] }) }));
      expect(response.statusCode, JSON.stringify(parseResponseBody(response))).toBe(201);
    });

    test("three currencies each agree with the register, each class in its own currency, and an allotment in each files its totals per currency", async () => {
      registerAnswer = companyDataAnswer([
        { currency: "GBP", shares: [["Ordinary", "100", "100"]] },
        { currency: "EUR", unpaid: "5", shares: [["Ordinary", "10", "10"]] },
        { currency: "USD", shares: [["Ordinary", "0.5", "0.5"]] },
      ]);
      const allotments = [
        ALLOTMENT,
        { ...ALLOTMENT, currency: "EUR", numShares: "10", amountPaidPerShare: "1", amountUnpaidPerShare: "1", nominalValue: "2" },
        { ...ALLOTMENT, currency: "USD", numShares: "0.25", amountPaidPerShare: "1", nominalValue: "1" },
      ];
      const statementOfCapital = [
        CAPITAL,
        { currency: "EUR", totalAmountUnpaid: "15", shares: [{ ...ORDINARY, numShares: "20", aggregateNominalValue: "30" }] },
        { currency: "USD", totalAmountUnpaid: "0", shares: [{ ...ORDINARY, numShares: "0.75", aggregateNominalValue: "0.75" }] },
      ];
      const response = await ingestHandler(buildEvent({ body: buildFormBody({ allotments, statementOfCapital }) }));
      expect(response.statusCode, JSON.stringify(parseResponseBody(response))).toBe(201);
      const body = mockBuildFormSubmission.mock.calls.at(-1)[0].formXml ?? JSON.stringify(mockBuildFormSubmission.mock.calls.at(-1)[0]);
      for (const [currency, number, nominal, unpaid] of [
        ["GBP", "150", "150", "0"],
        ["EUR", "20", "30", "15"],
        ["USD", "0.75", "0.75", "0"],
      ]) {
        expect(body).toContain(
          `<TotalAmountUnpaid>${unpaid}</TotalAmountUnpaid><TotalNumberOfIssuedShares>${number}</TotalNumberOfIssuedShares>` +
            `<ShareCurrency>${currency}</ShareCurrency><TotalAggregateNominalValue>${nominal}</TotalAggregateNominalValue>`,
        );
      }
    });

    test("refuses a class the return puts in another currency than the register's, naming both currencies", async () => {
      registerAnswer = companyDataAnswer([{ currency: "GBP", shares: [["Ordinary", "100", "100"]] }]);
      const usd = { ...CAPITAL, currency: "USD" };
      const response = await ingestHandler(
        buildEvent({ body: buildFormBody({ allotments: [{ ...ALLOTMENT, currency: "USD" }], statementOfCapital: [usd] }) }),
      );
      expect(response.statusCode).toBe(400);
      expect(parseResponseBody(response).mismatches).toEqual([
        {
          currency: "GBP",
          shareClass: "Ordinary",
          stated: { numShares: "0", aggregateNominalValue: "0" },
          register: { numShares: "100", aggregateNominalValue: "100" },
        },
        {
          currency: "USD",
          shareClass: "Ordinary",
          stated: { numShares: "100", aggregateNominalValue: "100" },
          register: { numShares: "0", aggregateNominalValue: "0" },
        },
      ]);
    });

    test("files a return whose capital before differs from the register when the filer confirms it, as for an earlier allotment", async () => {
      registerAnswer = companyDataAnswer([{ currency: "GBP", shares: [["Ordinary", "120", "120"]] }]);
      const response = await ingestHandler(buildEvent({ body: buildFormBody({ capitalDifferenceConfirmed: true }) }));
      expect(response.statusCode, JSON.stringify(parseResponseBody(response))).toBe(201);
      expect(mockBuildFormSubmission).toHaveBeenCalledTimes(1);
      expect(mockBuildFormSubmission.mock.calls[0][0].formXml).not.toContain("capitalDifferenceConfirmed");
    });

    test("refuses a return whose confirmation is not true or false, and one confirmed false that differs", async () => {
      const notBoolean = await ingestHandler(buildEvent({ body: buildFormBody({ capitalDifferenceConfirmed: "yes" }) }));
      expect(notBoolean.statusCode).toBe(400);
      expect(parseResponseBody(notBoolean).message).toContain("Invalid capitalDifferenceConfirmed - must be true or false");
      registerAnswer = companyDataAnswer([{ currency: "GBP", shares: [["Ordinary", "120", "120"]] }]);
      const unconfirmed = await ingestHandler(buildEvent({ body: buildFormBody({ capitalDifferenceConfirmed: false }) }));
      expect(parseResponseBody(unconfirmed).reason).toBe("capital-before-differs-from-register");
      expect(mockBuildFormSubmission).not.toHaveBeenCalled();
    });

    test("answers the company authentication code's sentence when Companies House refuses the code, and sends nothing", async () => {
      registerErrors = [{ number: "9999", text: "Invalid CompanyAuthenticationCode" }];
      const response = await ingestHandler(buildEvent());
      expect(response.statusCode).toBe(400);
      expect(parseResponseBody(response).message).toBe(
        "Companies House does not accept this company authentication code. Check the 6 to 8 character code and enter it again.",
      );
      expect(mockBuildFormSubmission).not.toHaveBeenCalled();
    });

    test("answers a JSON 502 and sends nothing when the register's capital cannot be read", async () => {
      registerErrors = [{ number: "502", text: "Service unavailable" }];
      expect((await ingestHandler(buildEvent())).statusCode).toBe(502);
      registerErrors = [];
      mockPostToGateway.mockRejectedValueOnce(new Error("socket hang up"));
      const response = await ingestHandler(buildEvent());
      expect(response.statusCode).toBe(502);
      expect(parseResponseBody(response).message).toBe(
        "Companies House did not give the company's share capital, so the return was not sent",
      );
      expect(mockBuildFormSubmission).not.toHaveBeenCalled();
    });

    test("answers a JSON 429 and reads nothing when the account has used its share of the lookups", async () => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      mockSend.mockImplementation(async (cmd) => {
        if (cmd instanceof lib.QueryCommand) return { Items: [{ bundleId: "resident-pro", subscriptionStatus: "active" }], Count: 1 };
        if (cmd instanceof lib.UpdateCommand && String(cmd.input.TableName).includes("security-state"))
          return { Attributes: { hits: 151 } };
        return {};
      });
      const response = await ingestHandler(buildEvent());
      expect(response.statusCode).toBe(429);
      expect(mockPostToGateway).not.toHaveBeenCalled();
    });
  });

  test("a nominal value the schema takes is accepted, at eight significant digits and at a millionth", async () => {
    for (const [nominalValue, numShares] of [
      ["99999999", "1"],
      ["1234567.5", "2"],
      ["0.000001", "1000000"],
    ]) {
      const total = nominalValue === "99999999" ? "99999999" : nominalValue === "1234567.5" ? "2469135" : "1";
      registerAnswer = companyDataAnswer([]);
      const body = buildFormBody({
        allotments: [{ ...ALLOTMENT, nominalValue, numShares, amountPaidPerShare: nominalValue }],
        statementOfCapital: [{ ...CAPITAL, shares: [{ ...ORDINARY, numShares, aggregateNominalValue: total }] }],
      });
      mockBuildFormSubmission.mockClear();
      const response = await ingestHandler(buildEvent({ body }));
      expect(response.statusCode, JSON.stringify(parseResponseBody(response))).toBe(201);
      expect(await gatewayFormSchemaErrors(mockBuildFormSubmission.mock.calls[0][0].formXml, "ReturnofAllotmentShares-v3-0.xsd")).toEqual(
        [],
      );
    }
  });

  test("answers 500 in JSON and marks the filing failed when the gateway rejects the envelope", async () => {
    mockParseGatewayResponse.mockImplementation((data) =>
      data === registerAnswer ? { errors: [], statuses: [] } : { errors: [{ number: "604", text: "Invalid Request" }], statuses: [] },
    );
    const response = await ingestHandler(buildEvent());
    expect(response.statusCode).toBe(500);
    expect(parseResponseBody(response).message).toBe("Companies House rejected the return of allotment of shares submission envelope");
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
    expect(parseResponseBody(response)).toMatchObject({ code: "ACTIVITY_ENVIRONMENT_RESTRICTED", activityId: "allot-shares" });
    expect(mockPostToGateway).not.toHaveBeenCalled();
  });
});
