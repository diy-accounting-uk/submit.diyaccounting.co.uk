// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/routes/companies-house-xmlgw.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { createHash } from "crypto";
import express from "express";
import request from "supertest";
import { apiEndpoint, GATEWAY_PATH } from "@app/http-simulator/routes/companies-house-xmlgw.js";
import { resetAccountsFilings, SIMULATOR_PRESENTER_ID, SIMULATOR_PRESENTER_CODE } from "@app/http-simulator/scenarios/accounts-filing.js";
import {
  resetConfirmationStatementFilings,
  FIXTURE_COMPANY_NUMBER,
  FIXTURE_COMPANY_AUTHENTICATION_CODE,
} from "@app/http-simulator/scenarios/confirmation-statement.js";
import { resetPscVerificationStatementFilings } from "@app/http-simulator/scenarios/psc-verification-statement.js";
import { parseXmlDocument, firstElementText, allElements } from "@app/lib/xmlDom.js";

function md5Lowercase(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex").toLowerCase();
}

const VALID_SENDER_ID = md5Lowercase(SIMULATOR_PRESENTER_ID);
const VALID_AUTH_VALUE = md5Lowercase(SIMULATOR_PRESENTER_CODE);
const WRONG_HASH = md5Lowercase("not-the-right-credential");

