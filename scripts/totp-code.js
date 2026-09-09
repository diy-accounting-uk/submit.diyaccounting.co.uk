#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

//
// Generate a TOTP code from a secret
//
// Usage:
//   node scripts/totp-code.js <base32-secret>
//   node scripts/totp-code.js                    # reads from cognito-native-test-credentials.json
//   oathtool --totp --base32 <base32-secret>     # equivalent using oathtool
//
// The code is valid for 30 seconds. A new code is generated each period.

import { TOTP, Secret } from "otpauth";
import fs from "fs";
import path from "path";

const credentialsFile = path.resolve("cognito-native-test-credentials.json");

function getSecret() {
  // Check command-line argument first
  const arg = process.argv[2];
  if (arg) return arg;

  // Check environment variable
  if (process.env.TEST_AUTH_TOTP_SECRET) return process.env.TEST_AUTH_TOTP_SECRET;

  // Try reading from credentials file
  if (fs.existsSync(credentialsFile)) {
    const creds = JSON.parse(fs.readFileSync(credentialsFile, "utf-8"));
    if (creds.totpSecret) return creds.totpSecret;
  }

  console.error("Usage: node scripts/totp-code.js <base32-secret>");
  console.error("   or: set TEST_AUTH_TOTP_SECRET environment variable");
  console.error("   or: have cognito-native-test-credentials.json with totpSecret field");
  process.exit(1);
}

const secret = getSecret();
const totp = new TOTP({
  secret: Secret.fromBase32(secret),
  algorithm: "SHA1",
  digits: 6,
  period: 30,
});

const code = totp.generate();
const secondsRemaining = 30 - (Math.floor(Date.now() / 1000) % 30);

console.log(code);
console.error(`(valid for ${secondsRemaining}s)`);
