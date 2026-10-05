// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// vat-sandbox-proof.js -- files a VAT return derived from an example book through the
// submission MCP, over stdio, against HMRC's sandbox, on the proxy lane with no AWS write.
//
// Run it as `npm run mcp:vat-sandbox-proof` from the repository root. That script supplies the
// proxy environment (.env.proxy) and the HMRC sandbox client secret (scripts/proxy-secrets.sh).
//
// The script starts dynalite, a mock OAuth2 server carrying the MCP client (mock-oauth2-config.json,
// issuer "oauth2", the Cognito-shaped /oauth2/authorize and /oauth2/token paths auth.js uses) and the
// proxy's Express server, then drives the MCP server as a client would: sign_in, open_book,
// derive_vat_return, list_vat_obligations, submit_vat_return, get_vat_receipt, sign_out. The HMRC
// sandbox test user is created through the sandbox API and consents through a headless browser.
// Every process it started is stopped on exit. MCP_PROOF_TRANSCRIPT names a file that receives the
// script's own lines (no token, secret or password is among them).

import { spawn, spawnSync } from "node:child_process";
import { chmodSync, createWriteStream, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { buildAuthorizeUrl, getAuthorizationCode } from "../../scripts/lib/hmrcAuthorizationCode.js";
import { createHmrcTestUser } from "../../scripts/create-hmrc-test-user.js";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../..");
const BOOK_DIRECTORY = join(REPOSITORY_ROOT, "mcp/test/fixtures/brickwork-pro-ltd-vat");
const BOOK_PERIOD_END = "2025-09-30";
const MCP_CLIENT_ID = "diya-submit-mcp-proxy";
const MOCK_OAUTH2_PORT = 8081;
const MOCK_OAUTH2_CONTAINER = "diya-mcp-vat-proof-mock-oauth2";
const MOCK_OAUTH2_IMAGE = "ghcr.io/navikt/mock-oauth2-server:3.0.1";
const REQUIRED_FREE_PORTS = [3443, 9000, MOCK_OAUTH2_PORT];
const MCP_SESSION_USER = "mcp-proxy-user";

const transcript = [];
function say(line) {
  transcript.push(line);
  console.log(line);
}

const startedProcesses = [];
let startedMockContainer = false;

function start(label, command, args, environment) {
  const logDirectory = process.env.MCP_PROOF_LOG_DIR;
  const child = spawn(command, args, { cwd: REPOSITORY_ROOT, env: environment, detached: true, stdio: ["ignore", "pipe", "pipe"] });
  const sink = createWriteStream(join(logDirectory, `${label}.log`));
  child.stdout.pipe(sink);
  child.stderr.pipe(sink);
  startedProcesses.push({ label, child });
  return child;
}

function stopEverything() {
  for (const { child } of startedProcesses) {
    try {
      process.kill(-child.pid, "SIGTERM");
    } catch {
      // already exited
    }
  }
  if (startedMockContainer) spawnSync("docker", ["stop", MOCK_OAUTH2_CONTAINER], { stdio: "ignore" });
}

async function portIsListening(port) {
  const { default: net } = await import("node:net");
  return new Promise((done) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      done(true);
    });
    socket.once("error", () => done(false));
  });
}

async function waitFor(label, probe, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe().catch(() => false)) return;
    await new Promise((done) => setTimeout(done, 500));
  }
  throw new Error(`${label} was not ready within ${timeoutMs} ms`);
}

// The stand-in for the operator's browser: auth.js hands the authorize URL to the platform's
// `open`. This one answers the mock's interactive login form with a user and follows the redirect
// to auth.js's loopback listener, so sign_in completes unattended.
function writeBrowserStandIn(directory) {
  const path = join(directory, "open");
  writeFileSync(
    path,
    `#!/usr/bin/env node
const authorizeUrl = process.argv[2];
const form = new URLSearchParams({ username: ${JSON.stringify(MCP_SESSION_USER)}, claims: "{}" });
const response = await fetch(authorizeUrl, { method: "POST", redirect: "manual", body: form, headers: { "content-type": "application/x-www-form-urlencoded" } });
const location = response.headers.get("location");
if (!location) { console.error("the mock login answered HTTP " + response.status + " with no redirect"); process.exit(1); }
await fetch(location);
`,
  );
  chmodSync(path, 0o755);
}

function textOf(result) {
  return result.content?.map((part) => part.text ?? "").join("") ?? "";
}

async function callTool(client, name, args = {}) {
  const result = await client.callTool({ name, arguments: args });
  if (result.isError) throw new Error(`${name} failed: ${textOf(result)}`);
  return result.structuredContent;
}

