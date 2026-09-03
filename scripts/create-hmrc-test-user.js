#!/usr/bin/env node
/**
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 *
 * Create an HMRC Sandbox test user for development and testing.
 *
 * Usage: node scripts/create-hmrc-test-user.js
 *
 * Environment variables:
 *   HMRC_SANDBOX_CLIENT_ID       - HMRC Sandbox application client ID
 *   HMRC_SANDBOX_CLIENT_SECRET   - HMRC Sandbox application client secret
 *   HMRC_TEST_USER_SERVICE_NAMES - Comma-separated HMRC service names to enrol the user
 *                                  for (default: "mtd-vat")
 *
 * This script creates a test organisation user in the HMRC Sandbox environment.
 * The organisation endpoint accepts both mtd-vat and mtd-income-tax service names,
 * returning a VRN and/or NINO depending on which services were requested. The
 * credentials can be used for:
 * - Manual testing against the HMRC Sandbox
 * - Behaviour tests that require HMRC authentication
 *
 * IMPORTANT: These are SANDBOX/TEST credentials only, not production credentials.
 * They are intended for testing purposes and have no access to real HMRC data.
 */

import { fileURLToPath } from "node:url";

const KNOWN_HMRC_SERVICE_NAMES = ["mtd-vat", "mtd-income-tax"];

// Parses a comma-separated HMRC service-names value (e.g. the workflow's
// service-names input) into a validated array. Blank input defaults to mtd-vat.
export function parseServiceNames(rawServiceNames) {
  if (rawServiceNames === undefined || rawServiceNames === null || rawServiceNames.trim() === "") {
    return ["mtd-vat"];
  }

  const serviceNames = rawServiceNames.split(",").map((name) => name.trim());

  for (const name of serviceNames) {
    if (name === "") {
      throw new Error(`Invalid HMRC service names "${rawServiceNames}": contains an empty entry`);
    }
    if (!KNOWN_HMRC_SERVICE_NAMES.includes(name)) {
      throw new Error(`Unknown HMRC service name "${name}". Known service names: ${KNOWN_HMRC_SERVICE_NAMES.join(", ")}`);
    }
  }

  return serviceNames;
}

// Inline implementation to avoid module resolution issues in GitHub Actions
export async function createHmrcTestUser(hmrcClientId, hmrcClientSecret, options = {}) {
  const serviceNames = options.serviceNames || ["mtd-vat"];
  const baseUrl = process.env.HMRC_SANDBOX_BASE_URI || "https://test-api.service.hmrc.gov.uk";
  const endpoint = "/create-test-user/organisations";
  const url = `${baseUrl}${endpoint}`;
  const tokenUrl = `${baseUrl}/oauth/token`;

  console.log("[HMRC Test User Creation] Starting test user creation");
  console.log(`  URL: ${url}`);
  console.log(`  Service Names: ${serviceNames.join(", ")}`);

  const requestBody = { serviceNames };

  try {
    const timeoutMs = 20000;

    // 1. Obtain OAuth2 access token
    console.log("\n[HMRC Test User Creation] Requesting OAuth2 access token...");

    const tokenController = new AbortController();
    const tokenTimeout = setTimeout(() => tokenController.abort(), timeoutMs);

    let tokenResponse;
    try {
      const tokenBody = new URLSearchParams({
        client_id: hmrcClientId,
        client_secret: hmrcClientSecret,
        grant_type: "client_credentials",
      });

      tokenResponse = await fetch(tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenBody.toString(),
        signal: tokenController.signal,
      });
    } finally {
      clearTimeout(tokenTimeout);
    }

    const tokenResponseBody = await tokenResponse.json().catch(() => ({}));

    if (!tokenResponse.ok) {
      const tokenErrorDetails = tokenResponseBody?.error_description || tokenResponseBody?.error || JSON.stringify(tokenResponseBody);
      throw new Error(`Failed to obtain HMRC access token: ${tokenResponse.status} ${tokenResponse.statusText} - ${tokenErrorDetails}`);
    }

    const accessToken = tokenResponseBody.access_token;
    if (!accessToken) {
      throw new Error("Failed to obtain HMRC access token: access_token missing from response");
    }

    console.log("[HMRC Test User Creation] Access token obtained successfully");

    // 2. Call Create Test User (organisations)
    console.log("\n[HMRC Test User Creation] Creating test organisation user...");

    const requestHeaders = {
      "Content-Type": "application/json",
      "Accept": "application/vnd.hmrc.1.0+json",
      "Authorization": `Bearer ${accessToken}`,
    };

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: requestHeaders,
        body: JSON.stringify(requestBody),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const responseBody = await response.json();

    if (!response.ok) {
      const errorDetails = responseBody?.message || responseBody?.error || JSON.stringify(responseBody);
      throw new Error(`Failed to create HMRC test user: ${response.status} ${response.statusText} - ${errorDetails}`);
    }

    // Extract key information from response
    // Note: HMRC uses 'vrn' (VAT Registration Number) in the response
    const testUser = {
      userId: responseBody.userId,
      password: responseBody.password,
      userFullName: responseBody.userFullName,
      emailAddress: responseBody.emailAddress,
      organisationDetails: responseBody.organisationDetails,
      vrn: responseBody.vrn,
      vatRegistrationNumber: responseBody.vrn, // Alias for convenience
      ...responseBody,
    };

    console.log("[HMRC Test User Creation] Test user created successfully!");

    return testUser;
  } catch (error) {
    console.error("[HMRC Test User Creation] Error:", error.message);
    throw error;
  }
}