function accountsEnvelope({
  senderId = VALID_SENDER_ID,
  authValue = VALID_AUTH_VALUE,
  submissionNumber = "AAA001",
  companyNumber = "02706061",
} = {}) {
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
      <DateSigned>2026-06-30</DateSigned>
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

function confirmationStatementEnvelope({
  senderId = VALID_SENDER_ID,
  authValue = VALID_AUTH_VALUE,
  submissionNumber = "CS0001",
  companyNumber = FIXTURE_COMPANY_NUMBER,
  formIdentifier = "ConfirmationAndVerificationStatement",
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>${formIdentifier}</Class>
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
        <CompanyName>EXAMPLE CONFIRMATION STATEMENT LIMITED</CompanyName>
        <CompanyAuthenticationCode>${FIXTURE_COMPANY_AUTHENTICATION_CODE}</CompanyAuthenticationCode>
        <PackageReference></PackageReference>
        <FormIdentifier>${formIdentifier}</FormIdentifier>
        <SubmissionNumber>${submissionNumber}</SubmissionNumber>
      </FormHeader>
      <DateSigned>2026-09-22</DateSigned>
      <Form>
      <${formIdentifier} xmlns="http://xmlgw.companieshouse.gov.uk">
        <ReviewDate>2026-09-21</ReviewDate>
        <AcceptLawfulPurposeStatement>true</AcceptLawfulPurposeStatement>
        <StateConfirmation>true</StateConfirmation>
      </${formIdentifier}>
      </Form>
    </FormSubmission>
  </Body>
</GovTalkMessage>`;
}

function pscVerificationStatementEnvelope({
  senderId = VALID_SENDER_ID,
  authValue = VALID_AUTH_VALUE,
  submissionNumber = "VS0001",
  companyNumber = FIXTURE_COMPANY_NUMBER,
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>PSCVerificationStatement</Class>
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
        <CompanyName>EXAMPLE CONFIRMATION STATEMENT LIMITED</CompanyName>
        <CompanyAuthenticationCode>${FIXTURE_COMPANY_AUTHENTICATION_CODE}</CompanyAuthenticationCode>
        <PackageReference></PackageReference>
        <FormIdentifier>PSCVerificationStatement</FormIdentifier>
        <SubmissionNumber>${submissionNumber}</SubmissionNumber>
      </FormHeader>
      <DateSigned>2026-09-22</DateSigned>
      <Form>
      <PSCVerificationStatement xmlns="http://xmlgw.companieshouse.gov.uk">
        <Individual>
          <Surname>EXAMPLE</Surname>
          <Change>
            <VerificationDetails>
              <CompaniesHousePersonalCode>AB1234CD56E</CompaniesHousePersonalCode>
              <VerificationStatements><VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual></VerificationStatements>
            </VerificationDetails>
          </Change>
        </Individual>
      </PSCVerificationStatement>
      </Form>
    </FormSubmission>
  </Body>
</GovTalkMessage>`;
}

function companyDataRequestEnvelope({
  senderId = VALID_SENDER_ID,
  authValue = VALID_AUTH_VALUE,
  companyNumber = FIXTURE_COMPANY_NUMBER,
  companyAuthenticationCode = FIXTURE_COMPANY_AUTHENTICATION_CODE,
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>CompanyDataRequest</Class>
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
    <CompanyDataRequest xmlns="http://xmlgw.companieshouse.gov.uk">
      <CompanyNumber>${companyNumber}</CompanyNumber>
      <CompanyAuthenticationCode>${companyAuthenticationCode}</CompanyAuthenticationCode>
      <MadeUpDate>2026-09-21</MadeUpDate>
    </CompanyDataRequest>
  </Body>
</GovTalkMessage>`;
}

function paymentPeriodsRequestEnvelope({
  senderId = VALID_SENDER_ID,
  authValue = VALID_AUTH_VALUE,
  companyNumber = FIXTURE_COMPANY_NUMBER,
  companyAuthenticationCode = FIXTURE_COMPANY_AUTHENTICATION_CODE,
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>PaymentPeriodsRequest</Class>
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
    <PaymentPeriodsRequest xmlns="http://xmlgw.companieshouse.gov.uk">
      <CompanyNumber>${companyNumber}</CompanyNumber>
      <CompanyAuthenticationCode>${companyAuthenticationCode}</CompanyAuthenticationCode>
    </PaymentPeriodsRequest>
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
    resetConfirmationStatementFilings();
    resetPscVerificationStatementFilings();
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
    await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "REUSE1" }));
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

  test("rejects an Accounts submission that wraps DateSigned in an Authority element", async () => {
    const withAuthority = accountsEnvelope().replace(
      "<DateSigned>2026-06-30</DateSigned>",
      "<Authority><Designation>DIR</Designation><DateSigned>2026-06-30</DateSigned></Authority>",
    );
    const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(withAuthority);

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Number")).toBe("9999");
    expect(firstElementText(document, "RaisedBy")).toBe("Accounts");
    expect(firstElementText(document, "Text")).toContain("No element 'Authority'");
  });

  test("polls PENDING on the first poll and ACCEPT afterwards", async () => {
    await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "POLL01" }));

    const firstPoll = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(statusEnvelope({ submissionNumber: "POLL01" }));
    const firstDocument = parseXmlDocument(firstPoll.text);
    expect(firstElementText(firstDocument, "StatusCode")).toBe("PENDING");

    const secondPoll = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(statusEnvelope({ submissionNumber: "POLL01" }));
    const secondDocument = parseXmlDocument(secondPoll.text);
    expect(firstElementText(secondDocument, "StatusCode")).toBe("ACCEPT");
  });

  test("Gov-Test-Scenario ACCOUNTS_REJECTED returns a reject with a RejectCode", async () => {
    await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "REJCT1" }));

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
    await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "STUCK1" }));

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
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(statusEnvelope({ submissionNumber: "NEVER1" }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Text")).toBe("No Transaction Found");
  });

  describe("CompanyDataRequest", () => {
    test("answers the fixture company's CompanyData", async () => {
      const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(companyDataRequestEnvelope());

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Qualifier")).toBe("response");
      expect(firstElementText(document, "CompanyNumber")).toBe(FIXTURE_COMPANY_NUMBER);
      expect(allElements(document, "Director")).toHaveLength(2);
      expect(allElements(document, "SICCode").map((el) => el.textContent)).toEqual(["69201", "69202"]);
    });

    test("rejects a company authentication code that does not match the fixture", async () => {
      const response = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(companyDataRequestEnvelope({ companyAuthenticationCode: "WRONGCODE" }));

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Number")).toBe("604");
    });

    test("Gov-Test-Scenario AUTH_FAILURE overrides valid credentials with a 502", async () => {
      const response = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .set("Gov-Test-Scenario", "AUTH_FAILURE")
        .send(companyDataRequestEnvelope());

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Number")).toBe("502");
    });
  });

  describe("PaymentPeriodsRequest", () => {
    test("answers PeriodPaid false by default", async () => {
      const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(paymentPeriodsRequestEnvelope());

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Qualifier")).toBe("response");
      expect(firstElementText(document, "PeriodPaid")).toBe("false");
    });

    test("Gov-Test-Scenario CS_PERIOD_PAID answers PeriodPaid true", async () => {
      const response = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .set("Gov-Test-Scenario", "CS_PERIOD_PAID")
        .send(paymentPeriodsRequestEnvelope());

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "PeriodPaid")).toBe("true");
    });
  });

  describe("confirmation statement submission and poll", () => {
    test("acknowledges a valid ConfirmationAndVerificationStatement submission", async () => {
      const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(confirmationStatementEnvelope());

      expect(response.status).toBe(200);
      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Qualifier")).toBe("acknowledgement");
      expect(allElements(document, "GovTalkErrors")).toHaveLength(0);
    });

    test("acknowledges a ConfirmationStatement submission once every officer is verified", async () => {
      const response = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(confirmationStatementEnvelope({ submissionNumber: "CS0002", formIdentifier: "ConfirmationStatement" }));

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Qualifier")).toBe("acknowledgement");
    });

    test("rejects a submission missing a required FormHeader element", async () => {
      const missingCompanyName = confirmationStatementEnvelope().replace(
        "<CompanyName>EXAMPLE CONFIRMATION STATEMENT LIMITED</CompanyName>",
        "",
      );
      const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(missingCompanyName);

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Number")).toBe("604");
      expect(firstElementText(document, "Location")).toBe("Body/FormSubmission/FormHeader/CompanyName");
    });

    test("rejects a submission whose ReviewDate is missing", async () => {
      const missingReviewDate = confirmationStatementEnvelope().replace("<ReviewDate>2026-09-21</ReviewDate>", "");
      const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(missingReviewDate);

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Number")).toBe("604");
      expect(firstElementText(document, "Location")).toBe("Body/FormSubmission/Form/ReviewDate");
    });

    test("Gov-Test-Scenario CS_DUPLICATE_SHAREHOLDING returns a fatal 9999 at submission", async () => {
      const response = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .set("Gov-Test-Scenario", "CS_DUPLICATE_SHAREHOLDING")
        .send(confirmationStatementEnvelope({ submissionNumber: "CS0003" }));

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Number")).toBe("9999");
      expect(firstElementText(document, "Text")).toBe("Duplicate ShareholdingId");
    });

    test("Gov-Test-Scenario CS_INSUFFICIENT_FUNDS returns a fatal 5006 at submission", async () => {
      const response = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .set("Gov-Test-Scenario", "CS_INSUFFICIENT_FUNDS")
        .send(confirmationStatementEnvelope({ submissionNumber: "CS0004" }));

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Number")).toBe("5006");
    });

    test("polls PENDING then ACCEPT for a confirmation statement submission, through the same GetSubmissionStatus poll accounts uses", async () => {
      await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(confirmationStatementEnvelope({ submissionNumber: "CS0005" }));

      const firstPoll = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(statusEnvelope({ submissionNumber: "CS0005" }));
      expect(firstElementText(parseXmlDocument(firstPoll.text), "StatusCode")).toBe("PENDING");

      const secondPoll = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(statusEnvelope({ submissionNumber: "CS0005" }));
      expect(firstElementText(parseXmlDocument(secondPoll.text), "StatusCode")).toBe("ACCEPT");
    });

    test("Gov-Test-Scenario CS_SHAREHOLDERS_REQUIRED rejects with RejectCode 11686 at poll", async () => {
      await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(confirmationStatementEnvelope({ submissionNumber: "CS0006" }));

      const response = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .set("Gov-Test-Scenario", "CS_SHAREHOLDERS_REQUIRED")
        .send(statusEnvelope({ submissionNumber: "CS0006" }));

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "StatusCode")).toBe("REJECT");
      expect(firstElementText(document, "RejectCode")).toBe("11686");
    });

    test("Gov-Test-Scenario CS_DIRECTOR_NOT_VERIFIED rejects naming the director", async () => {
      await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(confirmationStatementEnvelope({ submissionNumber: "CS0007" }));

      const response = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .set("Gov-Test-Scenario", "CS_DIRECTOR_NOT_VERIFIED")
        .send(statusEnvelope({ submissionNumber: "CS0007" }));

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "StatusCode")).toBe("REJECT");
      expect(firstElementText(document, "RejectCode")).toBe("12604");
      expect(firstElementText(document, "Description")).toContain("ALICE EXAMPLE");
    });

    test("an accounts submission number and a confirmation statement submission number poll independently", async () => {
      await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(accountsEnvelope({ submissionNumber: "MIXED1" }));
      await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(confirmationStatementEnvelope({ submissionNumber: "MIXED2" }));

      const accountsPoll = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(statusEnvelope({ submissionNumber: "MIXED1" }));
      const confirmationStatementPoll = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(statusEnvelope({ submissionNumber: "MIXED2" }));

      expect(firstElementText(parseXmlDocument(accountsPoll.text), "StatusCode")).toBe("PENDING");
      expect(firstElementText(parseXmlDocument(confirmationStatementPoll.text), "StatusCode")).toBe("PENDING");
    });
  });

  describe("PSC verification statement submission and poll", () => {
    test("acknowledges a valid PSCVerificationStatement submission", async () => {
      const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(pscVerificationStatementEnvelope());

      expect(response.status).toBe(200);
      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Qualifier")).toBe("acknowledgement");
      expect(allElements(document, "GovTalkErrors")).toHaveLength(0);
    });

    test("rejects a submission missing a required FormHeader element", async () => {
      const missingCompanyName = pscVerificationStatementEnvelope().replace(
        "<CompanyName>EXAMPLE CONFIRMATION STATEMENT LIMITED</CompanyName>",
        "",
      );
      const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(missingCompanyName);

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Number")).toBe("604");
      expect(firstElementText(document, "Location")).toBe("Body/FormSubmission/FormHeader/CompanyName");
    });

    test("rejects a submission whose Individual element is missing", async () => {
      const missingIndividual = pscVerificationStatementEnvelope().replace(/<Individual>[\s\S]*<\/Individual>/, "");
      const response = await request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml").send(missingIndividual);

      const document = parseXmlDocument(response.text);
      expect(firstElementText(document, "Number")).toBe("604");
      expect(firstElementText(document, "Location")).toBe("Body/FormSubmission/Form/Individual");
    });

    test("polls PENDING then ACCEPT", async () => {
      await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(pscVerificationStatementEnvelope({ submissionNumber: "VS0002" }));

      const firstPoll = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(statusEnvelope({ submissionNumber: "VS0002" }));
      const secondPoll = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(statusEnvelope({ submissionNumber: "VS0002" }));

      expect(firstElementText(parseXmlDocument(firstPoll.text), "StatusCode")).toBe("PENDING");
      expect(firstElementText(parseXmlDocument(secondPoll.text), "StatusCode")).toBe("ACCEPT");
    });

    test("an accounts submission number, a confirmation statement submission number and a PSC verification statement submission number poll independently", async () => {
      await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(accountsEnvelope({ submissionNumber: "MIXED3" }));
      await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(confirmationStatementEnvelope({ submissionNumber: "MIXED4" }));
      await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(pscVerificationStatementEnvelope({ submissionNumber: "MIXED5" }));

      const accountsPoll = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(statusEnvelope({ submissionNumber: "MIXED3" }));
      const confirmationStatementPoll = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(statusEnvelope({ submissionNumber: "MIXED4" }));
      const pscVerificationStatementPoll = await request(app)
        .post(GATEWAY_PATH)
        .set("Content-Type", "text/xml")
        .send(statusEnvelope({ submissionNumber: "MIXED5" }));

      expect(firstElementText(parseXmlDocument(accountsPoll.text), "StatusCode")).toBe("PENDING");
      expect(firstElementText(parseXmlDocument(confirmationStatementPoll.text), "StatusCode")).toBe("PENDING");
      expect(firstElementText(parseXmlDocument(pscVerificationStatementPoll.text), "StatusCode")).toBe("PENDING");
    });
  });
});
