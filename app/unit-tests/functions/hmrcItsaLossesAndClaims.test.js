// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaLossesAndClaims.test.js
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
  ingestHandler as hmrcItsaLossesAndClaimsPutHandler,
  buildLossesAndClaimsRequestBody,
} from "@app/functions/hmrc/hmrcItsaLossesAndClaimsPut.js";
import { ingestHandler as hmrcItsaLossesAndClaimsGetHandler } from "@app/functions/hmrc/hmrcItsaLossesAndClaimsGet.js";
import { ingestHandler as hmrcItsaLossesAndClaimsDeleteHandler } from "@app/functions/hmrc/hmrcItsaLossesAndClaimsDelete.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_BUSINESS_ID = "XAIS12345678901";
const VALID_TAX_YEAR = "2023-24";

function buildLossesBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    businessId: VALID_BUSINESS_ID,
    taxYear: VALID_TAX_YEAR,
    typeOfBusiness: "self-employment",
    claims: { carryForward: { currentYearLosses: 1000 } },
    ...overrides,
  };
}

function buildLossesEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildLossesBody(body),
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

describe("buildLossesAndClaimsRequestBody", () => {
  test("omits empty losses/claims sections entirely", () => {
    const body = buildLossesAndClaimsRequestBody({
      losses: {},
      claims: { carryForward: { currentYearLosses: 500 } },
    });
    expect(body).toEqual({ claims: { carryForward: { currentYearLosses: 500 } } });
  });

  test("rounds money values to 2 decimal places", () => {
    const body = buildLossesAndClaimsRequestBody({ losses: { broughtForwardLosses: 100.005 } });
    expect(body.losses.broughtForwardLosses).toBe(100.01);
  });

  test("accepts the carry-forward, carry-sideways and carry-back sections together", () => {
    const body = buildLossesAndClaimsRequestBody({
      claims: {
        carryForward: { currentYearLosses: 1000 },
        carrySideways: { currentYearGeneralIncome: 500 },
        carryBack: { previousYearGeneralIncome: 200 },
      },
    });
    expect(body.claims.carryForward).toEqual({ currentYearLosses: 1000 });
    expect(body.claims.carrySideways).toEqual({ currentYearGeneralIncome: 500 });
    expect(body.claims.carryBack).toEqual({ previousYearGeneralIncome: 200 });
  });

  test("rejects an entirely empty body", () => {
    expect(() => buildLossesAndClaimsRequestBody({})).toThrow(/An empty or non-matching body/);
  });

  test("rejects a carry-back claim against a UK property business", () => {
    expect(() =>
      buildLossesAndClaimsRequestBody({
        claims: { carryBack: { previousYearGeneralIncome: 200 } },
        typeOfBusiness: "uk-property",
      }),
    ).toThrow(/carry-back claim cannot be made against a property business/);
  });

  test("accepts a carry-back claim for a self-employment business", () => {
    const body = buildLossesAndClaimsRequestBody({
      claims: { carryBack: { previousYearGeneralIncome: 200 } },
      typeOfBusiness: "self-employment",
    });
    expect(body.claims.carryBack).toEqual({ previousYearGeneralIncome: 200 });
  });

  test("rejects a preference order with no carry-sideways or carry-back claim", () => {
    expect(() =>
      buildLossesAndClaimsRequestBody({
        claims: { carryForward: { currentYearLosses: 1000 }, preferenceOrder: { applyFirst: "carry-sideways" } },
      }),
    ).toThrow(/preferenceOrder only applies/);
  });

  test("accepts a preference order when both a carry-sideways and a carry-back claim are present", () => {
    const body = buildLossesAndClaimsRequestBody({
      claims: {
        carrySideways: { currentYearGeneralIncome: 500 },
        carryBack: { previousYearGeneralIncome: 200 },
        preferenceOrder: { applyFirst: "carry-sideways" },
      },
      typeOfBusiness: "self-employment",
    });
    expect(body.claims.preferenceOrder).toEqual({ applyFirst: "carry-sideways" });
  });
});

let mockFetch;

