// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/customerEmailSend.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  cognitoSend: vi.fn(),
  sendCustomerEmail: vi.fn(),
  isRecipientAllowed: vi.fn(),
  getReceipt: vi.fn(),
  publishActivityEvent: vi.fn(),
  publishActivityFailureEvent: vi.fn(),
  emitMetric: vi.fn(),
}));

vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: class {
    send(...args) {
      return mocks.cognitoSend(...args);
    }
  },
  ListUsersCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));
vi.mock("@app/services/customerEmailSender.js", async (importOriginal) => ({
  ...(await importOriginal()),
  sendCustomerEmail: mocks.sendCustomerEmail,
  isRecipientAllowed: mocks.isRecipientAllowed,
}));
vi.mock("@app/data/dynamoDbReceiptRepository.js", () => ({ getReceipt: mocks.getReceipt }));
vi.mock("@app/lib/emfMetrics.js", () => ({ emitMetric: mocks.emitMetric }));
vi.mock("@app/lib/qrCodeGenerator.js", () => ({
  generatePassQrCodeBuffer: vi.fn().mockResolvedValue(Buffer.from("png")),
  generatePassQrCodeSvgString: vi.fn().mockResolvedValue('<svg viewBox="0 0 29 29"><path d="M0 0"/></svg>'),
}));
vi.mock("@app/lib/activityAlert.js", async (importOriginal) => ({
  ...(await importOriginal()),
  publishActivityEvent: mocks.publishActivityEvent,
  publishActivityFailureEvent: mocks.publishActivityFailureEvent,
}));

import { handler } from "@app/functions/email/customerEmailSend.js";
import { _setTestSalt } from "@app/services/subHasher.js";
import { _clearOperatorsCache } from "@app/lib/operators.js";

function sqsEvent(payload, userId = "sub-1") {
  return { Records: [{ messageId: "m1", body: JSON.stringify({ userId, requestId: "r1", payload }) }] };
}

