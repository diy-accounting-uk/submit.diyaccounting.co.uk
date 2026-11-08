// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/hmrcCtSubmissionStatus.test.js

import { describe, test, beforeEach, afterEach, expect, vi } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const mockGetAsyncRequest = vi.fn();
const mockPutAsyncRequest = vi.fn();
vi.mock("@app/data/dynamoDbAsyncRequestRepository.js", () => ({
  getAsyncRequest: (...args) => mockGetAsyncRequest(...args),
  putAsyncRequest: (...args) => mockPutAsyncRequest(...args),
}));

const mockPutReceipt = vi.fn();
vi.mock("@app/data/dynamoDbReceiptRepository.js", () => ({ putReceipt: (...args) => mockPutReceipt(...args) }));

const mockRequestCustomerEmail = vi.fn();
vi.mock("@app/lib/customerEmailRequest.js", () => ({ requestCustomerEmail: (...args) => mockRequestCustomerEmail(...args) }));

vi.mock("@app/lib/activityAlert.js", () => ({
  publishActivityEvent: vi.fn().mockResolvedValue(undefined),
  resolveActorClass: () => "test",
}));
vi.mock("@app/services/tokenEnforcement.js", () => ({ chargeTokenOnSuccess: vi.fn() }));

const mockSleep = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
vi.mock("node:timers/promises", () => ({ setTimeout: mockSleep }));

const mockPost = vi.fn();
vi.mock("@app/services/hmrcTransactionEngine.js", async (importOriginal) => ({
  ...(await importOriginal()),
  postToTransactionEngine: (...args) => mockPost(...args),
}));

const mockLogger = vi.hoisted(() => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), trace: vi.fn(), fatal: vi.fn() }));
vi.mock("@app/lib/logger.js", async (importOriginal) => ({ ...(await importOriginal()), createLogger: () => mockLogger }));

