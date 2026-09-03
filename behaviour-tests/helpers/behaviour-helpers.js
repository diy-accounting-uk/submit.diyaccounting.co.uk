// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// behaviour-tests/helpers/behaviour-helpers.js
import {
  startDynamoDB,
  ensureBundleTableExists,
  ensureHmrcApiRequestsTableExists,
  ensureReceiptsTableExists,
  ensureAsyncRequestsTableExists,
  ensurePassesTableExists,
  ensureCapacityTableExists,
} from "@app/bin/dynamodb.js";
import { spawn } from "child_process";
import { checkIfServerIsRunning } from "./serverHelper.js";
import { test } from "@playwright/test";
import { gotoWithRetries } from "./gotoWithRetries.js";
import fs from "node:fs";
import path from "node:path";
import net from "node:net";
import { createLogger, sanitiseString, sanitiseData } from "../../app/lib/logger.js";

const logger = createLogger({ source: "behaviour-tests/helpers/behaviour-helpers.js" });

const defaultScreenshotPath = "target/behaviour-test-results/screenshots/behaviour-helpers";

export function getEnvVarAndLog(name, envKey, defaultValue) {
  let value;
  if (process.env[envKey] && process.env[envKey].trim() !== "") {
    value = process.env[envKey];
  } else {
    value = defaultValue;
  }
  logger.info(`${name}: ${value}`);
  return value;
}

/**
 * Determine if we're running against HMRC sandbox or production API
 * based on the HMRC_BASE_URI environment variable
 * @returns {boolean} true if using sandbox, false otherwise
 */
export function isSandboxMode() {
  // Prefer explicit HMRC_ACCOUNT when provided
  const hmrcAccount = (process.env.HMRC_ACCOUNT || "").toLowerCase();
  if (hmrcAccount === "sandbox") {
    logger.info(`Sandbox mode detection: HMRC_ACCOUNT=${hmrcAccount} => sandbox=true`);
    return true;
  } else {
    logger.info(`Sandbox mode detection: HMRC_ACCOUNT=${hmrcAccount} => sandbox=false`);
    return false;
  }
}

export async function runLocalDynamoDb(runDynamoDb, bundleTableName, hmrcApiRequestsTableName, receiptsTableName) {
  logger.info(
    `[dynamodb]: runDynamoDb=${runDynamoDb}, bundleTableName=${bundleTableName}, hmrcApiRequestsTableName=${hmrcApiRequestsTableName}, receiptsTableName=${receiptsTableName}`,
  );
  let stop;
  let endpoint;
  if (runDynamoDb === "run") {
    // Prefer an ephemeral random port to avoid EADDRINUSE collisions across test runs
    if (!process.env.DYNAMODB_PORT || String(process.env.DYNAMODB_PORT).trim() === "") {
      process.env.DYNAMODB_PORT = "0"; // let dynalite choose a free port
      logger.info("[dynamodb]: DYNAMODB_PORT not set; using ephemeral port (0)");
    }
    logger.info("[dynamodb]: Starting dynalite (local DynamoDB) server...");
    const started = await startDynamoDB();
    stop = started.stop;
    endpoint = started.endpoint;
    logger.info(`[dynamodb]: Started at ${endpoint}`);

    // Ensure AWS SDK v3 will talk to local endpoint
    // Clear AWS_PROFILE to prevent SDK from preferring SSO credentials over static credentials
    delete process.env.AWS_PROFILE;
    process.env.AWS_REGION = process.env.AWS_REGION || "us-east-1";
    process.env.AWS_ACCESS_KEY_ID = "dummy";
    process.env.AWS_SECRET_ACCESS_KEY = "dummy";
    process.env.AWS_ENDPOINT_URL = endpoint;
    process.env.AWS_ENDPOINT_URL_DYNAMODB = endpoint;

    // Ensure table names are set in env, with sensible defaults for behaviour tests
    const bundlesTable = bundleTableName || process.env.BUNDLE_DYNAMODB_TABLE_NAME || "behaviour-bundles";
    const hmrcReqsTable = hmrcApiRequestsTableName || process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME || "behaviour-hmrc-requests";
    const receiptsTable = receiptsTableName || process.env.RECEIPTS_DYNAMODB_TABLE_NAME || "behaviour-receipts";

    process.env.BUNDLE_DYNAMODB_TABLE_NAME = bundlesTable;
    process.env.HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME = hmrcReqsTable;
    process.env.RECEIPTS_DYNAMODB_TABLE_NAME = receiptsTable;

    // Create tables
    await ensureBundleTableExists(bundlesTable, endpoint);
    await ensureHmrcApiRequestsTableExists(hmrcReqsTable, endpoint);
    await ensureReceiptsTableExists(receiptsTable, endpoint);

    const passesTable = process.env.PASSES_DYNAMODB_TABLE_NAME;
    if (passesTable) {
      await ensurePassesTableExists(passesTable, endpoint);
    }

    const capacityTable = process.env.BUNDLE_CAPACITY_DYNAMODB_TABLE_NAME;
    if (capacityTable) {
      await ensureCapacityTableExists(capacityTable, endpoint);
    }

    const asyncTable = process.env.ASYNC_REQUESTS_DYNAMODB_TABLE_NAME;
    if (asyncTable) await ensureAsyncRequestsTableExists(asyncTable, endpoint);

    const bundlePostAsyncTable = process.env.BUNDLE_POST_ASYNC_REQUESTS_TABLE_NAME;
    if (bundlePostAsyncTable) await ensureAsyncRequestsTableExists(bundlePostAsyncTable, endpoint);

    const bundleDeleteAsyncTable = process.env.BUNDLE_DELETE_ASYNC_REQUESTS_TABLE_NAME;
    if (bundleDeleteAsyncTable) await ensureAsyncRequestsTableExists(bundleDeleteAsyncTable, endpoint);

    const hmrcVatReturnPostAsyncTable = process.env.HMRC_VAT_RETURN_POST_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcVatReturnPostAsyncTable) await ensureAsyncRequestsTableExists(hmrcVatReturnPostAsyncTable, endpoint);

    const hmrcVatReturnGetAsyncTable = process.env.HMRC_VAT_RETURN_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcVatReturnGetAsyncTable) await ensureAsyncRequestsTableExists(hmrcVatReturnGetAsyncTable, endpoint);

    const hmrcVatObligationGetAsyncTable = process.env.HMRC_VAT_OBLIGATION_GET_ASYNC_REQUESTS_TABLE_NAME;
    if (hmrcVatObligationGetAsyncTable) await ensureAsyncRequestsTableExists(hmrcVatObligationGetAsyncTable, endpoint);
  } else {
    endpoint = process.env.AWS_ENDPOINT_URL_DYNAMODB || undefined;
    logger.info(`[dynamodb]: Not starting dynalite (TEST_DYNAMODB=${runDynamoDb}); using existing endpoint ${endpoint}`);
  }
  return { stop, endpoint };
}

