// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/hmrc-transaction-engine.js
// HMRC Transaction Engine simulator for CT600 filings, following the Document Submission Protocol.
// Handles: POST /hmrc-transaction-engine/submission - a SUBMISSION_REQUEST, answered with an
//          acknowledgement carrying a CorrelationID and a poll end point;
//          POST /hmrc-transaction-engine/poll - a SUBMISSION_POLL, answered with an acknowledgement
//          the first time (still processing) and then with the final response (the success
//          receipt, or error 2021 when the IRmark does not match), or a DELETE_REQUEST, answered
//          with a delete response.
// A Gov-Test-Scenario header of CT600_REJECT_IRMARK on the submission makes its final response
// error 2021. A scenario of CT600_TRANSIENT_POLL_ERROR makes the second poll answer Gateway error
// 1000, after which the polls carry on as normal. A scenario of CT600_LOST_REPLY keeps the
// submission but answers the submit with HTTP 504; CT600_LOST_REQUEST answers 504 and keeps
// nothing. Both leave the client with no CorrelationID.
// A DATA_REQUEST (Function list) to either path is answered with a DATA_RESPONSE listing the
// submissions held. A poll or delete sent to the submission path is served as on the poll path.
// The response shapes copy what HMRC's Third Party Validation Service returned on 2026-10-05.

import express from "express";
import { randomBytes } from "node:crypto";
import { parseXmlDocument, firstElementText, firstElement, escapeXmlText } from "../../lib/xmlDom.js";
import { computeIrmark, CT600_CLASS, CT600_TEST_IN_LIVE_CLASS } from "../../services/hmrcTransactionEngine.js";

export const SUBMISSION_PATH = "/hmrc-transaction-engine/submission";
export const POLL_PATH = "/hmrc-transaction-engine/poll";
const POLL_INTERVAL_SECONDS = 1;
export const REJECT_IRMARK_SCENARIO = "CT600_REJECT_IRMARK";
export const TRANSIENT_POLL_ERROR_SCENARIO = "CT600_TRANSIENT_POLL_ERROR";
export const LOST_REPLY_SCENARIO = "CT600_LOST_REPLY";
export const LOST_REQUEST_SCENARIO = "CT600_LOST_REQUEST";

const submissions = new Map();

export function resetTransactionEngineSubmissions() {
  submissions.clear();
}

function envelope({
  messageClass,
  qualifier,
  messageFunction,
  correlationId,
  transactionId,
  responseEndPoint,
  errorsXml = "",
  bodyXml = "",
}) {
  const endPoint =
    responseEndPoint === undefined
      ? "<ResponseEndPoint></ResponseEndPoint>"
      : `<ResponseEndPoint PollInterval="${POLL_INTERVAL_SECONDS}">${responseEndPoint}</ResponseEndPoint>`;
  return `<?xml version='1.0' encoding='UTF-8'?><GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>${escapeXmlText(messageClass)}</Class><Qualifier>${qualifier}</Qualifier><Function>${messageFunction}</Function>${transactionId === undefined ? "" : `<TransactionID>${escapeXmlText(transactionId)}</TransactionID>`}<CorrelationID>${correlationId}</CorrelationID>${endPoint}<Transformation>XML</Transformation><GatewayTimestamp>${new Date().toISOString().replace("Z", "")}</GatewayTimestamp></MessageDetails><SenderDetails/></Header><GovTalkDetails><Keys></Keys>${errorsXml}</GovTalkDetails><Body>${bodyXml}</Body></GovTalkMessage>`;
}

function fatalError(text, number) {
  return envelope({
    messageClass: "UndefinedClass",
    qualifier: "error",
    messageFunction: "submit",
    correlationId: "",
    errorsXml: `<GovTalkErrors><Error><RaisedBy>Gateway</RaisedBy><Number>${number}</Number><Type>fatal</Type><Text>${escapeXmlText(text)}</Text><Location></Location></Error></GovTalkErrors>`,
  });
}

