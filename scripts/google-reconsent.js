#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-183 Replace a Google refresh token or OAuth client without a gap
// - **Use when:** a Google refresh token (YouTube, Google Ads, Microsoft Ads sign-in) or the Desktop OAuth client secret needs replacing, and the old value must keep working until the new one is proven.
// - **Does:** google-reconsent.js runs the loopback consent with PKCE, checks the new refresh token with the read its real reader makes, writes it to its secret with the rotated-at tag, reads it back, and checks the stored value. It never revokes the old token, because a revoke ends the account's whole grant to the client and so every token the client holds. A failed step leaves the old token stored and exits non-zero. With --client-json it writes a new OAuth client JSON the same way and reports whether each stored refresh token still mints an access token. It prints step names and outcomes, never a token, a secret or a code.
// - **Run:** `AWS_PROFILE=diya-submit-prod node scripts/google-reconsent.js --token <youtube|ads|msads> [--dry-run]`; `AWS_PROFILE=diya-submit-prod node scripts/google-reconsent.js --client-json <path> [--dry-run]`
// - **Entry:** `scripts/google-reconsent.js`
// - **Files:** scripts/google-reconsent.js, app/unit-tests/scripts/googleReconsent.test.js, scripts/put-secret-with-rotation-tag.sh
// - **Keywords:** google refresh token, reconsent, rotate refresh token, oauth client secret roll, pkce, loopback consent
// - **Related:** OPS-93, OPS-45
// @end-capability

// Usage:
//   node scripts/google-reconsent.js --token <youtube|ads|msads> [--dry-run]
//   node scripts/google-reconsent.js --client-json <path> [--dry-run]
//
// --token replaces one refresh token. The order is fixed: consent, exchange, check the new token,
// write, read back, check the stored value. Nothing is written before the new token passes its
// check. --dry-run stops after the check of the new token and writes nothing.
//
// --client-json writes a new OAuth client JSON (the file the console downloads after Add Secret)
// to the client secret, then reports for each of the three stored refresh tokens whether it still
// mints an access token with the new client. --dry-run makes that report without the write.
//
// The secrets are in the prod account: run with AWS_PROFILE=diya-submit-prod and a live SSO session.

import fs from "node:fs";
import http from "node:http";
import crypto from "node:crypto";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";
import {
  OAUTH_SCOPES,
  fetchOwnChannel,
  channelHandlesMatch,
  parseConfig as parseYoutubeConfig,
  CONFIG_PATH as YOUTUBE_CONFIG_PATH,
} from "./youtube-upload.js";
import { parseConfig as parseAdsConfig } from "../infra/google/ads/ads-inventory.js";
import { parseConfig as parseMsadsConfig, parseDeveloperToken, callApi as callMsadsApi } from "../app/lib/microsoftAdsReporting.js";

export const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const TOKEN_NAMES = ["youtube", "ads", "msads"];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ADS_CONFIG_PATH = "infra/google/ads/ads.toml";
const MSADS_CONFIG_PATH = "infra/microsoft/ads/msads.toml";
const CONSENT_TIMEOUT_MS = 10 * 60 * 1000;

/** The step that failed, so the operator and the tests know whether the old token is still the only valid one. */
export class StepError extends Error {
  constructor(step, message, options) {
    super(message, options);
    this.name = "StepError";
    this.step = step;
  }
}

// --- Pure helpers ---

export function base64Url(buffer) {
  return Buffer.from(buffer).toString("base64url");
}

export function makePkcePair(randomBytes = crypto.randomBytes) {
  const verifier = base64Url(randomBytes(32));
  const challenge = base64Url(crypto.createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}

export function buildConsentUrl({ clientId, redirectUri, scopes, codeChallenge, state }) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: scopes.join(" "),
    access_type: "offline",
    prompt: "consent",
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state,
  });
  return `${AUTH_ENDPOINT}?${params.toString()}`;
}