export async function runLocalHttpServer(runTestServer, httpServerPort) {
  logger.info(`[http]: runTestServer=${runTestServer}, httpServerPort=${httpServerPort}`);
  let serverProcess;
  if (runTestServer === "run") {
    logger.info("[http]: Starting server process...");
    // Spawn node directly instead of via npm run server to ensure env vars are inherited
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    serverProcess = spawn("node", ["app/bin/server.js"], {
      env: {
        ...process.env,
        TEST_SERVER_HTTP_PORT: httpServerPort.toString(),
      },
      stdio: ["pipe", "pipe", "pipe"],
    });

    serverProcess.stdout.on("data", (data) => logger.info(sanitiseString(`[http-stdout]: ${data.toString().trim()}`)));
    serverProcess.stderr.on("data", (data) => logger.error(sanitiseString(`[http-stderr]: ${data.toString().trim()}`)));

    // In TLS mode the server answers only on HTTPS, so the health check has to hit the
    // same hostname the certificate is issued for rather than the plain HTTP loopback.
    const healthCheckUrl =
      process.env.TEST_SERVER_TLS === "run"
        ? `https://local.submit.diyaccounting.co.uk:${process.env.TEST_SERVER_HTTPS_PORT}`
        : `http://127.0.0.1:${httpServerPort}`;
    await checkIfServerIsRunning(healthCheckUrl, 1000, undefined, "http");
  } else {
    logger.info("[http]: Skipping server process as runTestServer is not set to 'run'");
  }
  return serverProcess;
}

/**
 * Start `stripe listen`, replaying real Stripe webhook traffic to the local server over an
 * outbound connection instead of an inbound tunnel. Skipped when the run has no Stripe price IDs
 * configured — the same gate server.js uses to decide whether to register mockBilling.js — so the
 * simulator's auto-completing checkout path never spawns the Stripe CLI.
 *
 * Must be started, and its signing secret read, before runLocalHttpServer spawns the server:
 * resolveWebhookSecret() in billingWebhookPost.js caches the first STRIPE_TEST_WEBHOOK_SECRET it
 * sees, so the secret has to exist in the child's env before the process starts.
 *
 * @param {string} webhookUrl - the local server's webhook endpoint, e.g.
 *   https://local.submit.diyaccounting.co.uk:3443/api/v1/billing/webhook
 * @returns {Promise<{secret: string, kill: Function}|null>}
 */
