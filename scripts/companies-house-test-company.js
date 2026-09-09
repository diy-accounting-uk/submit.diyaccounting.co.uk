#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 *
 * Create or delete a Companies House sandbox test company with the test data generator.
 *
 * Usage:
 *   node scripts/companies-house-test-company.js                     - create a company
 *   node scripts/companies-house-test-company.js --delete <companyNumber> <authCode>
 *                                                                     - delete a company
 *
 * Environment variables:
 *   COMPANIES_HOUSE_API_KEY               - the API key for the test data generator
 *   COMPANIES_HOUSE_TEST_DATA_BASE_URI     - defaults to
 *                                            https://test-data-sandbox.company-information.service.gov.uk
 *
 * The test data generator has no client-credentials shortcut and exists only in the sandbox, so
 * this script is a developer and ci helper, run on demand. It is not part of the deploy path.
 *
 * A created company answers `company_number`, `company_uri` and `auth_code`. The `auth_code` is
 * the company authentication code a behaviour test types on the Companies House sign-in screen
 * when a requested OAuth scope names that company.
 */

import { fileURLToPath } from "node:url";

const DEFAULT_TEST_DATA_BASE_URI = "https://test-data-sandbox.company-information.service.gov.uk";

function getTestDataBaseUri() {
  return process.env.COMPANIES_HOUSE_TEST_DATA_BASE_URI || DEFAULT_TEST_DATA_BASE_URI;
}

export async function createTestCompany(apiKey, { baseUri = getTestDataBaseUri() } = {}) {
  if (!apiKey) {
    throw new Error("Missing COMPANIES_HOUSE_API_KEY");
  }

  const url = `${baseUri}/test-data/company`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "api_key": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({}),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(`Companies House test data generator rejected the create request: ${response.status} ${JSON.stringify(data)}`);
  }

  return {
    companyNumber: data.company_number,
    companyUri: data.company_uri,
    authCode: data.auth_code,
  };
}

export async function deleteTestCompany(apiKey, companyNumber, authCode, { baseUri = getTestDataBaseUri() } = {}) {
  if (!apiKey) {
    throw new Error("Missing COMPANIES_HOUSE_API_KEY");
  }
  if (!companyNumber) {
    throw new Error("Missing companyNumber");
  }
  if (!authCode) {
    throw new Error("Missing authCode");
  }

  const url = `${baseUri}/test-data/company/${companyNumber}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { "api_key": apiKey, "Content-Type": "application/json", "Accept": "application/json" },
    body: JSON.stringify({ auth_code: authCode }),
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(`Companies House test data generator rejected the delete request: ${response.status} ${JSON.stringify(data)}`);
  }
}

async function main() {
  const apiKey = process.env.COMPANIES_HOUSE_API_KEY;
  const args = process.argv.slice(2);

  if (args[0] === "--delete") {
    const [, companyNumber, authCode] = args;
    if (!companyNumber || !authCode) {
      console.error("Usage: node scripts/companies-house-test-company.js --delete <companyNumber> <authCode>");
      process.exit(1);
    }
    await deleteTestCompany(apiKey, companyNumber, authCode);
    console.log(JSON.stringify({ deleted: true, companyNumber }));
    return;
  }

  const company = await createTestCompany(apiKey);
  console.log(JSON.stringify(company));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
