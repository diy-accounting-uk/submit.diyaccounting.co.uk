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
// keyed apart from any real request id so it never collides with one. Submission numbers are
// unique per presenter across every form (accounts, confirmation statements, ...), so every form
// draws from this one counter; the key's own "accounts-submission-number-counter" text stays as
// the item's id, because renaming it would restart numbering and collide with numbers already used.
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
  // MD5 is the Companies House XML Gateway protocol's own required digest for IDAuthentication,
  // not a security control this code chooses.
  // eslint-disable-next-line sonarjs/hashing
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
 * Build the GovTalk envelope for a FormSubmission: FormHeader, DateSigned, and either a Form body
 * (a form's own XML, e.g. the ConfirmationAndVerificationStatement element) or a Document (a
 * base64 attachment, e.g. iXBRL accounts), matching FormSubmission-v2-11.xsd's own sequence.
 *
 * The root FormSubmission element carries its own xsi:schemaLocation, naming
 * FormSubmission-v2-11.xsd, exactly as every published Companies House example
 * (fixtures/companies-house-xmlgw/ConfirmationStatement*.xml, ConfirmationAndVerificationStatement.xml)
 * shows it. Without it the gateway answers error 505 "Invalid schema URI supplied" on every form
 * this function submits, even though the inner Form element's own schemaLocation is correct.
 *
 * @param {object} input
 * @param {string} input.presenterId
 * @param {string} input.presenterCode
 * @param {string} input.companyNumber
 * @param {string} input.companyName
 * @param {string} input.companyAuthenticationCode
 * @param {string} [input.packageReference] - the value Companies House's XML team issues per
 *   environment (the test service and the live service each expect a different one); the caller
 *   resolves it from configuration, defaulting to blank only when a caller has none to give
 * @param {string} input.formIdentifier - the form's FormIdentifier and GovTalk Class, e.g.
 *   "Accounts" or "ConfirmationAndVerificationStatement"
 * @param {string} input.submissionNumber - exactly 6 characters
 * @param {string} input.dateSigned - ISO date the director signed
 * @param {string} [input.formXml] - the form's own XML, sent inside Form
 * @param {object} [input.document] - sent inside Document when given
 * @param {string} input.document.data - the attachment's content, already base64-encoded
 * @param {string} input.document.date
 * @param {string} input.document.filename
 * @param {string} input.document.contentType
 * @param {string} input.document.category
 * @param {string} [input.transactionId] - defaults to the current epoch milliseconds
 * @param {boolean} [input.gatewayTest] - true against the test service
 * @returns {string} the envelope XML
 */
export function buildFormSubmission({
  presenterId,
  presenterCode,
  companyNumber,
  companyName,
  companyAuthenticationCode,
  packageReference = "",
  formIdentifier,
  submissionNumber,
  dateSigned,
  formXml = "",
  document,
  transactionId = String(Date.now()),
  gatewayTest = false,
}) {
  const documentXml = document
    ? `
      <Document>
        <Data>${document.data}</Data>
        <Date>${document.date}</Date>
        <Filename>${escapeXmlText(document.filename)}</Filename>
        <ContentType>${escapeXmlText(document.contentType)}</ContentType>
        <Category>${escapeXmlText(document.category)}</Category>
      </Document>`
    : "";

  const bodyXml = `<FormSubmission xmlns="http://xmlgw.companieshouse.gov.uk/Header" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk/Header http://xmlgw.companieshouse.gov.uk/v1-0/schema/forms/FormSubmission-v2-11.xsd">
      <FormHeader>
        <CompanyNumber>${escapeXmlText(companyNumber)}</CompanyNumber>
        <CompanyName>${escapeXmlText(companyName)}</CompanyName>
        <CompanyAuthenticationCode>${escapeXmlText(companyAuthenticationCode)}</CompanyAuthenticationCode>
        <PackageReference>${escapeXmlText(packageReference)}</PackageReference>
        <FormIdentifier>${escapeXmlText(formIdentifier)}</FormIdentifier>
        <SubmissionNumber>${escapeXmlText(submissionNumber)}</SubmissionNumber>
      </FormHeader>
      <DateSigned>${dateSigned}</DateSigned>
      <Form>
      ${formXml}
      </Form>${documentXml}
    </FormSubmission>`;

  return buildEnvelopeXml({ requestClass: formIdentifier, transactionId, gatewayTest, presenterId, presenterCode, bodyXml });
}

