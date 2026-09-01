// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/system-tests/customAuthorizer.system.test.js
//
// customAuthorizer.js is invoked directly by API Gateway as a Lambda authorizer -- it isn't
// wired into app/bin/server.js's Express routes, so there's no HTTP endpoint to call through.
// These tests invoke ingestHandler directly against a real dynalite-backed security-state
// table, the same pattern every other system test in this directory uses for its Lambda.

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from "vitest";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env.test" });

// Mock aws-jwt-verify to avoid network/keys
const mockVerify = vi.fn();
vi.mock("aws-jwt-verify", () => ({
  CognitoJwtVerifier: {
    create: vi.fn().mockReturnValue({ verify: mockVerify }),
  },
}));

// No local emulator exists for Cognito's admin API: mock the client customAuthorizer.js uses
// to force a global sign-out on a country change.
const mockCognitoSend = vi.fn();
vi.mock("@aws-sdk/client-cognito-identity-provider", () => {
  class CognitoIdentityProviderClient {
    send(cmd) {
      return mockCognitoSend(cmd);
    }
  }
  class AdminUserGlobalSignOutCommand {
    constructor(input) {
      this.input = input;
    }
  }
  return { CognitoIdentityProviderClient, AdminUserGlobalSignOutCommand };
});

function makeEvent(headers = {}, arn = "arn:aws:execute-api:eu-west-2:123456789012:abc123/prod/GET/resource") {
  return { routeArn: arn, headers, requestContext: {} };
}

let stopDynalite;
const securityStateTableName = "security-state-system-test";

beforeAll(async () => {
  const { default: dynalite } = await import("dynalite");
  const { DynamoDBClient, CreateTableCommand } = await import("@aws-sdk/client-dynamodb");

  const host = "127.0.0.1";
  const server = dynalite({ createTableMs: 0 });
  const address = await new Promise((resolve, reject) => {
    server.listen(0, host, (err) => (err ? reject(err) : resolve(server.address())));
  });
  stopDynalite = async () => {
    try {
      server.close();
    } catch {}
  };
  const endpoint = `http://${host}:${address.port}`;

  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;
  process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME = securityStateTableName;
  process.env.COGNITO_USER_POOL_ID = "pool-123";
  process.env.COGNITO_USER_POOL_CLIENT_ID = "client-123";
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-authorizer-system-tests"}}';

  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  const ddb = new DynamoDBClient({ region: process.env.AWS_REGION, endpoint });
  await ddb.send(
    new CreateTableCommand({
      TableName: securityStateTableName,
      KeySchema: [{ AttributeName: "stateKey", KeyType: "HASH" }],
      AttributeDefinitions: [{ AttributeName: "stateKey", AttributeType: "S" }],
      BillingMode: "PAY_PER_REQUEST",
    }),
  );
});

afterAll(async () => {
  await stopDynalite?.();
});

describe("System: customAuthorizer", () => {
  beforeEach(() => {
    mockVerify.mockReset();
    mockCognitoSend.mockReset();
    mockCognitoSend.mockResolvedValue({});
  });

  it("denies when X-Authorization header is missing", async () => {
    const { ingestHandler } = await import("../functions/auth/customAuthorizer.js");
    const res = await ingestHandler(makeEvent({}));
    expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
  });

  it("denies when X-Authorization is not 'Bearer <token>'", async () => {
    const { ingestHandler } = await import("../functions/auth/customAuthorizer.js");
    const res = await ingestHandler(makeEvent({ "X-Authorization": "token" }));
    expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
  });

  it("allows when verifier succeeds and returns payload", async () => {
    const { ingestHandler } = await import("../functions/auth/customAuthorizer.js");
    mockVerify.mockResolvedValueOnce({ sub: "user-sub", username: "user", scope: "read" });
    const res = await ingestHandler(makeEvent({ "x-authorization": "Bearer token-abc" }));
    expect(res.policyDocument.Statement[0].Effect).toBe("Allow");
    expect(res.principalId).toBe("user-sub");
    expect(res.context.sub).toBe("user-sub");
  });

  it("denies when verifier throws (invalid token)", async () => {
    const { ingestHandler } = await import("../functions/auth/customAuthorizer.js");
    mockVerify.mockRejectedValueOnce(new Error("invalid"));
    const res = await ingestHandler(makeEvent({ "x-authorization": "Bearer bad" }));
    expect(res.policyDocument.Statement[0].Effect).toBe("Deny");
  });

  // ==========================================================================
  // Mid-session country change against a real (dynalite) security-state table
  // ==========================================================================

  it("allows the first request from a country, then denies and revokes a later request from a different country", async () => {
    const { ingestHandler } = await import("../functions/auth/customAuthorizer.js");
    const userId = "system-test-country-user";
    const nowIat = Math.floor(Date.now() / 1000);

    mockVerify.mockResolvedValueOnce({ sub: userId, username: "user", iat: nowIat });
    const firstRes = await ingestHandler(
      makeEvent({ "x-authorization": "Bearer token-1", "cloudfront-viewer-country": "GB" }),
    );
    expect(firstRes.policyDocument.Statement[0].Effect).toBe("Allow");
    expect(mockCognitoSend).not.toHaveBeenCalled();

    mockVerify.mockResolvedValueOnce({ sub: userId, username: "user", iat: nowIat });
    const secondRes = await ingestHandler(
      makeEvent({ "x-authorization": "Bearer token-2", "cloudfront-viewer-country": "FR" }),
    );
    expect(secondRes.policyDocument.Statement[0].Effect).toBe("Deny");
    expect(mockCognitoSend).toHaveBeenCalledTimes(1);
  });

  it("allows a repeat request from the same country with no further sign-out calls", async () => {
    const { ingestHandler } = await import("../functions/auth/customAuthorizer.js");
    const userId = "system-test-same-country-user";
    const nowIat = Math.floor(Date.now() / 1000);

    mockVerify.mockResolvedValueOnce({ sub: userId, username: "user", iat: nowIat });
    await ingestHandler(makeEvent({ "x-authorization": "Bearer token-1", "cloudfront-viewer-country": "GB" }));

    mockVerify.mockResolvedValueOnce({ sub: userId, username: "user", iat: nowIat });
    const res = await ingestHandler(
      makeEvent({ "x-authorization": "Bearer token-2", "cloudfront-viewer-country": "GB" }),
    );

    expect(res.policyDocument.Statement[0].Effect).toBe("Allow");
    expect(mockCognitoSend).not.toHaveBeenCalled();
  });
});