function irmarkErrorResponse(messageClass, correlationId) {
  return envelope({
    messageClass,
    qualifier: "error",
    messageFunction: "submit",
    correlationId,
    errorsXml:
      "<GovTalkErrors><Error><RaisedBy>ChRIS</RaisedBy><Number>3001</Number><Type>business</Type><Text>Your submission failed due to business validation errors. Please see below for details.</Text></Error></GovTalkErrors>",
    bodyXml:
      '<ErrorResponse xmlns="http://www.govtalk.gov.uk/CM/errorresponse" SchemaVersion="2.0"><Application><MessageCount>1</MessageCount></Application><Error><RaisedBy>ChRIS</RaisedBy><Number>2021</Number><Type>business</Type><Text>The supplied IRmark is incorrect.</Text><Location>IRmark</Location></Error></ErrorResponse>',
  });
}

function successResponse(messageClass, correlationId, submission) {
  return envelope({
    messageClass,
    qualifier: "response",
    messageFunction: "submit",
    correlationId,
    bodyXml: `<SuccessResponse xmlns="http://www.inlandrevenue.gov.uk/SuccessResponse"><IRmarkReceipt><dsig:Signature xmlns:dsig="http://www.w3.org/2000/09/xmldsig#"><dsig:SignedInfo><dsig:Reference><dsig:DigestValue>${submission.irmark.base64}</dsig:DigestValue></dsig:Reference></dsig:SignedInfo></dsig:Signature><Message code="0000">HMRC has received the ${escapeXmlText(messageClass)} document ref: ${escapeXmlText(submission.utr)}. The associated IRmark was: ${submission.irmark.base32}.</Message></IRmarkReceipt><AcceptedTime>${submission.receivedAt}</AcceptedTime></SuccessResponse>`,
  });
}

