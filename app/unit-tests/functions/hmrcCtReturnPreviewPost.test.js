// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/hmrcCtReturnPreviewPost.test.js
import { describe, test, beforeAll, beforeEach, expect, vi } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";
import { buildLambdaEvent } from "@app/test-helpers/eventBuilders.js";
import { setupTestEnv, parseResponseBody } from "@app/test-helpers/mockHelpers.js";
import { buildCtReturnBodyFromBook } from "@app/test-helpers/ctReturnFixture.js";

const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class QueryCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return {
    DynamoDBDocumentClient: { from: () => ({ send: mockSend }) },
    QueryCommand,
    PutCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    GetCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
    UpdateCommand: class {
      constructor(input) {
        this.input = input;
      }
    },
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

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

const mockPostToTransactionEngine = vi.fn();
vi.mock("@app/services/hmrcTransactionEngine.js", async (importOriginal) => ({
  ...(await importOriginal()),
  postToTransactionEngine: (...args) => mockPostToTransactionEngine(...args),
}));

import { ingestHandler as hmrcCtReturnPreviewPostHandler } from "@app/functions/hmrc/hmrcCtReturnPreviewPost.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

let baseBody;

function buildEvent({ body = baseBody, headers = {}, authorizer, method = "POST" } = {}) {
  const options = {
    method,
    path: "/api/v1/hmrc/ct/return/preview",
    body,
    headers: { Authorization: "Bearer test-cognito-token", ...headers },
  };
  if (authorizer !== undefined) options.authorizer = authorizer;
  return buildLambdaEvent(options);
}

describe("hmrcCtReturnPreviewPost ingestHandler", () => {
  beforeAll(async () => {
    baseBody = await buildCtReturnBodyFromBook();
  });

  beforeEach(() => {
    Object.assign(process.env, setupTestEnv({ ENVIRONMENT_NAME: "test" }));
    vi.clearAllMocks();
    mockEventBridgeSend.mockResolvedValue({});
    mockSend.mockImplementation(async (cmd) => {
      const lib = await import("@aws-sdk/lib-dynamodb");
      if (cmd instanceof lib.QueryCommand) {
        return { Items: [{ bundleId: "resident", subscriptionStatus: "active" }], Count: 1 };
      }
      return {};
    });
  });

  test("returns the CT600, the computations and the accounts without calling HMRC or needing credentials", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent());
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.ct600Xml).toContain("<IRenvelope");
    expect(body.ct600Xml).toContain(`<Key Type="UTR">${baseBody.utr}</Key>`);
    expect(body.ct600Xml).toContain('<IRmark Type="generic"></IRmark>');
    expect(body.computationsIxbrl).toContain("ct-comp:AdjustedProfitForThePeriod");
    expect(body.accountsIxbrl).toContain("ix:header");
    expect(body.boxes["3"]).toBe(baseBody.utr);
    expect(body.boxes["975"]).toBe(baseBody.declarant.name);
    expect(mockPostToTransactionEngine).not.toHaveBeenCalled();
  });

  test("takes the typed company facts over the book export's", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(
      buildEvent({ body: { ...baseBody, utr: "1234567890", declarant: { name: "Pat Typed", status: "Secretary" } } }),
    );
    expect(response.statusCode).toBe(200);
    const body = parseResponseBody(response);
    expect(body.boxes["3"]).toBe("1234567890");
    expect(body.ct600Xml).toContain("<Name>Pat Typed</Name>");
    expect(body.ct600Xml).toContain("<Status>Secretary</Status>");
    expect(body.computationsIxbrl).toContain("1234567890");
  });

  test.each([
    ["a director's loan account overdrawn at the year end", { directorsLoanOverdrawn: true }, /CT600A/],
    ["an unanswered director's loan question", { directorsLoanOverdrawn: undefined }, /directorsLoanOverdrawn/],
    ["an unaccepted declaration", { declarationAccepted: false }, /accept the declaration/],
    ["a UTR that is not 10 digits", { utr: "123" }, /utr/],
    ["a missing trade name", { tradeName: "" }, /tradeName/],
    ["a missing declarant", { declarant: { name: "", status: "" } }, /declarant/],
    ["no boxes", { boxes: undefined }, /Missing boxes/],
    ["no computation lines", { computationLines: undefined }, /Missing computationLines/],
    ["a filleted accounts copy", { smallCompany: undefined }, /smallCompany is required/],
  ])("answers 400 for %s", async (_label, overrides, message) => {
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ body: { ...baseBody, ...overrides } }));
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).toMatch(message);
  });

  test("answers 400 when box 155 disagrees with the computation's adjusted profit", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(
      buildEvent({ body: { ...baseBody, boxes: { ...baseBody.boxes, 155: baseBody.boxes[155] + 1 } } }),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).toMatch(/Box 155/);
  });

  test("answers 400 when the accounts period does not overlap the return period", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(
      buildEvent({ body: { ...baseBody, boxes: { ...baseBody.boxes, 30: "2001-01-01", 35: "2001-12-31" } } }),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).toMatch(/does not overlap/);
  });

  test("answers 400 when the computation lines do not add up", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(
      buildEvent({
        body: { ...baseBody, computationLines: { ...baseBody.computationLines, depreciation: baseBody.computationLines.depreciation + 5 } },
      }),
    );
    expect(response.statusCode).toBe(400);
    expect(JSON.stringify(parseResponseBody(response))).toMatch(/does not add up/);
  });

  test("returns 401 when the Cognito bearer token is missing", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ authorizer: {} }));
    expect(response.statusCode).toBe(401);
  });

  test("returns 403 when the environment does not list the matched activity", async () => {
    process.env.ENVIRONMENT_NAME = "prod";
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent());
    expect(response.statusCode).toBe(403);
  });

  test("returns 200 with an empty object for a HEAD request", async () => {
    const response = await hmrcCtReturnPreviewPostHandler(buildEvent({ method: "HEAD" }));
    expect(response.statusCode).toBe(200);
    expect(parseResponseBody(response)).toEqual({});
  });
});