async function main() {
  const logDirectory = mkdtempSync(join(tmpdir(), "diya-mcp-vat-proof-logs-"));
  process.env.MCP_PROOF_LOG_DIR = logDirectory;
  const secret = process.env.HMRC_SANDBOX_CLIENT_SECRET;
  const clientId = process.env.HMRC_SANDBOX_CLIENT_ID;
  const baseUrl = process.env.DIY_SUBMIT_BASE_URL?.replace(/\/$/, "");
  if (!secret || !clientId || !baseUrl) {
    throw new Error("HMRC_SANDBOX_CLIENT_SECRET, HMRC_SANDBOX_CLIENT_ID and DIY_SUBMIT_BASE_URL must be set; run npm run mcp:vat-sandbox-proof");
  }
  for (const port of REQUIRED_FREE_PORTS) {
    if (await portIsListening(port)) throw new Error(`Port ${port} is already in use`);
  }

  say(`Proxy lane proof: derived VAT return filed through the submission MCP to HMRC's sandbox (${new Date().toISOString()})`);

  start("dynalite", "node", ["app/bin/dynamodb.js"], process.env);
  const dynamoEndpoint = "http://127.0.0.1:9000";
  const proxyEnvironment = {
    ...process.env,
    AWS_REGION: "us-east-1",
    AWS_ACCESS_KEY_ID: "dummy",
    AWS_SECRET_ACCESS_KEY: "dummy",
    AWS_ENDPOINT_URL: dynamoEndpoint,
    AWS_ENDPOINT_URL_DYNAMODB: dynamoEndpoint,
    TEST_MOCK_OAUTH2_BASE: `http://localhost:${MOCK_OAUTH2_PORT}`,
  };
  await waitFor("dynalite", () => portIsListening(9000), 30_000);

  const dockerRun = spawnSync(
    "docker",
    [
      "run", "--rm", "-d", "--name", MOCK_OAUTH2_CONTAINER,
      "-p", `${MOCK_OAUTH2_PORT}:8080`,
      "-e", "JSON_CONFIG_PATH=/config/mock-oauth2-config.json",
      "-v", `${join(REPOSITORY_ROOT, "mock-oauth2-config.json")}:/config/mock-oauth2-config.json:ro`,
      MOCK_OAUTH2_IMAGE,
    ],
    { encoding: "utf8" },
  );
  if (dockerRun.status !== 0) throw new Error(`docker run failed: ${dockerRun.stderr}`);
  startedMockContainer = true;
  const authDomain = `http://localhost:${MOCK_OAUTH2_PORT}`;
  await waitFor("the mock OAuth2 server", async () => (await fetch(`${authDomain}/oauth2/.well-known/openid-configuration`)).ok, 60_000);

  start("server", "node", ["app/bin/server.js"], proxyEnvironment);
  await waitFor("the proxy server", async () => (await fetch(`${baseUrl}/submit.env`)).ok, 90_000);
  say(`Proxy server ${baseUrl}, mock OAuth2 ${authDomain} (issuer oauth2, client ${MCP_CLIENT_ID}), dynalite ${dynamoEndpoint}`);

  const workDirectory = mkdtempSync(join(tmpdir(), "diya-mcp-vat-proof-"));
  const shimDirectory = join(workDirectory, "bin");
  mkdirSync(shimDirectory);
  writeBrowserStandIn(shimDirectory);
  const mcpEnvironment = {
    ...process.env,
    PATH: `${shimDirectory}${delimiter}${process.env.PATH}`,
    DIYA_SUBMIT_AUTH_DOMAIN: authDomain,
    DIYA_SUBMIT_MCP_CLIENT_ID: MCP_CLIENT_ID,
    DIYA_SUBMIT_BASE_URL: baseUrl,
    DIYA_SUBMIT_CONFIG_DIR: join(workDirectory, "config"),
  };

  const client = new Client({ name: "vat-sandbox-proof", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({
      command: "node",
      args: [join(REPOSITORY_ROOT, "mcp/bin/diya-submit-mcp.js")],
      env: Object.fromEntries(Object.entries(mcpEnvironment).filter(([, value]) => value !== undefined)),
      stderr: "ignore",
    }),
  );

  try {
    await callTool(client, "sign_in");
    say("sign_in: signed in to the mock OAuth2 server by PKCE on the loopback redirect");

    const credentials = JSON.parse((await import("node:fs")).readFileSync(join(workDirectory, "config", "credentials.json"), "utf8"));
    const sessionBearer = credentials.accessToken;
    const claims = JSON.parse(Buffer.from(sessionBearer.split(".")[1], "base64url").toString());
    say(`session bearer claims: sub=${claims.sub} client_id=${claims.client_id}`);

    const grant = await fetch(`${baseUrl}/api/v1/bundle`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${sessionBearer}`, "Content-Type": "application/json" },
      body: JSON.stringify({ bundleId: "day-guest" }),
    });
    if (!grant.ok) throw new Error(`Granting the day-guest bundle answered HTTP ${grant.status}`);
    say("bundle: day-guest granted to the session user");

    const opened = await callTool(client, "open_book", { path: BOOK_DIRECTORY });
    say(`open_book: ${opened.entity?.name ?? opened.entity ?? "book"} (${opened.lines ?? opened.lineCount ?? "?"} lines)`);

    const derived = await callTool(client, "derive_vat_return", { periodEnd: BOOK_PERIOD_END });
    say(`derive_vat_return: period ${derived.periodStart} to ${derived.periodEnd} for book VRN ${derived.vatRegistrationNumber}`);
    say(`derived boxes: ${JSON.stringify(derived.hmrc)}`);

    const testUser = await createHmrcTestUser(clientId, secret, { serviceNames: ["mtd-vat"] });
    say(`HMRC sandbox test user created: VRN ${testUser.vrn} (organisation ${testUser.organisationDetails?.name ?? "n/a"})`);

    const redirectUri = `${baseUrl}/activities/submitVatCallback.html`;
    const { code } = await getAuthorizationCode({
      authorizeUrl: buildAuthorizeUrl({
        sandboxBase: process.env.HMRC_SANDBOX_BASE_URI,
        clientId,
        redirectUri,
        scope: "write:vat read:vat",
        state: "mcp-vat-sandbox-proof",
      }),
      redirectUri,
      userId: testUser.userId,
      password: testUser.password,
      outDir: workDirectory,
      label: "mcp-vat-sandbox-proof",
    });
    say("HMRC sandbox consent: authorisation code obtained for write:vat read:vat");

    const exchange = await fetch(`${baseUrl}/api/v1/hmrc/token`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${sessionBearer}`, "Content-Type": "application/json", "hmrcAccount": "synthetic" },
      body: JSON.stringify({ code }),
    });
    const exchanged = await exchange.json();
    if (!exchange.ok) throw new Error(`The HMRC token exchange answered HTTP ${exchange.status}: ${exchanged.message ?? exchanged.error}`);
    const hmrcAccessToken = exchanged.hmrcAccessToken;
    if (!hmrcAccessToken) throw new Error("The HMRC token exchange answered no hmrcAccessToken");
    say("HMRC token exchange: access token held in memory");

    const listed = await callTool(client, "list_vat_obligations", { vrn: testUser.vrn, status: "O", hmrcAccessToken, hmrcAccount: "synthetic" });
    const obligations = listed.obligations ?? listed.hmrcResponse?.obligations ?? listed.hmrcResponseBody?.obligations;
    const open = obligations?.find((obligation) => obligation.status === "O");
    if (!open) throw new Error(`HMRC listed no open obligation for VRN ${testUser.vrn}`);
    say(`list_vat_obligations: ${obligations.length} listed; filing the open one ${open.start} to ${open.end} (periodKey ${open.periodKey})`);

    const submitted = await callTool(client, "submit_vat_return", {
      vatNumber: testUser.vrn,
      periodStart: open.start,
      periodEnd: open.end,
      hmrcAccessToken,
      hmrcAccount: "synthetic",
      allowSyntheticObligations: true,
      vatDueSales: derived.hmrc.vatDueSales,
      vatDueAcquisitions: derived.hmrc.vatDueAcquisitions,
      vatReclaimedCurrPeriod: derived.hmrc.vatReclaimedCurrPeriod,
      totalValueSalesExVAT: derived.hmrc.totalValueSalesExVAT,
      totalValuePurchasesExVAT: derived.hmrc.totalValuePurchasesExVAT,
      totalValueGoodsSuppliedExVAT: derived.hmrc.totalValueGoodsSuppliedExVAT,
      totalAcquisitionsExVAT: derived.hmrc.totalAcquisitionsExVAT,
    });
    say(`submit_vat_return: periodKey ${submitted.periodKey}, receiptId ${submitted.receiptId}`);
    say(`HMRC receipt: ${JSON.stringify(submitted.receipt)}`);

    const stored = await callTool(client, "get_vat_receipt", { name: `${submitted.receiptId}.json` });
    say(`get_vat_receipt: ${JSON.stringify(stored)}`);

    await callTool(client, "sign_out");
    say("sign_out: refresh token revoked and local credentials removed");
  } finally {
    await client.close();
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

try {
  await main();
  say("Result: filed");
} catch (error) {
  say(`Result: failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  stopEverything();
  if (process.env.MCP_PROOF_TRANSCRIPT) writeFileSync(process.env.MCP_PROOF_TRANSCRIPT, `${transcript.join("\n")}\n`);
  if (process.env.MCP_PROOF_LOG_DIR) say(`Process logs (not part of the transcript): ${process.env.MCP_PROOF_LOG_DIR}`);
}