export async function runStripeListen(webhookUrl) {
  const usesRealStripe = !!(process.env.STRIPE_PRICE_ID_RESIDENT_PRO || process.env.STRIPE_TEST_PRICE_ID_RESIDENT_PRO);
  if (!usesRealStripe) {
    logger.info("[stripe-listen]: Skipping stripe listen — no Stripe price IDs configured (simulator/mock billing)");
    return null;
  }
  // Deployed environments (ci/prod) receive webhooks at their public endpoint;
  // forwarding is only needed when the server under test is local.
  const localServer = process.env.TEST_SERVER_HTTP === "run" || process.env.TEST_SERVER_HTTP === "useExisting";
  if (!localServer) {
    logger.info("[stripe-listen]: Skipping stripe listen — server under test is not local");
    return null;
  }

  logger.info(`[stripe-listen]: Starting stripe listen --forward-to ${webhookUrl}...`);
  return new Promise((resolve, reject) => {
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    const child = spawn("stripe", ["listen", "--forward-to", webhookUrl], {
      env: { ...process.env },
      stdio: ["pipe", "pipe", "pipe"],
    });

    let resolved = false;
    const secretPattern = /whsec_[A-Za-z0-9]+/;

    const onOutput = (streamLabel) => (data) => {
      const text = data.toString();
      logger.info(sanitiseString(`[stripe-listen-${streamLabel}]: ${text.trim()}`));
      if (resolved) return;
      const match = text.match(secretPattern);
      if (match) {
        resolved = true;
        clearTimeout(startupTimeout);
        resolve({
          secret: match[0],
          kill: () => {
            logger.info("[stripe-listen]: kill() called, stopping...");
            child.kill();
          },
        });
      }
    };

    child.stdout.on("data", onOutput("stdout"));
    child.stderr.on("data", onOutput("stderr"));

    child.on("error", (error) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(startupTimeout);
        reject(error);
      }
    });

    const startupTimeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        child.kill();
        reject(new Error("[stripe-listen]: Timed out waiting for the webhook signing secret"));
      }
    }, 20_000);
  });
}

