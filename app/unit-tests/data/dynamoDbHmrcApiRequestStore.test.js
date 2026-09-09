// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/dynamoDbHmrcApiRequestStore.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { context } from "@app/lib/logger.js";
import { _setTestSalt, _clearSalt } from "@app/services/subHasher.js";

// Mocks for AWS SDK clients used via dynamic import in the implementation
const mockSend = vi.fn();

vi.mock("@aws-sdk/lib-dynamodb", () => {
  class PutCommand {
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
    UpdateCommand,
  };
});

vi.mock("@aws-sdk/client-dynamodb", () => {
  class DynamoDBClient {
    constructor(_config) {
      // no-op for tests
    }
  }
  return { DynamoDBClient };
});

describe("dynamoDbHmrcApiRequestStore", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
    context.enterWith(new Map());
    // Initialize salt for tests that use hashSub
    _setTestSalt("test-salt-for-unit-tests");
  });

  afterEach(() => {
    process.env = originalEnv;
    _clearSalt();
  });

  test("skips put when HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME is not set", async () => {
    // Arrange
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = ""; // disabled
    const { putHmrcApiRequest } = await import("@app/data/dynamoDbHmrcApiRequestRepository.js");

    // Act
    await expect(
      putHmrcApiRequest("user-sub", {
        url: "https://example.test",
        httpRequest: { method: "POST", headers: {}, body: {} },
        httpResponse: { statusCode: 200, headers: {}, body: {} },
        duration: 10,
      }),
    ).resolves.toBeUndefined();
  });

  test("writes PutCommand when table name is configured", async () => {
    // Arrange
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = "unit-test-hmrc-requests";
    process.env.AWS_REGION = process.env.AWS_REGION || "eu-west-2";
    const { putHmrcApiRequest } = await import("@app/data/dynamoDbHmrcApiRequestRepository.js");
    const { hashSub } = await import("@app/services/subHasher.js");

    const input = {
      url: "https://hmrc.example/api",
      httpRequest: { method: "POST", headers: { a: "b" }, body: { x: 1 } },
      httpResponse: { statusCode: 201, headers: { c: "d" }, body: { ok: true } },
      duration: 42,
    };

    await context.run(new Map(), async () => {
      // add request correlation data
      context.set("requestId", "req-123");
      context.set("amznTraceId", "Root=1-abc");
      context.set("traceparent", "00-8f3c...-01");

      // Capture the PutCommand input passed via mock send
      mockSend.mockImplementation(async (cmd) => {
        // mimic AWS client behaviour
        expect(cmd).toBeInstanceOf((await import("@aws-sdk/lib-dynamodb")).PutCommand);
        const expectedHashedSub = hashSub("user-sub");
        expect(cmd.input.TableName).toBe("unit-test-hmrc-requests");
        expect(cmd.input.Item.hashedSub).toBe(expectedHashedSub);
        expect(cmd.input.Item.requestId).toBe("req-123");
        expect(cmd.input.Item.url).toBe(input.url);
        expect(cmd.input.Item.method).toBe("POST");
        // duration and ttl should be numbers
        expect(typeof cmd.input.Item.duration).toBe("number");
        expect(typeof cmd.input.Item.ttl).toBe("number");
        return {};
      });

      // Act
      await putHmrcApiRequest("user-sub", input);
    });

    // Assert
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("masks sensitive data in httpRequest and httpResponse before storing", async () => {
    // Arrange
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = "unit-test-hmrc-requests";
    process.env.AWS_REGION = process.env.AWS_REGION || "eu-west-2";
    const { putHmrcApiRequest } = await import("@app/data/dynamoDbHmrcApiRequestRepository.js");

    const input = {
      url: "https://test-api.service.hmrc.gov.uk/oauth/token",
      httpRequest: {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": "Bearer actualToken123",
        },
        body: {
          grant_type: "authorization_code",
          client_secret: "actualSecret123",
        },
      },
      httpResponse: {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
        },
        body: {
          access_token: "actualAccessToken123",
          refresh_token: "actualRefreshToken123",
          expires_in: 14400,
          token_type: "Bearer",
        },
      },
      duration: 250,
    };

    await context.run(new Map(), async () => {
      context.set("requestId", "req-456");

      // Capture the PutCommand to verify masking
      mockSend.mockImplementation(async (cmd) => {
        const item = cmd.input.Item;

        // Verify Authorization header is masked
        expect(item.httpRequest.headers.Authorization).toBe("***MASKED***");
        expect(item.httpRequest.headers["Content-Type"]).toBe("application/json");

        // Verify client_secret in request body is masked
        expect(item.httpRequest.body.client_secret).toBe("***MASKED***");
        expect(item.httpRequest.body.grant_type).toBe("authorization_code");

        // Verify tokens in response body are masked
        expect(item.httpResponse.body.access_token).toBe("***MASKED***");
        expect(item.httpResponse.body.refresh_token).toBe("***MASKED***");
        expect(item.httpResponse.body.expires_in).toBe(14400);
        expect(item.httpResponse.body.token_type).toBe("Bearer");

        // Verify response headers are not masked
        expect(item.httpResponse.headers["Content-Type"]).toBe("application/json");

        return {};
      });

      // Act
      await putHmrcApiRequest("user-sub", input);
    });

    // Assert
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  test("masks hmrcTestPassword in nested test data", async () => {
    // Arrange
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = "unit-test-hmrc-requests";
    process.env.AWS_REGION = process.env.AWS_REGION || "eu-west-2";
    const { putHmrcApiRequest } = await import("@app/data/dynamoDbHmrcApiRequestRepository.js");

    const input = {
      url: "https://test-api.service.hmrc.gov.uk/test/fraud-prevention-headers/validate",
      httpRequest: {
        method: "GET",
        headers: {
          "Accept": "application/vnd.hmrc.1.0+json",
          "Authorization": "Bearer testToken",
          "Gov-Client-Public-IP": "88.97.27.180",
        },
        body: {
          testData: {
            hmrcTestUsername: "869172854733",
            hmrcTestPassword: "actualTestPassword",
            hmrcTestVatNumber: "123456789",
          },
        },
      },
      httpResponse: {
        statusCode: 200,
        headers: {},
        body: { code: "VALID_HEADERS" },
      },
      duration: 150,
    };

    await context.run(new Map(), async () => {
      context.set("requestId", "req-789");

      // Capture the PutCommand to verify masking
      mockSend.mockImplementation(async (cmd) => {
        const item = cmd.input.Item;

        // Verify hmrcTestPassword in nested test data is masked
        expect(item.httpRequest.body.testData.hmrcTestPassword).toBe("***MASKED***");
        expect(item.httpRequest.body.testData.hmrcTestUsername).toBe("869172854733");
        expect(item.httpRequest.body.testData.hmrcTestVatNumber).toBe("123456789");

        // Verify Authorization header is masked
        expect(item.httpRequest.headers.Authorization).toBe("***MASKED***");
        expect(item.httpRequest.headers.Accept).toBe("application/vnd.hmrc.1.0+json");

        return {};
      });

      // Act
      await putHmrcApiRequest("user-sub", input);
    });

    // Assert
    expect(mockSend).toHaveBeenCalledTimes(1);
  });
});