/**
 * Build the GovTalk envelope for an Accounts submission: a FormSubmission whose Document carries
 * the base64-encoded iXBRL.
 *
 * @param {object} input
 * @param {string} input.presenterId
 * @param {string} input.presenterCode
 * @param {string} input.companyNumber
 * @param {string} input.companyName
 * @param {string} input.companyAuthenticationCode
 * @param {string} [input.packageReference]
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

  return buildFormSubmission({
    presenterId,
    presenterCode,
    companyNumber,
    companyName,
    companyAuthenticationCode,
    packageReference,
    formIdentifier: "Accounts",
    submissionNumber,
    dateSigned,
    document: { data, date: dateSigned, filename, contentType: "application/xml", category: "ACCOUNTS" },
    transactionId,
    gatewayTest,
  });
}

/**
 * Build the GovTalk envelope for a confirmation statement submission: a FormSubmission whose Form
 * carries the already-built ConfirmationAndVerificationStatement (or, once every officer is
 * verified, ConfirmationStatement) element.
 *
 * @param {object} input
 * @param {string} input.presenterId
 * @param {string} input.presenterCode
 * @param {string} input.companyNumber
 * @param {string} input.companyName
 * @param {string} input.companyAuthenticationCode
 * @param {string} [input.packageReference]
 * @param {string} input.submissionNumber - exactly 6 characters
 * @param {string} input.dateSigned - ISO date the director signed
 * @param {string} input.statementXml - the built ConfirmationAndVerificationStatement element,
 *   e.g. from companiesHouseConfirmationStatementXml.js's buildConfirmationStatementBody()
 * @param {string} [input.formIdentifier] - "ConfirmationAndVerificationStatement" or, once every
 *   officer is verified, "ConfirmationStatement"
 * @param {string} [input.transactionId] - defaults to the current epoch milliseconds
 * @param {boolean} [input.gatewayTest] - true against the test service
 * @returns {string} the envelope XML
 */
export function buildConfirmationStatementSubmission({
  presenterId,
  presenterCode,
  companyNumber,
  companyName,
  companyAuthenticationCode,
  packageReference = "",
  submissionNumber,
  dateSigned,
  statementXml,
  formIdentifier = "ConfirmationAndVerificationStatement",
  transactionId = String(Date.now()),
  gatewayTest = false,
}) {
  return buildFormSubmission({
    presenterId,
    presenterCode,
    companyNumber,
    companyName,
    companyAuthenticationCode,
    packageReference,
    formIdentifier,
    submissionNumber,
    dateSigned,
    formXml: statementXml,
    transactionId,
    gatewayTest,
  });
}

/**
 * Build the GovTalk envelope for a PSC verification statement submission: a FormSubmission whose
 * Form carries the already-built PSCVerificationStatement element - one director who is also a
 * person with significant control, filed separately from the confirmation statement's own
 * VerificationStatement.
 *
 * @param {object} input
 * @param {string} input.presenterId
 * @param {string} input.presenterCode
 * @param {string} input.companyNumber
 * @param {string} input.companyName
 * @param {string} input.companyAuthenticationCode
 * @param {string} [input.packageReference]
 * @param {string} input.submissionNumber - exactly 6 characters
 * @param {string} input.dateSigned - ISO date the PSC's verification was signed
 * @param {string} input.statementXml - the built PSCVerificationStatement element, e.g. from
 *   companiesHousePscVerificationStatementXml.js's buildPscVerificationStatementBody()
 * @param {string} [input.transactionId] - defaults to the current epoch milliseconds
 * @param {boolean} [input.gatewayTest] - true against the test service
 * @returns {string} the envelope XML
 */
