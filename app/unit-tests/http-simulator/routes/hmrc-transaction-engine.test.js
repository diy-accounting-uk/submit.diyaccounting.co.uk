// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/http-simulator/routes/hmrc-transaction-engine.test.js

import { describe, test, expect, beforeEach } from "vitest";
import express from "express";
import request from "supertest";
import {
  apiEndpoint,
  SUBMISSION_PATH,
  POLL_PATH,
  resetTransactionEngineSubmissions,
} from "@app/http-simulator/routes/hmrc-transaction-engine.js";
import {
  buildCt600SubmissionRequest,
  buildPollRequest,
  buildDeleteRequest,
  parseTransactionEngineResponse,
} from "@app/services/hmrcTransactionEngine.js";

const IR_ENVELOPE =
  '<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CT/5"><IRheader><Keys><Key Type="UTR">8596148860</Key></Keys><PeriodEnd>2026-03-31</PeriodEnd><DefaultCurrency>GBP</DefaultCurrency><IRmark Type="generic"></IRmark><Sender>Company</Sender></IRheader><CompanyTaxReturn ReturnType="new"/></IRenvelope>';

function submissionXml() {
  return buildCt600SubmissionRequest({
    senderId: "user1",
    password: "password1",
    utr: "8596148860",
    vendorId: "1000",
    productName: "DIY Accounting Submit",
    productVersion: "1.0",
    irEnvelopeXml: IR_ENVELOPE,
    gatewayTest: true,
  });
}

function app() {
  const server = express();
  apiEndpoint(server);
  return server;
}

async function post(server, path, xml) {
  const response = await request(server).post(path).set("Content-Type", "text/xml").send(xml);
  expect(response.status).toBe(200);
  return parseTransactionEngineResponse(response.text);
}

describe("HMRC Transaction Engine simulator", () => {
  beforeEach(() => {
    resetTransactionEngineSubmissions();
  });

  test("acknowledges a submission, answers the poll with a receipt for its IRmark, then deletes it", async () => {
    const server = app();
    const { xml, irmark } = submissionXml();
    const acknowledgement = await post(server, SUBMISSION_PATH, xml);
    expect(acknowledgement.qualifier).toBe("acknowledgement");
    expect(acknowledgement.correlationId).toMatch(/^[0-9A-F]{32}$/);
    expect(acknowledgement.responseEndPoint).toBe(POLL_PATH);
    expect(acknowledgement.pollIntervalSeconds).toBe(1);

    const response = await post(server, POLL_PATH, buildPollRequest({ correlationId: acknowledgement.correlationId, gatewayTest: true }));
    expect(response.qualifier).toBe("response");
    expect(response.irmarkReceipt).toBe(irmark.base64);
    expect(response.successMessage).toContain(irmark.base32);

    const deleted = await post(server, POLL_PATH, buildDeleteRequest({ correlationId: acknowledgement.correlationId, gatewayTest: true }));
    expect(deleted).toMatchObject({ qualifier: "response", messageFunction: "delete" });
    const afterDelete = await post(
      server,
      POLL_PATH,
      buildPollRequest({ correlationId: acknowledgement.correlationId, gatewayTest: true }),
    );
    expect(afterDelete.qualifier).toBe("error");
  });

  test("answers error 2021 when the IRmark does not match the Body", async () => {
    const server = app();
    const tampered = submissionXml().xml.replace("<Sender>Company</Sender>", "<Sender>Agent</Sender>");
    const acknowledgement = await post(server, SUBMISSION_PATH, tampered);
    const response = await post(server, POLL_PATH, buildPollRequest({ correlationId: acknowledgement.correlationId, gatewayTest: true }));
    expect(response.qualifier).toBe("error");
    expect(response.businessErrors[0]).toMatchObject({ number: "2021", text: "The supplied IRmark is incorrect." });
  });

  test("answers a fatal error for a badly formed message or another class", async () => {
    const server = app();
    const malformed = await post(server, SUBMISSION_PATH, "<GovTalkMessage><Body>");
    expect(malformed.qualifier).toBe("error");
    expect(malformed.errors[0].type).toBe("fatal");
    const otherClass = await post(
      server,
      SUBMISSION_PATH,
      submissionXml().xml.replace("<Class>HMRC-CT-CT600</Class>", "<Class>HMRC-SA-SA100</Class>"),
    );
    expect(otherClass.errors[0].text).toContain("HMRC-SA-SA100");
  });
});
