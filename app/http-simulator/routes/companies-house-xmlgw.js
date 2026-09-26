// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/companies-house-xmlgw.js
// Companies House XML Gateway simulator.
// Handles: POST /v1-0/xmlgw/Gateway - Class=Accounts, Class=ConfirmationAndVerificationStatement
//          (or ConfirmationStatement) and Class=PSCVerificationStatement submissions,
//          Class=CompanyDataRequest and Class=PaymentPeriodsRequest reads, and
//          Class=GetSubmissionStatus polls for any of them, all arrive at the same endpoint.

import express from "express";
import { parseXmlDocument, firstElementText, firstElement, allElements, escapeXmlText } from "../../lib/xmlDom.js";
import { submitAccounts, pollStatus } from "../scenarios/accounts-filing.js";
import {
  requestCompanyData,
  requestPaymentPeriods,
  submitConfirmationStatement,
  pollConfirmationStatement,
} from "../scenarios/confirmation-statement.js";
import { submitPscVerificationStatement, pollPscVerificationStatement } from "../scenarios/psc-verification-statement.js";

const GATEWAY_PATH = "/v1-0/xmlgw/Gateway";

function buildErrorsXml(errors) {
  const errorItems = errors
    .map(
      (error) => `      <Error>
        <RaisedBy>${escapeXmlText(error.raisedBy)}</RaisedBy>
${error.number !== undefined ? `        <Number>${error.number}</Number>\n` : ""}        <Type>${escapeXmlText(error.type)}</Type>
        <Text>${escapeXmlText(error.text)}</Text>
${error.location ? `        <Location>${escapeXmlText(error.location)}</Location>\n` : ""}      </Error>`,
    )
    .join("\n");
  return `    <GovTalkErrors>
${errorItems}
    </GovTalkErrors>`;
}