import { pollCtSubmission, findHeldCtSubmission } from "@app/services/hmrcCtSubmissionStatus.js";
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
      expect(data.deleteOwed).toBeUndefined();
    });

    describe("after three failed attempts", () => {
      const OWED = { pollUrl: "https://example.test/poll", gatewayTest: true, messageClass: "HMRC-CT-CT600" };

      function completedWithDeleteOwed(status = "completed") {
        return {
          status,
          data: {
            kind: CT_RETURN_KIND,
            statusCode: status === "completed" ? "ACCEPT" : "REJECT",
            correlationId: CORRELATION_ID,
            deleteOwed: OWED,
          },
        };
      }

      test("stores a delete owed mark with what the next delete needs", async () => {
        mockPost.mockResolvedValueOnce(successResponse(IRMARK_BASE64)).mockResolvedValue(deleteError("1000"));
        await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
        const owedWrite = mockPutAsyncRequest.mock.calls.find((call) => call[3].deleteOwed);
        expect(owedWrite[2]).toBe("completed");
        expect(owedWrite[3].deleteOwed).toEqual(OWED);
      });

      test("stores the mark on a rejected request too", async () => {
        mockPost.mockResolvedValueOnce(gatewayError("3000")).mockResolvedValue(deleteError("1000"));
        await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
        const owedWrite = mockPutAsyncRequest.mock.calls.find((call) => call[3].deleteOwed);
        expect(owedWrite[2]).toBe("failed");
      });

      test("the next status read sends the delete, answers without the mark, and clears it on DELETE_RESPONSE", async () => {
        mockGetAsyncRequest.mockResolvedValue(completedWithDeleteOwed());
        mockPost.mockResolvedValueOnce(deleteResponse());
        const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
        expect(deleteCalls()).toHaveLength(1);
        expect(deleteCalls()[0][0]).toBe(OWED.pollUrl);
        expect(data.deleteOwed).toBeUndefined();
        expect(data.statusCode).toBe("ACCEPT");
        expect(mockPutAsyncRequest).toHaveBeenCalledTimes(1);
        expect(mockPutAsyncRequest.mock.calls[0][3].deleteOwed).toBeUndefined();
      });

      test("error 2000 on the next read clears the mark", async () => {
        mockGetAsyncRequest.mockResolvedValue(completedWithDeleteOwed("failed"));
        mockPost.mockResolvedValueOnce(deleteError("2000"));
        await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
        expect(mockPutAsyncRequest.mock.calls[0][2]).toBe("failed");
        expect(mockPutAsyncRequest.mock.calls[0][3].deleteOwed).toBeUndefined();
      });

      test("keeps the mark when the delete still fails, and sends it again on the read after", async () => {
        mockGetAsyncRequest.mockResolvedValue(completedWithDeleteOwed());
        mockPost.mockResolvedValue(deleteError("1000"));
        await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
        expect(mockPutAsyncRequest.mock.calls[0][3].deleteOwed).toEqual(OWED);
        await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
        expect(deleteCalls()).toHaveLength(6);
      });

      test("a completed request with no mark sends no delete", async () => {
        mockGetAsyncRequest.mockResolvedValue({ status: "completed", data: { kind: CT_RETURN_KIND, statusCode: "ACCEPT" } });
        await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
        expect(mockPost).not.toHaveBeenCalled();
      });
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

describe("receipt signature", () => {
  const SIGNED_RECEIPT = readFileSync(
    join(process.cwd(), "fixtures", "hmrc-transaction-engine", "receipt-signed-test-certificate.xml"),
    "utf8",
  );
  // base32 of the receipt's DigestValue XwHjMbO6v3X19HZ5W3M1WuioQPE=
  const SIGNED_RECEIPT_IRMARK = "L4A6GMNTXK7XL5PUOZ4VW4ZVLLUKQQHR";
  const TRUSTED_SHA256 = "13FDCF9678B707C605A97CA8F7AD3F5321D522FBC7E46DB8F09295165861D733";

  const receiptResponse = () => ({ ok: true, status: 200, data: SIGNED_RECEIPT });
  const logged = (level, text) => mockLogger[level].mock.calls.map(([entry]) => entry).filter((entry) => entry.message?.includes(text));

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAsyncRequest.mockResolvedValue({ ...pendingRequest(), data: { ...pendingRequest().data, irmark: SIGNED_RECEIPT_IRMARK } });
    mockPost.mockResolvedValueOnce(receiptResponse()).mockResolvedValueOnce(deleteResponse());
  });

  afterEach(() => {
    delete process.env.HMRC_RECEIPT_CERTIFICATE_SHA256;
  });

  test("a trusted certificate is stored as valid and logged with the correlation ID and receipt IRmark", async () => {
    process.env.HMRC_RECEIPT_CERTIFICATE_SHA256 = TRUSTED_SHA256;
    const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
    expect(data).toMatchObject({ statusCode: "ACCEPT", receiptSignature: "valid" });
    expect(data.irmarkReceiptMismatch).toBeUndefined();
    expect(mockPutReceipt.mock.calls[0][2]).toMatchObject({ receiptSignature: "valid" });
    expect(mockRequestCustomerEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "submission-receipt",
        userSub: "u",
        synthetic: true,
        data: expect.objectContaining({ receiptKind: "ct-return" }),
      }),
    );
    expect(logged("info", "receipt signature")[0]).toMatchObject({
      correlationId: CORRELATION_ID,
      receiptIrmark: "XwHjMbO6v3X19HZ5W3M1WuioQPE=",
      receiptSignature: "valid",
      certificateSha256: TRUSTED_SHA256,
    });
  });

  test("no trusted certificate is stored as unknown-certificate and the return stays accepted", async () => {
    const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
    expect(data).toMatchObject({ statusCode: "ACCEPT", receiptSignature: "unknown-certificate" });
    expect(logged("warn", "receipt signature")[0]).toMatchObject({
      receiptSignature: "unknown-certificate",
      correlationId: CORRELATION_ID,
    });
    expect(deleteCalls()).toHaveLength(1);
  });

  test("a receipt whose digest is not reproduced is stored as such, logged at info with both digests, and stays accepted", async () => {
    mockPost.mockReset();
    mockPost.mockResolvedValueOnce({
      ok: true,
      status: 200,
      data: SIGNED_RECEIPT.replace("XwHjMbO6v3X19HZ5W3M1WuioQPE=", "XwHjMbO6v3X19HZ5W3M1WuioQPF="),
    });
    mockPost.mockResolvedValueOnce(deleteResponse());
    process.env.HMRC_RECEIPT_CERTIFICATE_SHA256 = TRUSTED_SHA256;
    const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
    expect(data.statusCode).toBe("ACCEPT");
    expect(data.receiptSignature).toBe("digest-not-reproduced");
    expect(mockPutReceipt).toHaveBeenCalledTimes(1);
    expect(logged("info", "receipt signature")[0]).toMatchObject({
      correlationId: CORRELATION_ID,
      receiptSignature: "digest-not-reproduced",
      computedDigest: expect.stringMatching(/^[0-9a-f]{40}$/),
      signedDigest: expect.stringMatching(/^[0-9a-f]{40}$/),
      canonicalization: "http://www.w3.org/TR/2001/REC-xml-c14n-20010315",
    });
    expect(logged("warn", "receipt signature")).toHaveLength(0);
  });

  test("a receipt whose signature cannot be read is stored as invalid, logged at warn, and stays accepted", async () => {
    mockPost.mockReset();
    mockPost.mockResolvedValueOnce({ ok: true, status: 200, data: SIGNED_RECEIPT.replace(/(<dsig:SignatureValue>)./, "$1A") });
    mockPost.mockResolvedValueOnce(deleteResponse());
    const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
    expect(data.receiptSignature).toBe("invalid");
    expect(logged("warn", "receipt signature")[0]).toMatchObject({ receiptSignature: "invalid" });
  });

  test("a pending or rejected poll checks no signature", async () => {
    mockPost.mockReset();
    mockPost.mockResolvedValueOnce(gatewayError("1000"));
    const { data } = await pollCtSubmission({ userSub: "u", correlationId: CORRELATION_ID });
    expect(data.receiptSignature).toBeUndefined();
    expect(logged("warn", "receipt signature")).toHaveLength(0);
  });
});