describe("hmrcItsaLossesAndClaims handlers", () => {
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
    test("returns 400 when nino is missing from body", async () => {
      const event = buildLossesEvent({ body: { nino: undefined } });
      const response = await hmrcItsaLossesAndClaimsPutHandler(event);
      expect(response.statusCode).toBe(400);
      const body = parseResponseBody(response);
      expect(body.message).toContain("nino");
    });

    test("returns 400 for an entirely empty body without ever calling HMRC", async () => {
      const event = buildLossesEvent({ body: { claims: undefined } });
      const response = await hmrcItsaLossesAndClaimsPutHandler(event);
      expect(response.statusCode).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("returns 400 for a carry-back claim against a property business without ever calling HMRC", async () => {
      const event = buildLossesEvent({
        body: { typeOfBusiness: "uk-property", claims: { carryBack: { previousYearGeneralIncome: 200 } } },
      });
      const response = await hmrcItsaLossesAndClaimsPutHandler(event);
      expect(response.statusCode).toBe(400);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    test("returns 200 on success", async () => {
      mockHmrcSuccess(mockFetch, {});
      const event = buildLossesEvent();
      const response = await hmrcItsaLossesAndClaimsPutHandler(event);
      expect(response.statusCode).toBe(200);
    });

    test("calls HMRC with PUT, the correct endpoint path and the Individual Losses 7.0 Accept version", async () => {
      mockHmrcSuccess(mockFetch, {});
      const event = buildLossesEvent();
      await hmrcItsaLossesAndClaimsPutHandler(event);

      expect(mockFetch).toHaveBeenCalled();
      const calledUrl = mockFetch.mock.calls[0][0];
      const calledInit = mockFetch.mock.calls[0][1];
      expect(calledInit.method).toBe("PUT");
      expect(calledUrl).toContain(`/individuals/losses/${VALID_NINO}/businesses/${VALID_BUSINESS_ID}/loss-claims/${VALID_TAX_YEAR}`);
      expect(calledInit.headers["Accept"]).toBe("application/vnd.hmrc.7.0+json");
    });

    test("sends the suspendTemporalValidations header when the caller asks for it", async () => {
      mockHmrcSuccess(mockFetch, {});
      const event = buildLossesEvent({ body: { suspendTemporalValidations: true } });
      await hmrcItsaLossesAndClaimsPutHandler(event);

      const calledInit = mockFetch.mock.calls[0][1];
      expect(calledInit.headers["suspendTemporalValidations"]).toBe("true");
    });

    test("returns 400 when HMRC answers with a 400", async () => {
      mockHmrcError(mockFetch, 400, { code: "RULE_OUTSIDE_AMENDMENT_WINDOW" });
      const event = buildLossesEvent();
      const response = await hmrcItsaLossesAndClaimsPutHandler(event);
      expect(response.statusCode).toBe(400);
    });
  });

  describe("GET", () => {
    test("returns 400 when taxYear is missing", async () => {
      const event = buildHmrcEvent({
        queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcItsaLossesAndClaimsGetHandler(event);
      expect(response.statusCode).toBe(400);
      const body = parseResponseBody(response);
      expect(body.message).toContain("taxYear");
    });

    test("calls HMRC with GET, the correct endpoint path and the Individual Losses 7.0 Accept version", async () => {
      mockHmrcSuccess(mockFetch, { losses: { broughtForwardLosses: 0 } });
      const event = buildHmrcEvent({
        queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcItsaLossesAndClaimsGetHandler(event);
      expect(response.statusCode).toBe(200);

      const calledUrl = mockFetch.mock.calls[0][0];
      const calledInit = mockFetch.mock.calls[0][1];
      expect(calledInit.method).toBe("GET");
      expect(calledUrl).toContain(`/individuals/losses/${VALID_NINO}/businesses/${VALID_BUSINESS_ID}/loss-claims/${VALID_TAX_YEAR}`);
      expect(calledInit.headers["Accept"]).toBe("application/vnd.hmrc.7.0+json");
    });

    test("returns a client error when HMRC answers MATCHING_RESOURCE_NOT_FOUND", async () => {
      mockHmrcError(mockFetch, 404, { code: "MATCHING_RESOURCE_NOT_FOUND" });
      const event = buildHmrcEvent({
        queryStringParameters: { nino: VALID_NINO, businessId: VALID_BUSINESS_ID, taxYear: VALID_TAX_YEAR },
        headers: { authorization: "Bearer test-token" },
      });
      const response = await hmrcItsaLossesAndClaimsGetHandler(event);
      // Every HMRC "not found" maps to a client-fixable 400, the way every other read handler
      // in this repo treats it (see http404NotFoundFromHmrcResponse).
      expect(response.statusCode).toBe(400);
    });
  });

  describe("DELETE", () => {
    test("returns 400 when businessId is missing", async () => {
      const event = buildLossesEvent({ body: { businessId: undefined } });
      const response = await hmrcItsaLossesAndClaimsDeleteHandler(event);
      expect(response.statusCode).toBe(400);
    });

    test("calls HMRC with DELETE and the correct endpoint path", async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 204, json: () => Promise.resolve({}) });
      const event = buildLossesEvent();
      const response = await hmrcItsaLossesAndClaimsDeleteHandler(event);
      expect(response.statusCode).toBe(200);

      const calledUrl = mockFetch.mock.calls[0][0];
      const calledInit = mockFetch.mock.calls[0][1];
      expect(calledInit.method).toBe("DELETE");
      expect(calledUrl).toContain(`/individuals/losses/${VALID_NINO}/businesses/${VALID_BUSINESS_ID}/loss-claims/${VALID_TAX_YEAR}`);
    });

    test("returns 400 when HMRC answers with a 400", async () => {
      mockHmrcError(mockFetch, 400, { code: "RULE_OUTSIDE_AMENDMENT_WINDOW" });
      const event = buildLossesEvent();
      const response = await hmrcItsaLossesAndClaimsDeleteHandler(event);
      expect(response.statusCode).toBe(400);
    });
  });
});
