#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Inject DynamoDB HMRC API requests into an existing test report JSON
 *
 * This script:
 * 1. Reads an existing test-report-*.json file
 * 2. Reads hmrc-api-requests.jsonl from DynamoDB export
 * 3. Injects the HMRC API requests into the report's hmrcApiRequests array
 * 4. Writes the updated report back to the same file
 *
 * Usage:
 *   node scripts/inject-dynamodb-into-test-report.js \
 *     --reportFile <path/to/test-report-*.json> \
 *     --dynamoDbFile <path/to/hmrc-api-requests.jsonl>
 *
 * Example:
 *   node scripts/inject-dynamodb-into-test-report.js \
 *     --reportFile target/behaviour-test-results/submitVatBehaviour/test-report-submitVatBehaviour.json \
 *     --dynamoDbFile target/behaviour-test-results/hmrc-api-requests.jsonl
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function logInfo(msg) {
  console.log(`ℹ️  ${msg}`);
}

function logOk(msg) {
  console.log(`✅ ${msg}`);
}

function logWarn(msg) {
  console.warn(`⚠️  ${msg}`);
}

function logError(msg) {
  console.error(`❌ ${msg}`);
}

/**
 * Parse CLI arguments
 */
function parseCliArgs(argv = process.argv.slice(2)) {
  const out = { reportFile: null, dynamoDbFile: null };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => (i + 1 < argv.length ? argv[i + 1] : undefined);

    if (arg === "--reportFile" || arg === "--report-file" || arg === "-r") {
      out.reportFile = next();
      i++;
    } else if (arg === "--dynamoDbFile" || arg === "--dynamodb-file" || arg === "-d") {
      out.dynamoDbFile = next();
      i++;
    } else if (arg === "--help" || arg === "-h") {
      out.help = true;
    }
  }
  return out;
}

/**
 * Read and parse JSONL file
 */
function readJsonlFile(filePath) {
  if (!fs.existsSync(filePath)) {
    logWarn(`JSONL file not found: ${filePath}`);
    return [];
  }

  try {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split("\n").filter((line) => line.trim());
    const parsed = [];
    let failures = 0;

    for (const [i, line] of lines.entries()) {
      try {
        const obj = JSON.parse(line);
        parsed.push(obj);
      } catch (e) {
        failures++;
        logWarn(`JSONL parse error at line ${i + 1}: ${e.message}`);
      }
    }

    logOk(`Parsed ${parsed.length} HMRC API request(s) from ${filePath}`);
    if (failures > 0) {
      logWarn(`${failures} line(s) failed to parse`);
    }

    return parsed;
  } catch (e) {
    logError(`Failed to read JSONL file: ${e.message}`);
    return [];
  }
}

/**
 * Main execution
 */
function main() {
  logInfo("=== Injecting DynamoDB data into test report ===");

  // Parse CLI arguments
  const args = parseCliArgs();

  if (args.help) {
    console.log(`
Usage:
  node scripts/inject-dynamodb-into-test-report.js \\
    --reportFile <path/to/test-report-*.json> \\
    --dynamoDbFile <path/to/hmrc-api-requests.jsonl>

Options:
  --reportFile, -r    Path to existing test report JSON file (required)
  --dynamoDbFile, -d  Path to hmrc-api-requests.jsonl file (required)
  --help, -h          Show this help message
`);
    process.exit(0);
  }

  if (!args.reportFile) {
    logError("--reportFile is required");
    process.exit(1);
  }

  if (!args.dynamoDbFile) {
    logError("--dynamoDbFile is required");
    process.exit(1);
  }

  const reportPath = path.resolve(args.reportFile);
  const dynamoDbPath = path.resolve(args.dynamoDbFile);

  // Check if files exist
  if (!fs.existsSync(reportPath)) {
    logError(`Report file not found: ${reportPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(dynamoDbPath)) {
    logWarn(`DynamoDB file not found: ${dynamoDbPath}`);
    logWarn("Report will not be updated with HMRC API requests");
    process.exit(0); // Exit gracefully, not an error
  }

  // Read the existing test report
  logInfo(`Reading test report: ${reportPath}`);
  let report;
  try {
    const content = fs.readFileSync(reportPath, "utf-8");
    report = JSON.parse(content);
    logOk(`Loaded test report: ${report.testName || "unknown"}`);
  } catch (e) {
    logError(`Failed to read test report: ${e.message}`);
    process.exit(1);
  }

  // Read HMRC API requests from DynamoDB export
  logInfo(`Reading DynamoDB export: ${dynamoDbPath}`);
  const hmrcApiRequests = readJsonlFile(dynamoDbPath);

  if (hmrcApiRequests.length === 0) {
    logWarn("No HMRC API requests found in DynamoDB export");
    logInfo("Test report will not be updated");
    process.exit(0);
  }

  // Inject HMRC API requests into the report
  const originalCount = Array.isArray(report.hmrcApiRequests) ? report.hmrcApiRequests.length : 0;
  report.hmrcApiRequests = hmrcApiRequests;

  logInfo(`Injected ${hmrcApiRequests.length} HMRC API request(s) into test report`);
  if (originalCount > 0) {
    logInfo(`Replaced ${originalCount} existing request(s)`);
  }

  // Write the updated report back to the file
  try {
    const updatedContent = JSON.stringify(report, null, 2);
    fs.writeFileSync(reportPath, updatedContent, "utf-8");
    logOk(`Updated test report: ${reportPath}`);
  } catch (e) {
    logError(`Failed to write updated report: ${e.message}`);
    process.exit(1);
  }

  logOk("=== Injection complete ===");
}

main();