describe("findHeldCtSubmission", () => {
  const TRANSACTION_ID = "AB12CD";
  const input = {
    senderId: "user1",
    password: "pass1",
    submissionUrl: "https://example.test/submission",
    gatewayTest: true,
    transactionId: TRANSACTION_ID,
    attemptedAt: new Date("2026-11-03T10:00:00Z"),
    waitSeconds: 10,
  };
  const dataResponse = (records = "") =>
    message("response", "list", { body: `<StatusReport><SenderID/><StartTimeStamp/><EndTimeStamp/>${records}</StatusReport>` });
  const record = (transactionId, correlationId, status = "SUBMISSION_ACKNOWLEDGE") =>
    `<StatusRecord><TimeStamp>03/11/2026 10:00:01</TimeStamp><CorrelationID>${correlationId}</CorrelationID><TransactionID>${transactionId}</TransactionID><Status>${status}</Status></StatusRecord>`;

  beforeEach(() => {
    mockPost.mockReset();
    mockSleep.mockClear();
  });

  test("waits the poll interval, sends a DATA_REQUEST and returns the held submission's CorrelationID", async () => {
    mockPost.mockResolvedValueOnce(dataResponse(record("OTHER", "11") + record(TRANSACTION_ID, CORRELATION_ID, "SUBMISSION_RESPONSE")));
    const result = await findHeldCtSubmission(input);
    expect(result).toEqual({ state: "held", correlationId: CORRELATION_ID, status: "SUBMISSION_RESPONSE" });
    expect(mockSleep).toHaveBeenCalledWith(10000);
    const [url, xml] = mockPost.mock.calls[0];
    expect(url).toBe("https://example.test/submission");
    expect(xml).toContain("<Function>list</Function>");
    expect(xml).toContain(`<TransactionID>${TRANSACTION_ID}</TransactionID>`);
    expect(xml).toContain("<StartDate>02/11/2026</StartDate>");
  });

  test("says not-received when the Transaction Engine answers and holds nothing with the TransactionID", async () => {
    mockPost.mockResolvedValueOnce(dataResponse(record("OTHER", "11")));
    expect(await findHeldCtSubmission(input)).toEqual({ state: "not-received" });
    expect(mockPost).toHaveBeenCalledTimes(1);
  });

  test("asks again after a failed request and then answers from the second reply", async () => {
    mockPost.mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce(dataResponse(record(TRANSACTION_ID, CORRELATION_ID)));
    expect((await findHeldCtSubmission(input)).state).toBe("held");
    expect(mockSleep).toHaveBeenCalledTimes(2);
  });

  test("says unknown when every attempt fails or answers with an error, and never says not-received", async () => {
    mockPost.mockResolvedValueOnce({ ok: false, status: 504, data: "" }).mockResolvedValueOnce(gatewayError("1046"));
    expect(await findHeldCtSubmission(input)).toEqual({ state: "unknown" });
    expect(mockPost).toHaveBeenCalledTimes(2);
  });

  test("forwards the extra headers and keeps the password out of the log", async () => {
    mockPost.mockResolvedValueOnce(dataResponse());
    await findHeldCtSubmission({ ...input, extraHeaders: { "Gov-Test-Scenario": "CT600_LOST_REPLY" } });
    expect(mockPost.mock.calls[0][2]).toEqual({ "Gov-Test-Scenario": "CT600_LOST_REPLY" });
    expect(JSON.stringify([...mockLogger.warn.mock.calls, ...mockLogger.info.mock.calls])).not.toContain("pass1");
  });
});