function formatReportTime(isoWithoutZone) {
  const [date, time] = isoWithoutZone.split("T");
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year} ${time.slice(0, 8)}`;
}

function dataResponse(messageClass, requestTransactionId, heldClass) {
  const records = [...submissions.entries()]
    .filter(([, submission]) => submission.messageClass === heldClass)
    .map(
      ([correlationId, submission]) =>
        `<StatusRecord><TimeStamp>${formatReportTime(submission.receivedAt)}</TimeStamp><CorrelationID>${correlationId}</CorrelationID><TransactionID>${submission.transactionId}</TransactionID><Identifiers><Identifier Type="UTR">${escapeXmlText(submission.utr)}</Identifier></Identifiers><Status>${submission.polls >= 2 ? "SUBMISSION_RESPONSE" : "SUBMISSION_ACKNOWLEDGE"}</Status></StatusRecord>`,
    )
    .join("");
  return envelope({
    messageClass,
    qualifier: "response",
    messageFunction: "list",
    correlationId: "",
    transactionId: requestTransactionId,
    responseEndPoint: POLL_PATH,
    bodyXml: `<StatusReport><SenderID/><StartTimeStamp/><EndTimeStamp/>${records}</StatusReport>`,
  });
}

function sendXml(res, xml) {
  res.setHeader("Content-Type", "text/xml; charset=utf-8");
  return res.status(200).send(xml);
}

function parseMessage(body) {
  return parseXmlDocument((body || "").replace(/^\s*<\?xml[^?]*\?>/, ""));
}

export function apiEndpoint(app) {
  app.post(SUBMISSION_PATH, express.text({ type: () => true, limit: "30mb" }), (req, res) => {
    console.log(`[http-simulator:hmrc-transaction-engine] POST ${SUBMISSION_PATH}`);
    let document;
    try {
      document = parseMessage(req.body);
    } catch {
      return sendXml(res, fatalError("The submitted XML document was badly formed.", 1001));
    }
    const messageClass = firstElementText(document, "Class");
    if (messageClass !== CT600_CLASS && messageClass !== CT600_TEST_IN_LIVE_CLASS) {
      return sendXml(res, fatalError(`The class ${messageClass} is not served here`, 1002));
    }
    const messageFunction = firstElementText(document, "Function");
    if (messageFunction === "list")
      return sendXml(res, dataResponse(messageClass, firstElementText(document, "TransactionID"), messageClass));
    if (firstElementText(document, "Qualifier") === "poll" || messageFunction === "delete") return followOn(res, document);
    if (firstElementText(document, "Qualifier") !== "request" || messageFunction !== "submit") {
      return sendXml(res, fatalError("A submission is Qualifier request, Function submit", 1002));
    }
    const returnType = firstElement(document, "CompanyTaxReturn")?.getAttribute("ReturnType");
    if (returnType !== undefined && returnType !== null && returnType !== "new" && returnType !== "amended") {
      return sendXml(res, fatalError(`The ReturnType ${returnType} is not new or amended`, 1003));
    }
    const suppliedIrmark = firstElement(document, "IRmark")?.textContent || "";
    const irmark = computeIrmark(req.body);
    const correlationId = randomBytes(16).toString("hex").toUpperCase();
    const scenario = req.get("Gov-Test-Scenario");
    if (scenario === LOST_REQUEST_SCENARIO) return res.status(504).send("");
    submissions.set(correlationId, {
      messageClass,
      transactionId: firstElementText(document, "TransactionID") || "",
      utr: firstElementText(document, "Key") || "",
      irmark,
      irmarkMatches: suppliedIrmark === irmark.base64 && req.get("Gov-Test-Scenario") !== REJECT_IRMARK_SCENARIO,
      polls: 0,
      transientPollError: req.get("Gov-Test-Scenario") === TRANSIENT_POLL_ERROR_SCENARIO,
      receivedAt: new Date().toISOString().replace("Z", ""),
    });
    if (scenario === LOST_REPLY_SCENARIO) return res.status(504).send("");
    return sendXml(
      res,
      envelope({ messageClass, qualifier: "acknowledgement", messageFunction: "submit", correlationId, responseEndPoint: POLL_PATH }),
    );
  });

  app.post(POLL_PATH, express.text({ type: () => true }), (req, res) => {
    console.log(`[http-simulator:hmrc-transaction-engine] POST ${POLL_PATH}`);
    let document;
    try {
      document = parseMessage(req.body);
    } catch {
      return sendXml(res, fatalError("The submitted XML document was badly formed.", 1001));
    }
    if (firstElementText(document, "Function") === "list") {
      const messageClass = firstElementText(document, "Class");
      return sendXml(res, dataResponse(messageClass, firstElementText(document, "TransactionID"), messageClass));
    }
    return followOn(res, document);
  });
}

function followOn(res, document) {
  const correlationId = firstElementText(document, "CorrelationID") || "";
  const submission = submissions.get(correlationId);
  if (!submission) return sendXml(res, fatalError(`No submission has CorrelationID ${correlationId}`, 2000));
  const messageFunction = firstElementText(document, "Function");
  if (messageFunction === "delete") {
    submissions.delete(correlationId);
    return sendXml(
      res,
      envelope({ messageClass: submission.messageClass, qualifier: "response", messageFunction: "delete", correlationId }),
    );
  }
  if (firstElementText(document, "Qualifier") !== "poll")
    return sendXml(res, fatalError("A poll is Qualifier poll, Function submit", 1002));
  submission.polls += 1;
  if (submission.polls === 1) {
    return sendXml(
      res,
      envelope({
        messageClass: submission.messageClass,
        qualifier: "acknowledgement",
        messageFunction: "submit",
        correlationId,
        responseEndPoint: POLL_PATH,
      }),
    );
  }
  if (submission.transientPollError && submission.polls === 2) {
    return sendXml(res, fatalError("System failure. The submission of this document has failed due to an internal system error.", 1000));
  }
  return sendXml(
    res,
    submission.irmarkMatches
      ? successResponse(submission.messageClass, correlationId, submission)
      : irmarkErrorResponse(submission.messageClass, correlationId),
  );
}
