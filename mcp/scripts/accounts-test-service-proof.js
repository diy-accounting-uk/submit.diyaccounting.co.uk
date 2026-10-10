// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// accounts-test-service-proof.js -- files derived micro-entity accounts through the submission
// MCP, over stdio, to the Companies House XML Gateway test service, on the proxy lane with no AWS write.
//
// Run it as `npm run mcp:accounts-test-service-proof` from the repository root. That script supplies
// the proxy environment (.env.proxy) and the test gateway environment. The presenter id and code are
// resolved from Secrets Manager by the proxy server under the AWS_PROFILE in use (diya-submit-ci).
//
// The script starts dynalite, a mock OAuth2 server carrying the MCP client (mock-oauth2-config.json,
// issuer "oauth2", the Cognito-shaped /oauth2/authorize and /oauth2/token paths auth.js uses) and the
// proxy's Express server, then drives the MCP server as a client would: sign_in, open_book,
// derive_micro_entity_accounts, preview_micro_entity_accounts, submit_micro_entity_accounts and
// poll_accounts_submission. The test service answers every accounts poll PENDING, so the proof is the
// gateway's acknowledgement at submit and PENDING on each poll. Every process it started is stopped on
// exit. MCP_PROOF_TRANSCRIPT names a file that receives the script's own lines (no token, secret,
// presenter credential or company authentication code is among them).

import { spawn, spawnSync } from "node:child_process";
import { chmodSync, createWriteStream, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const REPOSITORY_ROOT = resolve(import.meta.dirname, "../..");
const BOOK_DIRECTORY = join(REPOSITORY_ROOT, "mcp/test/fixtures/brickwork-pro-ltd-vat");
const CASES_FILE = join(REPOSITORY_ROOT, "scripts/fixtures/companies-house-test-service-cases.json");
const CASE_NAME = "micro-entity-accounts";
const POLL_BUDGET = 5;
const MIN_POLL_DELAY_MS = 1000;
const MAX_POLL_DELAY_MS = 30_000;
const GATEWAY_ENVIRONMENT = [
  "COMPANIES_HOUSE_XMLGW_URI",
  "COMPANIES_HOUSE_PRESENTER_ID_ARN",
  "COMPANIES_HOUSE_PRESENTER_CODE_ARN",
  "COMPANIES_HOUSE_GATEWAY_TEST",
  "COMPANIES_HOUSE_PACKAGE_REFERENCE",
];
const MCP_CLIENT_ID = "diya-submit-mcp-proxy";
const MOCK_OAUTH2_PORT = 8081;
const MOCK_OAUTH2_CONTAINER = "diya-mcp-accounts-proof-mock-oauth2";
const MOCK_OAUTH2_IMAGE = "ghcr.io/navikt/mock-oauth2-server:3.0.1";
const REQUIRED_FREE_PORTS = [3443, 9000, MOCK_OAUTH2_PORT];
const MCP_SESSION_USER = "mcp-proxy-user";
const MCP_SESSION_EMAIL = "mcp-proxy-user@example.com";

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
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- docker comes from the developer's PATH
  if (startedMockContainer) spawnSync("docker", ["stop", MOCK_OAUTH2_CONTAINER], { stdio: "ignore" });
}

async function portIsListening(port) {
  const { default: net } = await import("node:net");
  return new Promise((resolve) => {
    const socket = net.connect({ port, host: "127.0.0.1" });
    socket.once("connect", () => {
      socket.destroy();
      resolve(true);
    });
    socket.once("error", () => resolve(false));
  });
}

