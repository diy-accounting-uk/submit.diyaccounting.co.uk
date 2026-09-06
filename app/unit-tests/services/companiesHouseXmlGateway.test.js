// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/services/companiesHouseXmlGateway.test.js

import { describe, test, expect, beforeEach, vi } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import express from "express";
import request from "supertest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { setupTestEnv, setupFetchMock } from "@app/test-helpers/mockHelpers.js";
import { parseXmlDocument, firstElementText, firstElement } from "@app/lib/xmlDom.js";
import { apiEndpoint as companiesHouseXmlGatewayEndpoint, GATEWAY_PATH } from "@app/http-simulator/routes/companies-house-xmlgw.js";
import {
  resetAccountsFilings,
  SIMULATOR_PRESENTER_ID as SIMULATOR_TEST_PRESENTER_ID,
  SIMULATOR_PRESENTER_CODE as SIMULATOR_TEST_PRESENTER_CODE,
} from "@app/http-simulator/scenarios/accounts-filing.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const mockSecretsManagerSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send(...args) {
      return mockSecretsManagerSend(...args);
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

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

const {
  hashPresenterCredential,
  buildAccountsSubmission,
  buildStatusRequest,
  parseGatewayResponse,
  allocateSubmissionNumber,
  postToGateway,
  getXmlGatewayUri,
  resolvePresenterCredentials,
} = await import("@app/services/companiesHouseXmlGateway.js");

const GET_SUBMISSION_STATUS_RESPONSE_FIXTURE = readFileSync(
  new URL("../../../fixtures/companies-house-xmlgw/GetSubmissionStatus_response.xml", import.meta.url),
  "utf8",
);
const GET_SUBMISSION_STATUS_REQUEST_FIXTURE = readFileSync(
  new URL("../../../fixtures/companies-house-xmlgw/GetSubmissionStatus_request.xml", import.meta.url),
  "utf8",
);

let mockFetch;

