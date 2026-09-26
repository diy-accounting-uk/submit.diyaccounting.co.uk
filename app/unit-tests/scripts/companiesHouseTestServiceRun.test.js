// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/companiesHouseTestServiceRun.test.js

import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, test, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from "vitest";

// allocateSubmissionNumber()'s only external dependency is this DynamoDB client, so mocking it
// (the same way app/unit-tests/services/companiesHouseXmlGateway.test.js does) exercises the
// real allocateSubmissionNumber, buildConfirmationStatementBody, buildConfirmationStatementSubmission
// and postToGateway logic against a real HTTP listener (the simulator), without a real table.
const mockDynamoSend = vi.fn();
const dynamoDbModule = {
  UpdateCommand: class UpdateCommand {
    constructor(params) {
      this.params = params;
    }
  },
};
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (commandBuilder) => mockDynamoSend(commandBuilder(dynamoDbModule)),
}));

import {
  decideSyncOutcome,
  decidePollStep,
  nextPollDelayMs,
  evaluateOutcome,
  blankFirstDirectorPersonalCode,
  runCases,
} from "../../../scripts/companies-house-test-service-run.js";
import { parseGatewayResponse, hashPresenterCredential } from "../../../app/services/companiesHouseXmlGateway.js";
import { startSimulator } from "../../http-simulator/index.js";
import {
  resetConfirmationStatementFilings,
  FIXTURE_COMPANY_NUMBER,
  FIXTURE_COMPANY_AUTHENTICATION_CODE,
} from "../../http-simulator/scenarios/confirmation-statement.js";
import { SIMULATOR_PRESENTER_ID, SIMULATOR_PRESENTER_CODE, resetAccountsFilings } from "../../http-simulator/scenarios/accounts-filing.js";

describe("decideSyncOutcome", () => {
  test("OK when the parsed response carries no envelope errors", () => {
    expect(decideSyncOutcome({ errors: [] })).toEqual({ status: "OK" });
  });

  test("GOVTALK_ERROR when the parsed response carries a GovTalkErrors block", () => {
    const errors = [{ raisedBy: "Gateway", number: 604, type: "fatal", text: "Invalid Request" }];
    expect(decideSyncOutcome({ errors })).toEqual({ status: "GOVTALK_ERROR", errors });
  });
});

describe("decidePollStep", () => {
  test("GOVTALK_ERROR is terminal even without any status entries - the real test service's own 9999 shape", () => {
    const errors = [{ raisedBy: "GetSubmissionStatus", number: 9999, type: "fatal", text: "No presenter ID supplied" }];
    expect(decidePollStep({ errors, statuses: [] }, "ab12cd")).toEqual({ terminal: true, status: "GOVTALK_ERROR", errors });
  });

  test("ACCEPT is terminal", () => {
    const statuses = [{ submissionNumber: "ab12cd", statusCode: "ACCEPT", rejections: [] }];
    expect(decidePollStep({ errors: [], statuses }, "ab12cd")).toEqual({ terminal: true, status: "ACCEPT", rejections: [] });
  });

  test("REJECT is terminal and carries the reject codes", () => {
    const rejections = [{ rejectCode: "12604", description: "does not match any active director", instanceNumber: "1" }];
    const statuses = [{ submissionNumber: "ab12cd", statusCode: "REJECT", rejections }];
    expect(decidePollStep({ errors: [], statuses }, "ab12cd")).toEqual({ terminal: true, status: "REJECT", rejections });
  });

  test("PENDING is not terminal", () => {
    const statuses = [{ submissionNumber: "ab12cd", statusCode: "PENDING", rejections: [] }];
    expect(decidePollStep({ errors: [], statuses }, "ab12cd")).toEqual({ terminal: false, status: "PENDING", rejections: [] });
  });

  test("no matching status at all is terminal as NO_STATUS", () => {
    expect(decidePollStep({ errors: [], statuses: [] }, "ab12cd")).toEqual({ terminal: true, status: "NO_STATUS" });
  });
});

describe("nextPollDelayMs", () => {
  test("uses the gateway's announced PollInterval, in milliseconds", () => {
    expect(nextPollDelayMs({ pollInterval: 5 }, 2000)).toBe(5000);
  });

  test("clamps a PollInterval below the floor up to the minimum", () => {
    expect(nextPollDelayMs({ pollInterval: 0.001 }, 2000)).toBeGreaterThanOrEqual(1000);
  });

  test("clamps a very large PollInterval down to the ceiling", () => {
    expect(nextPollDelayMs({ pollInterval: 3600 }, 2000)).toBe(30000);
  });

  test("falls back to the previous delay when no PollInterval is announced", () => {
    expect(nextPollDelayMs({}, 7000)).toBe(7000);
  });

  test("falls back to the default when neither is available", () => {
    expect(nextPollDelayMs({}, undefined)).toBe(2000);
  });
});

