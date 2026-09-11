// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaTaxLiabilityAdjustments.test.js
import { describe, test, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildHmrcEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody, setupFetchMock, mockHmrcSuccess, mockHmrcError } from "@app/test-helpers/mockHelpers.js";

const mockSend = vi.fn();
const mockSqsSend = vi.fn();

vi.mock("@aws-sdk/client-sqs", () => {
  class SQSClient {
    constructor(_config) {}
    send(cmd) {
      return mockSqsSend(cmd);
    }
  }
  class SendMessageCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { SQSClient, SendMessageCommand };
});

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class PutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class DeleteCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class GetCommand {
    constructor(input) {
      this.input = input;
    }
  }
  class UpdateCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    PutCommand,
    QueryCommand,
    DeleteCommand,
    GetCommand,
    UpdateCommand,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {
      // no-op in unit tests
    }
  }
  return { DynamoDBClient };
});

const mockEventBridgeSend = vi.fn().mockResolvedValue({});
vi.mock("@aws-sdk/client-eventbridge", () => ({
  EventBridgeClient: class {
    send(...args) {
      return mockEventBridgeSend(...args);
    }
  },
  PutEventsCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  ingestHandler as hmrcItsaTaxLiabilityAdjustmentsPutHandler,
  buildTaxLiabilityAdjustmentsRequestBody,
} from "@app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsPut.js";
import { ingestHandler as hmrcItsaTaxLiabilityAdjustmentsGetHandler } from "@app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsGet.js";
import { ingestHandler as hmrcItsaTaxLiabilityAdjustmentsDeleteHandler } from "@app/functions/hmrc/hmrcItsaTaxLiabilityAdjustmentsDelete.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_TAX_YEAR = "2023-24";

function buildAdjustmentsBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    taxYear: VALID_TAX_YEAR,
    carryBackLossesDecrease: { incomeTax: 100 },
    ...overrides,
  };
}

function buildAdjustmentsEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildAdjustmentsBody(body),
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

describe("buildTaxLiabilityAdjustmentsRequestBody", () => {
  test("omits an empty taxRefundedOrSetOff section entirely", () => {
    const body = buildTaxLiabilityAdjustmentsRequestBody({
      carryBackLossesDecrease: { incomeTax: 100 },
      taxRefundedOrSetOff: {},
    });
    expect(body).toEqual({ carryBackLossesDecrease: { incomeTax: 100 } });
  });

  test("rounds money values to 2 decimal places", () => {
    const body = buildTaxLiabilityAdjustmentsRequestBody({ carryBackLossesDecrease: { incomeTax: 100.005 } });
    expect(body.carryBackLossesDecrease.incomeTax).toBe(100.01);
  });

  test("accepts all three carryBackLossesDecrease fields", () => {
    const body = buildTaxLiabilityAdjustmentsRequestBody({
      carryBackLossesDecrease: { incomeTax: 100, class4: 20, capitalGainsTax: 5 },
    });
    expect(body.carryBackLossesDecrease).toEqual({ incomeTax: 100, class4: 20, capitalGainsTax: 5 });
  });

  test("accepts taxRefundedOrSetOff on its own", () => {
    const body = buildTaxLiabilityAdjustmentsRequestBody({ taxRefundedOrSetOff: { amount: 50 } });
    expect(body).toEqual({ taxRefundedOrSetOff: { amount: 50 } });
  });

  test("rejects an entirely empty body", () => {
    expect(() => buildTaxLiabilityAdjustmentsRequestBody({})).toThrow(/An empty or non-matching body/);
  });
});

let mockFetch;