describe("functions/email/customerEmailSend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    _setTestSalt("salt");
    _clearOperatorsCache();
    Object.assign(process.env, {
      ENVIRONMENT_NAME: "ci",
      ACTIVITY_BUS_NAME: "bus",
      RECEIPTS_DYNAMODB_TABLE_NAME: "receipts",
      COGNITO_USER_POOL_ID: "pool",
      DIY_SUBMIT_BASE_URL: "https://submit.example.test/",
      CUSTOMER_EMAIL_FROM: "DIY Accounting <support@diyaccounting.co.uk>",
      CUSTOMER_EMAIL_CONFIGURATION_SET: "set",
      CUSTOMER_EMAIL_OPERATOR_COPY_TO: "ops@example.com",
    });
    delete process.env.CUSTOMER_EMAIL_TEST_SINK;
    process.env.USER_SUB_HASH_SALT = JSON.stringify({ current: "v1", versions: { v1: "salt" } });
    mocks.cognitoSend.mockResolvedValue({ Users: [{ Attributes: [{ Name: "email", Value: "person@example.com" }] }] });
    mocks.sendCustomerEmail.mockResolvedValue(undefined);
    mocks.isRecipientAllowed.mockResolvedValue(true);
    mocks.publishActivityEvent.mockResolvedValue({ published: true });
    mocks.publishActivityFailureEvent.mockResolvedValue(undefined);
  });

  test("finds the address from Cognito, sends, copies the operator and records sent", async () => {
    await handler(sqsEvent({ kind: "pass-redeemed", userSub: "sub-1", data: { bundleId: "day-guest" } }));
    expect(mocks.cognitoSend.mock.calls[0][0].input).toMatchObject({ Filter: 'sub = "sub-1"', Limit: 1 });
    expect(mocks.sendCustomerEmail).toHaveBeenCalledTimes(2);
    expect(mocks.sendCustomerEmail.mock.calls[0][0].to).toBe("person@example.com");
    expect(mocks.sendCustomerEmail.mock.calls[1][0].to).toBe("ops@example.com");
    expect(mocks.publishActivityEvent.mock.calls[0][0]).toMatchObject({ event: "customer-email-sent", actor: "customer" });
    expect(mocks.emitMetric).toHaveBeenCalledWith(expect.objectContaining({ metricName: "CustomerEmailSent" }));
  });

  test("a subscription from the webhook uses the address in the request", async () => {
    await handler(
      sqsEvent({ kind: "subscription-started", to: "buyer@example.com", hashedSub: "h1", data: { bundleId: "day-guest" } }, "h1"),
    );
    expect(mocks.cognitoSend).not.toHaveBeenCalled();
    expect(mocks.sendCustomerEmail.mock.calls[0][0]).toMatchObject({ to: "buyer@example.com", hashedSub: "h1" });
  });

  test("a submission receipt reads the stored receipt and sends no operator copy", async () => {
    mocks.getReceipt.mockResolvedValue({ formBundleNumber: "FB1", processingDate: "2026-11-01" });
    await handler(sqsEvent({ kind: "submission-receipt", userSub: "sub-1", data: { receiptId: "rc1", receiptKind: "vat-return" } }));
    expect(mocks.getReceipt).toHaveBeenCalledWith("sub-1", "rc1");
    expect(mocks.sendCustomerEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerEmail.mock.calls[0][0].text).toContain("FB1");
  });

  test("a message with no account is skipped for a kind that needs one", async () => {
    const event = {
      Records: [{ messageId: "m1", body: JSON.stringify({ requestId: "r1", payload: { kind: "pass-redeemed", to: "a@example.com" } }) }],
    };
    await handler(event);
    expect(mocks.sendCustomerEmail).not.toHaveBeenCalled();
  });

  test("a pass attaches the QR code inline", async () => {
    await handler(sqsEvent({ kind: "pass-generated", userSub: "sub-1", data: { code: "ab-cd", bundleId: "day-guest" } }));
    const attachment = mocks.sendCustomerEmail.mock.calls[0][0].attachments[0];
    expect(attachment).toMatchObject({ ContentDisposition: "INLINE", ContentId: "pass-qr", ContentType: "image/png" });
  });

  test("a physical pass attaches the QR code inline and the front and back to print", async () => {
    await handler(
      sqsEvent({ kind: "pass-generated", userSub: "sub-1", data: { code: "ab-cd", passTypeId: "physical-pass", bundleId: "day-guest" } }),
    );
    const attachments = mocks.sendCustomerEmail.mock.calls[0][0].attachments;
    expect(attachments.map((a) => [a.FileName, a.ContentDisposition])).toEqual([
      ["pass-ab-cd-qr.png", "INLINE"],
      ["pass-ab-cd-front.svg", "ATTACHMENT"],
      ["pass-ab-cd-back.svg", "ATTACHMENT"],
      ["pass-ab-cd-back.png", "ATTACHMENT"],
    ]);
  });

  test("a digital pass attaches the inline QR code only", async () => {
    await handler(sqsEvent({ kind: "pass-generated", userSub: "sub-1", data: { code: "ab-cd", passTypeId: "digital-pass" } }));
    expect(mocks.sendCustomerEmail.mock.calls[0][0].attachments).toHaveLength(1);
  });

  test("a test account is suppressed when no sink is set", async () => {
    mocks.cognitoSend.mockResolvedValue({ Users: [{ Attributes: [{ Name: "email", Value: "synthetic-x@test.diyaccounting.co.uk" }] }] });
    await handler(sqsEvent({ kind: "pass-redeemed", userSub: "sub-1", data: {} }));
    expect(mocks.sendCustomerEmail).not.toHaveBeenCalled();
    expect(mocks.publishActivityEvent.mock.calls[0][0]).toMatchObject({
      event: "customer-email-suppressed",
      detail: { sendOutcome: "suppressed-test" },
    });
  });

  test("a synthetic request goes to the sink and sends no operator copy", async () => {
    process.env.CUSTOMER_EMAIL_TEST_SINK = "success@simulator.amazonses.com";
    await handler(sqsEvent({ kind: "subscription-started", userSub: "sub-1", synthetic: true, data: {} }));
    expect(mocks.sendCustomerEmail).toHaveBeenCalledTimes(1);
    expect(mocks.sendCustomerEmail.mock.calls[0][0].to).toBe("success@simulator.amazonses.com");
  });

  test("a blocked recipient is suppressed by the sandbox rule", async () => {
    mocks.isRecipientAllowed.mockResolvedValue(false);
    await handler(sqsEvent({ kind: "pass-redeemed", userSub: "sub-1", data: {} }));
    expect(mocks.sendCustomerEmail).not.toHaveBeenCalled();
    expect(mocks.publishActivityEvent.mock.calls[0][0].detail.sendOutcome).toBe("suppressed-sandbox");
  });

  test("no address records a failure for a customer", async () => {
    mocks.cognitoSend.mockResolvedValue({ Users: [] });
    await handler(sqsEvent({ kind: "pass-redeemed", userSub: "sub-1", data: {} }));
    expect(mocks.sendCustomerEmail).not.toHaveBeenCalled();
    expect(mocks.publishActivityFailureEvent.mock.calls[0][0]).toMatchObject({ event: "customer-email-failed", failure: "no-address" });
  });

  test("a sub with unsafe characters is not sent to Cognito", async () => {
    await handler(sqsEvent({ kind: "pass-redeemed", userSub: 'x" or "1"="1', data: {} }, "u"));
    expect(mocks.cognitoSend).not.toHaveBeenCalled();
  });

  test("an operator copy failure does not repeat the customer email", async () => {
    mocks.sendCustomerEmail
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(Object.assign(new Error("TooManyRequestsException"), { retryable: true }));
    await handler(sqsEvent({ kind: "pass-redeemed", userSub: "sub-1", data: {} }));
    expect(mocks.sendCustomerEmail).toHaveBeenCalledTimes(2);
    expect(mocks.publishActivityEvent.mock.calls.some(([e]) => e.event === "customer-email-sent")).toBe(true);
    expect(mocks.publishActivityFailureEvent).toHaveBeenCalled();
  });

  test("a retryable SES error is rethrown with the name only", async () => {
    mocks.sendCustomerEmail.mockRejectedValue(Object.assign(new Error("TooManyRequestsException"), { retryable: true }));
    const err = await handler(sqsEvent({ kind: "pass-redeemed", userSub: "sub-1", data: {} })).catch((e) => e);
    expect(err.message).toBe("TooManyRequestsException");
    expect(err.retryable).toBe(true);
  });

  test("a terminal error records a failed outcome and does not throw", async () => {
    mocks.sendCustomerEmail.mockRejectedValue(Object.assign(new Error("MessageRejected"), { retryable: false }));
    await handler(sqsEvent({ kind: "pass-redeemed", userSub: "sub-1", data: {} }));
    expect(mocks.publishActivityFailureEvent.mock.calls[0][0]).toMatchObject({
      failure: "MessageRejected",
      detail: { kind: "pass-redeemed" },
    });
    expect(mocks.emitMetric).toHaveBeenCalledWith(expect.objectContaining({ metricName: "CustomerEmailFailure" }));
  });

  test("a missing receipt is a terminal failure", async () => {
    mocks.getReceipt.mockResolvedValue(null);
    await handler(sqsEvent({ kind: "submission-receipt", userSub: "sub-1", data: { receiptId: "rc1", receiptKind: "vat-return" } }));
    expect(mocks.sendCustomerEmail).not.toHaveBeenCalled();
    expect(mocks.publishActivityFailureEvent.mock.calls[0][0].failure).toBe("ReceiptNotFound");
  });
});
