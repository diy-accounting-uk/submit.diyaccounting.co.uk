#!/usr/bin/env node
/**
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 *
 * Post a generated micro-entity accounts iXBRL file to Companies House's public XBRL validator
 * and print the result. Reaches the network, so this runs on demand only, never as part of the
 * test suite.
 *
 * Usage:
 *   node scripts/validate-accounts-ixbrl.js <path-to-ixbrl-file>
 *   node scripts/validate-accounts-ixbrl.js            - validates a small built-in sample
 *
 * The validator (https://test-validator.companieshouse.gov.uk/xbrl_validate) has no JSON API: it
 * is a session-cookie-backed upload flow (POST the file, poll progress, fetch an HTML result
 * page), so this script drives that flow directly rather than calling a documented endpoint.
 */

import { readFileSync } from "node:fs";
import { basename, join } from "node:path";
import { tmpdir } from "node:os";
import { buildMicroEntityAccounts } from "../app/services/microEntityAccountsIxbrl.js";

const VALIDATOR_BASE_URI = "https://test-validator.companieshouse.gov.uk";

const SAMPLE_INPUT = {
  companyNumber: "02706061",
  companyName: "TEST MICRO LIMITED",
  periodStart: "2025-07-01",
  periodEnd: "2026-06-30",
  averageNumberOfEmployees: 2,
  directorName: "Jo Smith",
  dateOfApproval: "2026-09-01",
  balanceSheet: {
    current: {
      fixedAssets: 10000,
      currentAssets: 5000,
      creditorsWithinOneYear: 3000,
      creditorsAfterOneYear: 2000,
      calledUpShareCapital: 100,
      profitAndLossAccount: 9900,
      capitalAndReserves: 10000,
    },
    prior: {
      fixedAssets: 8000,
      currentAssets: 4000,
      creditorsWithinOneYear: 2500,
      creditorsAfterOneYear: 1500,
      calledUpShareCapital: 100,
      profitAndLossAccount: 7900,
      capitalAndReserves: 8000,
    },
  },
};

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }

  captureFrom(response) {
    const setCookieHeaders = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    for (const header of setCookieHeaders) {
      const [pair] = header.split(";");
      const [name, value] = pair.split("=");
      this.cookies.set(name.trim(), value);
    }
  }

  header() {
    return Array.from(this.cookies.entries())
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

async function fetchWithCookies(jar, url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { ...options.headers, ...(jar.header() ? { Cookie: jar.header() } : {}) },
  });
  jar.captureFrom(response);
  return response;
}

function extractFailureReasons(html) {
  const listMatch = html.match(/Your iXBRL accounts file[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/);
  if (!listMatch) {
    return [];
  }
  const items = [];
  const itemPattern = /<li[^>]*>([\s\S]*?)<\/li>/g;
  let match;
  while ((match = itemPattern.exec(listMatch[1])) !== null) {
    items.push(
      match[1]
        .replace(/&#39;/g, "'")
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, "&")
        .trim(),
    );
  }
  return items;
}

async function validate(filePath) {
  const fileContent = readFileSync(filePath, "utf8");
  const fileName = basename(filePath);
  const jar = new CookieJar();

  console.log(`Uploading ${fileName} to ${VALIDATOR_BASE_URI} ...`);

  // Establish a session cookie the same way a browser landing on the upload page would.
  await fetchWithCookies(jar, `${VALIDATOR_BASE_URI}/xbrl_validate/submit-accounts`);

  const formData = new FormData();
  formData.append("file", new Blob([fileContent], { type: "text/html" }), fileName);

  const uploadResponse = await fetchWithCookies(jar, `${VALIDATOR_BASE_URI}/xbrl_validate/submit-accounts`, {
    method: "POST",
    body: formData,
  });
  if (!uploadResponse.ok) {
    throw new Error(`Upload failed with status ${uploadResponse.status}: ${await uploadResponse.text()}`);
  }
  const { fileId } = await uploadResponse.json();
  console.log(`Uploaded. fileId=${fileId}. Polling progress ...`);

  const deadline = Date.now() + 15 * 60 * 1000;
  let progress = 0;
  while (progress < 100) {
    if (Date.now() > deadline) {
      throw new Error("Timed out waiting for validation to complete");
    }
    const progressResponse = await fetchWithCookies(jar, `${VALIDATOR_BASE_URI}/xbrl_validate/progress/${fileId}`);
    ({ progress } = await progressResponse.json());
    console.log(`  progress: ${progress}%`);
    if (progress < 100) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  const resultResponse = await fetchWithCookies(jar, `${VALIDATOR_BASE_URI}/xbrl_validate/result/${fileId}`);
  const resultHtml = await resultResponse.text();

  const isValid = /Your file is valid/i.test(resultHtml) || /govuk-notification-banner--success/.test(resultHtml);
  const isFailure = /Your file is not valid/i.test(resultHtml) || /govuk-notification-banner--failure/.test(resultHtml);

  if (isValid) {
    console.log("RESULT: valid");
    return;
  }
  if (isFailure) {
    console.log("RESULT: not valid");
    const reasons = extractFailureReasons(resultHtml);
    for (const reason of reasons) {
      console.log(`  - ${reason}`);
    }
    return;
  }
  console.log("RESULT: could not determine pass/fail from the result page; raw HTML follows");
  console.log(resultHtml);
}

async function main() {
  const filePathArg = process.argv[2];
  if (filePathArg) {
    await validate(filePathArg);
    return;
  }
  const { writeFileSync } = await import("node:fs");
  const sampleXhtml = buildMicroEntityAccounts(SAMPLE_INPUT);
  const samplePath = join(tmpdir(), "sample-accounts-ixbrl.html");
  writeFileSync(samplePath, sampleXhtml);
  await validate(samplePath);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