function buildResponseEnvelope({ requestClass, transactionId, qualifier, errors, gatewayTimestamp, pollInterval, bodyXml }) {
  const messageDetailsExtras = [
    pollInterval !== undefined ? `      <ResponseEndPoint PollInterval="${pollInterval}">${GATEWAY_PATH}</ResponseEndPoint>` : null,
    gatewayTimestamp ? `      <GatewayTimestamp>${gatewayTimestamp}</GatewayTimestamp>` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const govTalkDetailsXml = errors && errors.length > 0 ? buildErrorsXml(errors) : "    <Keys/>";

  return `<?xml version="1.0" encoding="UTF-8"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope">
  <EnvelopeVersion>1.0</EnvelopeVersion>
  <Header>
    <MessageDetails>
      <Class>${escapeXmlText(requestClass)}</Class>
      <Qualifier>${qualifier}</Qualifier>
      <TransactionID>${escapeXmlText(transactionId)}</TransactionID>
${messageDetailsExtras ? messageDetailsExtras + "\n" : ""}    </MessageDetails>
  </Header>
  <GovTalkDetails>
${govTalkDetailsXml}
  </GovTalkDetails>
  <Body>${bodyXml || ""}</Body>
</GovTalkMessage>
`;
}

function buildSubmissionStatusBodyXml(status) {
  const rejectionsXml =
    status.rejections && status.rejections.length > 0
      ? `<Rejections>${status.rejections
          .map(
            (reject) =>
              `<Reject><RejectCode>${escapeXmlText(reject.rejectCode)}</RejectCode><Description>${escapeXmlText(
                reject.description,
              )}</Description><InstanceNumber>${escapeXmlText(reject.instanceNumber)}</InstanceNumber></Reject>`,
          )
          .join("")}</Rejections>`
      : "<Rejections></Rejections>";

  return `<SubmissionStatus><Status><SubmissionNumber>${escapeXmlText(status.submissionNumber)}</SubmissionNumber><StatusCode>${
    status.statusCode
  }</StatusCode>${status.companyNumber ? `<CompanyNumber>${escapeXmlText(status.companyNumber)}</CompanyNumber>` : ""}${rejectionsXml}</Status></SubmissionStatus>`;
}

const REGISTERED_OFFICE_ADDRESS_FIELDS = [
  ["premise", "Premise"],
  ["street", "Street"],
  ["thoroughfare", "Thoroughfare"],
  ["postTown", "PostTown"],
  ["county", "County"],
  ["country", "Country"],
  ["postcode", "Postcode"],
];

function buildRegisteredOfficeAddressXml(address) {
  if (!address) {
    return "";
  }
  return REGISTERED_OFFICE_ADDRESS_FIELDS.filter(([field]) => address[field])
    .map(([field, tag]) => `<${tag}>${escapeXmlText(address[field])}</${tag}>`)
    .join("");
}

// CompanyDataDirectorType (and its Secretary equivalent) carries more than this - a service
// address, nationality, a residential address - the simulator emits only the fields
// parseCompanyDataResponse() reads, matching how the accounts scenario below stands in for the
// gateway's own business logic rather than its full schema shape.
function buildOfficerXml(officer) {
  const tag = officer.role === "secretary" ? "Secretary" : "Director";
  return `<${tag}><Person><Forename>${escapeXmlText(officer.forename)}</Forename><Surname>${escapeXmlText(officer.surname)}</Surname><DOB>${
    officer.dob
  }</DOB></Person><AppointmentDate>${officer.appointmentDate}</AppointmentDate></${tag}>`;
}

function buildStatementOfCapitalXml(statementOfCapital) {
  const sharesXml = (statementOfCapital.shares || [])
    .map(
      (share) =>
        `<Shares><ShareClass>${escapeXmlText(share.shareClass)}</ShareClass><PrescribedParticulars>${escapeXmlText(
          share.prescribedParticulars,
        )}</PrescribedParticulars><NumShares>${share.numShares}</NumShares><AggregateNominalValue>${
          share.aggregateNominalValue
        }</AggregateNominalValue></Shares>`,
    )
    .join("");
  return `<StatementOfCapital><Capital><TotalAmountUnpaid>${statementOfCapital.totalAmountUnpaid}</TotalAmountUnpaid><TotalNumberOfIssuedShares>${
    statementOfCapital.totalNumberOfIssuedShares
  }</TotalNumberOfIssuedShares><ShareCurrency>${escapeXmlText(
    statementOfCapital.shareCurrency,
  )}</ShareCurrency><TotalAggregateNominalValue>${statementOfCapital.totalAggregateNominalValue}</TotalAggregateNominalValue>${sharesXml}</Capital></StatementOfCapital>`;
}

function buildShareholdingXml(shareholding) {
  const shareholdersXml = (shareholding.shareholders || [])
    .map(
      (shareholder) =>
        `<Shareholders><Name><Surname>${escapeXmlText(shareholder.surname)}</Surname><Forename>${escapeXmlText(
          shareholder.forename,
        )}</Forename></Name></Shareholders>`,
    )
    .join("");
  return `<Shareholdings><ShareClass>${escapeXmlText(shareholding.shareClass)}</ShareClass><NumberHeld>${
    shareholding.numberHeld
  }</NumberHeld>${shareholdersXml}</Shareholdings>`;
}

function buildCompanyDataBodyXml(company) {
  const officersXml = (company.officers || []).map(buildOfficerXml).join("");
  const sicCodesXml = (company.sicCodes || []).map((code) => `<SICCode>${escapeXmlText(code)}</SICCode>`).join("");
  const statementOfCapitalXml = company.statementOfCapital ? buildStatementOfCapitalXml(company.statementOfCapital) : "";
  const shareholdingsXml = (company.shareholdings || []).map(buildShareholdingXml).join("");

  return `<CompanyData xmlns="http://xmlgw.companieshouse.gov.uk"><CompanyNumber>${escapeXmlText(
    company.companyNumber,
  )}</CompanyNumber><CompanyName>${escapeXmlText(company.companyName)}</CompanyName><CompanyCategory>${escapeXmlText(
    company.companyCategory,
  )}</CompanyCategory><Jurisdiction>${escapeXmlText(company.jurisdiction)}</Jurisdiction><TradingOnMarket>${
    company.tradingOnMarket
  }</TradingOnMarket><DTR5Applies>${company.dtr5Applies}</DTR5Applies><MadeUpDate>${company.madeUpDate}</MadeUpDate><NextDueDate>${
    company.nextDueDate
  }</NextDueDate><RegisteredOfficeAddress>${buildRegisteredOfficeAddressXml(
    company.registeredOfficeAddress,
  )}</RegisteredOfficeAddress><RegisteredEmailAddress>${escapeXmlText(
    company.registeredEmailAddress,
  )}</RegisteredEmailAddress><SICCodes>${sicCodesXml}</SICCodes><Officers>${officersXml}</Officers>${statementOfCapitalXml}${shareholdingsXml}</CompanyData>`;
}

function buildPaymentPeriodsBodyXml(periodPaid) {
  return `<PaymentPeriods xmlns="http://xmlgw.companieshouse.gov.uk"><PaymentPeriod><StartDate>2025-09-22</StartDate><EndDate>2026-09-21</EndDate><PeriodPaid>${periodPaid}</PeriodPaid></PaymentPeriod></PaymentPeriods>`;
}

// Every published error code the simulator can return here also has to name where the missing
// or invalid element was, so the route error, not just the scenario module's fixed cases, points
// at the actual first thing wrong with the request.
function schemaFailureFor(location) {
  return {
    errors: [
      {
        raisedBy: "Gateway",
        number: 604,
        type: "fatal",
        text: "Invalid Request - Request XML contains missing fields or invalid data",
        location,
      },
    ],
  };
}

// The sandbox's test service rejects this element outright, verbatim wording and all: 2026-09-13
// against ci-b29w2, submission numbers 000002 and 000003 both got this back for an envelope that
// wrapped DateSigned in Authority/Designation. FormSubmission-v2-11.xsd carries no Authority
// element - FormHeader is followed directly by a bare DateSigned - so any envelope built from an
// older worked example (the published Accounts.xml is against v2-5) reaches the real gateway
// with an element it no longer accepts.
const AUTHORITY_ELEMENT_ERROR = {
  raisedBy: "Accounts",
  number: 9999,
  type: "fatal",
  text: "No element 'Authority' in class CompaniesHouse::Filing::Accounts",
  location: "",
};

function parseCredentials(document) {
  return {
    senderIdHash: (firstElementText(document, "SenderID") || "").toLowerCase(),
    authValueHash: (firstElementText(document, "Value") || "").toLowerCase(),
  };
}

function handleAccounts(document, { senderIdHash, authValueHash, scenario }) {
  const formHeader = firstElement(document, "FormHeader");
  if (!formHeader) {
    return schemaFailureFor("Body/FormSubmission/FormHeader");
  }
  if (firstElement(document, "Authority")) {
    return { errors: [AUTHORITY_ELEMENT_ERROR] };
  }

  const companyNumber = firstElementText(formHeader, "CompanyNumber");
  const companyName = firstElementText(formHeader, "CompanyName");
  const formIdentifier = firstElementText(formHeader, "FormIdentifier");
  const submissionNumber = firstElementText(formHeader, "SubmissionNumber");
  const documentData = firstElementText(document, "Data");

  if (!companyNumber) return schemaFailureFor("Body/FormSubmission/FormHeader/CompanyNumber");
  if (!companyName) return schemaFailureFor("Body/FormSubmission/FormHeader/CompanyName");
  if (!formIdentifier) return schemaFailureFor("Body/FormSubmission/FormHeader/FormIdentifier");
  if (!submissionNumber) return schemaFailureFor("Body/FormSubmission/FormHeader/SubmissionNumber");
  if (!documentData) return schemaFailureFor("Body/FormSubmission/Document/Data");

  const outcome = submitAccounts({ senderIdHash, authValueHash, submissionNumber, companyNumber, scenario });
  if (outcome.errors) {
    return { errors: outcome.errors };
  }
  return {
    qualifier: "acknowledgement",
    gatewayTimestamp: outcome.gatewayTimestamp,
    pollInterval: outcome.pollInterval,
    bodyXml: "",
  };
}

function isNoTransactionFound(outcome) {
  return outcome.errors && outcome.errors.length === 1 && outcome.errors[0].text === "No Transaction Found";
}

function handleGetSubmissionStatus(document, { senderIdHash, authValueHash, scenario }) {
  const getSubmissionStatus = firstElement(document, "GetSubmissionStatus");
  if (!getSubmissionStatus) {
    return schemaFailureFor("Body/GetSubmissionStatus");
  }

  const presenterId = firstElementText(getSubmissionStatus, "PresenterID");
  const submissionNumber = firstElementText(getSubmissionStatus, "SubmissionNumber");
  if (!presenterId) {
    return schemaFailureFor("Body/GetSubmissionStatus/PresenterID");
  }
  if (!submissionNumber) {
    return schemaFailureFor("Body/GetSubmissionStatus/SubmissionNumber");
  }

  // Submission numbers are unique across the whole presenter (one shared counter backs every
  // form), so at most one of the three registries ever carries a given number: try accounts
  // first, then the confirmation statement, and only consult the PSC verification statement
  // registry when both of those genuinely have no record.
  const accountsOutcome = pollStatus({ senderIdHash, authValueHash, submissionNumber, scenario });
  const confirmationStatementOutcome = isNoTransactionFound(accountsOutcome)
    ? (pollConfirmationStatement({ senderIdHash, authValueHash, submissionNumber, scenario }) ?? accountsOutcome)
    : accountsOutcome;
  const outcome = isNoTransactionFound(confirmationStatementOutcome)
    ? (pollPscVerificationStatement({ senderIdHash, authValueHash, submissionNumber, scenario }) ?? confirmationStatementOutcome)
    : confirmationStatementOutcome;

  if (outcome.errors) {
    return { errors: outcome.errors };
  }
  return {
    qualifier: "response",
    bodyXml: buildSubmissionStatusBodyXml(outcome),
  };
}

function handleConfirmationStatement(document, { senderIdHash, authValueHash, scenario }) {
  const formHeader = firstElement(document, "FormHeader");
  if (!formHeader) {
    return schemaFailureFor("Body/FormSubmission/FormHeader");
  }

  const companyNumber = firstElementText(formHeader, "CompanyNumber");
  const companyName = firstElementText(formHeader, "CompanyName");
  const formIdentifier = firstElementText(formHeader, "FormIdentifier");
  const submissionNumber = firstElementText(formHeader, "SubmissionNumber");

  if (!companyNumber) return schemaFailureFor("Body/FormSubmission/FormHeader/CompanyNumber");
  if (!companyName) return schemaFailureFor("Body/FormSubmission/FormHeader/CompanyName");
  if (!formIdentifier) return schemaFailureFor("Body/FormSubmission/FormHeader/FormIdentifier");
  if (!submissionNumber) return schemaFailureFor("Body/FormSubmission/FormHeader/SubmissionNumber");

  const statementElement =
    firstElement(document, "ConfirmationAndVerificationStatement") || firstElement(document, "ConfirmationStatement");
  if (!statementElement) {
    return schemaFailureFor("Body/FormSubmission/Form");
  }
  if (!firstElementText(statementElement, "ReviewDate")) {
    return schemaFailureFor("Body/FormSubmission/Form/ReviewDate");
  }

  const outcome = submitConfirmationStatement({ senderIdHash, authValueHash, submissionNumber, companyNumber, scenario });
  if (outcome.errors) {
    return { errors: outcome.errors };
  }
  return {
    qualifier: "acknowledgement",
    gatewayTimestamp: outcome.gatewayTimestamp,
    pollInterval: outcome.pollInterval,
    bodyXml: "",
  };
}

function handlePscVerificationStatement(document, { senderIdHash, authValueHash, scenario }) {
  const formHeader = firstElement(document, "FormHeader");
  if (!formHeader) {
    return schemaFailureFor("Body/FormSubmission/FormHeader");
  }

  const companyNumber = firstElementText(formHeader, "CompanyNumber");
  const companyName = firstElementText(formHeader, "CompanyName");
  const formIdentifier = firstElementText(formHeader, "FormIdentifier");
  const submissionNumber = firstElementText(formHeader, "SubmissionNumber");

  if (!companyNumber) return schemaFailureFor("Body/FormSubmission/FormHeader/CompanyNumber");
  if (!companyName) return schemaFailureFor("Body/FormSubmission/FormHeader/CompanyName");
  if (!formIdentifier) return schemaFailureFor("Body/FormSubmission/FormHeader/FormIdentifier");
  if (!submissionNumber) return schemaFailureFor("Body/FormSubmission/FormHeader/SubmissionNumber");

  const statementElement = firstElement(document, "PSCVerificationStatement");
  if (!statementElement) {
    return schemaFailureFor("Body/FormSubmission/Form");
  }
  if (!firstElement(statementElement, "Individual")) {
    return schemaFailureFor("Body/FormSubmission/Form/Individual");
  }

  const outcome = submitPscVerificationStatement({ senderIdHash, authValueHash, submissionNumber, companyNumber, scenario });
  if (outcome.errors) {
    return { errors: outcome.errors };
  }
  return {
    qualifier: "acknowledgement",
    gatewayTimestamp: outcome.gatewayTimestamp,
    pollInterval: outcome.pollInterval,
    bodyXml: "",
  };
}

function handleCompanyDataRequest(document, { senderIdHash, authValueHash, scenario }) {
  const companyDataRequest = firstElement(document, "CompanyDataRequest");
  if (!companyDataRequest) {
    return schemaFailureFor("Body/CompanyDataRequest");
  }

  const companyNumber = firstElementText(companyDataRequest, "CompanyNumber");
  const companyAuthenticationCode = firstElementText(companyDataRequest, "CompanyAuthenticationCode");
  if (!companyNumber) return schemaFailureFor("Body/CompanyDataRequest/CompanyNumber");
  if (!companyAuthenticationCode) return schemaFailureFor("Body/CompanyDataRequest/CompanyAuthenticationCode");

  const outcome = requestCompanyData({ senderIdHash, authValueHash, companyNumber, companyAuthenticationCode, scenario });
  if (outcome.errors) {
    return { errors: outcome.errors };
  }
  return { qualifier: "response", bodyXml: buildCompanyDataBodyXml(outcome.company) };
}

function handlePaymentPeriodsRequest(document, { senderIdHash, authValueHash, scenario }) {
  const paymentPeriodsRequest = firstElement(document, "PaymentPeriodsRequest");
  if (!paymentPeriodsRequest) {
    return schemaFailureFor("Body/PaymentPeriodsRequest");
  }

  const companyNumber = firstElementText(paymentPeriodsRequest, "CompanyNumber");
  const companyAuthenticationCode = firstElementText(paymentPeriodsRequest, "CompanyAuthenticationCode");
  if (!companyNumber) return schemaFailureFor("Body/PaymentPeriodsRequest/CompanyNumber");
  if (!companyAuthenticationCode) return schemaFailureFor("Body/PaymentPeriodsRequest/CompanyAuthenticationCode");

  const outcome = requestPaymentPeriods({ senderIdHash, authValueHash, companyNumber, companyAuthenticationCode, scenario });
  if (outcome.errors) {
    return { errors: outcome.errors };
  }
  return { qualifier: "response", bodyXml: buildPaymentPeriodsBodyXml(outcome.periodPaid) };
}

export function apiEndpoint(app) {
  // The real gateway expects Content-Type: text/xml. express.json()/urlencoded() (registered
  // globally in server.js) skip bodies whose content type they don't recognise, so this route
  // parses its own raw body regardless of what Content-Type arrives with.
  app.post(GATEWAY_PATH, express.text({ type: () => true }), (req, res) => {
    const govTestScenario = req.headers["gov-test-scenario"];

    console.log(`[http-simulator:companies-house-xmlgw] POST ${GATEWAY_PATH}`);

    let document;
    try {
      document = parseXmlDocument(req.body || "");
    } catch {
      res.setHeader("Content-Type", "text/xml; charset=utf-8");
      return res.status(200).send(
        buildResponseEnvelope({
          requestClass: "Unknown",
          transactionId: "0",
          qualifier: "error",
          errors: [
            {
              raisedBy: "Gateway",
              number: 604,
              type: "fatal",
              text: "Invalid Request - Request XML contains missing fields or invalid data",
            },
          ],
        }),
      );
    }

    const requestClass = firstElementText(document, "Class");
    const transactionId = firstElementText(document, "TransactionID") || "0";
    const credentials = parseCredentials(document);

    let outcome;
    if (requestClass === "Accounts") {
      outcome = handleAccounts(document, { ...credentials, scenario: govTestScenario });
    } else if (requestClass === "ConfirmationAndVerificationStatement" || requestClass === "ConfirmationStatement") {
      outcome = handleConfirmationStatement(document, { ...credentials, scenario: govTestScenario });
    } else if (requestClass === "PSCVerificationStatement") {
      outcome = handlePscVerificationStatement(document, { ...credentials, scenario: govTestScenario });
    } else if (requestClass === "CompanyDataRequest") {
      outcome = handleCompanyDataRequest(document, { ...credentials, scenario: govTestScenario });
    } else if (requestClass === "PaymentPeriodsRequest") {
      outcome = handlePaymentPeriodsRequest(document, { ...credentials, scenario: govTestScenario });
    } else if (requestClass === "GetSubmissionStatus") {
      outcome = handleGetSubmissionStatus(document, { ...credentials, scenario: govTestScenario });
    } else {
      outcome = schemaFailureFor("Header/MessageDetails/Class");
    }

    const responseXml = buildResponseEnvelope({
      requestClass: requestClass || "Unknown",
      transactionId,
      qualifier: outcome.errors ? "error" : outcome.qualifier,
      errors: outcome.errors,
      gatewayTimestamp: outcome.gatewayTimestamp,
      pollInterval: outcome.pollInterval,
      bodyXml: outcome.bodyXml,
    });

    res.setHeader("Content-Type", "text/xml; charset=utf-8");
    res.status(200).send(responseXml);
  });
}

export { GATEWAY_PATH };
