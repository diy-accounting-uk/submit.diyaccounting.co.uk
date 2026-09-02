#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Disable Cognito native auth and drop the credentials enable-cognito-native-test.js saved
//
// The test user itself stays. It is durable and reused, and its password was rotated when the
// credentials were issued.
//
// Usage: node scripts/disable-cognito-native-test.js [environment-name]
// Example: node scripts/disable-cognito-native-test.js ci
//
// Prerequisites: AWS credentials must be assumed first:
//   . ./scripts/aws-assume-submit-deployment-role.sh

import { execFile } from "child_process";
import { promisify } from "util";
import fs from "fs";
import path from "path";

const execFileAsync = promisify(execFile);
const environmentName = process.argv[2] || "ci";
const credentialsFile = path.resolve("cognito-native-test-credentials.json");

async function main() {
  // Check AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    console.error("ERROR: No AWS credentials found.");
    console.error("Run: . ./scripts/aws-assume-submit-deployment-role.sh");
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

  // Step 1: Disable native auth
  console.log(`=== Disabling Cognito native auth ===`);
  try {
    const { stdout, stderr } = await execFileAsync("node", ["scripts/toggle-cognito-native-auth.js", "disable", credentials.environment]);
    if (stdout) console.log(stdout.trimEnd());
    if (stderr) console.error(stderr.trimEnd());
  } catch (error) {
    console.error(`Failed to disable native auth: ${error.message}`);
    if (error.stdout) console.log(error.stdout.trimEnd());
    if (error.stderr) console.error(error.stderr.trimEnd());
  }

  // Step 2: Remove credentials file
  fs.unlinkSync(credentialsFile);
  console.log("");
  console.log(`Removed credentials file: ${credentialsFile}`);
  console.log("");
  console.log("=== Cleanup complete ===");
}

main();
