// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/services/companiesHouseFeeRefund.test.js

import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { setupTestEnv } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();
vi.mock("@aws-sdk/lib-dynamodb", () => {
  class Command {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    GetCommand: class extends Command {},
    PutCommand: class extends Command {},
    UpdateCommand: class extends Command {},
    QueryCommand: class extends Command {},
    DeleteCommand: class extends Command {},
  };
});
vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send() {
      return Promise.resolve({});
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockRefundsCreate = vi.fn();
const mockGetStripeClient = vi.fn();
vi.mock("@app/lib/stripeClient.js", () => ({
  getStripeClient: (...args) => mockGetStripeClient(...args),
}));

const mockParseGatewayResponse = vi.fn();
vi.mock("@app/services/companiesHouseXmlGateway.js", async (importOriginal) => ({
  ...(await importOriginal()),
  buildStatusRequest: () => "<GovTalkMessage>status request</GovTalkMessage>",
  resolvePresenterCredentials: async () => ({ presenterId: "presenter-id", presenterCode: "presenter-code" }),
  postToGateway: async () => ({ ok: true, status: 200, data: "<GovTalkMessage/>", headers: {}, duration: 1 }),
  parseGatewayResponse: (...args) => mockParseGatewayResponse(...args),
}));
vi.mock("@app/services/companiesHouseCacheDrop.js", () => ({ dropCompanyCacheAfterAcceptedFiling: async () => undefined }));

import { pollSubmission } from "@app/services/companiesHouseSubmissionStatus.js";
import { initializeSalt } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const SUBJECT = "00000001:same-day:BRAMWELL TENNANT TRADING LIMITED";
const CHARGE_KEY = `charge#change-company-name#${SUBJECT}`;
const FEE_CHARGE = { activityId: "change-company-name", subjectKey: SUBJECT, refundOnReject: true };

// The filing as the route stored it, and the filer's charge, as the tables hold them.
function tablesHold({ filing, charge }) {
  mockSend.mockImplementation(async (cmd) => {
    const lib = await import("@aws-sdk/lib-dynamodb");
    if (cmd instanceof lib.GetCommand && cmd.input.Key?.chargeKey) return { Item: charge };
    if (cmd instanceof lib.GetCommand) return { Item: { requestId: cmd.input.Key.requestId, ...filing } };
    return {};
  });
}

function companiesHouseAnswers(statusCode, rejections = []) {
  mockParseGatewayResponse.mockReturnValue({
    errors: [],
    statuses: [{ statusCode, submissionNumber: "00001A", companyNumber: "00000001", rejections }],
  });
}

async function chargeUpdates() {
  const lib = await import("@aws-sdk/lib-dynamodb");
  return mockSend.mock.calls
    .map(([cmd]) => cmd)
    .filter((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.Key?.chargeKey === CHARGE_KEY);
}

describe("the fee of a change of company name, when Companies House decides it", () => {
  beforeEach(async () => {
    Object.assign(
      process.env,
      setupTestEnv({
        COMPANIES_HOUSE_XMLGW_URI: "https://xmlgw.companieshouse.gov.uk/v1-0/xmlgw/Gateway",
        RECEIPTS_DYNAMODB_TABLE_NAME: "test-receipts-table",
        COMPANIES_HOUSE_ACCOUNTS_ASYNC_REQUESTS_TABLE_NAME: "test-companies-house-accounts-async-requests-table",
        ACTIVITY_CHARGES_DYNAMODB_TABLE_NAME: "test-activity-charges-table",
        ENVIRONMENT_NAME: "test",
      }),
    );
    vi.clearAllMocks();
    await initializeSalt();
    mockRefundsCreate.mockResolvedValue({ id: "re_1" });
    mockGetStripeClient.mockResolvedValue({ refunds: { create: (...args) => mockRefundsCreate(...args) } });
  });

  test.each([
    [true, false],
    [false, true],
  ])("a REJECT refunds the payment in full, in the mode it was paid in (live %s), and marks it refunded", async (livemode, test) => {
    tablesHold({
      filing: { status: "pending", data: { kind: "change-of-name", feeCharge: FEE_CHARGE } },
      charge: { status: "used", stripePaymentIntentId: "pi_name_1", stripeLivemode: livemode, amount: 10412 },
    });
    companiesHouseAnswers("REJECT", [
      { rejectCode: "9995", description: "The name is the same as another company's.", instanceNumber: "1" },
    ]);

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "change-of-name" });

    expect(result.data.statusCode).toBe("REJECT");
    expect(mockGetStripeClient).toHaveBeenCalledWith({ test });
    expect(mockRefundsCreate).toHaveBeenCalledWith(
      { payment_intent: "pi_name_1", metadata: { activityId: "change-company-name", subjectKey: SUBJECT } },
      { idempotencyKey: expect.stringContaining(CHARGE_KEY) },
    );
    const [refunded] = await chargeUpdates();
    expect(refunded.input.ExpressionAttributeValues).toMatchObject({ ":refunded": "refunded", ":refundId": "re_1" });
  });

  test("a payment already refunded is not refunded again", async () => {
    tablesHold({
      filing: { status: "pending", data: { kind: "change-of-name", feeCharge: FEE_CHARGE } },
      charge: { status: "refunded", stripePaymentIntentId: "pi_name_1", stripeLivemode: true },
    });
    companiesHouseAnswers("REJECT", [{ rejectCode: "9995", description: "Same as.", instanceNumber: "1" }]);

    await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "change-of-name" });

    expect(mockRefundsCreate).not.toHaveBeenCalled();
  });

  test("an ACCEPT keeps the payment and refunds nothing", async () => {
    tablesHold({
      filing: { status: "pending", data: { kind: "change-of-name", feeCharge: FEE_CHARGE } },
      charge: { status: "used", stripePaymentIntentId: "pi_name_1", stripeLivemode: true },
    });
    companiesHouseAnswers("ACCEPT");

    const result = await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "change-of-name" });

    expect(result.data.statusCode).toBe("ACCEPT");
    expect(mockRefundsCreate).not.toHaveBeenCalled();
  });

  test("a REJECT of a confirmation statement, whose fee is not marked for a refund, refunds nothing", async () => {
    tablesHold({
      filing: {
        status: "pending",
        data: {
          kind: "confirmation-statement",
          feeCharge: { activityId: "file-confirmation-statement", subjectKey: "00000001:2026-11-01" },
        },
      },
      charge: { status: "used", stripePaymentIntentId: "pi_cs_1", stripeLivemode: true },
    });
    companiesHouseAnswers("REJECT", [{ rejectCode: "11686", description: "shareholders required", instanceNumber: "1" }]);

    await pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "confirmation-statement" });

    expect(mockRefundsCreate).not.toHaveBeenCalled();
  });

  test("a refund that fails leaves the rejection unrecorded for the next poll", async () => {
    tablesHold({
      filing: { status: "pending", data: { kind: "change-of-name", feeCharge: FEE_CHARGE } },
      charge: { status: "used", stripePaymentIntentId: "pi_name_1", stripeLivemode: true },
    });
    companiesHouseAnswers("REJECT", [{ rejectCode: "9995", description: "Same as.", instanceNumber: "1" }]);
    mockRefundsCreate.mockRejectedValue(new Error("Stripe is down"));

    await expect(pollSubmission({ userSub: "user-1", submissionNumber: "00001A", kind: "change-of-name" })).rejects.toThrow(
      "Stripe is down",
    );
    const lib = await import("@aws-sdk/lib-dynamodb");
    const failedWrites = mockSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd instanceof lib.UpdateCommand && cmd.input.ExpressionAttributeValues?.[":status"] === "failed");
    expect(failedWrites).toHaveLength(0);
  });
});
