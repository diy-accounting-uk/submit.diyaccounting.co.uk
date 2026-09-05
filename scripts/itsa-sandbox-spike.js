#!/usr/bin/env node
/**
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 *
 * Spike harness. Not production code and not part of any test suite.
 *
 * It answers one question: does our existing HMRC sandbox application, our OAuth
 * redirect and our fraud prevention headers get a Business Details (MTD) v2.0
 * read through, using the `read:self-assessment` scope? It drives the same
 * authorisation code flow the proxy variant drives, then calls
 * GET /individuals/business/details/{nino}/list with the headers
 * app/lib/buildFraudHeaders.js produces for a server-side call.
 *
 * The proxy variant (npm run start:proxy) is the normal way to get a sandbox
 * token. This harness exists because that route needs Docker.
 *
 * Usage:
 *   scripts/proxy-secrets.sh node scripts/itsa-sandbox-spike.js
 *
 * Environment:
 *   HMRC_SANDBOX_BASE_URI        sandbox API base (from .env.proxy)
 *   HMRC_SANDBOX_CLIENT_ID       sandbox application client id (from .env.proxy)
 *   HMRC_SANDBOX_CLIENT_SECRET   sandbox application client secret (from proxy-secrets.sh)
 *   DIY_SUBMIT_BASE_URL          base for the registered redirect uri (from .env.proxy)
 *   ITSA_SPIKE_TEST_USER_FILE    path to the sandbox test user JSON (userId, password, nino)
 *   ITSA_SPIKE_OUT_DIR           directory for the raw transcript and screenshots
 *   ITSA_SPIKE_SCOPE             scope to request (default "read:self-assessment")
 *   ITSA_SPIKE_HEADFUL           set to "true" to watch the browser
 *
 * Nothing here prints or writes a token, a password or a client secret.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";
import dotenv from "dotenv";

import { buildFraudHeaders, detectVendorPublicIp } from "../app/lib/buildFraudHeaders.js";
import { initializeSalt } from "../app/services/subHasher.js";
import { buildHmrcHeaders } from "../app/services/hmrcApi.js";
import { prepareTokenExchangeRequest } from "../app/functions/hmrc/hmrcTokenPost.js";

const SCENARIOS = ["N/A - DEFAULT", "PROPERTY", "FOREIGN_PROPERTY", "BUSINESS_AND_PROPERTY", "UNSPECIFIED", "NOT_FOUND", "STATEFUL"];

const transcript = [];

function record(step, detail) {
  transcript.push({ step, at: new Date().toISOString(), ...detail });
  console.log(`[itsa-spike] ${step}`);
}

function maskNino(nino) {
  return `${"*".repeat(Math.max(0, nino.length - 2))}${nino.slice(-2)}`;
}

function headersToObject(headers) {
  const out = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

// Authorization carries the token, so the transcript keeps only its shape.
function redactRequestHeaders(headers) {
  return Object.fromEntries(
    Object.entries(headers)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([key, value]) => (key.toLowerCase() === "authorization" ? [key, "Bearer <redacted>"] : [key, value])),
  );
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.trim() === "") {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

/**
 * Drive the sandbox authorisation pages until the browser is sent to the
 * redirect uri, and return the authorisation code from that redirect.
 */