describe("evaluateOutcome", () => {
  test("passes when the observed status matches the expected one", () => {
    expect(evaluateOutcome({ status: "ACCEPT" }, "ACCEPT")).toBe(true);
  });

  test("fails when they differ", () => {
    expect(evaluateOutcome({ status: "ACCEPT" }, "REJECT")).toBe(false);
  });
});

describe("blankFirstDirectorPersonalCode", () => {
  test("blanks the first CompaniesHousePersonalCode, leaving the element in place", () => {
    const xml =
      "<Director><VerificationDetails><CompaniesHousePersonalCode>12345678951</CompaniesHousePersonalCode></VerificationDetails></Director>";
    expect(blankFirstDirectorPersonalCode(xml)).toBe(
      "<Director><VerificationDetails><CompaniesHousePersonalCode></CompaniesHousePersonalCode></VerificationDetails></Director>",
    );
  });

  test("only blanks the first occurrence, for a statement with several directors", () => {
    const xml =
      "<CompaniesHousePersonalCode>11111111111</CompaniesHousePersonalCode><CompaniesHousePersonalCode>22222222222</CompaniesHousePersonalCode>";
    const blanked = blankFirstDirectorPersonalCode(xml);
    expect(blanked).toBe(
      "<CompaniesHousePersonalCode></CompaniesHousePersonalCode><CompaniesHousePersonalCode>22222222222</CompaniesHousePersonalCode>",
    );
  });
});