describe("hmrcItsaTaxLiabilityAdjustments handlers", () => {
  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) return { Items: [], Count: 0 };
      if (cmd instanceof lib.PutCommand) return {};
      if (cmd instanceof lib.DeleteCommand) return {};
      if (cmd instanceof lib.GetCommand) return { Item: null };
      return {};
    });
  });

  describe("PUT", () => {
    test("returns 400 when nino is missing", async () => {
      const event = buildAdjustmentsEvent({ body: { nino: undefined } });
      const response = await hmrcItsaTaxLiabilityAdjustmentsPutHandler(event);
      expect(response.statusCode).toBe(400);
      const body = parseResponseBody(response);
      expect(body.message).toContain("nino");
    });

    test("returns 400 for an entirely empty body without ever calling HMRC", async () => {
      const event = buildAdjustmentsEvent({ body: { carryBackLossesDecrease: undefined } });
      const response = await hmrcItsaTaxLiabilityAdjustmentsPutHandler(event);
      expect(response.statusCode).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("returns 200 on success", async () => {
      mockHmrcSuccess(mockFetch, {});
      const event = buildAdjustmentsEvent();
      const response = await hmrcItsaTaxLiabilityAdjustmentsPutHandler(event);
      expect(response.statusCode).toBe(200);
    });

    test("calls HMRC with PUT, the correct endpoint path and the Individuals Tax Liability Adjustments 1.0 Accept version", async () => {
      mockHmrcSuccess(mockFetch, {});
      const event = buildAdjustmentsEvent();
      await hmrcItsaTaxLiabilityAdjustmentsPutHandler(event);

      expect(mockFetch).toHaveBeenCalled();
      const calledUrl = mockFetch.mock.calls[0][0];
      const calledInit = mockFetch.mock.calls[0][1];
      expect(calledInit.method).toBe("PUT");
      expect(calledUrl).toContain(`/individuals/tax-liability/adjustments/${VALID_NINO}/${VALID_TAX_YEAR}`);
      expect(calledInit.headers["Accept"]).toBe("application/vnd.hmrc.1.0+json");
    });

    test("sends the suspendTemporalValidations header when the caller asks for it", async () => {
      mockHmrcSuccess(mockFetch, {});
      const event = buildAdjustmentsEvent({ body: { suspendTemporalValidations: true } });
      await hmrcItsaTaxLiabilityAdjustmentsPutHandler(event);

      const calledInit = mockFetch.mock.calls[0][1];
      expect(calledInit.headers["suspendTemporalValidations"]).toBe("true");
    });
  });

  describe("GET", () => {
    test("returns 400 when taxYear is missing", async () => {
      const event = buildHmrcEvent({
        queryStringParameters: { nino: VALID_NINO },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcItsaTaxLiabilityAdjustmentsGetHandler(event);
      expect(response.statusCode).toBe(400);
      const body = parseResponseBody(response);
      expect(body.message).toContain("taxYear");
    });

    test("calls HMRC with GET, the correct endpoint path and the Accept version", async () => {
      mockHmrcSuccess(mockFetch, { carryBackLossesDecrease: { incomeTax: 100 } });
      const event = buildHmrcEvent({
        queryStringParameters: { nino: VALID_NINO, taxYear: VALID_TAX_YEAR },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcItsaTaxLiabilityAdjustmentsGetHandler(event);
      expect(response.statusCode).toBe(200);

      const calledUrl = mockFetch.mock.calls[0][0];
      const calledInit = mockFetch.mock.calls[0][1];
      expect(calledInit.method).toBe("GET");
      expect(calledUrl).toContain(`/individuals/tax-liability/adjustments/${VALID_NINO}/${VALID_TAX_YEAR}`);
      expect(calledInit.headers["Accept"]).toBe("application/vnd.hmrc.1.0+json");
    });

    test("returns a client error when HMRC answers MATCHING_RESOURCE_NOT_FOUND", async () => {
      mockHmrcError(mockFetch, 404, { code: "MATCHING_RESOURCE_NOT_FOUND" });
      const event = buildHmrcEvent({
        queryStringParameters: { nino: VALID_NINO, taxYear: VALID_TAX_YEAR },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcItsaTaxLiabilityAdjustmentsGetHandler(event);
      // Every HMRC "not found" maps to a client-fixable 400, the way every other read handler
      // in this repo treats it (see http404NotFoundFromHmrcResponse).
      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE", () => {
    test("returns 400 when taxYear is missing", async () => {
      const event = buildAdjustmentsEvent({ body: { taxYear: undefined } });
      const response = await hmrcItsaTaxLiabilityAdjustmentsDeleteHandler(event);
      expect(response.statusCode).toBe(400);
    });

    test("calls HMRC with DELETE and the correct endpoint path", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) });
      const event = buildAdjustmentsEvent();
      const response = await hmrcItsaTaxLiabilityAdjustmentsDeleteHandler(event);
      expect(response.statusCode).toBe(200);

      const calledUrl = mockFetch.mock.calls[0][0];
      const calledInit = mockFetch.mock.calls[0][1];
      expect(calledInit.method).toBe("DELETE");
      expect(calledUrl).toContain(`/individuals/tax-liability/adjustments/${VALID_NINO}/${VALID_TAX_YEAR}`);
    });

    test("returns 400 when HMRC answers with a 400", async () => {
      mockHmrcError(mockFetch, 400, { code: "RULE_OUTSIDE_AMENDMENT_WINDOW" });
      const event = buildAdjustmentsEvent();
      const response = await hmrcItsaTaxLiabilityAdjustmentsDeleteHandler(event);
      expect(response.statusCode).toBe(400);
    });
  });
});
