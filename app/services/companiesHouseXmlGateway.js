// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseXmlGateway.js
// Builds and sends GovTalk envelopes for the Companies House XML Gateway (accounts filing and
// submission status polling). Separate from companiesHouseFilingApi.js, which is the OAuth-
// authorised REST filing client: the XML Gateway is a different transport (XML over HTTP, a
// presenter id/code instead of a bearer token) for a different resource (accounts, not the
// transaction-based filings the REST API carries).

import { createHash } from "node:crypto";
import { createLogger } from "../lib/logger.js";
import { fetchTextWithTimeout, DEFAULT_TIMEOUTS } from "../lib/httpFetch.js";
import { executeDynamoDbCommand } from "../lib/dynamoDbClient.js";
import { parseXmlDocument, firstElementText, firstElement, allElements, escapeXmlText } from "../lib/xmlDom.js";

const logger = createLogger({ source: "app/services/companiesHouseXmlGateway.js" });

const DEFAULT_XML_GATEWAY_URI = "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway";

// The atomic counter backing allocateSubmissionNumber() lives in the same async-requests table
// the Lambda records the submission itself under (COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME),
// keyed apart from any real request id so it never collides with one.
const SUBMISSION_NUMBER_COUNTER_KEY = { hashedSub: "companies-house-xmlgw", requestId: "accounts-submission-number-counter" };

let secretsClient = null;
let cachedPresenterId;
let cachedPresenterCode;

async function getSecretsClient() {
  if (!secretsClient) {
    const { SecretsManagerClient } = await import("@aws-sdk/client-secrets-manager");
    secretsClient = new SecretsManagerClient();
  }
  return secretsClient;
}

