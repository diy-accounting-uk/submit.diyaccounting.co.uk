// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/system-tests/provisionUser.system.test.js

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { DynamoDBClient, CreateTableCommand, DescribeTableCommand, GetItemCommand, ScanCommand } from "@aws-sdk/client-dynamodb";
import { runLocalDynamoDb } from "../../behaviour-tests/helpers/behaviour-helpers.js";
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { createHmrcTestUser, saveHmrcTestUserToFiles } from "../../behaviour-tests/helpers/behaviour-helpers.js";
import { dotenvConfigIfNotBlank } from "@app/lib/env.js";

dotenvConfigIfNotBlank({ path: ".env" });
dotenvConfigIfNotBlank({ path: ".env.proxy" });

describe("System: provision-user.mjs", () => {
  const usersTableName = "system-test-auth-users";
  let username = `user-${Math.random().toString(36).slice(2, 8)}`;
  let password = `pass-${Math.random().toString(36).slice(2, 8)}`;
  const artifactsDir = path.join("target", "system-test-results", "provision-user");

  /** @type {{ stop?: () => Promise<void>, endpoint?: string }} */
  let dynamoControl;
  /** @type {DynamoDBClient} */
  let ddb;

  beforeAll(async () => {
    process.env.DYNAMODB_PORT = "0"; // ask dynalite to bind a random free port
    // Try to start local DynamoDB via helper; if already running, reuse it
    try {
      dynamoControl = await runLocalDynamoDb("run");
    } catch (e) {
      if (e && /EADDRINUSE/.test(String(e.message))) {
        dynamoControl = { endpoint: "http://127.0.0.1:9000", stop: undefined };
      } else {
        throw e;
      }
    }
    expect(dynamoControl.endpoint).toBeTruthy();
    ddb = new DynamoDBClient({
      region: process.env.AWS_REGION || "us-east-1",
      endpoint: dynamoControl.endpoint,
      credentials: { accessKeyId: "dummy", secretAccessKey: "dummy" },
    });

    // Create simple users table with partition key 'username'
    try {
      await ddb.send(
        new CreateTableCommand({
          TableName: usersTableName,
          KeySchema: [{ AttributeName: "username", KeyType: "HASH" }],
          AttributeDefinitions: [{ AttributeName: "username", AttributeType: "S" }],
          BillingMode: "PAY_PER_REQUEST",
        }),
      );
    } catch {}
    const desc = await ddb.send(new DescribeTableCommand({ TableName: usersTableName }));
    expect(desc?.Table?.TableName).toBe(usersTableName);

    // Optionally create an HMRC sandbox test user if creds provided, and save to files
    const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID;
    const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET;
    if (hmrcClientId && hmrcClientSecret) {
      try {
        const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames: ["mtd-vat"] });
        // Save HMRC test user details to artifacts and repo root
        saveHmrcTestUserToFiles(testUser, artifactsDir, process.cwd());
        // Use this HMRC test user for provisioning as "username" and its password
        username = testUser.userId || username;
        password = testUser.password || password;
      } catch (e) {
        // If creation fails (e.g., offline), proceed with generated username/password
      }
    }
  }, 60_000);

  afterAll(async () => {
    if (dynamoControl?.stop) await dynamoControl.stop();
  });

  it("provisions a user into the table", async () => {
    // Spawn the provision script
    await new Promise((resolve, reject) => {
      const child = spawn("node", ["app/bin/provision-user.mjs", usersTableName, username, password], {
        env: {
          ...process.env,
          AWS_REGION: process.env.AWS_REGION || "us-east-1",
          AWS_ENDPOINT_URL: dynamoControl.endpoint,
          AWS_ENDPOINT_URL_DYNAMODB: dynamoControl.endpoint,
          AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "dummy",
          AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "dummy",
        },
        stdio: "pipe",
      });
      let stderr = "";
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", reject);
      child.on("exit", (code) => {
        if (code === 0) resolve(undefined);
        else reject(new Error(`provision-user exited with code ${code}: ${stderr}`));
      });
    });

    const got = await ddb.send(new GetItemCommand({ TableName: usersTableName, Key: { username: { S: username } } }));
    expect(got.Item?.username?.S).toBe(username);
    // Ensure passwordHash attribute exists
    expect(got.Item?.passwordHash?.S || got.Item?.passwordHash?.B).toBeTruthy();

    // Export all records in the users table to an artifact file for debugging
    const scan = await ddb.send(new ScanCommand({ TableName: usersTableName }));
    fs.mkdirSync(artifactsDir, { recursive: true });
    const exportPath = path.join(artifactsDir, "users-table-scan.json");
    fs.writeFileSync(exportPath, JSON.stringify({ items: scan.Items || [] }, null, 2), "utf-8");
  });
});