export function parseArgs(argv) {
  const opts = { token: undefined, clientJson: undefined, dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--dry-run") opts.dryRun = true;
    else if (arg === "--token" || arg === "--client-json") {
      const value = argv[++i];
      if (!value) throw new Error(`${arg} requires an argument`);
      if (arg === "--token") opts.token = value;
      else opts.clientJson = value;
    } else throw new Error(`Unknown argument: ${arg}`);
  }
  if (opts.token && opts.clientJson) throw new Error("--token and --client-json are separate modes");
  if (!opts.token && !opts.clientJson) throw new Error("One of --token <youtube|ads|msads> or --client-json <path> is required");
  if (opts.token && !TOKEN_NAMES.includes(opts.token)) throw new Error(`--token must be one of ${TOKEN_NAMES.join(", ")}`);
  return opts;
}

/** Replaces every secret value in a line, so no code path can print one by accident. */
export function makeLogger(sink, secretValues) {
  return (line) => {
    let out = String(line);
    for (const value of secretValues()) {
      if (value && value.length >= 8) out = out.split(value).join("[redacted]");
    }
    sink(out);
  };
}

export function parseClientJson(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("The OAuth client value is not valid JSON");
  }
  const installed = parsed?.installed;
  if (!installed?.client_id || !installed?.client_secret) {
    throw new Error('The OAuth client JSON does not have the expected {"installed": {"client_id", "client_secret"}} shape');
  }
  return { client_id: installed.client_id, client_secret: installed.client_secret };
}

export function parseRefreshTokenSecret(raw) {
  const token = JSON.parse(raw)?.refresh_token;
  if (!token) throw new Error("The stored refresh token secret has no refresh_token field");
  return token;
}

// --- Token specs: where each token lives, its scopes and the read its reader makes ---

export function loadSpecs(root = REPO_ROOT) {
  const read = (relative) => fs.readFileSync(path.join(root, relative), "utf8");
  const youtube = parseYoutubeConfig(read(YOUTUBE_CONFIG_PATH));
  const ads = parseAdsConfig(read(ADS_CONFIG_PATH));
  const msads = parseMsadsConfig(read(MSADS_CONFIG_PATH));
  return {
    clientSecretName: youtube.clientSecretName,
    tokens: {
      youtube: {
        name: "youtube",
        secretName: youtube.refreshTokenSecretName,
        scopes: OAUTH_SCOPES,
        check: (ctx) => checkYoutube({ ...ctx, youtube }),
      },
      ads: {
        name: "ads",
        secretName: ads.refreshTokenSecretName,
        scopes: [ads.scope, ads.uploadScope],
        check: (ctx) => checkAds({ ...ctx, ads }),
      },
      msads: {
        name: "msads",
        secretName: msads.refreshTokenSecretName,
        scopes: msads.scope.split(" "),
        check: (ctx) => checkMsads({ ...ctx, msads }),
      },
    },
  };
}

async function checkYoutube({ accessToken, fetchImpl, youtube }) {
  const channel = await fetchOwnChannel({ accessToken, quotaProject: youtube.quotaProject, fetchImpl });
  if (!channelHandlesMatch(channel.handle, youtube.channelHandle)) {
    throw new Error(`The token resolves to channel ${channel.handle ?? "(none)"}, expected ${youtube.channelHandle}`);
  }
}

