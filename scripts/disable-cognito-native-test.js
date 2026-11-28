#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

//
// Release the native auth hold enable-cognito-native-test.js took, disable Cognito native auth when
// no other holder remains, and drop the credentials it saved
//
// The test user itself stays. It is durable and reused, and its password was rotated when the
// credentials were issued.
//
// Usage: node scripts/disable-cognito-native-test.js
// The environment is the one the credentials file records.
//
// Prerequisites: AWS SSO profile must be selected first:
//   . ./scripts/aws-use-submit-profile.sh ci (or prod, the environment the credentials file records)

import fs from "fs";
import path from "path";

import { SSMClient } from "@aws-sdk/client-ssm";

import {
  applyHold,
  scriptHolder,
  runToggleScript,
  DEFAULT_STALE_AFTER_HOURS,
} from "../.github/actions/hold-native-auth/hold-native-auth.mjs";

const credentialsFile = path.resolve("cognito-native-test-credentials.json");

async function main() {
  // Check AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    console.error("ERROR: No AWS credentials found.");
    console.error("Run: . ./scripts/aws-use-submit-profile.sh ci (or prod)");
    process.exit(1);
  }

  // Read credentials file
  if (!fs.existsSync(credentialsFile)) {
    console.log(`No credentials file found at: ${credentialsFile}`);
    console.log("Nothing to clean up. Run 'npm run test:enableCognitoNative' first.");
    process.exit(0);
  }

  const credentials = JSON.parse(fs.readFileSync(credentialsFile, "utf-8"));
  console.log(`=== Cleaning up Cognito native auth for ${credentials.environment} ===`);
  console.log(`Test user: ${credentials.username}`);
  console.log(`Issued: ${credentials.issuedAt}`);
  console.log("");

  // Step 1: Release the hold, and disable native auth when no other holder remains
  console.log(`=== Disabling Cognito native auth ===`);
  try {
    await applyHold({
      mode: "disable",
      environmentName: credentials.environment,
      holder: scriptHolder(),
      ssmClient: new SSMClient({}),
      staleAfterMs: DEFAULT_STALE_AFTER_HOURS * 60 * 60 * 1000,
      repository: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      toggle: (action) => runToggleScript(action, credentials.environment),
    });
  } catch (error) {
    console.error(`Failed to disable native auth: ${error.message}`);
  }

  // Step 2: Remove credentials file
  fs.unlinkSync(credentialsFile);
  console.log("");
  console.log(`Removed credentials file: ${credentialsFile}`);
  console.log("");
  console.log("=== Cleanup complete ===");
}

main();
