// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/routes/companies-house-xmlgw.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { createHash } from "crypto";
import express from "express";
import request from "supertest";
import { apiEndpoint, GATEWAY_PATH } from "@app/http-simulator/routes/companies-house-xmlgw.js";
import { resetAccountsFilings, SIMULATOR_PRESENTER_ID, SIMULATOR_PRESENTER_CODE } from "@app/http-simulator/scenarios/accounts-filing.js";
import { parseXmlDocument, firstElementText, allElements } from "@app/lib/xmlDom.js";

function md5Lowercase(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex").toLowerCase();
}

const VALID_SENDER_ID = md5Lowercase(SIMULATOR_PRESENTER_ID);
const VALID_AUTH_VALUE = md5Lowercase(SIMULATOR_PRESENTER_CODE);
const WRONG_HASH = md5Lowercase("not-the-right-credential");

function accountsEnvelope({ senderId = VALID_SENDER_ID, authValue = VALID_AUTH_VALUE, submissionNumber = "AAA001", companyNumber = "02706061" } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>Accounts</Class>
      <Qualifier>request</Qualifier>
      <TransactionID>1</TransactionID>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${senderId}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${authValue}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys/>
  </GovTalkDetails>
  <Body>
    <FormSubmission xmlns="http://xmlgw.companieshouse.gov.uk/Header">
      <FormHeader>
        <CompanyNumber>${companyNumber}</CompanyNumber>
        <CompanyName>TEST COMPANY LIMITED</CompanyName>
        <CompanyAuthenticationCode>ABC123</CompanyAuthenticationCode>
        <PackageReference></PackageReference>
        <FormIdentifier>Accounts</FormIdentifier>
        <SubmissionNumber>${submissionNumber}</SubmissionNumber>
      </FormHeader>
      <Authority>
        <Designation>DIR</Designation>
        <DateSigned>2026-06-30</DateSigned>
      </Authority>
      <Form>
      </Form>
      <Document>
        <Data>PGh0bWw+PC9odG1sPg==</Data>
        <Date>2026-06-30</Date>
        <Filename>Accounts.xml</Filename>
        <ContentType>application/xml</ContentType>
        <Category>ACCOUNTS</Category>
      </Document>
    </FormSubmission>
  </Body>
</GovTalkMessage>`;
}

function statusEnvelope({ senderId = VALID_SENDER_ID, authValue = VALID_AUTH_VALUE, submissionNumber = "AAA001" } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>GetSubmissionStatus</Class>
      <Qualifier>request</Qualifier>
      <TransactionID>2</TransactionID>
    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${senderId}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${authValue}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>
  <GovTalkDetails>
    <Keys/>
  </GovTalkDetails>
  <Body>
    <GetSubmissionStatus xmlns="http://xmlgw.companieshouse.gov.uk">
      <SubmissionNumber>${submissionNumber}</SubmissionNumber>
      <PresenterID>${SIMULATOR_PRESENTER_ID}</PresenterID>
    </GetSubmissionStatus>
  </Body>
</GovTalkMessage>`;
}

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));
  apiEndpoint(app);
  return app;
}

describe("http-simulator/routes/companies-house-xmlgw", () => {
  let app;

  beforeEach(() => {
    resetAccountsFilings();
    app = buildApp();
  });

  test("acknowledges a valid Accounts submission", async () => {
    const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(accountsEnvelope());

    expect(response.status).toBe(200);
    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Qualifier")).toBe("acknowledgement");
    expect(firstElementText(document, "GatewayTimestamp")).toBeTruthy();
    expect(allElements(document, "GovTalkErrors")).toHaveLength(0);
  });

  test("rejects an unknown SenderID with a 502 authorisation failure", async () => {
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ senderId: WRONG_HASH }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Number")).toBe("502");
    expect(firstElementText(document, "Type")).toBe("fatal");
  });

  test("rejects an unknown authentication Value with a 502 authorisation failure", async () => {
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ authValue: WRONG_HASH }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Number")).toBe("502");
  });

  test("rejects a submission with a SubmissionNumber shorter than 6 characters", async () => {
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "AB1" }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Number")).toBe("604");
  });

  test("rejects a SubmissionNumber that has already been used", async () => {
    await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(accountsEnvelope({ submissionNumber: "REUSE1" }));
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "REUSE1" }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Number")).toBe("604");
    expect(firstElementText(document, "Location")).toBe("SubmissionNumber");
  });

  test("rejects an Accounts submission missing a required FormHeader element", async () => {
    const missingCompanyName = accountsEnvelope().replace("<CompanyName>TEST COMPANY LIMITED</CompanyName>", "");
    const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(missingCompanyName);

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Number")).toBe("604");
    expect(firstElementText(document, "Location")).toBe("Body/FormSubmission/FormHeader/CompanyName");
  });

  test("polls PENDING on the first poll and ACCEPT afterwards", async () => {
    await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(accountsEnvelope({ submissionNumber: "POLL01" }));

    const firstPoll = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(statusEnvelope({ submissionNumber: "POLL01" }));
    const firstDocument = parseXmlDocument(firstPoll.text);
    expect(firstElementText(firstDocument, "StatusCode")).toBe("PENDING");

    const secondPoll = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(statusEnvelope({ submissionNumber: "POLL01" }));
    const secondDocument = parseXmlDocument(secondPoll.text);
    expect(firstElementText(secondDocument, "StatusCode")).toBe("ACCEPT");
  });

  test("Gov-Test-Scenario ACCOUNTS_REJECTED returns a reject with a RejectCode", async () => {
    await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(accountsEnvelope({ submissionNumber: "REJCT1" }));

    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .set("Gov-Test-Scenario", "ACCOUNTS_REJECTED")
      .send(statusEnvelope({ submissionNumber: "REJCT1" }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "StatusCode")).toBe("REJECT");
    expect(firstElementText(document, "RejectCode")).toBe("1");
  });

  test("Gov-Test-Scenario AUTH_FAILURE overrides valid credentials with a 502", async () => {
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .set("Gov-Test-Scenario", "AUTH_FAILURE")
      .send(accountsEnvelope({ submissionNumber: "AUTHFL" }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Number")).toBe("502");
  });

  test("Gov-Test-Scenario SCHEMA_FAILURE returns a parser error regardless of a valid body", async () => {
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .set("Gov-Test-Scenario", "SCHEMA_FAILURE")
      .send(accountsEnvelope({ submissionNumber: "SCHFL1" }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Number")).toBe("604");
  });

  test("Gov-Test-Scenario PENDING_FOREVER never advances past PENDING", async () => {
    await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(accountsEnvelope({ submissionNumber: "STUCK1" }));

    await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .set("Gov-Test-Scenario", "PENDING_FOREVER")
      .send(statusEnvelope({ submissionNumber: "STUCK1" }));
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .set("Gov-Test-Scenario", "PENDING_FOREVER")
      .send(statusEnvelope({ submissionNumber: "STUCK1" }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "StatusCode")).toBe("PENDING");
  });

  test("polling a submission number that was never submitted answers a business error", async () => {
    const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(statusEnvelope({ submissionNumber: "NEVER1" }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Text")).toBe("No Transaction Found");
  });
});