async function waitFor(label, probe, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await probe().catch(() => false)) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
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

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function dayAfter(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

async function main() {
  const logDirectory = mkdtempSync(join(tmpdir(), "diya-mcp-accounts-proof-logs-"));
  process.env.MCP_PROOF_LOG_DIR = logDirectory;
  const baseUrl = process.env.DIY_SUBMIT_BASE_URL?.replace(/\/$/, "");
  if (!baseUrl) throw new Error("DIY_SUBMIT_BASE_URL must be set; run npm run mcp:accounts-test-service-proof");
  const missingGatewayVariables = GATEWAY_ENVIRONMENT.filter((name) => !process.env[name]);
  if (missingGatewayVariables.length > 0) {
    throw new Error(`${missingGatewayVariables.join(", ")} must be set; run npm run mcp:accounts-test-service-proof`);
  }
  const fixture = JSON.parse(readFileSync(CASES_FILE, "utf8")).find((testCase) => testCase.name === CASE_NAME);
  if (!fixture?.companyAuthCode || !fixture.companyNumber) throw new Error(`${CASES_FILE} has no usable case ${CASE_NAME}`);
  for (const port of REQUIRED_FREE_PORTS) {
    if (await portIsListening(port)) throw new Error(`Port ${port} is already in use`);
  }

  say(
    `Proxy lane proof: derived micro-entity accounts filed through the submission MCP to the Companies House XML Gateway test service (${new Date().toISOString()})`,
  );

  start("dynalite", "node", ["app/bin/dynamodb.js"], process.env);
  if (!process.env.AWS_PROFILE) throw new Error("AWS_PROFILE must be set so the proxy server can read the presenter secrets");
  // Only the DynamoDB endpoint is redirected to dynalite; Secrets Manager is reached for real under AWS_PROFILE.
  const dynamoEndpoint = "http://127.0.0.1:9000";
  const proxyEnvironment = {
    ...process.env,
    AWS_REGION: "eu-west-2",
    AWS_ENDPOINT_URL_DYNAMODB: dynamoEndpoint,
    OPERATOR_EMAILS: MCP_SESSION_EMAIL,
    TEST_MOCK_OAUTH2_BASE: `http://localhost:${MOCK_OAUTH2_PORT}`,
  };
  await waitFor("dynalite", () => portIsListening(9000), 30_000);

  const dockerRun = spawnSync(
    // eslint-disable-next-line sonarjs/no-os-command-from-path -- docker comes from the developer's PATH
    "docker",
    [
      "run",
      "--rm",
      "-d",
      "--name",
      MOCK_OAUTH2_CONTAINER,
      "-p",
      `${MOCK_OAUTH2_PORT}:8080`,
      "-e",
      "JSON_CONFIG_PATH=/config/mock-oauth2-config.json",
      "-v",
      `${join(REPOSITORY_ROOT, "mock-oauth2-config.json")}:/config/mock-oauth2-config.json:ro`,
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

  const workDirectory = mkdtempSync(join(tmpdir(), "diya-mcp-accounts-proof-"));
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

  const client = new Client({ name: "accounts-test-service-proof", version: "1.0.0" });
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

    const authorised = { "Authorization": `Bearer ${sessionBearer}`, "Content-Type": "application/json" };
    const issued = await fetch(`${baseUrl}/api/v1/pass/admin`, {
      method: "POST",
      headers: authorised,
      body: JSON.stringify({ passTypeId: "resident-pro-test-pass", bundleId: "resident-pro" }),
    });
    if (!issued.ok) throw new Error(`Issuing the resident-pro test pass answered HTTP ${issued.status}`);
    const passCode = (await issued.json()).code;
    if (!passCode) throw new Error("Issuing the resident-pro test pass answered no code");
    const redeemed = await fetch(`${baseUrl}/api/v1/pass`, {
      method: "POST",
      headers: authorised,
      body: JSON.stringify({ code: passCode }),
    });
    if (!redeemed.ok) throw new Error(`Redeeming the resident-pro test pass answered HTTP ${redeemed.status}`);
    say("bundle: resident-pro granted to the session user by a test pass");

    const opened = await callTool(client, "open_book", { path: BOOK_DIRECTORY });
    say(`open_book: ${opened.entity?.name ?? opened.entity ?? "book"} (${opened.lines ?? opened.lineCount ?? "?"} lines)`);

    const derived = await callTool(client, "derive_micro_entity_accounts");
    say(`derive_micro_entity_accounts: ${derived.companyName} period ${derived.periodStart} to ${derived.periodEnd}`);
    say(`derived balance sheet: ${JSON.stringify(derived.balanceSheet)}`);

    const filing = {
      companyNumber: fixture.companyNumber,
      companyName: derived.companyName,
      periodStart: derived.periodStart,
      periodEnd: derived.periodEnd,
      balanceSheet: derived.balanceSheet,
      averageEmployees: derived.averageNumberOfEmployees,
      director: { name: derived.directorName, dateApproved: dayAfter(derived.periodEnd) },
      statementsAccepted: {
        section477Exemption: true,
        membersNotRequiredAudit: true,
        directorsResponsibilities: true,
        microEntityProvisions: true,
      },
    };

    const previewed = await callTool(client, "preview_micro_entity_accounts", filing);
    say(`preview_micro_entity_accounts: ${Object.keys(previewed).join(", ")}`);

    const submitted = await callTool(client, "submit_micro_entity_accounts", { ...filing, companyAuthCode: fixture.companyAuthCode });
    if (!submitted.submissionNumber)
      throw new Error(`submit_micro_entity_accounts answered no submissionNumber: ${JSON.stringify(submitted)}`);
    say(
      `submit_micro_entity_accounts: company ${fixture.companyNumber}, submissionNumber ${submitted.submissionNumber}, gatewayTimestamp ${submitted.gatewayTimestamp}`,
    );

    let delayMs = Math.min(Math.max(Number(submitted.pollInterval) * 1000 || MIN_POLL_DELAY_MS, MIN_POLL_DELAY_MS), MAX_POLL_DELAY_MS);
    for (let poll = 1; poll <= POLL_BUDGET; poll++) {
      await sleep(delayMs);
      const polled = await callTool(client, "poll_accounts_submission", { submissionNumber: submitted.submissionNumber });
      say(`poll_accounts_submission ${poll}/${POLL_BUDGET}: statusCode ${polled.statusCode}, submissionNumber ${polled.submissionNumber}`);
      if (polled.statusCode !== "PENDING")
        throw new Error(`Poll ${poll} answered ${polled.statusCode}, expected PENDING: ${JSON.stringify(polled)}`);
      if (Number(polled.pollInterval) > 0)
        delayMs = Math.min(Math.max(Number(polled.pollInterval) * 1000, MIN_POLL_DELAY_MS), MAX_POLL_DELAY_MS);
    }

    await callTool(client, "sign_out");
    say("sign_out: refresh token revoked and local credentials removed");
  } finally {
    await client.close();
    rmSync(workDirectory, { recursive: true, force: true });
  }
}

try {
  await main();
  say("Result: acknowledged at submit, PENDING on every poll");
} catch (error) {
  say(`Result: failed: ${error.message}`);
  process.exitCode = 1;
} finally {
  stopEverything();
  if (process.env.MCP_PROOF_TRANSCRIPT) writeFileSync(process.env.MCP_PROOF_TRANSCRIPT, `${transcript.join("\n")}\n`);
  if (process.env.MCP_PROOF_LOG_DIR) say(`Process logs (not part of the transcript): ${process.env.MCP_PROOF_LOG_DIR}`);
}
