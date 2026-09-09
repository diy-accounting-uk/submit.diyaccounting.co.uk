// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, ScanCommand, GetCommand } from "@aws-sdk/lib-dynamodb";

// We start a local Dynalite instance using the helper in app/bin/dynamodb.js,
// then set environment variables so that the AWS SDK v3 client in
// app/data/dynamoDbReceiptRepository.js connects to that local endpoint via
// AWS_ENDPOINT_URL[_DYNAMODB]. Only after env is set we dynamically import the
// receipt store module to ensure it picks up the correct configuration.

let stopDynalite;
// @ts-check
/** @typedef {typeof import("../data/dynamoDbReceiptRepository.js")} ReceiptStore */
/** @type {ReceiptStore} */
let store;
const tableName = "receipts-system-test";
let dynamoDbClient;
let docClient;

beforeAll(async () => {
  // const { startDynamoDB, ensureReceiptsTableExists } = await import("../bin/dynamodb.js");
  //
  // // Start local dynalite and configure environment for AWS SDK v3
  // const started = await startDynamoDB();
  // stopDynalite = started.stop;
  // const endpoint = started.endpoint;
  const { ensureReceiptsTableExists } = await import("../bin/dynamodb.js");
  const { default: dynalite } = await import("dynalite");

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

  // Minimal AWS SDK env for local usage with endpoint override
  process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
  process.env.AWS_ACCESS_KEY_ID = process.env.AWS_ACCESS_KEY_ID || "dummy";
  process.env.AWS_SECRET_ACCESS_KEY = process.env.AWS_SECRET_ACCESS_KEY || "dummy";

  // Endpoint override for DynamoDB (SDK v3 respects these vars)
  process.env.AWS_ENDPOINT_URL = endpoint;
  process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;

  // Enable DynamoDB usage in the receipt store
  process.env.RECEIPTS_DYNAMODB_TABLE_NAME = tableName;

  // Set salt for hashing user subs (required by subHasher.js)
  process.env.USER_SUB_HASH_SALT = '{"current":"v1","versions":{"v1":"test-salt-for-system-tests"}}';

  // Initialize the salt before importing modules that use hashSub
  const { initializeSalt } = await import("../services/subHasher.js");
  await initializeSalt();

  // Ensure the table exists on the local endpoint
  await ensureReceiptsTableExists(tableName, endpoint);

  // Create DynamoDB client for direct table access in tests
  dynamoDbClient = new DynamoDBClient({
    endpoint,
    region: "us-east-1",
    credentials: {
      accessKeyId: "dummy",
      secretAccessKey: "dummy",
    },
  });
  docClient = DynamoDBDocumentClient.from(dynamoDbClient);

  // Import the store AFTER environment is configured
  store = await import("../data/dynamoDbReceiptRepository.js");
});

afterAll(async () => {
  try {
    await stopDynalite?.();
  } catch {
    // ignore
  }
});

