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
import { resetGatewayFormFilings } from "@app/http-simulator/scenarios/gateway-forms.js";
import { buildFormSubmission } from "@app/services/companiesHouseXmlGateway.js";
import { buildPscCessationBody } from "@app/services/companiesHousePscCessationXml.js";
import { buildMicroEntityAccounts } from "@app/services/microEntityAccountsIxbrl.js";
import { parseXmlDocument, firstElementText, allElements } from "@app/lib/xmlDom.js";

function md5Lowercase(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex").toLowerCase();
}

const VALID_SENDER_ID = md5Lowercase(SIMULATOR_PRESENTER_ID);
const VALID_AUTH_VALUE = md5Lowercase(SIMULATOR_PRESENTER_CODE);
const WRONG_HASH = md5Lowercase("not-the-right-credential");

const REVISED_FLAG = "bus:ReportAnAmendedRevisedVersionPreviouslyFiledReportTruefalse";
const REVISION_STATEMENTS = {
  "bus:StatementThatRevisedReportReplacesPreviouslyFiledReportForPeriod":
    "These revised accounts replace the original accounts for the year ended 30 June 2026.",
  "bus:StatementThatThisReportNowStatutoryAccountsForPeriod": "They are now the statutory accounts of the company for that year.",
  "bus:StatementThatThisReportHasBeenPreparedAsDatePreviouslyFiledReport": "They are prepared as at the date of the original accounts.",
  "bus:StatementRespectsInWhichPreviouslyFiledReportDidNotComplyWithCompaniesAct2006":
    "The original balance sheet omitted the share capital.",
  "bus:StatementSignificantAmendmentsToPreviouslyFiledReport": "The share capital is now shown.",
  "bus:DateApprovalRevisionReport": "1 October 2026",
};

// A minimal iXBRL accounts document holding the given facts, each as visible text.
function ixbrlDocument(facts) {
  const factsXml = Object.entries(facts)
    .map(([name, text]) => `<p><ix:nonNumeric name="${name}" contextRef="current">${text}</ix:nonNumeric></p>`)
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><html xmlns="http://www.w3.org/1999/xhtml" xmlns:ix="http://www.xbrl.org/2013/inlineXBRL"><body>${factsXml}</body></html>`;
}

const REVISED_BY_REPLACEMENT = ixbrlDocument({ [REVISED_FLAG]: "true", ...REVISION_STATEMENTS });
const REVISED_BY_SUPPLEMENTARY_NOTE = ixbrlDocument({
  [REVISED_FLAG]: "true",
  "bus:SupplementaryNote": "Note 3 omitted the share capital, which is £100.",
});
const REVISED_WITH_NEITHER = ixbrlDocument({ [REVISED_FLAG]: "true" });
const ORIGINAL = ixbrlDocument({ [REVISED_FLAG]: "false" });

const base64 = (text) => Buffer.from(text, "utf8").toString("base64");

function accountsEnvelope({
  senderId = VALID_SENDER_ID,
  authValue = VALID_AUTH_VALUE,
  submissionNumber = "AAA001",
  companyNumber = "02706061",
  documentData = "PGh0bWw+PC9odG1sPg==",
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
        <Data>${documentData}</Data>
        <Date>2026-06-30</Date>
        <Filename>Accounts.xml</Filename>
        <ContentType>application/xml</ContentType>
        <Category>ACCOUNTS</Category>
      </Document>
    </FormSubmission>
  </Body>
</GovTalkMessage>`;
}

