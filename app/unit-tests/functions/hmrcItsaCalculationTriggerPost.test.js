// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcItsaCalculationTriggerPost.test.js
import { describe, test, beforeAll, beforeEach, expect, vi } from "vitest";
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

import { ingestHandler as hmrcItsaCalculationTriggerPostHandler } from "@app/functions/hmrc/hmrcItsaCalculationTriggerPost.js";
import { hashSub } from "@app/services/subHasher.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

const VALID_NINO = "AB123456C";
const VALID_TAX_YEAR = "2023-24";
const VALID_CALCULATION_ID = "f2fb30e5-4ab6-4a29-b3c1-c7264259ff1c";

function buildTriggerBody(overrides = {}) {
  return {
    nino: VALID_NINO,
    taxYear: VALID_TAX_YEAR,
    calculationType: "in-year",
    ...overrides,
  };
}

function buildTriggerEvent({ body = {}, headers = {} } = {}) {
  return buildHmrcEvent({
    body: buildTriggerBody(body),
    headers: { authorization: "Bearer test-token", ...headers },
  });
}

function jsonResponse({ ok, status, body }) {
  return { ok, status, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

let mockFetch;

describe("hmrcItsaCalculationTriggerPost ingestHandler", () => {
  beforeAll(async () => {
    // The vendor IP lookup runs once per module, so settle it before any test queues an HMRC
    // response - otherwise the first test's response is consumed by the lookup instead.
    const { detectVendorPublicIp } = await import("@app/lib/buildFraudHeaders.js");
    await detectVendorPublicIp();
  });

  beforeEach(() => {
    Object.assign(process.env, setupTestEnv());
    mockFetch = setupFetchMock();
    vi.resetAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [], Count: 0 };
      }
      if (cmd instanceof lib.PutCommand) {
        return {};
      }
      if (cmd instanceof lib.DeleteCommand) {
        return {};
      }
      if (cmd instanceof lib.GetCommand) {
        return { Item: null };
      }
      return {};
    });
  });

  test("returns 400 when nino is missing", async () => {
    const event = buildTriggerEvent({ body: { nino: undefined } });
    const response = await hmrcItsaCalculationTriggerPostHandler(event);
    expect(response.statusCode).toBe(400);
    const body = parseResponseBody(response);
    expect(body.message).toContain("nino");
  });

  test("returns 400 when taxYear is missing or malformed", async () => {
    const event = buildTriggerEvent({ body: { taxYear: "not-a-year" } });
    const response = await hmrcItsaCalculationTriggerPostHandler(event);
    expect(response.statusCode).toBe(400);
  });

  test("returns 400 for a calculationType outside in-year, intent-to-finalise, intent-to-amend, without calling HMRC", async () => {
    const event = buildTriggerEvent({ body: { calculationType: "not-a-type" } });
    const response = await hmrcItsaCalculationTriggerPostHandler(event);
    expect(response.statusCode).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 403 JSON when the authenticated user holds no bundle entitled to ITSA self-employment", async () => {
    const event = buildTriggerEvent();
    event.requestContext.http.path = "/api/v1/hmrc/itsa/calculation/trigger";
    const response = await hmrcItsaCalculationTriggerPostHandler(event);
    expect(response.statusCode).toBe(403);
    const body = parseResponseBody(response);
    expect(body.code).toBe("BUNDLE_FORBIDDEN");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  test("returns 400 when HMRC rejects the trigger, and never retrieves a calculation", async () => {
    mockHmrcError(mockFetch, 400, { code: "RULE_RECENT_SUBMISSIONS_EXIST", message: "More recent submissions exist. Trigger a new calculation" });

    const event = buildTriggerEvent({ headers: { "x-wait-time-ms": "30000", "x-initial-request": "true" } });
    const response = await hmrcItsaCalculationTriggerPostHandler(event);
    expect(response.statusCode).toBe(400);
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });

  describe("the worker's wait and bounded retry on the calculation's 404", () => {
    // These run the real MIN_CALCULATION_WAIT_MS and CALCULATION_RETRIEVE_RETRY_DELAY_MS waits
    // rather than fake timers - the module's sleep() runs alongside several other awaited steps
    // (bundle enforcement, fraud headers, the DynamoDB async-request writes), and advancing a
    // fake clock through all of them reliably races real timers elsewhere in that chain. Real
    // waits make the test slower but deterministic; the explicit per-test timeout below covers
    // the worst case named by the constants themselves.

    test(
      "waits at least 5 seconds, retries on 404, and completes with the finished calculation",
      async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true, status: 202, body: { calculationId: VALID_CALCULATION_ID } }));
        // Two "not finished yet" responses, then a finished calculation - well within the bound.
        mockFetch.mockResolvedValueOnce(
          jsonResponse({ ok: false, status: 404, body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" } }),
        );
        mockFetch.mockResolvedValueOnce(
          jsonResponse({ ok: false, status: 404, body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" } }),
        );
        const finishedCalculation = {
          metadata: { calculationId: VALID_CALCULATION_ID, calculationType: "in-year", finalDeclaration: false },
          calculation: { taxCalculation: { totalIncomeTaxAndNicsDue: 1900 } },
        };
        mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true, status: 200, body: finishedCalculation }));

        const event = buildTriggerEvent({ headers: { "x-wait-time-ms": "30000", "x-initial-request": "true" } });
        const response = await hmrcItsaCalculationTriggerPostHandler(event);

        expect(response.statusCode).toBe(200);
        expect(JSON.parse(response.body)).toEqual(finishedCalculation);
        // 1 trigger + 2 not-ready retrievals + 1 finished retrieval
        expect(mockFetch).toHaveBeenCalledTimes(4);
      },
      20000,
    );

    test(
      "stops retrying at the bound and reports not found rather than polling forever",
      async () => {
        mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true, status: 202, body: { calculationId: VALID_CALCULATION_ID } }));
        // Every retrieval attempt answers 404 - the calculation never finishes in this test.
        for (let i = 0; i < 5; i += 1) {
          mockFetch.mockResolvedValueOnce(
            jsonResponse({ ok: false, status: 404, body: { code: "MATCHING_RESOURCE_NOT_FOUND", message: "Matching resource not found" } }),
          );
        }

        const event = buildTriggerEvent({ headers: { "x-wait-time-ms": "30000", "x-initial-request": "true" } });
        const response = await hmrcItsaCalculationTriggerPostHandler(event);

        expect(response.statusCode).toBe(400);
        // 1 trigger + exactly 5 retrieval attempts (the named bound) - a 6th would mean it never stops.
        expect(mockFetch).toHaveBeenCalledTimes(6);
      },
      30000,
    );
  });

  test(
    "publishes the itsa-calculation-triggered event with the hashed sub, never the raw sub",
    async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true, status: 202, body: { calculationId: VALID_CALCULATION_ID } }));
      mockFetch.mockResolvedValueOnce(jsonResponse({ ok: true, status: 200, body: { metadata: { calculationId: VALID_CALCULATION_ID } } }));

      const event = buildTriggerEvent({ headers: { "x-wait-time-ms": "30000", "x-initial-request": "true" } });
      await hmrcItsaCalculationTriggerPostHandler(event);

      const triggeredCalls = mockEventBridgeSend.mock.calls.filter((call) => {
        const detail = JSON.parse(call[0].input.Entries[0].Detail);
        return detail.event === "itsa-calculation-triggered";
      });
      expect(triggeredCalls).toHaveLength(1);
      const rawDetail = triggeredCalls[0][0].input.Entries[0].Detail;
      expect(rawDetail).not.toContain('"test-sub"');
      const detail = JSON.parse(rawDetail);
      expect(detail.hashedSub).toBe(hashSub("test-sub"));
    },
    15000,
  );
});
