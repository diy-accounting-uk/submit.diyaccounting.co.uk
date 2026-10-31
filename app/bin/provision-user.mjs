// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-68 Provision and assume roles for test-user provisioning
// - **Use when:** a local or CI run needs a fresh Cognito test user and credentials.
// - **Does:** provision-user.mjs creates a Cognito test user with generated credentials for local or CI use. provision-user.sh wraps it and generates TEST_AUTH_USERNAME and TEST_AUTH_PASSWORD, after aws-assume-user-provisioning-role.sh assumes the external user-provisioning role.
// - **Run:** `. ./scripts/aws-assume-user-provisioning-role.sh`; `./scripts/provision-user.sh`; `node app/bin/provision-user.mjs <table-name> [username] [password]`
// - **Entry:** `app/bin/provision-user.mjs`
// - **Files:** app/bin/provision-user.mjs, app/system-tests/provisionUser.system.test.js, scripts/provision-user.sh, scripts/aws-assume-user-provisioning-role.sh
// - **Keywords:** provision test user, cognito test user, user provisioning role, test_auth_username, test_auth_password
// - **Related:** OPS-16, OPS-66
// @end-capability

import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, PutCommand } from "@aws-sdk/lib-dynamodb";
import bcrypt from "bcryptjs";
import { v4 } from "uuid";

// Usage
//  % TEST_USERNAME=$(uuidgen | tr '[:upper:]' '[:lower:]')
//  % TEST_PASSWORD=$(uuidgen | tr '[:upper:]' '[:lower:]')
//  % node app/bin/provision-user.mjs my-dynamodb-table ${TEST_USERNAME} ${TEST_PASSWORD}
// Provisioning user 72db57b6-68dc-4274-a14a-a91be209a1b1 in table my-dynamodb-table
// created 72db57b6-68dc-4274-a14a-a91be209a1b1
// % export TEST_AUTH_USERNAME=${TEST_USERNAME}
// % export TEST_AUTH_PASSWORD=${TEST_PASSWORD}

// const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));

const tableName = process.argv[2];
const username = process.argv[3] || v4();
const password = process.argv[4] || v4();

console.log(`Provisioning user ${username} in table ${tableName}`);
const hash = bcrypt.hashSync(password, 10);
await ddb.send(new PutCommand({ TableName: tableName, Item: { username, passwordHash: hash, createdAt: Date.now() } }));
console.log("created", username);
