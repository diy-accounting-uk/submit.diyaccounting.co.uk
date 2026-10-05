// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/http-simulator/routes/hmrc-transaction-engine.js
// HMRC Transaction Engine simulator for CT600 filings, following the Document Submission Protocol.
// Handles: POST /hmrc-transaction-engine/submission - a SUBMISSION_REQUEST, answered with an
//          acknowledgement carrying a CorrelationID and a poll end point;
//          POST /hmrc-transaction-engine/poll - a SUBMISSION_POLL, answered with the final
//          response (the success receipt, or error 2021 when the IRmark does not match), or a
//          DELETE_REQUEST, answered with a delete response.
// The response shapes copy what HMRC's Third Party Validation Service returned on 2026-10-05.

import express from "express";
import { randomBytes } from "node:crypto";
import { parseXmlDocument, firstElementText, firstElement, escapeXmlText } from "../../lib/xmlDom.js";
import { computeIrmark, CT600_CLASS, CT600_TEST_IN_LIVE_CLASS } from "../../services/hmrcTransactionEngine.js";

export const SUBMISSION_PATH = "/hmrc-transaction-engine/submission";
export const POLL_PATH = "/hmrc-transaction-engine/poll";
const POLL_INTERVAL_SECONDS = 1;

const submissions = new Map();

export function resetTransactionEngineSubmissions() {
  submissions.clear();
}

function envelope({ messageClass, qualifier, messageFunction, correlationId, responseEndPoint, errorsXml = "", bodyXml = "" }) {
  const endPoint =
    responseEndPoint === undefined
      ? "<ResponseEndPoint></ResponseEndPoint>"
      : `<ResponseEndPoint PollInterval="${POLL_INTERVAL_SECONDS}">${responseEndPoint}</ResponseEndPoint>`;
  return `<?xml version='1.0' encoding='UTF-8'?><GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>${escapeXmlText(messageClass)}</Class><Qualifier>${qualifier}</Qualifier><Function>${messageFunction}</Function><CorrelationID>${correlationId}</CorrelationID>${endPoint}<Transformation>XML</Transformation><GatewayTimestamp>${new Date().toISOString().replace("Z", "")}</GatewayTimestamp></MessageDetails><SenderDetails/></Header><GovTalkDetails><Keys></Keys>${errorsXml}</GovTalkDetails><Body>${bodyXml}</Body></GovTalkMessage>`;
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
    if (firstElementText(document, "Qualifier") !== "request" || firstElementText(document, "Function") !== "submit") {
      return sendXml(res, fatalError("A submission is Qualifier request, Function submit", 1002));
    }
    const suppliedIrmark = firstElement(document, "IRmark")?.textContent || "";
    const irmark = computeIrmark(req.body);
    const correlationId = randomBytes(16).toString("hex").toUpperCase();
    submissions.set(correlationId, {
      messageClass,
      utr: firstElementText(document, "Key") || "",
      irmark,
      irmarkMatches: suppliedIrmark === irmark.base64,
      receivedAt: new Date().toISOString().replace("Z", ""),
    });
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
    return sendXml(
      res,
      submission.irmarkMatches
        ? successResponse(submission.messageClass, correlationId, submission)
        : irmarkErrorResponse(submission.messageClass, correlationId),
    );
  });
}