async function main() {
  const hmrcClientId = process.env.HMRC_SANDBOX_CLIENT_ID;
  const hmrcClientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET;

  if (!hmrcClientId) {
    console.error("ERROR: HMRC_SANDBOX_CLIENT_ID environment variable is required");
    process.exit(1);
  }

  if (!hmrcClientSecret) {
    console.error("ERROR: HMRC_SANDBOX_CLIENT_SECRET environment variable is required");
    process.exit(1);
  }

  let serviceNames;
  try {
    serviceNames = parseServiceNames(process.env.HMRC_TEST_USER_SERVICE_NAMES);
  } catch (error) {
    console.error(`ERROR: ${error.message}`);
    process.exit(1);
  }

  console.log("=".repeat(70));
  console.log("HMRC SANDBOX TEST USER CREATION");
  console.log("=".repeat(70));
  console.log("");
  console.log("NOTE: These are SANDBOX/TEST credentials only.");
  console.log("      They have no access to real HMRC data or systems.");
  console.log("");

  try {
    const testUser = await createHmrcTestUser(hmrcClientId, hmrcClientSecret, { serviceNames });

    console.log("");
    console.log("=".repeat(70));
    console.log("HMRC SANDBOX TEST USER CREATED SUCCESSFULLY");
    console.log("=".repeat(70));
    console.log("");
    console.log("Copy these credentials for HMRC Sandbox testing:");
    console.log("");
    console.log("-".repeat(70));
    console.log(`User ID:              ${testUser.userId}`);
    console.log(`Password:             ${testUser.password}`);
    if (testUser.vrn) {
      console.log(`VAT Number (VRN):     ${testUser.vrn}`);
    }
    if (testUser.nino) {
      console.log(`NINO:                 ${testUser.nino}`);
    }
    console.log("-".repeat(70));
    console.log("");
    console.log("Organisation Details:");
    console.log(`  Name:               ${testUser.organisationDetails?.name || "N/A"}`);
    console.log(`  Address Line 1:     ${testUser.organisationDetails?.address?.line1 || "N/A"}`);
    console.log(`  Postcode:           ${testUser.organisationDetails?.address?.postcode || "N/A"}`);
    console.log("");
    console.log("Full Name:            " + (testUser.userFullName || "N/A"));
    console.log("Email:                " + (testUser.emailAddress || "N/A"));
    console.log("");
    console.log("=".repeat(70));
    console.log("HOW TO USE THESE CREDENTIALS:");
    console.log("");
    console.log("1. Go to your app and initiate HMRC OAuth (sandbox mode)");
    console.log("2. When redirected to HMRC login, enter:");
    console.log(`      User ID:  ${testUser.userId}`);
    console.log(`      Password: ${testUser.password}`);
    console.log("3. Grant access to your application");
    if (testUser.vrn) {
      console.log("4. Use VAT Number (VRN) in your VAT submission forms:");
      console.log(`      VRN: ${testUser.vrn}`);
    }
    if (testUser.nino) {
      console.log("5. Use the NINO for Making Tax Digital Income Tax submissions:");
      console.log(`      NINO: ${testUser.nino}`);
    }
    console.log("");
    console.log("=".repeat(70));

    // Output for GitHub Actions
    if (process.env.GITHUB_OUTPUT) {
      const fs = await import("fs");
      const outputFile = process.env.GITHUB_OUTPUT;
      fs.appendFileSync(outputFile, `hmrc-user-id=${testUser.userId}\n`);
      fs.appendFileSync(outputFile, `hmrc-password=${testUser.password}\n`);
      fs.appendFileSync(outputFile, `hmrc-vat-number=${testUser.vrn || ""}\n`);
      fs.appendFileSync(outputFile, `hmrc-nino=${testUser.nino || ""}\n`);
      fs.appendFileSync(outputFile, `hmrc-org-name=${testUser.organisationDetails?.name || ""}\n`);
    }

    // Also write to hmrc-test-user.json for artifact upload
    const fs = await import("fs");
    fs.writeFileSync("hmrc-test-user.json", JSON.stringify(testUser, null, 2));
    console.log("\nCredentials also saved to: hmrc-test-user.json");
  } catch (error) {
    console.error("");
    console.error("=".repeat(70));
    console.error("FAILED TO CREATE HMRC TEST USER");
    console.error("=".repeat(70));
    console.error("");
    console.error("Error:", error.message);
    console.error("");
    process.exit(1);
  }
}

// CLI entrypoint — guarded so importing this module (e.g. for unit tests) does not run main()
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}
