// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/migrations/runner.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

// Mock DynamoDB (used by runner for migration tracking)
const mockDynamoSend = vi.fn();

vi.mock("@aws-sdk/client-dynamodb", () => ({
  DynamoDBClient: class {
    constructor() {}
  },
}));

vi.mock("@aws-sdk/lib-dynamodb", () => ({
  DynamoDBDocumentClient: { from: () => ({ send: mockDynamoSend }) },
  QueryCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  PutCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  ScanCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  UpdateCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  DeleteCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  GetCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// Mock Secrets Manager (used by migration 001, 002, 003)
const mockSmSend = vi.fn();
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    constructor() {
      this.send = mockSmSend;
    }
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
  UpdateSecretCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// Mock Cognito (used by migration 003)
vi.mock("@aws-sdk/client-cognito-identity-provider", () => ({
  CognitoIdentityProviderClient: class {
    constructor() {
      this.send = vi.fn();
    }
  },
  ListUsersCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

// Mock SSM (used by migration 003)
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    constructor() {
      this.send = vi.fn();
    }
  },
  GetParameterCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import { runMigrations } from "../../../scripts/migrations/runner.js";

describe("migration runner", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("throws when ENVIRONMENT_NAME is not set", async () => {
    delete process.env.ENVIRONMENT_NAME;
    await expect(runMigrations()).rejects.toThrow("ENVIRONMENT_NAME is required");
  });

  test("discovers migration files and skips all when already applied", async () => {
    process.env.ENVIRONMENT_NAME = "test";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundles";

    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { hashedSub: "system#migrations", bundleId: "001-convert-salt-to-registry" },
        { hashedSub: "system#migrations", bundleId: "002-backfill-salt-version-v1" },
        { hashedSub: "system#migrations", bundleId: "003-rotate-salt-to-passphrase" },
        { hashedSub: "system#migrations", bundleId: "004-backfill-stripe-test-mode" },
      ],
    });

    const result = await runMigrations();

    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(4);
    expect(result.total).toBe(4);

    // Only the QueryCommand for checking applied migrations
    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
    const queryInput = mockDynamoSend.mock.calls[0][0].input;
    expect(queryInput.TableName).toBe("test-bundles");
    expect(queryInput.ExpressionAttributeValues[":pk"]).toBe("system#migrations");
  });

  test("filters migrations by phase", async () => {
    process.env.ENVIRONMENT_NAME = "test";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundles";

    // 001 and 004 are pre-deploy, already applied
    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { hashedSub: "system#migrations", bundleId: "001-convert-salt-to-registry" },
        { hashedSub: "system#migrations", bundleId: "004-backfill-stripe-test-mode" },
      ],
    });

    const result = await runMigrations("pre-deploy");

    // 001, 004 are pre-deploy but already applied → counted as skipped
    // 002, 003 are post-deploy → skipped by phase filter (not counted in skipped)
    expect(result.applied).toBe(0);
    expect(result.skipped).toBe(2);
    expect(result.total).toBe(4);
  });

  test("runs unapplied pre-deploy migration and records it", async () => {
    process.env.ENVIRONMENT_NAME = "test";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundles";

    // 004 already applied, so only 001 (pre-deploy, unapplied) runs
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ hashedSub: "system#migrations", bundleId: "004-backfill-stripe-test-mode" }],
    });

    // 001's up() reads salt from Secrets Manager — return already-converted registry (idempotent path)
    mockSmSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({ current: "v1", versions: { v1: "test-salt" } }),
    });

    // PutCommand to record migration 001 as applied
    mockDynamoSend.mockResolvedValueOnce({});

    const result = await runMigrations("pre-deploy");

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(4);

    // Second DynamoDB call is PutCommand recording the applied migration
    expect(mockDynamoSend).toHaveBeenCalledTimes(2);
    const putInput = mockDynamoSend.mock.calls[1][0].input;
    expect(putInput.Item.hashedSub).toBe("system#migrations");
    expect(putInput.Item.bundleId).toBe("001-convert-salt-to-registry");
    expect(putInput.Item.environment).toBe("test");
  });

  test("dry run applies the migration function but records nothing", async () => {
    process.env.ENVIRONMENT_NAME = "test";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundles";
    process.env.MIGRATION_DRY_RUN = "true";

    // 004 already applied, so only 001 (pre-deploy, unapplied) runs
    mockDynamoSend.mockResolvedValueOnce({
      Items: [{ hashedSub: "system#migrations", bundleId: "004-backfill-stripe-test-mode" }],
    });

    // 001's up() reads salt from Secrets Manager — return already-converted registry (idempotent path)
    mockSmSend.mockResolvedValueOnce({
      SecretString: JSON.stringify({ current: "v1", versions: { v1: "test-salt" } }),
    });

    const result = await runMigrations("pre-deploy");

    expect(result.applied).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.total).toBe(4);

    // Only the initial QueryCommand for already-applied migrations — no PutCommand recording 001
    expect(mockDynamoSend).toHaveBeenCalledTimes(1);
  });

  test("uses fallback table name from ENVIRONMENT_NAME", async () => {
    process.env.ENVIRONMENT_NAME = "ci";
    delete process.env.BUNDLE_DYNAMODB_TABLE_NAME;

    mockDynamoSend.mockResolvedValueOnce({
      Items: [
        { hashedSub: "system#migrations", bundleId: "001-convert-salt-to-registry" },
        { hashedSub: "system#migrations", bundleId: "002-backfill-salt-version-v1" },
        { hashedSub: "system#migrations", bundleId: "003-rotate-salt-to-passphrase" },
        { hashedSub: "system#migrations", bundleId: "004-backfill-stripe-test-mode" },
      ],
    });

    await runMigrations();

    const queryInput = mockDynamoSend.mock.calls[0][0].input;
    expect(queryInput.TableName).toBe("ci-env-bundles");
  });

  test("propagates migration failure", async () => {
    process.env.ENVIRONMENT_NAME = "test";
    process.env.BUNDLE_DYNAMODB_TABLE_NAME = "test-bundles";

    // No migrations applied
    mockDynamoSend.mockResolvedValueOnce({ Items: [] });

    // 001's up() calls Secrets Manager — simulate failure
    mockSmSend.mockRejectedValueOnce(new Error("Secret not found"));

    await expect(runMigrations("pre-deploy")).rejects.toThrow("Secret not found");
  });
});