export function buildPscVerificationStatementSubmission({
  presenterId,
  presenterCode,
  companyNumber,
  companyName,
  companyAuthenticationCode,
  packageReference = "",
  submissionNumber,
  dateSigned,
  statementXml,
  transactionId = String(Date.now()),
  gatewayTest = false,
}) {
  return buildFormSubmission({
    presenterId,
    presenterCode,
    companyNumber,
    companyName,
    companyAuthenticationCode,
    packageReference,
    formIdentifier: "PSCVerificationStatement",
    submissionNumber,
    dateSigned,
    formXml: statementXml,
    transactionId,
    gatewayTest,
  });
}

/**
 * Build the GovTalk envelope for a CompanyDataRequest: the pre-populated register data a
 * confirmation statement form is built from (MadeUpDate, NextDueDate, SIC codes, officers, PSCs,
 * statement of capital, shareholdings, registered email), free and synchronous.
 *
 * @param {object} input
 * @param {string} input.presenterId
 * @param {string} input.presenterCode
 * @param {string} input.companyNumber
 * @param {string} input.companyAuthenticationCode - the company's own authentication code, not
 *   the presenter's
 * @param {string} [input.companyType] - the company type prefix (EW, SC, NI, R, OC, SO, NC)
 * @param {string} input.madeUpDate
 * @param {string} [input.transactionId] - defaults to the current epoch milliseconds
 * @param {boolean} [input.gatewayTest] - true against the test service
 * @returns {string} the envelope XML
 */
export function buildCompanyDataRequest({
  presenterId,
  presenterCode,
  companyNumber,
  companyAuthenticationCode,
  companyType,
  madeUpDate,
  transactionId = String(Date.now()),
  gatewayTest = false,
}) {
  const companyTypeXml = companyType ? `\n      <CompanyType>${escapeXmlText(companyType)}</CompanyType>` : "";

  const bodyXml = `<CompanyDataRequest xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/CompanyData-v3-6.xsd">
      <CompanyNumber>${escapeXmlText(companyNumber)}</CompanyNumber>${companyTypeXml}
      <CompanyAuthenticationCode>${escapeXmlText(companyAuthenticationCode)}</CompanyAuthenticationCode>
      <MadeUpDate>${madeUpDate}</MadeUpDate>
    </CompanyDataRequest>`;

  return buildEnvelopeXml({ requestClass: "CompanyDataRequest", transactionId, gatewayTest, presenterId, presenterCode, bodyXml });
}

/**
 * Build the GovTalk envelope for a PaymentPeriodsRequest: whether the confirmation statement's
 * payment period is already paid, free and synchronous.
 *
 * @param {object} input
 * @param {string} input.presenterId
 * @param {string} input.presenterCode
 * @param {string} input.companyNumber
 * @param {string} input.companyAuthenticationCode - the company's own authentication code, not
 *   the presenter's
 * @param {string} [input.companyType] - the company type prefix (EW, SC, NI, R, OC, SO, NC)
 * @param {string} [input.transactionId] - defaults to the current epoch milliseconds
 * @param {boolean} [input.gatewayTest] - true against the test service
 * @returns {string} the envelope XML
 */
