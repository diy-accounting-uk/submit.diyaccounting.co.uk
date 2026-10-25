#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/mint-exploratory-state.mjs
//
// Sign in once as the ci lane's durable Cognito user and write the browser context's storage
// state for the Playwright MCP server (.mcp.json), plus an empty state for the visitor pass.
// The credentials come from cognito-native-test-credentials.json, which
// `npm run test:enableCognitoNative` writes. Run `npm run test:disableCognitoNative` after.
//
// The sign-in opens the host the deployed site names in its own submit.env (the ci set's host),
// because the Cognito callback keeps the OAuth state in that origin's sessionStorage.
//
// Usage: node scripts/mint-exploratory-state.mjs [--base-url <url>] [--out <dir>] [--credentials <file>]

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import { TOTP, Secret } from "otpauth";
import { resolveDeployedBaseUrl } from "./use-deployed-base-url.js";

export const DEFAULT_ENTRY_URL = "https://ci-submit.diyaccounting.co.uk/";
export const DEFAULT_OUT_DIR = ".cache/playwright-mcp";
export const DEFAULT_CREDENTIALS_FILE = "cognito-native-test-credentials.json";
export const SIGNED_IN_STATE_FILE = "ci-state.json";
export const VISITOR_STATE_FILE = "visitor-state.json";

export function parseArguments(argv) {
  const options = { baseUrl: null, outDir: DEFAULT_OUT_DIR, credentialsFile: DEFAULT_CREDENTIALS_FILE };
  const valueFlags = { "--base-url": "baseUrl", "--out": "outDir", "--credentials": "credentialsFile" };
  for (let index = 0; index < argv.length; index += 1) {
    const key = valueFlags[argv[index]];
    if (!key) {
      throw new Error(`Unknown argument ${argv[index]}`);
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`${argv[index]} needs a value`);
    }
    options[key] = value;
    index += 1;
  }
  return options;
}

export function emptyStorageState() {
  return { cookies: [], origins: [] };
}

export function stateFilePaths(outDir) {
  return {
    signedIn: path.join(outDir, SIGNED_IN_STATE_FILE),
    visitor: path.join(outDir, VISITOR_STATE_FILE),
  };
}

export function readCredentials(credentialsFile) {
  if (!fs.existsSync(credentialsFile)) {
    throw new Error(`${credentialsFile} is missing. Run npm run test:enableCognitoNative first.`);
  }
  const credentials = JSON.parse(fs.readFileSync(credentialsFile, "utf-8"));
  if (!credentials.username || !credentials.password) {
    throw new Error(`${credentialsFile} has no username or password`);
  }
  return credentials;
}

async function typeIntoVisibleField(page, name, text) {
  await page.evaluate((fieldName) => {
    const fields = document.querySelectorAll(`input[name="${fieldName}"]`);
    const visible = Array.from(fields).find((element) => element.offsetParent !== null) || fields[fields.length - 1];
    visible.focus();
    visible.select();
  }, name);
  await page.keyboard.type(text, { delay: 10 });
}

async function clickVisibleSubmit(page, selector) {
  await page.evaluate((buttonSelector) => {
    const buttons = document.querySelectorAll(buttonSelector);
    const visible = Array.from(buttons).find((element) => element.offsetParent !== null) || buttons[buttons.length - 1];
    if (visible) {
      const form = visible.closest("form");
      if (form) form.noValidate = true;
      visible.click();
    }
  }, selector);
}

const TOTP_FIELD =
  'input[name="totpCode"], input[name="SOFTWARE_TOKEN_MFA_CODE"], input[type="text"][inputmode="numeric"], input[name="code"]';

async function answerTotpChallenge(page, totpSecret) {
  await page.waitForSelector(TOTP_FIELD, { state: "attached", timeout: 15000 });
  const totp = new TOTP({ secret: Secret.fromBase32(totpSecret), algorithm: "SHA1", digits: 6, period: 30 });
  await page.evaluate((fieldSelector) => {
    const fields = document.querySelectorAll(fieldSelector);
    const visible = Array.from(fields).find((element) => element.offsetParent !== null) || fields[fields.length - 1];
    visible.focus();
    visible.select();
  }, TOTP_FIELD);
  await page.keyboard.type(totp.generate(), { delay: 10 });
  await clickVisibleSubmit(page, 'input[name="signInSubmitButton"], button[type="submit"], input[type="submit"]');
}

export async function signIn(page, baseUrl, credentials) {
  await page.goto(new URL("auth/login.html", baseUrl).toString(), { waitUntil: "domcontentloaded" });
  const appOrigin = new URL(page.url()).origin;
  await page.waitForFunction(() => typeof document.getElementById("loginWithCognito")?.onclick === "function", null, { timeout: 30000 });
  await page.locator("button:has-text('Google account')").click();
  await page.waitForURL((url) => url.origin !== appOrigin, { timeout: 30000 });
  await page.waitForSelector('input[name="username"]', { state: "attached", timeout: 30000 });
  await typeIntoVisibleField(page, "username", credentials.username);
  await typeIntoVisibleField(page, "password", credentials.password);
  await clickVisibleSubmit(page, 'input[name="signInSubmitButton"]');
  if (credentials.totpSecret) {
    await answerTotpChallenge(page, credentials.totpSecret);
  }
  await page.waitForURL((url) => url.origin === appOrigin && !url.pathname.includes("loginWithCognitoCallback"), { timeout: 60000 });
  await page.getByText("Logged in as").waitFor({ state: "visible", timeout: 30000 });
}

export async function main(argv = process.argv.slice(2)) {
  const options = parseArguments(argv);
  const credentials = readCredentials(options.credentialsFile);
  const baseUrl = options.baseUrl ?? (await resolveDeployedBaseUrl(DEFAULT_ENTRY_URL));
  const files = stateFilePaths(options.outDir);
  fs.mkdirSync(options.outDir, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    await signIn(page, baseUrl, credentials);
    await context.storageState({ path: files.signedIn });
  } finally {
    await browser.close();
  }
  fs.writeFileSync(files.visitor, JSON.stringify(emptyStorageState(), null, 2) + "\n");
  console.log(`Signed in at ${baseUrl}`);
  console.log(`Wrote ${files.signedIn}`);
  console.log(`Wrote ${files.visitor}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
