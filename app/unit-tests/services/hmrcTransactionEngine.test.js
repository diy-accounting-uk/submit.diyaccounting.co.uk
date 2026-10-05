// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcTransactionEngine.test.js

import { describe, test, expect, afterEach } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  computeIrmark,
  withIrmark,
  newTransactionId,
  buildCt600SubmissionRequest,
  buildPollRequest,
  buildDeleteRequest,
  parseTransactionEngineResponse,
  getTransactionEngineSubmissionUrl,
  CT600_CLASS,
  CT600_TEST_IN_LIVE_CLASS,
  TRANSACTION_ENGINE_LIVE_SUBMISSION_URL,
  TRANSACTION_ENGINE_TEST_SUBMISSION_URL,
} from "@app/services/hmrcTransactionEngine.js";
import { parseXmlDocument, firstElementText, firstElement } from "@app/lib/xmlDom.js";

const FIXTURES = join(process.cwd(), "fixtures", "hmrc-transaction-engine");
const fixture = (name) => readFileSync(join(FIXTURES, name), "utf8");

const IR_ENVELOPE =
  '<IRenvelope xmlns="http://www.govtalk.gov.uk/taxation/CT/5"><IRheader><Keys><Key Type="UTR">8596148860</Key></Keys><PeriodEnd>2026-03-31</PeriodEnd><DefaultCurrency>GBP</DefaultCurrency><IRmark Type="generic"></IRmark><Sender>Company</Sender></IRheader><CompanyTaxReturn ReturnType="new"/></IRenvelope>';

function submission(overrides = {}) {
  return buildCt600SubmissionRequest({
    senderId: "user1",
    password: "pass & word",
    utr: "8596148860",
    vendorId: "1000",
    productName: "DIY Accounting Submit",
    productVersion: "1.0",
    irEnvelopeXml: IR_ENVELOPE,
    gatewayTest: true,
    transactionId: "0123ABCD",
    ...overrides,
  });
}

function parse(xml) {
  return parseXmlDocument(xml.replace(/^\s*<\?xml[^?]*\?>/, ""));
}

describe("computeIrmark", () => {
  test("gives HMRC's published IRmark for the worked example, in base64 and base32", () => {
    const irmark = computeIrmark(fixture("irmarkexample-submission.xml"));
    expect(irmark.base64).toBe("RPfWtxHeCZRcwfitnIJmK9xc4OQ=");
    expect(irmark.base32).toBe("IT35NNYR3YEZIXGB7CWZZATGFPOFZYHE");
  });

  test("does not depend on the IRmark element's content", () => {
    const original = fixture("irmarkexample-submission.xml");
    const changed = original.replace("RPfWtxHeCZRcwfitnIJmK9xc4OQ=", "something else");
    expect(computeIrmark(changed).base64).toBe(computeIrmark(original).base64);
  });

  test("changes when anything else in the Body changes", () => {
    const original = fixture("irmarkexample-submission.xml");
    expect(computeIrmark(original.replace("AB124674A", "AB124674B")).base64).not.toBe(computeIrmark(original).base64);
  });

  test("does not depend on the GovTalk header", () => {
    const original = fixture("irmarkexample-submission.xml");
    expect(computeIrmark(original.replace("ctfuser001", "someone-else")).base64).toBe("RPfWtxHeCZRcwfitnIJmK9xc4OQ=");
  });

  test("refuses a message with no Body", () => {
    expect(() => computeIrmark('<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><Header/></GovTalkMessage>')).toThrow(
      /no Body/,
    );
  });
});

describe("withIrmark", () => {
  test("fills the IRmark element and the result verifies", () => {
    const { xml, irmark } = withIrmark(fixture("irmarkexample-submission.xml").replace("RPfWtxHeCZRcwfitnIJmK9xc4OQ=", ""));
    expect(irmark.base64).toBe("RPfWtxHeCZRcwfitnIJmK9xc4OQ=");
    expect(xml).toContain('<IRmark Type="generic">RPfWtxHeCZRcwfitnIJmK9xc4OQ=</IRmark>');
  });

  test("refuses a message without exactly one generic IRmark", () => {
    expect(() => withIrmark("<GovTalkMessage><Body/></GovTalkMessage>")).toThrow(/found 0/);
  });
});

