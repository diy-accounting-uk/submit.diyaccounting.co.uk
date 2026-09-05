#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Generate a pass locally using assumed AWS credentials
//
// Usage: node scripts/generate-pass.js [pass-type] [environment] [options]
// Example: node scripts/generate-pass.js day-guest-test-pass ci
//          node scripts/generate-pass.js invited-guest ci --email user@example.com
//          node scripts/generate-pass.js day-guest-pass prod --max-uses 5 --validity-period P30D
//          node scripts/generate-pass.js                  (defaults: day-guest-test-pass, ci)
//
// Prerequisites: AWS credentials must be assumed first:
//   . ./scripts/aws-assume-submit-deployment-role.sh
//
// Pass types (from submit.passes.toml):
//   day-guest-test-pass    - Day guest synthetic access (1 day, 1 use, testPass: true)
//   day-guest-pass         - Day guest production access (1 day, 1 use)
//   resident-pro-test-pass - Resident pro synthetic access (1 day, 1 use, testPass: true)
//   resident-pro-pass      - Resident pro production access (1 day, 1 use)
//   invited-guest          - Month-long access for invited users (1 month, 1 use, email required)
//   resident-guest         - Ongoing free access (unlimited, 1 use, email required)
//   resident-pro-comp      - Complimentary pro subscription (1 year, 1 use, email required)

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { parse as parseTOML } from "@iarna/toml";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

// Parse CLI arguments
function parseArgs(args) {
  const result = {
    passType: "day-guest-test-pass",
    environment: "ci",
    email: null,
    maxUses: null,
    validityPeriod: null,
    quantity: 1,
    notes: null,
  };

  let positional = 0;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--email" && args[i + 1]) {
      result.email = args[++i];
    } else if (args[i] === "--max-uses" && args[i + 1]) {
      result.maxUses = parseInt(args[++i], 10);
    } else if (args[i] === "--validity-period" && args[i + 1]) {
      result.validityPeriod = args[++i];
    } else if (args[i] === "--quantity" && args[i + 1]) {
      result.quantity = parseInt(args[++i], 10);
    } else if (args[i] === "--notes" && args[i + 1]) {
      result.notes = args[++i];
    } else if (args[i] === "--help" || args[i] === "-h") {
      printUsage();
      process.exit(0);
    } else if (!args[i].startsWith("--")) {
      if (positional === 0) result.passType = args[i];
      else if (positional === 1) result.environment = args[i];
      positional++;
    }
  }

  return result;
}

function printUsage() {
  console.log(`Usage: node scripts/generate-pass.js [pass-type] [environment] [options]

Positional arguments:
  pass-type         Pass type from submit.passes.toml (default: day-guest-test-pass)
  environment       Target environment: ci or prod (default: ci)

Options:
  --email EMAIL           Restrict pass to this email address
  --max-uses N            Override default max uses
  --validity-period DUR   Override default validity (ISO 8601, e.g. P7D, P1M)
  --quantity N            Number of passes to generate (default: 1)
  --notes TEXT            Admin notes for this pass
  --help, -h              Show this help

Prerequisites:
  . ./scripts/aws-assume-submit-deployment-role.sh`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  // Check AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    console.error("ERROR: No AWS credentials found.");
    console.error("Run: . ./scripts/aws-assume-submit-deployment-role.sh");
    process.exit(1);
  }

  // Read pass type configuration
  const passesConfig = parseTOML(fs.readFileSync(path.join(projectRoot, "submit.passes.toml"), "utf-8"));
  const passType = passesConfig.passTypes.find((p) => p.id === args.passType);
  if (!passType) {
    console.error(`ERROR: Unknown pass type: ${args.passType}`);
    console.error(`Available types: ${passesConfig.passTypes.map((p) => p.id).join(", ")}`);
    process.exit(1);
  }

  // Validate email requirement
  if (passType.requiresEmailRestriction && !args.email) {
    console.error(`ERROR: Pass type '${args.passType}' requires --email`);
    process.exit(1);
  }

  // Validate environment
  if (!["ci", "prod"].includes(args.environment)) {
    console.error(`ERROR: Environment must be 'ci' or 'prod', got: ${args.environment}`);
    process.exit(1);
  }

  const tableName = `${args.environment}-env-passes`;
  const maxUses = args.maxUses ?? passType.defaultMaxUses ?? 1;
  const validityPeriod = args.validityPeriod ?? passType.defaultValidityPeriod ?? undefined;
  const host = args.environment === "prod" ? "submit.diyaccounting.co.uk" : `${args.environment}.submit.diyaccounting.co.uk`;

  console.log(`=== Generating ${args.quantity} ${args.passType} pass(es) for ${args.environment} ===`);
  console.log(`  Bundle: ${passType.bundleId}`);
  console.log(`  Max uses: ${maxUses}`);
  console.log(`  Validity: ${validityPeriod || "unlimited"}`);
  console.log(`  Table: ${tableName}`);
  if (args.email) console.log(`  Email: ${args.email}`);
  console.log("");

  // Set environment variables for passService
  process.env.PASSES_DYNAMODB_TABLE_NAME = tableName;

  // Fetch email hash secret if needed
  if (args.email) {
    try {
      const { SecretsManagerClient, GetSecretValueCommand } = await import("@aws-sdk/client-secrets-manager");
      const client = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
      const response = await client.send(new GetSecretValueCommand({ SecretId: `${args.environment}/submit/email-hash-secret` }));
      process.env.EMAIL_HASH_SECRET = response.SecretString;
      const { initializeEmailHashSecret } = await import("../app/lib/emailHash.js");
      await initializeEmailHashSecret();
    } catch (err) {
      console.error(`WARNING: Could not fetch email hash secret: ${err.message}`);
      console.error("Pass will be created without email restriction.");
      args.email = null;
    }
  }

  // Generate passes
  const { createPass } = await import("../app/services/passService.js");
  const results = [];

  for (let i = 0; i < args.quantity; i++) {
    const pass = await createPass({
      passTypeId: args.passType,
      bundleId: passType.bundleId,
      validityPeriod: validityPeriod || undefined,
      maxUses,
      restrictedToEmail: args.email || undefined,
      createdBy: `local-script#${process.env.USER || "unknown"}`,
      notes: args.notes || undefined,
      ...(passType.test ? { testPass: true } : {}),
    });
    results.push(pass);
  }

  // Display results
  console.log("=== Generated Passes ===");
  console.log("");
  for (const pass of results) {
    const url = `https://${host}/bundles.html?pass=${pass.code}`;
    console.log(`  Code:        ${pass.code}`);
    console.log(`  URL:         ${url}`);
    console.log(`  Bundle:      ${pass.bundleId}`);
    console.log(`  Valid from:  ${pass.validFrom}`);
    console.log(`  Valid until: ${pass.validUntil || "unlimited"}`);
    console.log(`  Max uses:    ${pass.maxUses}`);
    if (args.email) console.log(`  Email:       ${args.email}`);
    console.log("");
  }
}

main().catch((err) => {
  console.error(`ERROR: ${err.message}`);
  process.exit(1);
});