export async function runLocalOAuth2Server(runMockOAuth2) {
  logger.info(`[auth]: runMockOAuth2=${runMockOAuth2}`);
  let serverProcess;
  let simulatorResult = null;

  if (runMockOAuth2 === "run") {
    logger.info("[auth]: Starting mock-oauth2-server process...");
    // eslint-disable-next-line sonarjs/no-os-command-from-path
    serverProcess = spawn("npm", ["run", "auth"], {
      env: {
        ...process.env,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    await checkIfServerIsRunning("http://localhost:8080/default/debugger", 2000, undefined, "auth");
  } else {
    logger.info("[auth]: Skipping mock-oauth2-server process as runMockOAuth2 is not set to 'run'");

    // When mock-oauth2-server is off, check if HTTP simulator should run instead
    const runHttpSimulator = process.env.TEST_HTTP_SIMULATOR;
    if (runHttpSimulator === "run") {
      logger.info("[auth]: Starting HTTP simulator (replaces mock-oauth2-server and HMRC API)...");
      simulatorResult = await runLocalHttpSimulator(runHttpSimulator);
    }
  }

  // Return an object that can stop both the mock-oauth2 process and simulator
  return {
    process: serverProcess,
    simulator: simulatorResult,
    kill: () => {
      if (serverProcess) serverProcess.kill();
      if (simulatorResult?.stop) simulatorResult.stop();
    },
  };
}

/**
 * Start the HTTP simulator that replaces both Docker mock-oauth2-server and HMRC API
 * @param {string} runSimulator - 'run' to start, any other value to skip
 * @param {number} port - Port to listen on (default from TEST_HTTP_SIMULATOR_PORT, or an ephemeral free port if neither is set)
 * @returns {Promise<{stop: Function, endpoint: string}|null>}
 */
export async function runLocalHttpSimulator(runSimulator, port) {
  // Ephemeral by default (0), matching the dynalite pattern in runLocalDynamoDb above,
  // so concurrent runs don't collide on a pinned port.
  const simulatorPort = port || process.env.TEST_HTTP_SIMULATOR_PORT || 0;
  logger.info(`[http-simulator]: runSimulator=${runSimulator}, port=${simulatorPort}`);

  if (runSimulator === "run") {
    logger.info("[http-simulator]: Starting HTTP simulator...");
    try {
      const { startSimulator } = await import("@app/http-simulator/index.js");
      const result = await startSimulator({ port: Number(simulatorPort) });
      logger.info(`[http-simulator]: Started at ${result.baseUrl}`);

      // Update environment variables to point to the simulator
      process.env.TEST_MOCK_OAUTH2_BASE = result.baseUrl;
      process.env.HMRC_BASE_URI = result.baseUrl;
      process.env.HMRC_SANDBOX_BASE_URI = result.baseUrl;

      return {
        stop: result.stop,
        endpoint: result.baseUrl,
      };
    } catch (error) {
      logger.error(`[http-simulator]: Failed to start: ${error.message}`);
      throw error;
    }
  } else {
    logger.info("[http-simulator]: Skipping HTTP simulator as TEST_HTTP_SIMULATOR is not set to 'run'");
    return null;
  }
}

export function addOnPageLogging(page) {
  // Always capture console and page errors (useful, low volume)
  // All output is sanitised through the logger's PII redaction to prevent credential leakage
  page.on("console", (msg) => {
    logger.info(sanitiseString(`[BROWSER CONSOLE ${msg.type()}]: ${msg.text()}`));
  });

  page.on("pageerror", (error) => {
    logger.info(sanitiseString(`[BROWSER ERROR]: ${error.message}`));
  });

  // Verbose network logging can flood CI logs and cause timeouts.
  // Enable only when explicitly requested via env flag.
  const verboseHttp = String(process.env.TEST_VERBOSE_HTTP_LOGS || "").toLowerCase() === "true";

  if (verboseHttp) {
    page.on("request", (request) => {
      logger.info(sanitiseString(`[HTTP REQUEST] ${request.method()} ${request.url()}`));
      logger.info({ headers: sanitiseData(request.headers()) }, "[HTTP REQUEST HEADERS]");
      if (request.postData()) {
        logger.info(sanitiseString(`[HTTP REQUEST BODY] ${request.postData()}`));
      }
    });

    page.on("response", (response) => {
      logger.info(sanitiseString(`[HTTP RESPONSE] ${response.status()} ${response.url()}`));
      logger.info({ headers: sanitiseData(response.headers()) }, "[HTTP RESPONSE HEADERS]");
    });
  }

  // Always log failed requests — these are important for diagnosing errors
  page.on("requestfailed", (request) => {
    logger.info(sanitiseString(`[HTTP REQUEST FAILED] ${request.method()} ${request.url()} - ${request.failure()?.errorText}`));
  });
}

// Create helper functions for logging user interactions (narrative steps)
// internal util to create safe slug parts for filenames
const toSlug = (text) =>
  String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

// ensure a directory exists (sync to minimize test flakiness)
const ensureDirSync = (dirPath) => {
  try {
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  } catch (e) {
    // best-effort; do not fail tests due to screenshot folder issues
    console.warn(`[WARN] Failed to ensure screenshot directory ${dirPath}: ${e.message}`);
  }
};

// take a post-focus screenshot using an auto path to avoid changing all call sites
const autoFocusScreenshot = async (page, context) => {
  const autoPath = path.join("target", "behaviour-test-results", "screenshots", "auto-focus");
  ensureDirSync(autoPath);
  const slug = toSlug(context || "focus");
  const file = `${timestamp()}-01-focus-${slug || "target"}.png`;
  try {
    await page.screenshot({ path: path.join(autoPath, file) });
  } catch (e) {
    console.warn(`[WARN] Failed to take focus screenshot: ${e.message}`);
  }
};

// Accepts either a selector string or a Playwright Locator
export const loggedClick = async (page, selectorOrLocator, description = "", options = undefined) =>
  await test.step(description ? `The user clicks ${description}` : `The user clicks selector ${selectorOrLocator}`, async () => {
    const opts = options && typeof options === "object" ? options : {};
    const timeout = opts.timeout || 30000;
    const isLocator = selectorOrLocator && typeof selectorOrLocator !== "string";
    const selector = isLocator ? undefined : selectorOrLocator;
    const locator = isLocator ? selectorOrLocator : page.locator(selector);

    console.log(`[USER INTERACTION] Clicking: ${isLocator ? "[Locator]" : selector} ${description ? "- " + description : ""}`);

    // Wait for element to be visible and stable before clicking
    await (isLocator ? locator.waitFor({ state: "visible", timeout }) : page.waitForSelector(selector, { state: "visible", timeout }));

    // Explicitly focus the element before clicking
    try {
      if (isLocator) {
        await locator.focus();
      } else {
        await page.focus(selector);
      }
    } catch (e) {
      console.warn(`[WARN] Failed to focus before click: ${e.message}`);
    }

    // Screenshot just after focus change
    if (opts.screenshotPath) {
      const labelSlug = toSlug(opts.focusLabel || description || (isLocator ? "locator" : selector));
      const name = `${timestamp()}-00-focus-${labelSlug || "target"}.png`;
      try {
        ensureDirSync(opts.screenshotPath);
        await page.screenshot({ path: path.join(opts.screenshotPath, name) });
      } catch (e) {
        console.warn(`[WARN] Failed to take focus screenshot at provided path: ${e.message}`);
      }
    } else {
      await autoFocusScreenshot(page, description || (isLocator ? "locator" : selector));
    }

    // Perform the click
    await (isLocator ? locator.click() : page.click(selector));
  });

// Accepts either a selector string or a Playwright Locator
export const loggedFill = async (page, selectorOrLocator, value, description = "", options = undefined) =>
  await test.step(
    description ? `The user fills ${description} with "${value}"` : `The user fills selector ${selectorOrLocator} with "${value}"`,
    async () => {
      const opts = options && typeof options === "object" ? options : {};
      const timeout = opts.timeout || 30000;
      const isLocator = selectorOrLocator && typeof selectorOrLocator !== "string";
      const selector = isLocator ? undefined : selectorOrLocator;
      const locator = isLocator ? selectorOrLocator : page.locator(selector);

      console.log(
        `[USER INTERACTION] Filling: ${isLocator ? "[Locator]" : selector} with value: "${value}" ${description ? "- " + description : ""}`,
      );

      // Wait for visibility and focus before filling
      await (isLocator ? locator.waitFor({ state: "visible", timeout }) : page.waitForSelector(selector, { state: "visible", timeout }));

      try {
        if (isLocator) {
          await locator.focus();
        } else {
          await page.focus(selector);
        }
      } catch (e) {
        console.warn(`[WARN] Failed to focus before fill: ${e.message}`);
      }

      // Screenshot just after focus change
      if (opts.screenshotPath) {
        const labelSlug = toSlug(opts.focusLabel || description || (isLocator ? "locator" : selector));
        const name = `${timestamp()}-00-focus-${labelSlug || "target"}.png`;
        try {
          ensureDirSync(opts.screenshotPath);
          await page.screenshot({ path: path.join(opts.screenshotPath, name) });
        } catch (e) {
          console.warn(`[WARN] Failed to take focus screenshot at provided path: ${e.message}`);
        }
      } else {
        await autoFocusScreenshot(page, description || (isLocator ? "locator" : selector));
      }

      // Perform the fill
      await (isLocator ? locator.fill(String(value)) : page.fill(selector, String(value)));
    },
  );

export const loggedGoto = async (page, url, description = "", screenshotPath = defaultScreenshotPath) =>
  await test.step(description ? `The user navigates to ${description}` : `The user navigates to ${url}`, async () => {
    await gotoWithRetries(
      page,
      url,
      {
        description,
        waitUntil: "domcontentloaded",
        readySelector: "#dynamicActivities",
      },
      screenshotPath,
    );
  });

// Accepts either a selector string or a Playwright Locator
export const loggedFocus = async (page, selectorOrLocator, description = "", options = undefined) =>
  await test.step(description ? `The user focuses ${description}` : `The user focuses selector ${selectorOrLocator}`, async () => {
    const opts = options && typeof options === "object" ? options : {};
    const timeout = opts.timeout || 30000;
    const isLocator = selectorOrLocator && typeof selectorOrLocator !== "string";
    const selector = isLocator ? undefined : selectorOrLocator;
    const locator = isLocator ? selectorOrLocator : page.locator(selector);

    console.log(`[USER INTERACTION] Focusing: ${isLocator ? "[Locator]" : selector} ${description ? "- " + description : ""}`);

    await (isLocator ? locator.waitFor({ state: "visible", timeout }) : page.waitForSelector(selector, { state: "visible", timeout }));

    // Perform the focus
    try {
      if (isLocator) {
        await locator.focus();
      } else {
        await page.focus(selector);
      }
    } catch (e) {
      // Do not silently swallow focus bugs — rethrow after logging
      console.warn(`[WARN] Failed to focus target: ${e.message}`);
      throw e;
    }

    // Screenshot just after focus change
    if (opts.screenshotPath) {
      const labelSlug = toSlug(opts.focusLabel || description || (isLocator ? "locator" : selector));
      const name = `${timestamp()}-00-focus-${labelSlug || "target"}.png`;
      try {
        ensureDirSync(opts.screenshotPath);
        await page.screenshot({ path: path.join(opts.screenshotPath, name) });
      } catch (e) {
        console.warn(`[WARN] Failed to take focus screenshot at provided path: ${e.message}`);
      }
    } else {
      await autoFocusScreenshot(page, description || (isLocator ? "locator" : selector));
    }
  });

// Accepts either a selector string or a Playwright Locator
// valueOrOptions can be: string|number|{value,label}|Array of those
export const loggedSelectOption = async (page, selectorOrLocator, valueOrOptions, description = "", options = undefined) =>
  await test.step(
    description
      ? `The user selects ${description}`
      : `The user selects on ${typeof selectorOrLocator === "string" ? selectorOrLocator : "[Locator]"}`,
    async () => {
      const opts = options && typeof options === "object" ? options : {};
      const timeout = opts.timeout || 30000;
      const isLocator = selectorOrLocator && typeof selectorOrLocator !== "string";
      const selector = isLocator ? undefined : selectorOrLocator;
      const locator = isLocator ? selectorOrLocator : page.locator(selector);

      const valueLog = typeof valueOrOptions === "object" ? JSON.stringify(valueOrOptions) : String(valueOrOptions);
      console.log(
        `[USER INTERACTION] Selecting option on ${isLocator ? "[Locator]" : selector} value: ${valueLog} ${
          description ? "- " + description : ""
        }`,
      );

      // Ensure element is visible and focused before selection
      await (isLocator ? locator.waitFor({ state: "visible", timeout }) : page.waitForSelector(selector, { state: "visible", timeout }));

      try {
        if (isLocator) {
          await locator.focus();
        } else {
          await page.focus(selector);
        }
      } catch (e) {
        console.warn(`[WARN] Failed to focus before select: ${e.message}`);
      }

      // Screenshot just after focus change
      if (opts.screenshotPath) {
        const labelSlug = toSlug(opts.focusLabel || description || (isLocator ? "locator" : selector));
        const name = `${timestamp()}-00-focus-${labelSlug || "target"}.png`;
        try {
          ensureDirSync(opts.screenshotPath);
          await page.screenshot({ path: path.join(opts.screenshotPath, name) });
        } catch (e) {
          console.warn(`[WARN] Failed to take focus screenshot at provided path: ${e.message}`);
        }
      } else {
        await autoFocusScreenshot(page, description || (isLocator ? "locator" : selector));
      }

      // Perform selection with value-first, fallback-to-label behavior when given a primitive
      const performSelect = async (val) => (isLocator ? locator.selectOption(val) : page.selectOption(selector, val));

      if (valueOrOptions === undefined || valueOrOptions === null) {
        throw new Error("loggedSelectOption requires a value or options argument");
      }

      if (typeof valueOrOptions === "string" || typeof valueOrOptions === "number") {
        const valueStr = String(valueOrOptions);
        try {
          await performSelect(valueStr);
        } catch (error) {
          console.log(`Failed to select by value '${valueStr}' error: ${JSON.stringify(error)} — retrying by label`);
          await performSelect({ label: valueStr });
        }
      } else {
        // Caller provided explicit options object/array — do not silently change semantics
        await performSelect(valueOrOptions);
      }
    },
  );

// Generate timestamp for file naming
export function timestamp() {
  const now = new Date();
  const iso = now.toISOString(); // e.g. 2025-11-08T12:34:56.789Z
  const datePart = iso.slice(0, 10); // YYYY-MM-DD
  const timePart = iso.slice(11, 19); // HH:MM:SS
  const [hour, minute, second] = timePart.split(":");
  const nanos = (process.hrtime.bigint() % 1000000000n).toString().padStart(9, "0");
  return `${datePart}_${hour}-${minute}-${second}-${nanos}`;
}

/**
 * Create an HMRC sandbox test user with VAT enrollment
 * Uses OAuth2 client credentials (client id + client secret) to obtain a bearer token
 * before calling the Create Test User API.
 *
 * @param {string} hmrcClientId - HMRC application client ID
 * @param {string} hmrcClientSecret - HMRC application client secret
 * @param {Object} options - Additional options
 * @param {string[]} options.serviceNames - Service names to enroll (default: ["mtd-vat"])
 * @param {string} [options.scope] - Optional OAuth2 scope for the client credentials request
 * @returns {Promise<Object>} Test user details including userId, password, and vrn
 */
export async function createHmrcTestUser(hmrcClientId, hmrcClientSecret, options = {}) {
  const serviceNames = options.serviceNames || ["mtd-vat"];
  // Use HMRC_SANDBOX_BASE_URI if set (e.g., in simulator mode), otherwise fall back to real HMRC
  const baseUrl = process.env.HMRC_SANDBOX_BASE_URI || "https://test-api.service.hmrc.gov.uk";
  const endpoint = "/create-test-user/organisations";
  const url = `${baseUrl}${endpoint}`;
  const tokenUrl = `${baseUrl}/oauth/token`;

  logger.info({
    message: "[HMRC Test User Creation] Starting test user creation",
    url,
    serviceNames,
    hmrcClientId: hmrcClientId ? `${hmrcClientId.slice(0, Math.min(8, hmrcClientId.length))}...` : "none",
  });

  const requestBody = { serviceNames };

  logger.info({
    message: "[HMRC Test User Creation] Request details (pre-token)",
    method: "POST",
    url,
    body: requestBody,
  });

  const maxRetries = 3;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Add timeout to prevent hanging tests
      const timeoutMs = 20000;

      /* *************************** */
      /* 1. Obtain OAuth2 access token */
      /* *************************** */

      logger.info({
        message: "[HMRC Test User Creation] Requesting OAuth2 access token",
        tokenUrl,
        grantType: "client_credentials",
        attempt: attempt > 0 ? attempt : undefined,
      });

      const tokenController = new AbortController();
      const tokenTimeout = setTimeout(() => tokenController.abort(), timeoutMs);

      let tokenResponse;
      try {
        const tokenBody = new URLSearchParams({
          client_id: hmrcClientId,
          client_secret: hmrcClientSecret,
          grant_type: "client_credentials",
        });

        if (options.scope) {
          tokenBody.set("scope", options.scope);
        }

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

      logger.info({
        message: "[HMRC Test User Creation] Token response received",
        status: tokenResponse.status,
        statusText: tokenResponse.statusText,
        // Do not log access_token
        hasAccessToken: Boolean(tokenResponseBody && tokenResponseBody.access_token),
        error: tokenResponseBody.error,
        errorDescription: tokenResponseBody.error_description,
      });

      if (tokenResponse.status === 429) {
        const retryDelay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000 - 500;
        if (attempt < maxRetries) {
          logger.info({
            message: "[HMRC Test User Creation] Rate limited (429) on token request, retrying",
            attempt: attempt + 1,
            maxRetries,
            retryDelayMs: Math.round(retryDelay),
          });
          await new Promise((r) => setTimeout(r, retryDelay));
          continue;
        }
        const tokenErrorDetails = tokenResponseBody?.error_description || tokenResponseBody?.error || JSON.stringify(tokenResponseBody);
        throw new Error(`Failed to obtain HMRC access token: ${tokenResponse.status} ${tokenResponse.statusText} - ${tokenErrorDetails}`);
      }

      if (!tokenResponse.ok) {
        const tokenErrorDetails = tokenResponseBody?.error_description || tokenResponseBody?.error || JSON.stringify(tokenResponseBody);
        logger.error({
          message: "[HMRC Test User Creation] Failed to obtain access token",
          status: tokenResponse.status,
          tokenResponseBody,
        });
        throw new Error(`Failed to obtain HMRC access token: ${tokenResponse.status} ${tokenResponse.statusText} - ${tokenErrorDetails}`);
      }

      const accessToken = tokenResponseBody.access_token;
      if (!accessToken) {
        logger.error({
          message: "[HMRC Test User Creation] Token response did not contain access_token",
          tokenResponseBody,
        });
        throw new Error("Failed to obtain HMRC access token: access_token missing from response");
      }

      /* ************************************** */
      /* 2. Call Create Test User (organisations) */
      /* ************************************** */

      const requestHeaders = {
        "Content-Type": "application/json",
        "Accept": "application/vnd.hmrc.1.0+json",
        "Authorization": `Bearer ${accessToken}`,
      };

      const requestHeadersForLog = {
        ...requestHeaders,
        Authorization: "Bearer ***REDACTED***",
      };

      logger.info({
        message: "[HMRC Test User Creation] Request details (create-test-user)",
        method: "POST",
        url,
        headers: requestHeadersForLog,
        body: requestBody,
      });

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

      logger.info({
        message: "[HMRC Test User Creation] Response received",
        status: response.status,
        statusText: response.statusText,
        responseBody,
      });

      if (response.status === 429) {
        const retryDelay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000 - 500;
        if (attempt < maxRetries) {
          logger.info({
            message: "[HMRC Test User Creation] Rate limited (429) on create-test-user request, retrying",
            attempt: attempt + 1,
            maxRetries,
            retryDelayMs: Math.round(retryDelay),
          });
          await new Promise((r) => setTimeout(r, retryDelay));
          continue;
        }
        const errorDetails = responseBody?.message || responseBody?.error || JSON.stringify(responseBody);
        throw new Error(`Failed to create HMRC test user: ${response.status} ${response.statusText} - ${errorDetails}`);
      }

      if (!response.ok) {
        const errorDetails = responseBody?.message || responseBody?.error || JSON.stringify(responseBody);
        logger.error({
          message: "[HMRC Test User Creation] Failed to create test user",
          status: response.status,
          responseBody,
        });
        throw new Error(`Failed to create HMRC test user: ${response.status} ${response.statusText} - ${errorDetails}`);
      }

      // Extract key information from response
      const testUser = {
        userId: responseBody.userId,
        password: responseBody.password,
        userFullName: responseBody.userFullName,
        emailAddress: responseBody.emailAddress,
        organisationDetails: responseBody.organisationDetails,
        vatRegistrationNumber: responseBody.vatRegistrationNumber,
        // Include all other fields for completeness
        ...responseBody,
      };

      logger.info({
        message: "[HMRC Test User Creation] Test user created successfully",
        userId: testUser.userId,
        userFullName: testUser.userFullName,
        vatRegistrationNumber: testUser.vatRegistrationNumber,
        organisationName: testUser.organisationDetails?.name,
      });

      return testUser;
    } catch (error) {
      if (attempt < maxRetries && error.message && error.message.includes("429")) {
        // This handles edge cases where a 429 error propagates through an unexpected path
        const retryDelay = Math.pow(2, attempt + 1) * 1000 + Math.random() * 1000 - 500;
        logger.info({
          message: "[HMRC Test User Creation] Rate limited (429), retrying after error",
          attempt: attempt + 1,
          maxRetries,
          retryDelayMs: Math.round(retryDelay),
          error: error.message,
        });
        await new Promise((r) => setTimeout(r, retryDelay));
        continue;
      }
      logger.error({
        message: "[HMRC Test User Creation] Error creating test user",
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }
}

/**
 * Save HMRC test user details to JSON files
 * @param {Object} testUser - Test user details to save
 * @param {string} outputDir - Test-specific output directory for artifacts
 * @param {string} repoRoot - Repository root directory
 */
export function saveHmrcTestUserToFiles(testUser, outputDir, repoRoot) {
  logger.info({
    message: "[HMRC Test User] Saving test user details to JSON files",
    outputDir,
    repoRoot,
  });

  const testUserJson = JSON.stringify(testUser, null, 2);

  // Save to test-specific artifact directory
  try {
    if (outputDir) {
      fs.mkdirSync(outputDir, { recursive: true });
      const artifactPath = path.join(outputDir, "hmrc-test-user.json");
      fs.writeFileSync(artifactPath, testUserJson, "utf-8");
      logger.info({
        message: "[HMRC Test User] Saved test user to artifact directory",
        path: artifactPath,
      });
    }
  } catch (error) {
    logger.error({
      message: "[HMRC Test User] Failed to save test user to artifact directory",
      error: error.message,
      outputDir,
    });
  }

  // Save to repository root with consistent filename
  try {
    if (repoRoot) {
      const rootPath = path.join(repoRoot, "hmrc-test-user.json");
      fs.writeFileSync(rootPath, testUserJson, "utf-8");
      logger.info({
        message: "[HMRC Test User] Saved test user to repository root",
        path: rootPath,
      });
    }
  } catch (error) {
    logger.error({
      message: "[HMRC Test User] Failed to save test user to repository root",
      error: error.message,
      repoRoot,
    });
  }
}

/**
 * Fetch and log HMRC fraud prevention header validation feedback for sandbox tests.
 * This is a shared helper used by multiple behavior tests.
 * Returns the validation feedback result for inclusion in test reports.
 *
 * Note: This request is made directly from the test executor to HMRC, not through Lambda.
 * In CI environments without DynamoDB access, this is the only way to capture the feedback.
 *
 * @param {Object} page - Playwright page object
 * @param {Object} testInfo - Playwright test info object
 * @param {string} screenshotPath - Path for screenshots
 * @param {string} auditForUserSub - User sub for auditing to DynamoDB
 * @param {string} requestId - Optional request ID for auditing to DynamoDB
 * @param {string} traceparent - Optional traceparent for auditing to DynamoDB
 * @param {string} correlationId - Optional correlation ID for auditing to DynamoDB
 * @returns {Object|null} The validation feedback result, or null if not in sandbox mode or no token
 */
export async function checkFraudPreventionHeadersFeedback(
  page,
  testInfo,
  screenshotPath,
  auditForUserSub,
  requestId = undefined,
  traceparent = undefined,
  correlationId = undefined,
) {
  if (!isSandboxMode()) {
    console.log("[HMRC Fraud Prevention] Skipping fraud prevention header validation feedback check in non-sandbox mode");
    return null;
  } else {
    console.log(`[HMRC Fraud Prevention] Checking fraud prevention header validation feedback for user sub: ${auditForUserSub}`);
  }

  // Initialize salt for hashing (needed when getFraudPreventionHeadersFeedback stores to DynamoDB)
  // This is called from the test executor, not Lambda, so salt needs explicit initialization
  try {
    const { initializeSalt } = await import("@app/services/subHasher.js");
    await initializeSalt();
  } catch (e) {
    console.log(`[HMRC Fraud Prevention] Salt initialization skipped (this is OK for CI): ${e.message}`);
  }

  const { extractHmrcAccessTokenFromSessionStorage } = await import("./fileHelper.js");
  const { fetchFraudPreventionHeadersFeedback } = await import("../steps/behaviour-hmrc-vat-steps.js");

  const hmrcAccessToken = await extractHmrcAccessTokenFromSessionStorage(page, testInfo);
  if (hmrcAccessToken) {
    const result = await fetchFraudPreventionHeadersFeedback(
      hmrcAccessToken,
      screenshotPath,
      auditForUserSub,
      requestId,
      traceparent,
      correlationId,
    );
    return result;
  } else {
    console.warn("Could not retrieve HMRC access token from session storage for feedback check");
    return null;
  }
}

/**
 * Generate standard test period dates for VAT submission tests.
 * Returns dates matching the default open obligation in the http-simulator.
 * @returns {{ periodStart: string, periodEnd: string }} ISO date strings
 */
export function generatePeriodDates() {
  // Use the default open obligation from http-simulator (18A2: Q2 2017)
  return {
    periodStart: "2017-04-01",
    periodEnd: "2017-06-30",
  };
}

/**
 * Resolve a free TCP port by briefly binding to port 0 and releasing it. Behaviour test files
 * read TEST_SERVER_HTTP_PORT and DIY_SUBMIT_BASE_URL into module-level consts at import time,
 * before their beforeAll hook runs — too early for runLocalHttpServer to fix up in-process. The
 * test:submitVatBehaviour-simulator npm script resolves a port this same way, in a plain `node`
 * one-liner run before the test process starts (see package.json), so two concurrent runs bind
 * different ports instead of colliding on TEST_SERVER_HTTP_PORT=3000.
 * @returns {Promise<number>}
 */
export function getFreeTcpPort() {
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.unref();
    probe.on("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const { port } = probe.address();
      probe.close(() => resolve(port));
    });
  });
}
