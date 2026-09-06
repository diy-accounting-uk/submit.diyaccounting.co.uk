// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/routes/companies-house-xmlgw.js
// Companies House XML Gateway simulator.
// Handles: POST /v1-0/xmlgw/Gateway (both Class=Accounts submissions and
//          Class=GetSubmissionStatus polls arrive at the same endpoint)

import express from "express";
import { parseXmlDocument, firstElementText, firstElement, allElements, escapeXmlText } from "../../lib/xmlDom.js";
import { submitAccounts, pollStatus } from "../scenarios/accounts-filing.js";

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

  const outcome = pollStatus({ senderIdHash, authValueHash, submissionNumber, scenario });
  if (outcome.errors) {
    return { errors: outcome.errors };
  }
  return {
    qualifier: "response",
    bodyXml: buildSubmissionStatusBodyXml(outcome),
  };
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
      return res
        .status(200)
        .send(
          buildResponseEnvelope({
            requestClass: "Unknown",
            transactionId: "0",
            qualifier: "error",
            errors: [{ raisedBy: "Gateway", number: 604, type: "fatal", text: "Invalid Request - Request XML contains missing fields or invalid data" }],
          }),
        );
    }

    const requestClass = firstElementText(document, "Class");
    const transactionId = firstElementText(document, "TransactionID") || "0";
    const credentials = parseCredentials(document);

    let outcome;
    if (requestClass === "Accounts") {
      outcome = handleAccounts(document, { ...credentials, scenario: govTestScenario });
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