describe("runCases against the Companies House XML Gateway simulator", () => {
  let simulator;
  let outDir;
  let submissionNumberCounter;
  const fastSleep = () => Promise.resolve();

  beforeAll(async () => {
    simulator = await startSimulator({ port: 0 });
    process.env.COMPANIES_HOUSE_XMLGW_URI = `${simulator.baseUrl}/v1-0/xmlgw/Gateway`;
    process.env.COMPANIES_HOUSE_PRESENTER_ID = SIMULATOR_PRESENTER_ID;
    process.env.COMPANIES_HOUSE_PRESENTER_CODE = SIMULATOR_PRESENTER_CODE;
  });

  afterAll(async () => {
    if (simulator) await simulator.stop();
    delete process.env.COMPANIES_HOUSE_XMLGW_URI;
    delete process.env.COMPANIES_HOUSE_PRESENTER_ID;
    delete process.env.COMPANIES_HOUSE_PRESENTER_CODE;
  });

  beforeEach(() => {
    resetConfirmationStatementFilings();
    resetAccountsFilings();
    outDir = mkdtempSync(join(tmpdir(), "companies-house-test-service-run-"));
    submissionNumberCounter = 0;
    mockDynamoSend.mockImplementation(() => Promise.resolve({ Attributes: { value: (submissionNumberCounter += 1) } }));
  });

  afterEach(() => {
    rmSync(outDir, { recursive: true, force: true });
    mockDynamoSend.mockReset();
  });

  const baseCase = (overrides) => ({
    name: "case",
    type: "confirmationStatement",
    companyNumber: FIXTURE_COMPANY_NUMBER,
    companyName: "EXAMPLE CONFIRMATION STATEMENT LIMITED",
    companyAuthenticationCode: FIXTURE_COMPANY_AUTHENTICATION_CODE,
    statement: {
      reviewDate: "2025-09-21",
      directors: [{ forename: "Alice", otherForenames: "Alice", surname: "Example", dob: "1970-01-01", personalCode: "12345678951" }],
    },
    ...overrides,
  });

  test("polls a no-change confirmation statement through PENDING to ACCEPT, honouring the announced PollInterval", async () => {
    const cases = [baseCase({ name: "accept-case", expectedOutcome: { status: "ACCEPT", pinned: true } })];

    const { entries, allPass } = await runCases(cases, outDir, { sleepFn: fastSleep });

    expect(entries).toHaveLength(1);
    expect(entries[0].observedStatus).toBe("ACCEPT");
    expect(entries[0].pass).toBe(true);
    expect(allPass).toBe(true);
    // At least one poll happened beyond the submit call.
    expect(entries[0].exchanges.length).toBeGreaterThanOrEqual(2);
    expect(entries[0].exchanges.some((exchange) => exchange.label.startsWith("poll-"))).toBe(true);
  });

  test("polls to REJECT when the gateway answers a Status with rejections", async () => {
    const cases = [
      baseCase({
        name: "reject-case",
        govTestScenario: "CS_SHAREHOLDERS_REQUIRED",
        expectedOutcome: { status: "REJECT", pinned: true },
      }),
    ];

    const { entries } = await runCases(cases, outDir, { sleepFn: fastSleep });

    expect(entries[0].observedStatus).toBe("REJECT");
    expect(entries[0].rejections).toEqual([
      {
        rejectCode: "11686",
        description: "You must provide the name of each shareholder who held shares at the confirmation date",
        instanceNumber: "1",
      },
    ]);
    expect(entries[0].pass).toBe(true);
  });

  // The simulator's AUTH_FAILURE scenario rejects at submit time (its own submitConfirmationStatement
  // checks the same scenario the real test service's presenter-authentication bug fails at poll
  // time) - this proves the same GovTalkErrors-is-not-a-crash handling end to end over real HTTP.
  // decidePollStep's own unit tests above cover the poll-time 9999 shape directly.
  test("records a GovTalkErrors response as the case's observed outcome instead of throwing", async () => {
    const cases = [
      baseCase({
        name: "govtalk-error-case",
        govTestScenario: "AUTH_FAILURE",
        expectedOutcome: { status: "GOVTALK_ERROR", pinned: false },
      }),
    ];

    const { entries, allPass } = await runCases(cases, outDir, { sleepFn: fastSleep });

    expect(entries[0].observedStatus).toBe("GOVTALK_ERROR");
    expect(entries[0].errors[0].number).toBe(502);
    expect(entries[0].pass).toBe(true);
    expect(allPass).toBe(true);
  });

  test("fails the case when the observed outcome does not match the fixture's expectation", async () => {
    const cases = [baseCase({ name: "mismatch-case", expectedOutcome: { status: "REJECT", pinned: true } })];

    const { entries, allPass } = await runCases(cases, outDir, { sleepFn: fastSleep });

    expect(entries[0].observedStatus).toBe("ACCEPT");
    expect(entries[0].pass).toBe(false);
    expect(allPass).toBe(false);
  });

  test("writes an evidence log with redacted exchanges - the presenter credentials never appear in the clear", async () => {
    const cases = [baseCase({ name: "redaction-case", expectedOutcome: { status: "ACCEPT", pinned: true } })];

    await runCases(cases, outDir, { sleepFn: fastSleep });

    const evidenceLog = readFileSync(join(outDir, "evidence-log.json"), "utf8");
    expect(evidenceLog).not.toContain(SIMULATOR_PRESENTER_ID);
    expect(evidenceLog).not.toContain(hashPresenterCredential(SIMULATOR_PRESENTER_ID));
    expect(evidenceLog).not.toContain(hashPresenterCredential(SIMULATOR_PRESENTER_CODE));
    const parsed = JSON.parse(evidenceLog);
    expect(parsed[0].exchanges.length).toBeGreaterThan(0);

    const summary = readFileSync(join(outDir, "summary.md"), "utf8");
    expect(summary).toContain("redaction-case");
  });

  test("a synchronous CompanyDataRequest case is answered without polling", async () => {
    const cases = [
      {
        name: "company-data-case",
        type: "companyDataRequest",
        companyNumber: FIXTURE_COMPANY_NUMBER,
        companyAuthenticationCode: FIXTURE_COMPANY_AUTHENTICATION_CODE,
        madeUpDate: "2025-09-21",
        expectedOutcome: { status: "OK", pinned: true },
      },
    ];

    const { entries } = await runCases(cases, outDir, { sleepFn: fastSleep });

    expect(entries[0].observedStatus).toBe("OK");
    expect(entries[0].exchanges).toHaveLength(1);
    expect(parseGatewayResponse(entries[0].exchanges[0].responseXml).errors).toEqual([]);
  });

  test("running a single named case with --case only runs that one", async () => {
    const cases = [
      baseCase({ name: "first-case", expectedOutcome: { status: "ACCEPT", pinned: true } }),
      baseCase({ name: "second-case", expectedOutcome: { status: "ACCEPT", pinned: true } }),
    ];

    const { entries } = await runCases(cases, outDir, { caseName: "second-case", sleepFn: fastSleep });

    expect(entries).toHaveLength(1);
    expect(entries[0].case).toBe("second-case");
  });
});