describe("buildCt600SubmissionRequest", () => {
  test("writes the GovTalk 2.0 envelope the Document Submission Protocol defines", () => {
    const { xml, transactionId } = submission();
    const document = parse(xml);
    expect(document.documentElement.namespaceURI).toBe("http://www.govtalk.gov.uk/CM/envelope");
    expect(firstElementText(document, "EnvelopeVersion")).toBe("2.0");
    expect(firstElementText(document, "Class")).toBe(CT600_CLASS);
    expect(firstElementText(document, "Qualifier")).toBe("request");
    expect(firstElementText(document, "Function")).toBe("submit");
    expect(firstElementText(document, "TransactionID")).toBe(transactionId);
    expect(firstElementText(document, "CorrelationID")).toBe("");
    expect(firstElementText(document, "Transformation")).toBe("XML");
    expect(firstElementText(document, "GatewayTest")).toBe("1");
    expect(firstElementText(document, "SenderID")).toBe("user1");
    expect(firstElementText(document, "Method")).toBe("clear");
    expect(firstElementText(document, "Role")).toBe("principal");
    expect(firstElementText(document, "Value")).toBe("pass & word");
    const key = firstElement(firstElement(document, "GovTalkDetails"), "Key");
    expect(key.getAttribute("Type")).toBe("UTR");
    expect(key.textContent).toBe("8596148860");
    expect(firstElementText(document, "Organisation")).toBe("HMRC");
    expect(firstElementText(document, "URI")).toBe("1000");
    expect(firstElementText(document, "Product")).toBe("DIY Accounting Submit");
    expect(firstElement(document, "IRenvelope").namespaceURI).toBe("http://www.govtalk.gov.uk/taxation/CT/5");
  });

  test("carries an IRmark that verifies against the message it is in", () => {
    const { xml, irmark } = submission();
    expect(firstElementText(parse(xml), "IRmark")).toBe(irmark.base64);
    expect(computeIrmark(xml)).toEqual(irmark);
    expect(irmark.base32).toMatch(/^[A-Z2-7]{32}$/);
  });

  test("leaves GatewayTest out for live and uses the test-in-live class when asked", () => {
    const live = parse(submission({ gatewayTest: false }).xml);
    expect(firstElement(live, "GatewayTest")).toBeUndefined();
    const testInLive = parse(submission({ gatewayTest: false, testInLive: true }).xml);
    expect(firstElementText(testInLive, "Class")).toBe(CT600_TEST_IN_LIVE_CLASS);
  });

  test("adds the ChannelRouting timestamp only when given", () => {
    expect(submission().xml).not.toContain("<Timestamp>");
    expect(firstElementText(parse(submission({ timestamp: "2026-05-01T12:00:00" }).xml), "Timestamp")).toBe("2026-05-01T12:00:00");
  });

  test("refuses inputs the protocol rejects", () => {
    expect(() => submission({ utr: "123" })).toThrow(/UTR/);
    expect(() => submission({ vendorId: "12345" })).toThrow(/vendor ID/);
    expect(() => submission({ transactionId: "abc" })).toThrow(/TransactionID/);
    expect(() => submission({ testInLive: true })).toThrow(/Test in live/);
    expect(() => submission({ password: "" })).toThrow(/password/);
  });
});

describe("newTransactionId", () => {
  test("is 32 upper-case hex characters", () => {
    expect(newTransactionId()).toMatch(/^[0-9A-F]{32}$/);
  });
});

describe("buildPollRequest and buildDeleteRequest", () => {
  test("poll carries the CorrelationID, Qualifier poll and no Body content", () => {
    const document = parse(buildPollRequest({ correlationId: "46DCD4CC7E194088B99857931C185829", gatewayTest: true }));
    expect(firstElementText(document, "Class")).toBe(CT600_CLASS);
    expect(firstElementText(document, "Qualifier")).toBe("poll");
    expect(firstElementText(document, "Function")).toBe("submit");
    expect(firstElementText(document, "CorrelationID")).toBe("46DCD4CC7E194088B99857931C185829");
    expect(firstElementText(document, "GatewayTest")).toBe("1");
    expect(firstElement(document, "SenderDetails")).toBeUndefined();
  });

  test("delete is Qualifier request, Function delete", () => {
    const document = parse(buildDeleteRequest({ correlationId: "46DCD4CC7E194088B99857931C185829", gatewayTest: false }));
    expect(firstElementText(document, "Qualifier")).toBe("request");
    expect(firstElementText(document, "Function")).toBe("delete");
    expect(firstElement(document, "GatewayTest")).toBeUndefined();
  });

  test("refuses a CorrelationID that is not upper-case hex", () => {
    expect(() => buildPollRequest({ correlationId: "", gatewayTest: true })).toThrow(/CorrelationID/);
  });
});