async function checkAds({ accessToken, fetchImpl, ads }) {
  const response = await fetchImpl(`https://googleads.googleapis.com/${ads.apiVersion}/customers/${ads.customerId}/googleAds:search`, {
    method: "POST",
    headers: { "Authorization": `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "SELECT customer.id FROM customer" }),
  });
  if (!response.ok) throw new Error(`The Google Ads customer read answered ${response.status}`);
}

async function checkMsads({ accessToken, fetchImpl, secrets, msads }) {
  const developerToken = parseDeveloperToken(await secrets.read(msads.developerTokenSecretName));
  const session = { config: msads, accessToken, developerToken, fetchImpl, withAccount: false };
  const body = await callMsadsApi(session, msads.customerManagementUrl, "/User/Query", { UserId: null });
  if (!body.User?.Id) throw new Error("The Microsoft Advertising user read returned no user");
}

// --- Google calls (the fetch implementation is injected) ---

async function postForm(fetchImpl, url, fields) {
  const response = await fetchImpl(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields),
  });
  let body = {};
  try {
    body = await response.json();
  } catch {
    body = {};
  }
  return { ok: response.ok, status: response.status, body };
}

function oauthError(prefix, result) {
  return new Error(`${prefix} (${result.status} ${typeof result.body.error === "string" ? result.body.error : "no error code"})`);
}

export async function exchangeCode({ fetchImpl, client, code, redirectUri, verifier }) {
  const result = await postForm(fetchImpl, TOKEN_ENDPOINT, {
    code,
    client_id: client.client_id,
    client_secret: client.client_secret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
    code_verifier: verifier,
  });
  if (!result.ok) throw oauthError("Google refused the authorization code", result);
  if (!result.body.refresh_token) throw new Error("Google returned no refresh token");
  return { refreshToken: result.body.refresh_token };
}

export async function mintAccessToken({ fetchImpl, client, refreshToken }) {
  const result = await postForm(fetchImpl, TOKEN_ENDPOINT, {
    client_id: client.client_id,
    client_secret: client.client_secret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (!result.ok || !result.body.access_token) throw oauthError("Google would not mint an access token", result);
  return { accessToken: result.body.access_token, scope: result.body.scope ?? "" };
}

// Google reports the OpenID Connect scopes profile and email as their full addresses.
const GRANTED_SCOPE_NAMES = {
  profile: "https://www.googleapis.com/auth/userinfo.profile",
  email: "https://www.googleapis.com/auth/userinfo.email",
};

/** Whether a requested scope is in Google's granted list, under its short or its full name. */
export function scopeGranted(requested, granted) {
  return granted.includes(requested) || granted.includes(GRANTED_SCOPE_NAMES[requested]);
}

/** Mints an access token, requires every scope to be granted, then makes the token's own read. */
export async function checkRefreshToken({ spec, fetchImpl, client, refreshToken, secrets }) {
  const { accessToken, scope } = await mintAccessToken({ fetchImpl, client, refreshToken });
  const granted = scope.split(" ");
  const missing = spec.scopes.filter((s) => !scopeGranted(s, granted));
  if (missing.length > 0) throw new Error(`The token lacks scopes: ${missing.join(" ")}`);
  await spec.check({ accessToken, fetchImpl, secrets });
}

// --- The order of the steps for one refresh token ---

async function step(name, log, fn) {
  try {
    const value = await fn();
    log(`step ${name}: ok`);
    return value;
  } catch (error) {
    log(`step ${name}: FAILED ${error.message}`);
    throw error instanceof StepError ? error : new StepError(name, error.message, { cause: error });
  }
}

/**
 * @param {object} input
 * @param {object} input.spec one entry of loadSpecs().tokens
 * @param {string} input.clientSecretName
 * @param {{read: Function, write: Function}} input.secrets
 * @param {typeof fetch} input.fetchImpl
 * @param {() => Promise<{redirectUri: string, waitForCode: (state: string) => Promise<string>, close: () => void}>} input.startLoopback
 * @param {boolean} input.dryRun
 * @param {(line: string) => void} input.log
 * @param {(secret: string) => void} input.remember registers a value the logger must hide
 * @returns {Promise<{replaced: boolean}>}
 */
export async function runReconsent({ spec, clientSecretName, secrets, fetchImpl, startLoopback, dryRun, log, remember = () => {} }) {
  const client = await step("read-client", log, async () => {
    const parsed = parseClientJson(await requireSecret(secrets, clientSecretName));
    remember(parsed.client_secret);
    return parsed;
  });

  const oldToken = await step("read-old-token", log, async () => {
    const raw = await secrets.read(spec.secretName);
    if (raw === null) return null;
    const token = parseRefreshTokenSecret(raw);
    remember(token);
    return token;
  });
  if (oldToken === null) log("no old token is stored");

  const { verifier, challenge } = makePkcePair();
  const state = base64Url(crypto.randomBytes(16));
  const code = await step("consent", log, async () => {
    const loopback = await startLoopback();
    try {
      const url = buildConsentUrl({
        clientId: client.client_id,
        redirectUri: loopback.redirectUri,
        scopes: spec.scopes,
        codeChallenge: challenge,
        state,
      });
      log(`Open this address and approve as the account owner:\n\n  ${url}\n`);
      const received = await loopback.waitForCode(state);
      remember(received);
      return { value: received, redirectUri: loopback.redirectUri };
    } finally {
      loopback.close();
    }
  });

  const { refreshToken: newToken } = await step("exchange", log, async () => {
    const result = await exchangeCode({ fetchImpl, client, code: code.value, redirectUri: code.redirectUri, verifier });
    remember(result.refreshToken);
    return result;
  });

  await step("check-new", log, () => checkRefreshToken({ spec, fetchImpl, client, refreshToken: newToken, secrets }));

  if (dryRun) {
    log("dry run: nothing written");
    return { replaced: false };
  }

  const newSecretValue = JSON.stringify({ refresh_token: newToken });
  await step("write", log, () => secrets.write(spec.secretName, newSecretValue));

  const rollBack = async () => {
    if (oldToken === null) return;
    try {
      await secrets.write(spec.secretName, JSON.stringify({ refresh_token: oldToken }));
      log("step rollback: ok the old token is stored again");
    } catch (error) {
      log(`step rollback: FAILED ${error.message}`);
    }
  };

  try {
    const stored = await step("read-back", log, async () => {
      const raw = await requireSecret(secrets, spec.secretName);
      if (raw !== newSecretValue) throw new Error("The stored value differs from the value written");
      return parseRefreshTokenSecret(raw);
    });
    await step("check-stored", log, () => checkRefreshToken({ spec, fetchImpl, client, refreshToken: stored, secrets }));
  } catch (error) {
    await rollBack();
    throw error;
  }

  // The old token is never revoked: Google's revoke ends the account's whole grant to this
  // client, which ends the new token and every other token the client holds for the account.
  return { replaced: true };
}

async function requireSecret(secrets, name) {
  const value = await secrets.read(name);
  if (value === null) throw new Error(`Secret ${name} does not exist`);
  return value;
}

// --- The client secret roll ---

/**
 * Writes a new OAuth client JSON, then reports whether each stored refresh token still mints an
 * access token with the new client. The check of the existing tokens runs against the new client
 * before the write, so a dry run gives the same answer without a write.
 */
export async function runClientRoll({ clientJsonRaw, specs, secrets, fetchImpl, dryRun, log, remember = () => {} }) {
  const newClient = await step("read-new-client", log, async () => {
    const parsed = parseClientJson(clientJsonRaw);
    remember(parsed.client_secret);
    return parsed;
  });
  await step("compare-client-id", log, async () => {
    const stored = parseClientJson(await requireSecret(secrets, specs.clientSecretName));
    remember(stored.client_secret);
    if (stored.client_id !== newClient.client_id) throw new Error("The new client has a different client id from the stored one");
  });

  const report = async (label) => {
    const outcomes = {};
    for (const name of TOKEN_NAMES) {
      const raw = await secrets.read(specs.tokens[name].secretName);
      if (raw === null) {
        outcomes[name] = "absent";
      } else {
        const token = parseRefreshTokenSecret(raw);
        remember(token);
        try {
          await mintAccessToken({ fetchImpl, client: newClient, refreshToken: token });
          outcomes[name] = "still mints an access token";
        } catch (error) {
          outcomes[name] = `no longer mints an access token (${error.message})`;
        }
      }
      log(`${label} ${name}: ${outcomes[name]}`);
    }
    return outcomes;
  };

  if (dryRun) {
    const outcomes = await report("existing token with the new client:");
    log("dry run: nothing written");
    return { written: false, outcomes };
  }

  const previousRaw = await requireSecret(secrets, specs.clientSecretName);
  await step("write", log, () => secrets.write(specs.clientSecretName, clientJsonRaw));
  try {
    await step("read-back", log, async () => {
      if ((await requireSecret(secrets, specs.clientSecretName)) !== clientJsonRaw)
        throw new Error("The stored value differs from the value written");
    });
  } catch (error) {
    await secrets.write(specs.clientSecretName, previousRaw);
    log("step rollback: ok the previous client is stored again");
    throw error;
  }
  const outcomes = await report("token after the client roll:");
  return { written: true, outcomes };
}

// --- Real clients ---

export function makeSecretsClient({ region = process.env.AWS_REGION || "eu-west-2", exec = execFileSync } = {}) {
  const sm = new SecretsManagerClient({ region });
  return {
    async read(name) {
      try {
        return (await sm.send(new GetSecretValueCommand({ SecretId: name }))).SecretString ?? null;
      } catch (error) {
        if (error.name === "ResourceNotFoundException") return null;
        throw error;
      }
    },
    async write(name, value) {
      exec(
        path.join(REPO_ROOT, "scripts/put-secret-with-rotation-tag.sh"),
        [name, value, "--description", "Google OAuth credential managed by scripts/google-reconsent.js"],
        {
          stdio: ["ignore", "ignore", "inherit"],
        },
      );
    },
  };
}

export async function startLoopbackListener({ timeoutMs = CONSENT_TIMEOUT_MS } = {}) {
  let resolveCode;
  let rejectCode;
  let expectedState;
  const codePromise = new Promise((resolve, reject) => {
    resolveCode = resolve;
    rejectCode = reject;
  });
  codePromise.catch(() => {});
  const server = http.createServer((req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const code = url.searchParams.get("code");
    const error = url.searchParams.get("error");
    if (!code && !error) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/plain" });
    if (error) {
      res.end("Consent was refused. Close this tab.");
      rejectCode(new Error(`Google reported consent error ${error}`));
    } else if (url.searchParams.get("state") !== expectedState) {
      res.end("Unexpected state. Close this tab.");
      rejectCode(new Error("The redirect carried a different state value"));
    } else {
      res.end("Consent received. Close this tab.");
      resolveCode(code);
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const redirectUri = `http://127.0.0.1:${server.address().port}/`;
  return {
    redirectUri,
    waitForCode(state) {
      expectedState = state;
      const timer = setTimeout(() => rejectCode(new Error("No consent within 10 minutes")), timeoutMs);
      return codePromise.finally(() => clearTimeout(timer));
    },
    close() {
      server.close();
      server.closeAllConnections?.();
    },
  };
}

export async function main(argv = process.argv.slice(2)) {
  const opts = parseArgs(argv);
  const known = new Set();
  const log = makeLogger(
    (line) => console.log(line),
    () => known,
  );
  const remember = (value) => known.add(value);
  const specs = loadSpecs();
  const secrets = makeSecretsClient();
  if (opts.clientJson) {
    await runClientRoll({
      clientJsonRaw: fs.readFileSync(opts.clientJson, "utf8"),
      specs,
      secrets,
      fetchImpl: fetch,
      dryRun: opts.dryRun,
      log,
      remember,
    });
    return;
  }
  await runReconsent({
    spec: specs.tokens[opts.token],
    clientSecretName: specs.clientSecretName,
    secrets,
    fetchImpl: fetch,
    startLoopback: () => startLoopbackListener(),
    dryRun: opts.dryRun,
    log,
    remember,
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof StepError ? `Failed at step ${error.step}: ${error.message}` : error.message);
    process.exit(1);
  });
}