function statusAckEnvelope({ senderId = VALID_SENDER_ID, authValue = VALID_AUTH_VALUE } = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>StatusAck</Class>
      <Qualifier>request</Qualifier>
      <TransactionID>3</TransactionID>
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
    <StatusAck xmlns="http://xmlgw.companieshouse.gov.uk"></StatusAck>
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
      ${submissionNumber ? `<SubmissionNumber>${submissionNumber}</SubmissionNumber>` : ""}
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
              <CompaniesHousePersonalCode>CWMPS832223</CompaniesHousePersonalCode>
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

  test("acknowledges a dormant company's accounts and polls them to ACCEPT", async () => {
    const dormantDocument = buildMicroEntityAccounts({
      companyNumber: "02706061",
      companyName: "TEST DORMANT LIMITED",
      registeredOffice: { addressLine1: "1 Test Street", cityOrTown: "London", postalCode: "EC1A 1AA" },
      periodStart: "2025-07-01",
      periodEnd: "2026-06-30",
      dormant: true,
      dormantTradingStatus: "neverTraded",
      shareClass: "ordinaryShares",
      nominalValue: 1,
      averageNumberOfEmployees: 0,
      directorName: "Jo Smith",
      dateOfApproval: "2026-09-01",
      balanceSheet: {
        current: {
          fixedAssets: 0,
          currentAssets: 100,
          creditorsWithinOneYear: 0,
          creditorsAfterOneYear: 0,
          calledUpShareCapital: 100,
          profitAndLossAccount: 0,
          capitalAndReserves: 100,
        },
        prior: {
          fixedAssets: 0,
          currentAssets: 100,
          creditorsWithinOneYear: 0,
          creditorsAfterOneYear: 0,
          calledUpShareCapital: 100,
          profitAndLossAccount: 0,
          capitalAndReserves: 100,
        },
      },
    });
    const documentData = Buffer.from(dormantDocument, "utf8").toString("base64");

    const submitted = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "DORM01", documentData }));
    expect(firstElementText(parseXmlDocument(submitted.text), "Qualifier")).toBe("acknowledgement");

    await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(statusEnvelope({ submissionNumber: "DORM01" }));
    const accepted = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(statusEnvelope({ submissionNumber: "DORM01" }));
    expect(firstElementText(parseXmlDocument(accepted.text), "StatusCode")).toBe("ACCEPT");
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

  test("acknowledges a revised Accounts submission that states every fact of a revision by replacement", async () => {
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "REV001", documentData: base64(REVISED_BY_REPLACEMENT) }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Qualifier")).toBe("acknowledgement");
    expect(allElements(document, "GovTalkErrors")).toHaveLength(0);
  });

  test("acknowledges a revised Accounts submission with a non-empty supplementary note", async () => {
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "REV002", documentData: base64(REVISED_BY_SUPPLEMENTARY_NOTE) }));

    expect(firstElementText(parseXmlDocument(response.text), "Qualifier")).toBe("acknowledgement");
  });

  test("rejects a revised Accounts submission with neither form of revision, with the validator's text", async () => {
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "REV003", documentData: base64(REVISED_WITH_NEITHER) }));

    const document = parseXmlDocument(response.text);
    expect(firstElementText(document, "Qualifier")).toBe("error");
    expect(firstElementText(document, "RaisedBy")).toBe("Accounts");
    expect(firstElementText(document, "Number")).toBe("9999");
    expect(firstElementText(document, "Text")).toBe(
      "For accounts identified as 'amended/revised' either SupplementaryNote must be provided and be non-empty or all relevant statement items and DateApprovalRevisionReport must be present.",
    );
  });

  test("acknowledges an original Accounts submission that states no revision", async () => {
    const response = await request(app)
      .post(GATEWAY_PATH)
      .set("Content-Type", "text/xml")
      .send(accountsEnvelope({ submissionNumber: "ORI001", documentData: base64(ORIGINAL) }));

    expect(firstElementText(parseXmlDocument(response.text), "Qualifier")).toBe("acknowledgement");
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

  describe("presenter poll and StatusAck", () => {
    const post = (body, scenario) =>
      request(app)
        .post(GATEWAY_PATH)
        .set({ "Content-Type": "text/xml", ...(scenario ? { "Gov-Test-Scenario": scenario } : {}) })
        .send(body);
    const statusesOf = (response) =>
      allElements(parseXmlDocument(response.text), "Status").map((status) => [
        firstElementText(status, "SubmissionNumber"),
        firstElementText(status, "StatusCode"),
      ]);

    test("answers every completed submission of the presenter across the forms, and leaves a pending one out", async () => {
      await post(accountsEnvelope({ submissionNumber: "PP0001" }));
      await post(accountsEnvelope({ submissionNumber: "PP0002" }), "ACCOUNTS_REJECTED");
      await post(accountsEnvelope({ submissionNumber: "PP0003" }), "PENDING_FOREVER");
      await post(confirmationStatementEnvelope({ submissionNumber: "PP0004" }), "CS_SHAREHOLDERS_REQUIRED");
      await post(pscVerificationStatementEnvelope({ submissionNumber: "PP0005" }));

      const response = await post(statusEnvelope({ submissionNumber: "" }));

      expect(firstElementText(parseXmlDocument(response.text), "Qualifier")).toBe("response");
      expect(statusesOf(response)).toEqual([
        ["PP0001", "ACCEPT"],
        ["PP0002", "REJECT"],
        ["PP0004", "REJECT"],
        ["PP0005", "ACCEPT"],
      ]);
    });

    test("answers the same submissions again until a StatusAck acknowledges them", async () => {
      await post(accountsEnvelope({ submissionNumber: "PP0011" }));

      expect(statusesOf(await post(statusEnvelope({ submissionNumber: "" })))).toEqual([["PP0011", "ACCEPT"]]);
      expect(statusesOf(await post(statusEnvelope({ submissionNumber: "" })))).toEqual([["PP0011", "ACCEPT"]]);

      const ack = await post(statusAckEnvelope());
      expect(firstElementText(parseXmlDocument(ack.text), "Class")).toBe("StatusAck");
      expect(allElements(parseXmlDocument(ack.text), "GovTalkErrors")).toHaveLength(0);

      expect(statusesOf(await post(statusEnvelope({ submissionNumber: "" })))).toEqual([["", ""]]);
    });

    test("a poll for one submission number still answers after the presenter poll acknowledged it", async () => {
      await post(accountsEnvelope({ submissionNumber: "PP0021" }));
      await post(statusEnvelope({ submissionNumber: "" }));
      await post(statusAckEnvelope());

      await post(statusEnvelope({ submissionNumber: "PP0021" }));
      const response = await post(statusEnvelope({ submissionNumber: "PP0021" }));
      expect(statusesOf(response)).toEqual([["PP0021", "ACCEPT"]]);
    });

    test("rejects a presenter poll and a StatusAck under the wrong credentials with a 502", async () => {
      const poll = await post(statusEnvelope({ submissionNumber: "", authValue: WRONG_HASH }));
      const ack = await post(statusAckEnvelope({ authValue: WRONG_HASH }));
      expect(firstElementText(parseXmlDocument(poll.text), "Number")).toBe("502");
      expect(firstElementText(parseXmlDocument(ack.text), "Number")).toBe("502");
    });
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
      expect(firstElementText(document, "Description")).toContain("ELEANOR BRAMWELL");
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

describe("http-simulator/routes/companies-house-xmlgw forms on the shared filing route", () => {
  let app;

  function cessationEnvelope(submissionNumber) {
    return buildFormSubmission({
      presenterId: SIMULATOR_PRESENTER_ID,
      presenterCode: SIMULATOR_PRESENTER_CODE,
      companyNumber: FIXTURE_COMPANY_NUMBER,
      companyName: "EXAMPLE PSC LIMITED",
      companyAuthenticationCode: FIXTURE_COMPANY_AUTHENTICATION_CODE,
      packageReference: "0012",
      formIdentifier: "PSCCessation",
      submissionNumber,
      dateSigned: "2026-11-20",
      formXml: buildPscCessationBody({
        kind: "individual-person-with-significant-control",
        surname: "BRAMWELL",
        cessationDate: "2026-11-01",
        confirmationDate: "2026-11-03",
      }),
      gatewayTest: true,
    });
  }

  const post = (xml, scenario) => {
    const call = request(app).post(GATEWAY_PATH).set("Content-Type", "text/xml");
    return (scenario ? call.set("Gov-Test-Scenario", scenario) : call).send(xml);
  };
  const statusOf = async (submissionNumber) =>
    firstElementText(parseXmlDocument((await post(statusEnvelope({ submissionNumber }))).text), "StatusCode");

  beforeEach(() => {
    resetAccountsFilings();
    resetConfirmationStatementFilings();
    resetPscVerificationStatementFilings();
    resetGatewayFormFilings();
    app = buildApp();
  });

  test("acknowledges a PSCCessation submission and polls it PENDING then ACCEPT", async () => {
    const acknowledgement = parseXmlDocument((await post(cessationEnvelope("CES001"))).text);
    expect(firstElementText(acknowledgement, "Qualifier")).toBe("acknowledgement");
    expect(allElements(acknowledgement, "GovTalkErrors")).toHaveLength(0);

    expect(await statusOf("CES001")).toBe("PENDING");
    expect(await statusOf("CES001")).toBe("ACCEPT");
  });

  test("answers REJECT with a reason under the REJECT scenario", async () => {
    await post(cessationEnvelope("CES002"), "REJECT");
    await statusOf("CES002");
    const final = parseXmlDocument((await post(statusEnvelope({ submissionNumber: "CES002" }))).text);
    expect(firstElementText(final, "StatusCode")).toBe("REJECT");
    expect(firstElementText(final, "RejectCode")).toBe("9998");
  });

  test("refuses a PSCCessation envelope whose Form does not hold the PSCCessation element", async () => {
    const response = await post(cessationEnvelope("CES003").replace(/<PSCCessation[\s\S]*<\/PSCCessation>/, ""));
    expect(allElements(parseXmlDocument(response.text), "GovTalkErrors")).toHaveLength(1);
  });

  test("refuses a submission number already used", async () => {
    await post(cessationEnvelope("CES004"));
    const response = await post(cessationEnvelope("CES004"));
    expect(firstElementText(parseXmlDocument(response.text), "Text")).toContain("SubmissionNumber has already been used");
  });
});