async function resolveSecret({ envVar, envArnVar, cached, setCached }) {
  if (process.env[envVar]) {
    return process.env[envVar];
  }
  if (!cached) {
    const secretArn = process.env[envArnVar];
    if (!secretArn) {
      throw new Error(`Missing required environment variable ${envVar} or ${envArnVar}`);
    }
    logger.info({ message: `Retrieving ${envVar} from Secrets Manager` });
    const client = await getSecretsClient();
    const { GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
    const data = await client.send(new GetSecretValueCommand({ SecretId: secretArn }));
    setCached(data.SecretString);
    logger.info({ message: `${envVar} retrieved from Secrets Manager and cached` });
    return data.SecretString;
  }
  return cached;
}

/**
 * Resolve the Companies House presenter id and authentication code, caching each across warm
 * starts the same way companiesHouseFilingApi.js's resolveClientSecret does.
 * @returns {Promise<{presenterId: string, presenterCode: string}>}
 */
export async function resolvePresenterCredentials() {
  const presenterId = await resolveSecret({
    envVar: "COMPANIES_HOUSE_PRESENTER_ID",
    envArnVar: "COMPANIES_HOUSE_PRESENTER_ID_ARN",
    cached: cachedPresenterId,
    setCached: (value) => {
      cachedPresenterId = value;
    },
  });
  const presenterCode = await resolveSecret({
    envVar: "COMPANIES_HOUSE_PRESENTER_CODE",
    envArnVar: "COMPANIES_HOUSE_PRESENTER_CODE_ARN",
    cached: cachedPresenterCode,
    setCached: (value) => {
      cachedPresenterCode = value;
    },
  });
  return { presenterId, presenterCode };
}

/**
 * The lowercase MD5 hex digest of a presenter credential. The gateway's IDAuthentication carries
 * this, not the credential itself: SenderID is the hashed presenter id, Authentication/Value is
 * the hashed presenter authentication code. Hash first, then lowercase - the wrong order returns
 * error 502, authorisation failure.
 * @param {string} value
 * @returns {string}
 */
export function hashPresenterCredential(value) {
  return createHash("md5").update(String(value), "utf8").digest("hex").toLowerCase();
}

function buildHeaderXml({ requestClass, transactionId, gatewayTest, presenterId, presenterCode }) {
  return `<Header>
    <MessageDetails>
      <Class>${requestClass}</Class>
      <Qualifier>request</Qualifier>
      <TransactionID>${escapeXmlText(transactionId)}</TransactionID>
${gatewayTest ? "      <GatewayTest>1</GatewayTest>\n" : ""}    </MessageDetails>
    <SenderDetails>
      <IDAuthentication>
        <SenderID>${hashPresenterCredential(presenterId)}</SenderID>
        <Authentication>
          <Method>clear</Method>
          <Value>${hashPresenterCredential(presenterCode)}</Value>
        </Authentication>
      </IDAuthentication>
    </SenderDetails>
  </Header>`;
}

function buildEnvelopeXml({ requestClass, transactionId, gatewayTest, presenterId, presenterCode, bodyXml }) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  ${buildHeaderXml({ requestClass, transactionId, gatewayTest, presenterId, presenterCode })}
  <GovTalkDetails>
    <Keys/>
  </GovTalkDetails>
  <Body>
    ${bodyXml}
  </Body>
</GovTalkMessage>
`;
}

/**
 * Build the GovTalk envelope for an Accounts submission.
 *
 * @param {object} input
 * @param {string} input.presenterId
 * @param {string} input.presenterCode
 * @param {string} input.companyNumber
 * @param {string} input.companyName
 * @param {string} input.companyAuthenticationCode
 * @param {string} [input.packageReference] - blank until Companies House issues one
 * @param {string} input.submissionNumber - exactly 6 characters
 * @param {string} input.dateSigned - ISO date the director signed
 * @param {string} input.ixbrl - the generated iXBRL document, not yet base64-encoded
 * @param {string} [input.filename]
 * @param {string} [input.transactionId] - defaults to the current epoch milliseconds
 * @param {boolean} [input.gatewayTest] - true against the test service
 * @returns {string} the envelope XML
 */
export function buildAccountsSubmission({
  presenterId,
  presenterCode,
  companyNumber,
  companyName,
  companyAuthenticationCode,
  packageReference = "",
  submissionNumber,
  dateSigned,
  ixbrl,
  filename = "Accounts.xml",
  transactionId = String(Date.now()),
  gatewayTest = false,
}) {
  const data = Buffer.from(ixbrl, "utf8").toString("base64");

  const bodyXml = `<FormSubmission xmlns="http://xmlgw.companieshouse.gov.uk/Header">
      <FormHeader>
        <CompanyNumber>${escapeXmlText(companyNumber)}</CompanyNumber>
        <CompanyName>${escapeXmlText(companyName)}</CompanyName>
        <CompanyAuthenticationCode>${escapeXmlText(companyAuthenticationCode)}</CompanyAuthenticationCode>
        <PackageReference>${escapeXmlText(packageReference)}</PackageReference>
        <FormIdentifier>Accounts</FormIdentifier>
        <SubmissionNumber>${escapeXmlText(submissionNumber)}</SubmissionNumber>
      </FormHeader>
      <Authority>
        <Designation>DIR</Designation>
        <DateSigned>${dateSigned}</DateSigned>
      </Authority>
      <Form>
      </Form>
      <Document>
        <Data>${data}</Data>
        <Date>${dateSigned}</Date>
        <Filename>${escapeXmlText(filename)}</Filename>
        <ContentType>application/xml</ContentType>
        <Category>ACCOUNTS</Category>
      </Document>
    </FormSubmission>`;

  return buildEnvelopeXml({ requestClass: "Accounts", transactionId, gatewayTest, presenterId, presenterCode, bodyXml });
}

/**
 * Build the GovTalk envelope for a GetSubmissionStatus poll.
 *
 * @param {object} input
 * @param {string} input.presenterId
 * @param {string} input.presenterCode
 * @param {string} [input.submissionNumber] - either this or companyNumber
 * @param {string} [input.companyNumber]
 * @param {string} [input.transactionId] - defaults to the current epoch milliseconds
 * @param {boolean} [input.gatewayTest]
 * @returns {string} the envelope XML
 */
export function buildStatusRequest({ presenterId, presenterCode, submissionNumber, companyNumber, transactionId = String(Date.now()), gatewayTest = false }) {
  const identifierXml = submissionNumber
    ? `<SubmissionNumber>${escapeXmlText(submissionNumber)}</SubmissionNumber>`
    : `<CompanyNumber>${escapeXmlText(companyNumber)}</CompanyNumber>`;

  const bodyXml = `<GetSubmissionStatus xmlns="http://xmlgw.companieshouse.gov.uk">
      ${identifierXml}
      <PresenterID>${escapeXmlText(presenterId)}</PresenterID>
    </GetSubmissionStatus>`;

  return buildEnvelopeXml({ requestClass: "GetSubmissionStatus", transactionId, gatewayTest, presenterId, presenterCode, bodyXml });
}

/**
 * Parse a GovTalk response envelope (an acknowledgement, a GetSubmissionStatus answer, or a
 * GovTalkErrors block) into a plain object.
 *
 * @param {string} xml
 * @returns {{
 *   qualifier: string|undefined,
 *   transactionId: string|undefined,
 *   gatewayTimestamp: string|undefined,
 *   pollInterval: number|undefined,
 *   errors: Array<{raisedBy: string, number: number|undefined, type: string, text: string, location: string|undefined}>,
 *   statuses: Array<{submissionNumber: string, statusCode: string, companyNumber: string|undefined, rejections: Array<{rejectCode: string, description: string, instanceNumber: string}>}>
 * }}
 */
export function parseGatewayResponse(xml) {
  const document = parseXmlDocument(xml);

  const responseEndPoint = firstElement(document, "ResponseEndPoint");
  const pollIntervalAttribute = responseEndPoint ? responseEndPoint.getAttribute("PollInterval") : undefined;

  const errors = allElements(document, "Error").map((errorElement) => {
    const numberText = firstElementText(errorElement, "Number");
    return {
      raisedBy: firstElementText(errorElement, "RaisedBy"),
      number: numberText !== undefined ? Number(numberText) : undefined,
      type: firstElementText(errorElement, "Type"),
      text: firstElementText(errorElement, "Text"),
      location: firstElementText(errorElement, "Location"),
    };
  });

  const statuses = allElements(document, "Status").map((statusElement) => ({
    submissionNumber: firstElementText(statusElement, "SubmissionNumber"),
    statusCode: firstElementText(statusElement, "StatusCode"),
    companyNumber: firstElementText(statusElement, "CompanyNumber"),
    rejections: allElements(statusElement, "Reject").map((rejectElement) => ({
      rejectCode: firstElementText(rejectElement, "RejectCode"),
      description: firstElementText(rejectElement, "Description"),
      instanceNumber: firstElementText(rejectElement, "InstanceNumber"),
    })),
  }));

  return {
    qualifier: firstElementText(document, "Qualifier"),
    transactionId: firstElementText(document, "TransactionID"),
    gatewayTimestamp: firstElementText(document, "GatewayTimestamp"),
    pollInterval: pollIntervalAttribute !== undefined && pollIntervalAttribute !== null ? Number(pollIntervalAttribute) : undefined,
    errors,
    statuses,
  };
}

/**
 * Allocate the next submission number: base36, zero-padded to 6 characters, from an atomic
 * counter item in the accounts async-requests table. Unique per presenter forever - reusing one
 * is rejected by the gateway.
 * @returns {Promise<string>}
 */
export async function allocateSubmissionNumber() {
  const tableName = process.env.COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME;
  if (!tableName) {
    throw new Error("Missing required environment variable COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME");
  }

  const result = await executeDynamoDbCommand((module) =>
    new module.UpdateCommand({
      TableName: tableName,
      Key: SUBMISSION_NUMBER_COUNTER_KEY,
      UpdateExpression: "ADD #value :increment",
      ExpressionAttributeNames: { "#value": "value" },
      ExpressionAttributeValues: { ":increment": 1 },
      ReturnValues: "UPDATED_NEW",
    }),
  );

  return result.Attributes.value.toString(36).toUpperCase().padStart(6, "0");
}

/**
 * The XML Gateway endpoint: one URL for both submit and poll. Overridable so a Lambda under test
 * (or against the simulator) can point somewhere other than the real gateway; the test service
 * itself uses this same URL with GatewayTest in the envelope, not a different address.
 * @returns {string}
 */
export function getXmlGatewayUri() {
  return process.env.COMPANIES_HOUSE_XMLGW_URI || DEFAULT_XML_GATEWAY_URI;
}

/**
 * POST a GovTalk envelope to the XML Gateway and return the raw text response.
 * @param {string} xml
 * @param {object} [extraHeaders] - e.g. a developer-mode Gov-Test-Scenario override; the real
 *   gateway ignores headers it does not know, so the same call shape reaches both.
 * @returns {Promise<{ok: boolean, status: number, data: string, headers: object, duration: number}>}
 */
export async function postToGateway(xml, extraHeaders = {}) {
  const url = getXmlGatewayUri();

  logger.info({ message: `POST ${url}`, url });

  const result = await fetchTextWithTimeout(
    url,
    { method: "POST", headers: { "Content-Type": "text/xml", ...extraHeaders }, body: xml },
    DEFAULT_TIMEOUTS.LONG,
  );

  logger.info({ message: `Response from POST ${url}`, url, status: result.status });

  return result;
}