async function getAuthorizationCode({ authorizeUrl, redirectUri, userId, password, outDir, headful }) {
  const browser = await chromium.launch({ headless: !headful });
  const page = await browser.newPage();
  const visited = [];
  const documentResponses = [];
  let redirectUrl = null;
  page.on("response", (response) => {
    if (response.request().resourceType() === "document") {
      documentResponses.push(`${response.status()} ${response.url().split("?")[0]}`);
    }
  });
  // Nothing serves the redirect uri here, so read the code off the request itself.
  page.on("request", (request) => {
    if (request.url().startsWith(redirectUri)) redirectUrl = request.url();
  });
  page.on("requestfailed", (request) => {
    if (request.resourceType() === "document") {
      documentResponses.push(`FAILED ${request.failure()?.errorText} ${request.url().split("?")[0]}`);
    }
  });

  await page.route(`${redirectUri}*`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<p>spike</p>" }));

  try {
    await page.goto(authorizeUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    for (let step = 0; step < 12; step += 1) {
      // A sign-in click lands on a chain of redirects, so the url settles before the dom does.
      await page.waitForLoadState("networkidle", { timeout: 30000 }).catch(() => {});
      const url = page.url();
      visited.push(url.split("?")[0]);

      if (redirectUrl) {
        const params = new URL(redirectUrl).searchParams;
        const error = params.get("error");
        if (error) {
          throw new Error(`Authorisation refused: ${error} ${params.get("error_description") || ""}`);
        }
        const code = params.get("code");
        if (!code) throw new Error("Redirect carried no authorisation code");
        return { code, visited, documentResponses };
      }

      const signInField = page.locator("#userId, input[name='userId']").first();
      if (await signInField.count()) {
        await signInField.fill(userId);
        await page.locator("#password, input[name='password']").first().fill(password);
        await Promise.all([
          page.waitForLoadState("domcontentloaded", { timeout: 60000 }),
          page.locator("button[type=submit], input[type=submit]").first().click(),
        ]);
        continue;
      }

      const candidates = [
        "#signIn",
        "#continue",
        "button[type=submit]",
        "input[type=submit]",
        "a[role=button].govuk-button",
        "a.govuk-button",
      ];
      let clicked = false;
      for (const selector of candidates) {
        const control = page.locator(selector).first();
        if (!(await control.count())) continue;
        await Promise.all([page.waitForLoadState("domcontentloaded", { timeout: 60000 }), control.click()]);
        clicked = true;
        break;
      }
      if (clicked) continue;

      await page.screenshot({ path: `${outDir}/stuck-${step}.png`, fullPage: true });
      writeFileSync(`${outDir}/stuck-${step}.html`, await page.content());
      const counts = {};
      for (const selector of candidates) counts[selector] = await page.locator(selector).count();
      throw new Error(
        `No action found on ${url.split("?")[0]} counts=${JSON.stringify(counts)} documents=${JSON.stringify(documentResponses)} (screenshot in ${outDir})`,
      );
    }

    throw new Error("Authorisation flow did not reach the redirect uri within 12 steps");
  } finally {
    await browser.close();
  }
}

/** Headers a browser would send us, which buildFraudHeaders turns into Gov-Client-* values. */
function buildSyntheticEvent(clientPublicIp) {
  return {
    headers: {
      "x-forwarded-for": clientPublicIp,
      "cloudfront-viewer-address": `${clientPublicIp}:51234`,
      "x-device-id": randomUUID(),
      "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) itsa-sandbox-spike",
      "Gov-Client-Public-IP-Timestamp": new Date().toISOString(),
      "Gov-Client-Screens": "width=1512&height=982&colour-depth=30&scaling-factor=2",
      "Gov-Client-Timezone": "UTC+00:00",
      "Gov-Client-Window-Size": "width=1512&height=857",
    },
    requestContext: { authorizer: { lambda: { sub: `spike-${randomUUID()}` } } },
  };
}

async function callBusinessDetailsList({ baseUri, nino, accessToken, govClientHeaders, scenario }) {
  const url = `${baseUri}/individuals/business/details/${nino}/list`;
  const headers = buildHmrcHeaders(accessToken, govClientHeaders, scenario, randomUUID(), undefined, randomUUID());
  headers.Accept = "application/vnd.hmrc.2.0+json";
  const cleanHeaders = Object.fromEntries(Object.entries(headers).filter(([, value]) => value !== undefined && value !== null));

  const response = await fetch(url, { method: "GET", headers: cleanHeaders });
  const body = await response.text();

  return {
    scenario: scenario || null,
    url: url.replace(nino, maskNino(nino)),
    requestHeaders: redactRequestHeaders({ ...cleanHeaders }),
    status: response.status,
    responseHeaders: headersToObject(response.headers),
    body: (() => {
      try {
        return JSON.parse(body);
      } catch {
        return body;
      }
    })(),
  };
}

async function main() {
  dotenv.config({ path: ".env.proxy", override: false });

  const baseUri = requireEnv("HMRC_SANDBOX_BASE_URI").replace(/\/$/, "");
  const clientId = requireEnv("HMRC_SANDBOX_CLIENT_ID");
  requireEnv("HMRC_SANDBOX_CLIENT_SECRET");
  const appBaseUrl = requireEnv("DIY_SUBMIT_BASE_URL").replace(/\/$/, "");
  const redirectUri = `${appBaseUrl}/activities/submitVatCallback.html`;
  const scope = process.env.ITSA_SPIKE_SCOPE || "read:self-assessment";
  const outDir = process.env.ITSA_SPIKE_OUT_DIR || "./target/itsa-spike";
  mkdirSync(outDir, { recursive: true });

  const testUser = JSON.parse(readFileSync(requireEnv("ITSA_SPIKE_TEST_USER_FILE"), "utf8"));
  const nino = testUser.nino;
  if (!nino) throw new Error("Test user file has no nino");

  const state = randomUUID();
  const authorizeUrl =
    `${baseUri}/oauth/authorize` +
    `?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&scope=${encodeURIComponent(scope)}` +
    `&state=${encodeURIComponent(state)}`;

  record("authorize", { scope, redirectUri, clientIdSuffix: clientId.slice(-4), nino: maskNino(nino) });

  const { code, visited } = await getAuthorizationCode({
    authorizeUrl,
    redirectUri,
    userId: testUser.userId,
    password: testUser.password,
    outDir,
    headful: process.env.ITSA_SPIKE_HEADFUL === "true",
  });
  record("authorization-code-received", { pagesVisited: visited, codeLength: code.length });

  const { url: tokenUrl, body: tokenBody } = await prepareTokenExchangeRequest(code, "synthetic");
  const tokenResponse = await fetch(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Accept": "application/vnd.hmrc.1.0+json" },
    body: JSON.stringify(tokenBody),
  });
  const tokenJson = await tokenResponse.json();
  if (!tokenResponse.ok || !tokenJson.access_token) {
    record("token-exchange-failed", { status: tokenResponse.status, body: tokenJson });
    throw new Error(`Token exchange failed with ${tokenResponse.status}`);
  }
  record("token-exchange", {
    status: tokenResponse.status,
    grantedScope: tokenJson.scope,
    tokenType: tokenJson.token_type,
    expiresIn: tokenJson.expires_in,
  });
  const accessToken = tokenJson.access_token;

  const vendorPublicIp = await detectVendorPublicIp();
  const clientPublicIp = vendorPublicIp;
  // Gov-Vendor-License-IDs is a hash of the user's bundles, so the harness needs a salt of its own.
  process.env.USER_SUB_HASH_SALT = JSON.stringify({ current: "spike", versions: { spike: randomUUID() } });
  await initializeSalt();
  const { govClientHeaders } = buildFraudHeaders(buildSyntheticEvent(clientPublicIp), { bundleIds: ["resident-itsa"] });
  record("fraud-headers", {
    headerNames: Object.keys(govClientHeaders).sort(),
    clientAndVendorIpAreTheSameHost: clientPublicIp === vendorPublicIp,
  });

  const validation = await fetch(`${baseUri}/test/fraud-prevention-headers/validate`, {
    method: "GET",
    headers: { Accept: "application/vnd.hmrc.1.0+json", Authorization: `Bearer ${accessToken}`, ...govClientHeaders },
  });
  const validationBody = await validation.json().catch(() => ({}));
  record("fraud-header-validator", { status: validation.status, body: validationBody });

  const attempts = [];
  const first = await callBusinessDetailsList({ baseUri, nino, accessToken, govClientHeaders, scenario: undefined });
  attempts.push(first);
  record("business-details-list", { status: first.status, scenario: "none" });

  if (first.status !== 200) {
    for (const scenario of SCENARIOS) {
      const attempt = await callBusinessDetailsList({ baseUri, nino, accessToken, govClientHeaders, scenario });
      attempts.push(attempt);
      record("business-details-list", { status: attempt.status, scenario });
    }
  }

  const outFile = `${outDir}/itsa-spike-transcript.json`;
  writeFileSync(outFile, JSON.stringify({ transcript, attempts }, null, 2));
  console.log(`[itsa-spike] transcript written to ${outFile}`);
}

main().catch((error) => {
  console.error(`[itsa-spike] failed: ${error.message}`);
  process.exitCode = 1;
});