describe("System: dynamoDbReceiptStore with local dynalite", () => {
  it("should enable DynamoDB via env and perform putReceipt/getReceipt/listUserReceipts operations", async () => {
    const userSub = "user-receipt-12345";
    const receiptId = "2025-11-24T10:00:00.000Z-TEST-BUNDLE-001";
    const receipt = {
      formBundleNumber: "TEST-BUNDLE-001",
      chargeRefNumber: "CHARGE-REF-001",
      processingDate: "2025-11-24T10:00:00.000Z",
      vatAmount: "150.00",
    };

    // Put the receipt
    await store.putReceipt(userSub, receiptId, receipt);

    // Get the specific receipt
    const retrievedReceipt = await store.getReceipt(userSub, receiptId);
    expect(retrievedReceipt).toBeTruthy();
    expect(retrievedReceipt.formBundleNumber).toBe(receipt.formBundleNumber);
    expect(retrievedReceipt.chargeRefNumber).toBe(receipt.chargeRefNumber);

    // List all receipts for the user
    const userReceipts = await store.listUserReceipts(userSub);
    expect(Array.isArray(userReceipts)).toBe(true);
    expect(userReceipts.length).toBeGreaterThan(0);
    const found = userReceipts.find((r) => r.receiptId === receiptId);
    expect(found).toBeTruthy();
    expect(found.formBundleNumber).toBe(receipt.formBundleNumber);
    expect(found.timestamp).toBe("2025-11-24T10:00:00.000Z");
  });

  it("should return null for non-existent receipt", async () => {
    const userSub = "user-does-not-exist";
    const receiptId = "2025-01-01T00:00:00.000Z-NONEXISTENT";

    const result = await store.getReceipt(userSub, receiptId);
    expect(result).toBeNull();
  });

  it("should return empty array for user with no receipts", async () => {
    const userSub = "user-no-receipts";

    const receipts = await store.listUserReceipts(userSub);
    expect(Array.isArray(receipts)).toBe(true);
    expect(receipts.length).toBe(0);
  });

  it("should store multiple receipts and list them in correct order", async () => {
    const userSub = "user-multi-receipts";
    const receipts = [
      {
        receiptId: "2025-11-24T09:00:00.000Z-BUNDLE-A",
        receipt: { formBundleNumber: "BUNDLE-A", chargeRefNumber: "CHARGE-A" },
      },
      {
        receiptId: "2025-11-24T10:00:00.000Z-BUNDLE-B",
        receipt: { formBundleNumber: "BUNDLE-B", chargeRefNumber: "CHARGE-B" },
      },
      {
        receiptId: "2025-11-24T11:00:00.000Z-BUNDLE-C",
        receipt: { formBundleNumber: "BUNDLE-C", chargeRefNumber: "CHARGE-C" },
      },
    ];

    // Store all receipts
    for (const { receiptId, receipt } of receipts) {
      await store.putReceipt(userSub, receiptId, receipt);
    }

    // List and verify order (should be descending by timestamp)
    const userReceipts = await store.listUserReceipts(userSub);
    expect(userReceipts.length).toBe(3);
    expect(userReceipts[0].receiptId).toBe("2025-11-24T11:00:00.000Z-BUNDLE-C");
    expect(userReceipts[1].receiptId).toBe("2025-11-24T10:00:00.000Z-BUNDLE-B");
    expect(userReceipts[2].receiptId).toBe("2025-11-24T09:00:00.000Z-BUNDLE-A");
  });

  it("should correctly parse receiptId with hyphens in formBundleNumber", async () => {
    const userSub = "user-hyphen-test";
    const receiptId = "2025-11-24T12:00:00.000Z-BUNDLE-WITH-HYPHENS-001";
    const receipt = {
      formBundleNumber: "BUNDLE-WITH-HYPHENS-001",
      chargeRefNumber: "CHARGE-REF-002",
    };

    await store.putReceipt(userSub, receiptId, receipt);

    const userReceipts = await store.listUserReceipts(userSub);
    const found = userReceipts.find((r) => r.receiptId === receiptId);
    expect(found).toBeTruthy();
    expect(found.formBundleNumber).toBe("BUNDLE-WITH-HYPHENS-001");
    expect(found.timestamp).toBe("2025-11-24T12:00:00.000Z");
  });

  describe("Direct DynamoDB verification", () => {
    it("should persist receipt with TTL attribute set to 7 years", async () => {
      const userSub = "user-ttl-check";
      const receiptId = "2025-11-24T13:00:00.000Z-TTL-BUNDLE";
      const receipt = {
        formBundleNumber: "TTL-BUNDLE",
        chargeRefNumber: "TTL-CHARGE",
      };

      // Store receipt
      await store.putReceipt(userSub, receiptId, receipt);

      // Import hashSub to get the hashed value
      const { hashSub } = await import("../services/subHasher.js");
      const hashedSub = hashSub(userSub);

      // Directly query DynamoDB to verify the stored item
      const result = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: {
            hashedSub,
            receiptId,
          },
        }),
      );

      expect(result.Item).toBeTruthy();
      expect(result.Item.hashedSub).toBe(hashedSub);
      expect(result.Item.receiptId).toBe(receiptId);
      expect(result.Item.receipt).toEqual(receipt);
      expect(result.Item.createdAt).toBeTruthy();
      expect(result.Item.ttl).toBeTruthy();
      expect(result.Item.ttl_datestamp).toBeTruthy();

      // Verify TTL is approximately 7 years in the future (2555 days)
      const now = Math.floor(Date.now() / 1000);
      const expectedTtl = now + 2555 * 24 * 60 * 60;
      const ttlDiff = Math.abs(result.Item.ttl - expectedTtl);
      // Allow 5 seconds difference for test execution time
      expect(ttlDiff).toBeLessThan(5);
    });

    it("should store hashedSub not plain userSub", async () => {
      const userSub = "user-privacy-check";
      const receiptId = "2025-11-24T14:00:00.000Z-PRIVACY-BUNDLE";
      const receipt = {
        formBundleNumber: "PRIVACY-BUNDLE",
        chargeRefNumber: "PRIVACY-CHARGE",
      };

      await store.putReceipt(userSub, receiptId, receipt);

      // Scan the table to find the item
      const scanResult = await docClient.send(
        new ScanCommand({
          TableName: tableName,
          FilterExpression: "receiptId = :receiptId",
          ExpressionAttributeValues: {
            ":receiptId": receiptId,
          },
        }),
      );

      expect(scanResult.Items.length).toBe(1);
      const item = scanResult.Items[0];

      // Verify hashedSub is NOT the plain userSub
      expect(item.hashedSub).not.toBe(userSub);
      // Verify hashedSub is a hash (should be hex string)
      expect(item.hashedSub).toMatch(/^[a-f0-9]+$/);
    });

    it("should verify all receipts are stored with required attributes", async () => {
      const userSub = "user-attributes-check";
      const receiptId = "2025-11-24T15:00:00.000Z-ATTRS-BUNDLE";
      const receipt = {
        formBundleNumber: "ATTRS-BUNDLE",
        chargeRefNumber: "ATTRS-CHARGE",
        processingDate: "2025-11-24T15:00:00.000Z",
      };

      await store.putReceipt(userSub, receiptId, receipt);

      const { hashSub } = await import("../services/subHasher.js");
      const hashedSub = hashSub(userSub);

      const result = await docClient.send(
        new GetCommand({
          TableName: tableName,
          Key: { hashedSub, receiptId },
        }),
      );

      const item = result.Item;
      expect(item).toBeTruthy();

      // Verify all required attributes exist
      const requiredAttributes = ["hashedSub", "receiptId", "receipt", "createdAt", "ttl", "ttl_datestamp"];
      for (const attr of requiredAttributes) {
        expect(item[attr]).toBeDefined();
        expect(item[attr]).not.toBeNull();
      }

      // Verify attribute types
      expect(typeof item.hashedSub).toBe("string");
      expect(typeof item.receiptId).toBe("string");
      expect(typeof item.receipt).toBe("object");
      expect(typeof item.createdAt).toBe("string");
      expect(typeof item.ttl).toBe("number");
      expect(typeof item.ttl_datestamp).toBe("string");

      // Verify createdAt and ttl_datestamp are valid ISO strings
      expect(() => new Date(item.createdAt)).not.toThrow();
      expect(() => new Date(item.ttl_datestamp)).not.toThrow();
    });
  });
});