describe("services/companiesHouseXmlGateway", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    mockSecretsManagerSend.mockReset();
    mockDynamoSend.mockReset();
    delete process.env.COMPANIES_HOUSE_PRESENTER_ID;
    delete process.env.COMPANIES_HOUSE_PRESENTER_ID_ARN;
    delete process.env.COMPANIES_HOUSE_PRESENTER_CODE;
    delete process.env.COMPANIES_HOUSE_PRESENTER_CODE_ARN;
    delete process.env.COMPANIES_HOUSE_XML_GATEWAY_URI;
    delete process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  });

  describe("hashPresenterCredential", () => {
    test("is the lowercase MD5 hex digest of the value", () => {
      const expected = createHash("md5").update("SimTest1", "utf8").digest("hex").toLowerCase();
      expect(hashPresenterCredential("SimTest1")).toBe(expected);
    });

    test("hashes first, then lowercases: an uppercase-hash-looking input still hashes", () => {
      expect(hashPresenterCredential("ABC")).not.toBe("abc");
      expect(hashPresenterCredential("ABC")).toMatch(/^[0-9a-f]{32}$/);
    });
  });

  describe("buildAccountsSubmission", () => {
    const baseInput = {
      presenterId: "12345678901",
      presenterCode: "SimTest1",
      companyNumber: "02706061",
      companyName: "TEST COMPANY LIMITED",
      companyAuthenticationCode: "ABC123",
      submissionNumber: "AAA001",
      dateSigned: "2026-06-30",
      ixbrl: "<html>accounts</html>",
      transactionId: "1700000000000",
    };

    test("matches the shape of the published Accounts.xml example", () => {
      const xml = buildAccountsSubmission(baseInput);
      const document = parseXmlDocument(xml);

      expect(firstElementText(document, "Class")).toBe("Accounts");
      expect(firstElementText(document, "Qualifier")).toBe("request");
      expect(firstElementText(document, "CompanyNumber")).toBe("02706061");
      expect(firstElementText(document, "CompanyName")).toBe("TEST COMPANY LIMITED");
      expect(firstElementText(document, "FormIdentifier")).toBe("Accounts");
      expect(firstElementText(document, "SubmissionNumber")).toBe("AAA001");
      expect(firstElementText(document, "Designation")).toBe("DIR");
      expect(firstElementText(document, "DateSigned")).toBe("2026-06-30");
      expect(firstElementText(document, "ContentType")).toBe("application/xml");
      expect(firstElementText(document, "Category")).toBe("ACCOUNTS");
    });

    test("base64-encodes the iXBRL document into Document/Data", () => {
      const xml = buildAccountsSubmission(baseInput);
      const document = parseXmlDocument(xml);
      const data = firstElementText(document, "Data");
      expect(Buffer.from(data, "base64").toString("utf8")).toBe(baseInput.ixbrl);
    });

    test("hashes the presenter id and code into SenderID and Authentication/Value", () => {
      const xml = buildAccountsSubmission(baseInput);
      const document = parseXmlDocument(xml);
      expect(firstElementText(document, "SenderID")).toBe(hashPresenterCredential(baseInput.presenterId));
      expect(firstElementText(document, "Value")).toBe(hashPresenterCredential(baseInput.presenterCode));
    });

    test("adds GatewayTest when gatewayTest is true", () => {
      const xml = buildAccountsSubmission({ ...baseInput, gatewayTest: true });
      expect(xml).toContain("<GatewayTest>1</GatewayTest>");
      expect(buildAccountsSubmission(baseInput)).not.toContain("<GatewayTest>");
    });

    test("the first line is the XML declaration", () => {
      const xml = buildAccountsSubmission(baseInput);
      expect(xml.split("\n")[0]).toBe('<?xml version="1.0" encoding="UTF-8"?>');
    });
  });

  describe("buildStatusRequest", () => {
    const baseInput = { presenterId: "12345678901", presenterCode: "SimTest1", submissionNumber: "AAA001", transactionId: "2" };

    test("matches the shape of the published GetSubmissionStatus request example", () => {
      const xml = buildStatusRequest(baseInput);
      const document = parseXmlDocument(xml);
      const exampleDocument = parseXmlDocument(GET_SUBMISSION_STATUS_REQUEST_FIXTURE);

      expect(firstElementText(document, "Class")).toBe(firstElementText(exampleDocument, "Class"));
      expect(firstElement(document, "GetSubmissionStatus")).toBeTruthy();
      expect(firstElement(exampleDocument, "GetSubmissionStatus")).toBeTruthy();
      expect(firstElementText(document, "PresenterID")).toBe(baseInput.presenterId);
    });

    test("carries SubmissionNumber when given one", () => {
      const xml = buildStatusRequest(baseInput);
      expect(firstElementText(parseXmlDocument(xml), "SubmissionNumber")).toBe("AAA001");
    });

    test("carries CompanyNumber instead when no submissionNumber is given", () => {
      const xml = buildStatusRequest({ ...baseInput, submissionNumber: undefined, companyNumber: "02706061" });
      const document = parseXmlDocument(xml);
      expect(firstElementText(document, "CompanyNumber")).toBe("02706061");
      expect(document.getElementsByTagName("SubmissionNumber")).toHaveLength(0);
    });
  });

  describe("parseGatewayResponse", () => {
    test("parses the published GetSubmissionStatus response example into a statuses array", () => {
      const result = parseGatewayResponse(GET_SUBMISSION_STATUS_RESPONSE_FIXTURE);
      expect(result.statuses.length).toBe(21);
      expect(result.statuses[0]).toMatchObject({ submissionNumber: "dp2872", statusCode: "REJECT", companyNumber: "05120000" });
      expect(result.statuses[0].rejections[0]).toMatchObject({ rejectCode: "1", description: "Random Test mode rejection", instanceNumber: "1" });
    });

    test("parses a GovTalkErrors block into the errors array", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <Header><MessageDetails><Class>Accounts</Class><Qualifier>error</Qualifier><TransactionID>1</TransactionID></MessageDetails></Header>
  <GovTalkDetails><GovTalkErrors><Error><RaisedBy>Gateway</RaisedBy><Number>502</Number><Type>fatal</Type><Text>Authorisation Failure</Text></Error></GovTalkErrors></GovTalkDetails>
  <Body></Body>
</GovTalkMessage>`;
      const result = parseGatewayResponse(xml);
      expect(result.qualifier).toBe("error");
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0]).toMatchObject({ raisedBy: "Gateway", number: 502, type: "fatal", text: "Authorisation Failure" });
    });

    test("reads GatewayTimestamp and the ResponseEndPoint PollInterval from an acknowledgement", () => {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <Header><MessageDetails><Class>Accounts</Class><Qualifier>acknowledgement</Qualifier><TransactionID>1</TransactionID><ResponseEndPoint PollInterval="1">https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway</ResponseEndPoint><GatewayTimestamp>2026-09-01T10:00:00Z</GatewayTimestamp></MessageDetails></Header>
  <GovTalkDetails><Keys/></GovTalkDetails>
  <Body></Body>
</GovTalkMessage>`;
      const result = parseGatewayResponse(xml);
      expect(result.qualifier).toBe("acknowledgement");
      expect(result.gatewayTimestamp).toBe("2026-09-01T10:00:00Z");
      expect(result.pollInterval).toBe(1);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe("allocateSubmissionNumber", () => {
    test("throws when the async requests table name is not configured", async () => {
      await expect(allocateSubmissionNumber()).rejects.toThrow(
        "Missing required environment variable COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME",
      );
    });

    test("returns the new counter value as base36, uppercase, zero-padded to 6 characters", async () => {
      process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME = "test-accounts-async-requests-table";
      mockDynamoSend.mockResolvedValue({ Attributes: { value: 46656 } }); // 46656 = 36^3, "1000" in base36

      const submissionNumber = await allocateSubmissionNumber();

      expect(submissionNumber).toBe("001000");
      expect(mockDynamoSend).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            TableName: "test-accounts-async-requests-table",
            UpdateExpression: "ADD #value :increment",
          }),
        }),
      );
    });
  });

  describe("getXmlGatewayUri / postToGateway", () => {
    test("defaults to the real Companies House gateway URL", () => {
      expect(getXmlGatewayUri()).toBe("https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway");
    });

    test("is overridable by COMPANIES_HOUSE_XML_GATEWAY_URI", () => {
      process.env.COMPANIES_HOUSE_XML_GATEWAY_URI = "http://localhost:9000/v1-0/xmlgw/Gateway";
      expect(getXmlGatewayUri()).toBe("http://localhost:9000/v1-0/xmlgw/Gateway");
    });

    test("POSTs the envelope as text/xml and returns the raw text response", async () => {
      process.env.COMPANIES_HOUSE_XML_GATEWAY_URI = "http://localhost:9000/v1-0/xmlgw/Gateway";
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        text: () => Promise.resolve("<GovTalkMessage></GovTalkMessage>"),
        headers: { forEach: () => {} },
      });

      const result = await postToGateway("<GovTalkMessage>request</GovTalkMessage>");

      expect(result.status).toBe(200);
      expect(result.data).toBe("<GovTalkMessage></GovTalkMessage>");
      const [requestedUrl, requestInit] = mockFetch.mock.calls[0];
      expect(requestedUrl).toBe("http://localhost:9000/v1-0/xmlgw/Gateway");
      expect(requestInit.method).toBe("POST");
      expect(requestInit.headers["Content-Type"]).toBe("text/xml");
      expect(requestInit.body).toBe("<GovTalkMessage>request</GovTalkMessage>");
    });
  });

  describe("resolvePresenterCredentials", () => {
    test("prefers the environment variables over Secrets Manager", async () => {
      process.env.COMPANIES_HOUSE_PRESENTER_ID = "env-presenter-id";
      process.env.COMPANIES_HOUSE_PRESENTER_CODE = "env-presenter-code";

      const credentials = await resolvePresenterCredentials();

      expect(credentials).toEqual({ presenterId: "env-presenter-id", presenterCode: "env-presenter-code" });
      expect(mockSecretsManagerSend).not.toHaveBeenCalled();
    });

    test("throws naming both the plain and ARN variables when neither is configured", async () => {
      await expect(resolvePresenterCredentials()).rejects.toThrow(
        "Missing required environment variable COMPANIES_HOUSE_PRESENTER_ID or COMPANIES_HOUSE_PRESENTER_ID_ARN",
      );
    });

    test("reads from Secrets Manager when only the ARN is set", async () => {
      process.env.COMPANIES_HOUSE_PRESENTER_ID_ARN = "arn:aws:secretsmanager:eu-west-2:123456789012:secret:test/companies-house/presenter_id";
      process.env.COMPANIES_HOUSE_PRESENTER_CODE_ARN = "arn:aws:secretsmanager:eu-west-2:123456789012:secret:test/companies-house/presenter_code";
      mockSecretsManagerSend.mockResolvedValueOnce({ SecretString: "secrets-manager-presenter-id" });
      mockSecretsManagerSend.mockResolvedValueOnce({ SecretString: "secrets-manager-presenter-code" });

      const credentials = await resolvePresenterCredentials();

      expect(credentials).toEqual({ presenterId: "secrets-manager-presenter-id", presenterCode: "secrets-manager-presenter-code" });
      expect(mockSecretsManagerSend).toHaveBeenCalledTimes(2);
    });
  });

  describe("interoperates with the http-simulator", () => {
    function buildSimulatorApp() {
      const app = express();
      app.use(express.json());
      app.use(express.urlencoded({ extended: true }));
      companiesHouseXmlGatewayEndpoint(app);
      return app;
    }

    let simulatorApp;

    beforeEach(() => {
      resetAccountsFilings();
      simulatorApp = buildSimulatorApp();
    });

    test("an envelope built by buildAccountsSubmission is acknowledged by the simulator, and the poll it triggers is accepted", async () => {
      const submission = buildAccountsSubmission({
        presenterId: SIMULATOR_TEST_PRESENTER_ID,
        presenterCode: SIMULATOR_TEST_PRESENTER_CODE,
        companyNumber: "02706061",
        companyName: "TEST COMPANY LIMITED",
        companyAuthenticationCode: "ABC123",
        submissionNumber: "GWY001",
        dateSigned: "2026-06-30",
        ixbrl: "<html>accounts</html>",
      });

      const submitResponse = await request(simulatorApp).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(submission);
      const submitResult = parseGatewayResponse(submitResponse.text);
      expect(submitResult.qualifier).toBe("acknowledgement");
      expect(submitResult.errors).toHaveLength(0);

      const pollRequest = buildStatusRequest({
        presenterId: SIMULATOR_TEST_PRESENTER_ID,
        presenterCode: SIMULATOR_TEST_PRESENTER_CODE,
        submissionNumber: "GWY001",
      });

      const firstPollResponse = await request(simulatorApp).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(pollRequest);
      expect(parseGatewayResponse(firstPollResponse.text).statuses[0]).toMatchObject({ statusCode: "PENDING", submissionNumber: "GWY001" });

      const secondPollResponse = await request(simulatorApp).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(pollRequest);
      expect(parseGatewayResponse(secondPollResponse.text).statuses[0]).toMatchObject({ statusCode: "ACCEPT", submissionNumber: "GWY001" });
    });

    test("an envelope built with the wrong presenter code is rejected by the simulator with a 502", async () => {
      const submission = buildAccountsSubmission({
        presenterId: SIMULATOR_TEST_PRESENTER_ID,
        presenterCode: "not-the-right-code",
        companyNumber: "02706061",
        companyName: "TEST COMPANY LIMITED",
        companyAuthenticationCode: "ABC123",
        submissionNumber: "GWY002",
        dateSigned: "2026-06-30",
        ixbrl: "<html>accounts</html>",
      });

      const response = await request(simulatorApp).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(submission);
      const result = parseGatewayResponse(response.text);
      expect(result.errors[0]).toMatchObject({ number: 502, type: "fatal" });
    });
  });
});