export function buildPaymentPeriodsRequest({
  presenterId,
  presenterCode,
  companyNumber,
  companyAuthenticationCode,
  companyType,
  transactionId = String(Date.now()),
  gatewayTest = false,
}) {
  const companyTypeXml = companyType ? `\n      <CompanyType>${escapeXmlText(companyType)}</CompanyType>` : "";

  const bodyXml = `<PaymentPeriodsRequest xmlns="http://xmlgw.companieshouse.gov.uk" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://xmlgw.companieshouse.gov.uk http://xmlgw.companieshouse.gov.uk/v1-0/schema/PaymentPeriods-v1-0.xsd">
      <CompanyNumber>${escapeXmlText(companyNumber)}</CompanyNumber>${companyTypeXml}
      <CompanyAuthenticationCode>${escapeXmlText(companyAuthenticationCode)}</CompanyAuthenticationCode>
    </PaymentPeriodsRequest>`;

  return buildEnvelopeXml({ requestClass: "PaymentPeriodsRequest", transactionId, gatewayTest, presenterId, presenterCode, bodyXml });
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
export function buildStatusRequest({
  presenterId,
  presenterCode,
  submissionNumber,
  companyNumber,
  transactionId = String(Date.now()),
  gatewayTest = false,
}) {
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

function parseAddressElement(addressElement) {
  if (!addressElement) {
    return undefined;
  }
  return {
    premise: firstElementText(addressElement, "Premise"),
    street: firstElementText(addressElement, "Street"),
    thoroughfare: firstElementText(addressElement, "Thoroughfare"),
    postTown: firstElementText(addressElement, "PostTown"),
    county: firstElementText(addressElement, "County"),
    country: firstElementText(addressElement, "Country"),
    postcode: firstElementText(addressElement, "Postcode"),
  };
}

function parseOfficerElement(officerElement, role) {
  const personElement = firstElement(officerElement, "Person");
  const appointmentDate = firstElementText(officerElement, "AppointmentDate");
  const resignationDate = firstElementText(officerElement, "ResignationDate");
  if (personElement) {
    return {
      role,
      type: "person",
      forename: firstElementText(personElement, "Forename"),
      surname: firstElementText(personElement, "Surname"),
      dob: firstElementText(personElement, "DOB"),
      nationality: firstElementText(personElement, "Nationality"),
      countryOfResidence: firstElementText(personElement, "CountryOfResidence"),
      appointmentDate,
      resignationDate,
    };
  }
  const corporateElement = firstElement(officerElement, "Corporate");
  return {
    role,
    type: "corporate",
    corporateName: firstElementText(corporateElement, "CorporateName"),
    appointmentDate,
    resignationDate,
  };
}

// A share class row inside StatementOfCapital/Capital: matches buildStatementOfCapitalXml's
// `shares` field shape exactly, so a form can be pre-filled with the register's own values and
// resubmitted through the same builder unchanged.
function parseShareClassElement(sharesElement) {
  return {
    shareClass: firstElementText(sharesElement, "ShareClass"),
    prescribedParticulars: firstElementText(sharesElement, "PrescribedParticulars"),
    numShares: firstElementText(sharesElement, "NumShares"),
    aggregateNominalValue: firstElementText(sharesElement, "AggregateNominalValue"),
  };
}

function parseStatementOfCapitalElement(statementOfCapitalElement) {
  const capitalElement = firstElement(statementOfCapitalElement, "Capital");
  if (!capitalElement) {
    return undefined;
  }
  return {
    totalAmountUnpaid: firstElementText(capitalElement, "TotalAmountUnpaid"),
    totalNumberOfIssuedShares: firstElementText(capitalElement, "TotalNumberOfIssuedShares"),
    shareCurrency: firstElementText(capitalElement, "ShareCurrency"),
    totalAggregateNominalValue: firstElementText(capitalElement, "TotalAggregateNominalValue"),
    shares: allElements(capitalElement, "Shares").map(parseShareClassElement),
  };
}

// A shareholder's Name is either a Surname/Forename pair or a single AmalgamatedName, matching
// buildShareholderNameXml's two shapes.
function parseShareholderNameElement(nameElement) {
  if (!nameElement) {
    return {};
  }
  const amalgamatedName = firstElementText(nameElement, "AmalgamatedName");
  if (amalgamatedName) {
    return { amalgamatedName };
  }
  return {
    surname: firstElementText(nameElement, "Surname"),
    forename: firstElementText(nameElement, "Forename"),
  };
}

function parseShareholderElement(shareholderElement) {
  return {
    ...parseShareholderNameElement(firstElement(shareholderElement, "Name")),
    address: parseAddressElement(firstElement(shareholderElement, "Address")),
  };
}

function parseTransferElement(transferElement) {
  return {
    dateOfTransfer: firstElementText(transferElement, "DateOfTransfer"),
    numberSharesTransferred: firstElementText(transferElement, "NumberSharesTransferred"),
  };
}

// One Shareholdings element per share class, matching buildShareholdingXml's input shape.
function parseShareholdingElement(shareholdingElement) {
  return {
    shareClass: firstElementText(shareholdingElement, "ShareClass"),
    numberHeld: firstElementText(shareholdingElement, "NumberHeld"),
    transfers: allElements(shareholdingElement, "Transfers").map(parseTransferElement),
    shareholders: allElements(shareholdingElement, "Shareholders").map(parseShareholderElement),
  };
}

/**
 * Parse a CompanyDataRequest answer (the register data a confirmation statement form is built
 * from) into a plain object.
 *
 * @param {string} xml
 * @returns {object|undefined} undefined when the response carries no CompanyData element (e.g. a
 *   GovTalkErrors-only response; the caller reads parseGatewayResponse()'s errors for that case)
 */
export function parseCompanyDataResponse(xml) {
  const document = parseXmlDocument(xml);
  const companyDataElement = firstElement(document, "CompanyData");
  if (!companyDataElement) {
    return undefined;
  }

  const sicCodesElement = firstElement(companyDataElement, "SICCodes");

  return {
    companyNumber: firstElementText(companyDataElement, "CompanyNumber"),
    companyName: firstElementText(companyDataElement, "CompanyName"),
    companyCategory: firstElementText(companyDataElement, "CompanyCategory"),
    jurisdiction: firstElementText(companyDataElement, "Jurisdiction"),
    tradingOnMarket: firstElementText(companyDataElement, "TradingOnMarket") === "true",
    dtr5Applies: firstElementText(companyDataElement, "DTR5Applies") === "true",
    madeUpDate: firstElementText(companyDataElement, "MadeUpDate"),
    nextDueDate: firstElementText(companyDataElement, "NextDueDate"),
    registeredOfficeAddress: parseAddressElement(firstElement(companyDataElement, "RegisteredOfficeAddress")),
    registeredEmailAddress: firstElementText(companyDataElement, "RegisteredEmailAddress"),
    sicCodes: sicCodesElement ? allElements(sicCodesElement, "SICCode").map((element) => element.textContent) : [],
    statementOfCapital: parseStatementOfCapitalElement(firstElement(companyDataElement, "StatementOfCapital")),
    shareholdings: allElements(companyDataElement, "Shareholdings").map(parseShareholdingElement),
    officers: [
      ...allElements(companyDataElement, "Director").map((element) => parseOfficerElement(element, "director")),
      ...allElements(companyDataElement, "Secretary").map((element) => parseOfficerElement(element, "secretary")),
    ],
  };
}

/**
 * Parse a PaymentPeriods answer (whether the confirmation statement's payment period is already
 * paid) into a plain object.
 *
 * @param {string} xml
 * @returns {{periods: Array<{startDate: string|undefined, endDate: string|undefined, periodPaid: boolean}>}|undefined}
 *   undefined when the response carries no PaymentPeriods element
 */
export function parsePaymentPeriodsResponse(xml) {
  const document = parseXmlDocument(xml);
  const paymentPeriodsElement = firstElement(document, "PaymentPeriods");
  if (!paymentPeriodsElement) {
    return undefined;
  }

  const periods = allElements(paymentPeriodsElement, "PaymentPeriod").map((periodElement) => ({
    startDate: firstElementText(periodElement, "StartDate"),
    endDate: firstElementText(periodElement, "EndDate"),
    periodPaid: firstElementText(periodElement, "PeriodPaid") === "true",
  }));

  return { periods };
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

  const result = await executeDynamoDbCommand(
    (module) =>
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
 * Redact the presenter id and presenter authentication value from a GovTalk envelope before it is
 * logged: the plaintext PresenterID a GetSubmissionStatus request body carries, and the hashed
 * SenderID / IDAuthentication Authentication Value every envelope's Header carries (request and
 * response alike, the response echoing the request's SenderDetails).
 * @param {string} xml
 * @returns {string}
 */
export function redactPresenterCredentials(xml) {
  if (typeof xml !== "string") {
    return xml;
  }
  return xml
    .replace(/(<PresenterID>)[\s\S]*?(<\/PresenterID>)/g, "$1***$2")
    .replace(/(<SenderID>)[\s\S]*?(<\/SenderID>)/g, "$1***$2")
    .replace(/(<Authentication>[\s\S]*?<Value>)[\s\S]*?(<\/Value>[\s\S]*?<\/Authentication>)/g, "$1***$2");
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
