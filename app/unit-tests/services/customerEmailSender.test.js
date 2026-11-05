// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/customerEmailSender.test.js

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockSend = vi.fn();
vi.mock("@aws-sdk/client-sesv2", () => ({
  SESv2Client: class {
    send(...args) {
      return mockSend(...args);
    }
  },
  SendEmailCommand: class {
    constructor(input) {
      this.input = input;
      this.kind = "send";
    }
  },
  GetAccountCommand: class {
    constructor(input) {
      this.input = input;
      this.kind = "account";
    }
  },
}));

import {
  classifyAwsError,
  isProductionAccessEnabled,
  isRecipientAllowed,
  resetProductionAccessCache,
  sendCustomerEmail,
} from "@app/services/customerEmailSender.js";

describe("services/customerEmailSender", () => {
  beforeEach(() => {
    mockSend.mockReset();
    resetProductionAccessCache();
  });

  test("sends from the configured address with a reply-to, tags and both parts", async () => {
    mockSend.mockResolvedValue({});
    await sendCustomerEmail({
      from: "DIY Accounting <support@diyaccounting.co.uk>",
      configurationSet: "set-1",
      to: "a@example.com",
      kind: "pass-redeemed",
      actor: "customer",
      hashedSub: "h1",
      subject: "S",
      text: "T",
      html: "<p>H</p>",
    });
    const input = mockSend.mock.calls[0][0].input;
    expect(input.FromEmailAddress).toContain("support@diyaccounting.co.uk");
    expect(input.ReplyToAddresses).toEqual(["support@diyaccounting.co.uk"]);
    expect(input.Destination.ToAddresses).toEqual(["a@example.com"]);
    expect(input.ConfigurationSetName).toBe("set-1");
    expect(input.EmailTags).toEqual([
      { Name: "kind", Value: "pass-redeemed" },
      { Name: "actor", Value: "customer" },
      { Name: "hashedsub", Value: "h1" },
    ]);
    expect(input.Content.Simple.Body.Text.Data).toBe("T");
    expect(input.Content.Simple.Body.Html.Data).toBe("<p>H</p>");
    expect(input.Content.Simple.Attachments).toBeUndefined();
  });

  test("passes attachments through", async () => {
    mockSend.mockResolvedValue({});
    await sendCustomerEmail({
      from: "f",
      configurationSet: "c",
      to: "a@b.c",
      kind: "k",
      actor: "a",
      subject: "S",
      text: "T",
      html: "H",
      attachments: [{ FileName: "x.png" }],
    });
    expect(mockSend.mock.calls[0][0].input.Content.Simple.Attachments).toEqual([{ FileName: "x.png" }]);
  });

  test("a retryable SES error becomes a retryable error that holds the name only", async () => {
    mockSend.mockRejectedValue(Object.assign(new Error("recipient a@example.com throttled"), { name: "TooManyRequestsException" }));
    const err = await sendCustomerEmail({
      from: "f",
      configurationSet: "c",
      to: "a@example.com",
      kind: "k",
      actor: "a",
      subject: "S",
      text: "T",
      html: "H",
    }).catch((e) => e);
    expect(err.retryable).toBe(true);
    expect(err.message).toBe("TooManyRequestsException");
  });

  test("a rejection is terminal", async () => {
    mockSend.mockRejectedValue(Object.assign(new Error("x"), { name: "MessageRejected" }));
    const err = await sendCustomerEmail({
      from: "f",
      configurationSet: "c",
      to: "a@b.c",
      kind: "k",
      actor: "a",
      subject: "S",
      text: "T",
      html: "H",
    }).catch((e) => e);
    expect(err.retryable).toBe(false);
    expect(err.message).toBe("MessageRejected");
  });

  test("classifyAwsError treats a 5xx as retryable", () => {
    expect(classifyAwsError(Object.assign(new Error("m"), { name: "Odd", $metadata: { httpStatusCode: 503 } })).retryable).toBe(true);
    expect(classifyAwsError(new Error("m")).retryable).toBe(false);
  });

  test("the sandbox rule allows our domain and the simulator while production access is off", async () => {
    mockSend.mockResolvedValue({ ProductionAccessEnabled: false });
    expect(await isRecipientAllowed("antony@diyaccounting.co.uk")).toBe(true);
    expect(await isRecipientAllowed("success@simulator.amazonses.com")).toBe(true);
    expect(await isRecipientAllowed("customer@example.com")).toBe(false);
  });

  test("production access opens every recipient and the answer is cached", async () => {
    mockSend.mockResolvedValue({ ProductionAccessEnabled: true });
    expect(await isRecipientAllowed("customer@example.com")).toBe(true);
    expect(await isProductionAccessEnabled()).toBe(true);
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
