// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcCtSubmissionStatus.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";

const mockGetAsyncRequest = vi.fn();
const mockPutAsyncRequest = vi.fn();
vi.mock("@app/data/dynamoDbAsyncRequestRepository.js", () => ({
  getAsyncRequest: (...args) => mockGetAsyncRequest(...args),
  putAsyncRequest: (...args) => mockPutAsyncRequest(...args),
}));

const mockPutReceipt = vi.fn();
vi.mock("@app/data/dynamoDbReceiptRepository.js", () => ({ putReceipt: (...args) => mockPutReceipt(...args) }));

vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: vi.fn().mockResolvedValue(undefined),
  resolveActorClass: () => "test",
}));
vi.mock("@app/services/tokenEnforcement.js", () => ({ chargeTokenOnSuccess: vi.fn() }));

const mockPost = vi.fn();
vi.mock("@app/services/hmrcTransactionEngine.js", async (importOriginal) => ({
  ...(await importOriginal()),
  postToTransactionEngine: (...args) => mockPost(...args),
}));

const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() }));
vi.mock("@app/lib/logger.js", async (importOriginal) => ({ ...(await importOriginal()), createLogger: () => mockLogger }));

import { pollCtSubmission } from "@app/services/hmrcCtSubmissionStatus.js";
import { CT_RETURN_KIND } from "@app/services/hmrcTransactionEngine.js";

const CORRELATION_ID = "46DCD4CC7E194088B99857931C185829";
// base64 of 20 bytes 0x00..0x13 and the same bytes in base32
const IRMARK_BASE64 = "AAECAwQFBgcICQoLDA0ODxAREhM=";
const IRMARK_BASE32 = "AAAQEAYEAUDAOCAJBIFQYDIOB4IBCEQT";

function message(qualifier, functionName, { errors = "", body = "" } = {}) {
  return {
    ok: true,
    status: 200,
    data: `<?xml version="1.0"?><GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>HMRC-CT-CT600</Class><Qualifier>${qualifier}</Qualifier><Function>${functionName}</Function><CorrelationID>${CORRELATION_ID}</CorrelationID><Transformation>XML</Transformation></MessageDetails></Header><GovTalkDetails><Keys/>${errors}</GovTalkDetails><Body>${body}</Body></GovTalkMessage>`,
  };
}

const gatewayError = (number, type = "fatal") =>
  message("error", "submit", {
    errors: `<GovTalkErrors><Error><RaisedBy>Gateway</RaisedBy><Number>${number}</Number><Type>${type}</Type><Text>x</Text></Error></GovTalkErrors>`,
  });

const deleteError = (number) =>
  message("error", "delete", {
    errors: `<GovTalkErrors><Error><RaisedBy>Gateway</RaisedBy><Number>${number}</Number><Type>fatal</Type><Text>x</Text></Error></GovTalkErrors>`,
  });

const successResponse = (digest) =>
  message("response", "submit", {
    body: `<SuccessResponse xmlns="http://www.inlandrevenue.gov.uk/SuccessResponse"><IRmarkReceipt><dsig:Signature xmlns:dsig="http://www.w3.org/2000/09/xmldsig#"><dsig:SignedInfo><dsig:Reference><dsig:DigestValue>${digest}</dsig:DigestValue></dsig:Reference></dsig:SignedInfo></dsig:Signature><Message code="0000">Received</Message></IRmarkReceipt></SuccessResponse>`,
  });

const deleteResponse = () => message("response", "delete");

function pendingRequest() {
  return {
    status: "pending",
    data: {
      kind: CT_RETURN_KIND,
      pollUrl: "https://example.test/poll",
      gatewayTest: true,
      messageClass: "HMRC-CT-CT600",
      utr: "8596148860",
      irmark: IRMARK_BASE32,
    },
  };
}

const deleteCalls = () => mockPost.mock.calls.filter(([, xml]) => xml.includes("<Function>delete</Function>"));
const statusWrites = () => mockPutAsyncRequest.mock.calls.map((call) => call[2]);

describe("pollCtSubmission", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAsyncRequest.mockResolvedValue(pendingRequest());
  });

  describe("transient poll errors", () => {
    test.each(["1000", "2005"])("error %s keeps the submission pending and deletes nothing", async (number) => {
      mockPost.mockResolvedValueOnce(gatewayError(number));
      const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
      expect(data).toMatchObject({ statusCode: "PENDING", correlationId: CORRELATION_ID });
      expect(statusWrites()).toEqual(["pending"]);
      expect(deleteCalls()).toHaveLength(0);
    });

    test.each(["3000", "2000"])("error %s ends the submission as a reject and deletes it", async (number) => {
      mockPost.mockResolvedValueOnce(gatewayError(number)).mockResolvedValueOnce(deleteResponse());
      const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
      expect(data.statusCode).toBe("REJECT");
      expect(statusWrites()).toEqual(["failed"]);
      expect(deleteCalls()).toHaveLength(1);
    });
  });

  describe("delete retry", () => {
    test("sends the delete again after a SUBMISSION_ERROR and stops at DELETE_RESPONSE", async () => {
      mockPost
        .mockResolvedValueOnce(successResponse(IRMARK_BASE64))
        .mockResolvedValueOnce(deleteError("1000"))
        .mockRejectedValueOnce(new Error("socket hang up"))
        .mockResolvedValueOnce(deleteResponse());
      const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
      expect(data.statusCode).toBe("ACCEPT");
      expect(deleteCalls()).toHaveLength(3);
    });

    test("stops sending the delete on error 2000", async () => {
      mockPost.mockResolvedValueOnce(successResponse(IRMARK_BASE64)).mockResolvedValueOnce(deleteError("2000"));
      await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
      expect(deleteCalls()).toHaveLength(1);
    });

    test("gives up after three failed attempts and the result stays accepted", async () => {
      mockPost.mockResolvedValueOnce(successResponse(IRMARK_BASE64)).mockResolvedValue(deleteError("1000"));
      const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
      expect(data.statusCode).toBe("ACCEPT");
      expect(deleteCalls()).toHaveLength(3);
    });
  });

  describe("receipt IRmark", () => {
    test("a matching receipt IRmark is stored without a mismatch flag", async () => {
      mockPost.mockResolvedValueOnce(successResponse(IRMARK_BASE64)).mockResolvedValueOnce(deleteResponse());
      const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
      expect(data.irmarkReceiptMismatch).toBeUndefined();
      expect(mockPutReceipt.mock.calls[0][2].irmarkReceiptMismatch).toBeUndefined();
      expect(mockLogger.error).not.toHaveBeenCalled();
    });

    test("a different receipt IRmark is logged as an error and recorded on the result and the receipt", async () => {
      mockPost.mockResolvedValueOnce(successResponse("AAAAAAAAAAAAAAAAAAAAAAAAAAA=")).mockResolvedValueOnce(deleteResponse());
      const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
      expect(data).toMatchObject({ statusCode: "ACCEPT", irmarkReceiptMismatch: true });
      expect(mockPutReceipt.mock.calls[0][2].irmarkReceiptMismatch).toBe(true);
      expect(mockLogger.error).toHaveBeenCalledWith(expect.objectContaining({ correlationId: CORRELATION_ID, sentIrmark: IRMARK_BASE32 }));
    });

    test("a response without a receipt IRmark is a mismatch", async () => {
      mockPost.mockResolvedValueOnce(message("response", "submit", { body: "<SuccessResponse/>" })).mockResolvedValueOnce(deleteResponse());
      const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
      expect(data.irmarkReceiptMismatch).toBe(true);
    });
  });
});