describe("parseTransactionEngineResponse", () => {
  test("reads TPVS's success response for a CT600 built here", () => {
    const response = parseTransactionEngineResponse(fixture("tpvs-ct600-success-response.xml"));
    expect(response.qualifier).toBe("response");
    expect(response.messageClass).toBe(CT600_CLASS);
    expect(response.errors).toEqual([]);
    expect(response.businessErrors).toEqual([]);
    expect(response.irmarkReceipt).toBe("OTW/9P+256EDczPrs074XCfpQXE=");
    expect(response.successMessage).toContain("The associated IRmark was: HE2375H7W3T2CA3TGPV3GTXYLQT6SQLR");
  });

  test("reads TPVS's error 2021 for a wrong IRmark", () => {
    const response = parseTransactionEngineResponse(fixture("tpvs-ct600-irmark-error-response.xml"));
    expect(response.qualifier).toBe("error");
    expect(response.errors[0]).toMatchObject({ raisedBy: "ChRIS", number: "3001", type: "business" });
    expect(response.businessErrors).toEqual([
      { number: "2021", type: "business", text: "The supplied IRmark is incorrect.", location: "IRmark" },
    ]);
  });

  test("reads a schema error with its location", () => {
    const response = parseTransactionEngineResponse(fixture("tpvs-ct600-schema-error-response.xml"));
    expect(response.businessErrors[0].number).toBe("4051");
    expect(response.businessErrors[0].location).toContain("ct:XBRLsubmission[1]/ct:Computation[1]");
  });

  test("reads an acknowledgement's CorrelationID and poll interval", () => {
    const response = parseTransactionEngineResponse(`<?xml version="1.0"?>
<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>HMRC-CT-CT600</Class><Qualifier>acknowledgement</Qualifier><Function>submit</Function><TransactionID></TransactionID><CorrelationID>46DCD4CC7E194088B99857931C185829</CorrelationID><ResponseEndPoint PollInterval="10">https://test-transaction-engine.tax.service.gov.uk/poll</ResponseEndPoint><GatewayTimestamp>2017-02-13T09:28:14.772</GatewayTimestamp></MessageDetails><SenderDetails/></Header><GovTalkDetails><Keys/></GovTalkDetails><Body/></GovTalkMessage>`);
    expect(response.qualifier).toBe("acknowledgement");
    expect(response.correlationId).toBe("46DCD4CC7E194088B99857931C185829");
    expect(response.responseEndPoint).toBe("https://test-transaction-engine.tax.service.gov.uk/poll");
    expect(response.pollIntervalSeconds).toBe(10);
  });
});

describe("getTransactionEngineSubmissionUrl", () => {
  afterEach(() => {
    delete process.env.HMRC_TRANSACTION_ENGINE_URL;
  });

  test("chooses the test service for a test message and live otherwise", () => {
    expect(getTransactionEngineSubmissionUrl({ gatewayTest: true })).toBe(TRANSACTION_ENGINE_TEST_SUBMISSION_URL);
    expect(getTransactionEngineSubmissionUrl({ gatewayTest: false })).toBe(TRANSACTION_ENGINE_LIVE_SUBMISSION_URL);
  });

  test("uses HMRC_TRANSACTION_ENGINE_URL when set", () => {
    process.env.HMRC_TRANSACTION_ENGINE_URL = "http://localhost:9000/hmrc-transaction-engine/submission";
    expect(getTransactionEngineSubmissionUrl({ gatewayTest: false })).toBe("http://localhost:9000/hmrc-transaction-engine/submission");
  });
});
