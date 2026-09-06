#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Upload the videos drafted in videos/publish.json to https://www.youtube.com/@DIYAccountingSubmit.
//
// Usage: node scripts/youtube-upload.js [--check] [--public] [--client-file <path>]
//        node scripts/youtube-upload.js --store-client <path>
//
// Credentials come from an OAuth client of our own (type Desktop app), created once in the
// Google Cloud console — see videos/PUBLISH.md. Google blocks gcloud's own OAuth client from
// requesting YouTube scopes, and a client created through the IAP API is locked to IAP, so this
// project needs its own.
//
// The client's id and secret (the JSON file the console downloads, shaped
// {"installed": {"client_id", "client_secret", ...}}) come from one of two places:
//   --client-file <path>   reads that JSON file directly
//   (no flag)               reads it from AWS Secrets Manager secret prod/submit/youtube/oauth_client
//                            in the submit-prod account
//
// --store-client <path> reads the downloaded JSON and writes it to that secret (creating it if
// it doesn't exist yet), then exits. That is the only way the client id and secret reach AWS —
// no id is ever typed or copied by hand.
//
// The first run (or any run after the stored refresh token secret is deleted) opens a browser
// for consent via the OAuth loopback flow: a local HTTP server on a free port receives the
// authorization code, exchanges it for tokens with access_type=offline and prompt=consent, and
// stores the refresh token in Secrets Manager secret prod/submit/youtube/refresh_token. Every
// later run reads that secret and never prompts.
//
// The YouTube Data API bills quota to a Google Cloud project with youtube.googleapis.com
// enabled, so every request here carries an x-goog-user-project header naming that project -
// default diyaccounting-ga4, overridable with the GOOGLE_CLOUD_QUOTA_PROJECT env var.
//
// --check obtains a token, looks up the signed-in channel and prints its title, without
// uploading anything. It's the first thing to run after consent, to prove the credential works.
//
// Uploads are unlisted by default. Pass --public to publish publicly instead.
// Re-running is safe: an entry that already carries a videoId is skipped.

import fs from "fs";
import path from "path";
import http from "node:http";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "url";
import { OAuth2Client } from "google-auth-library";
import { SecretsManagerClient, GetSecretValueCommand, UpdateSecretCommand, CreateSecretCommand } from "@aws-sdk/client-secrets-manager";

export const PUBLISH_LIST_PATH = path.resolve("videos/publish.json");

export const OAUTH_SCOPES = ["https://www.googleapis.com/auth/youtube.upload", "https://www.googleapis.com/auth/youtube.force-ssl"];

export const CLIENT_SECRET_NAME = "prod/submit/youtube/oauth_client";
export const REFRESH_TOKEN_SECRET_NAME = "prod/submit/youtube/refresh_token";

export const DEFAULT_QUOTA_PROJECT = "diyaccounting-ga4";

const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";
const UPLOAD_VIDEOS_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos";
const UPLOAD_CAPTIONS_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/captions";

export function parseArgs(argv) {
  return {
    publicVideo: argv.includes("--public"),
    check: argv.includes("--check"),
    clientFile: readFlagValue(argv, "--client-file"),
    storeClient: readFlagValue(argv, "--store-client"),
  };
}

function readFlagValue(argv, flag) {
  const index = argv.indexOf(flag);
  if (index === -1) {
    return undefined;
  }
  const value = argv[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a path argument`);
  }
  return value;
}

export function loadPublishList(filePath = PUBLISH_LIST_PATH) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Publish list not found: ${filePath}`);
  }
  const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
  if (!Array.isArray(parsed.videos)) {
    throw new Error(`Publish list at ${filePath} has no "videos" array`);
  }
  return parsed;
}

export function savePublishList(list, filePath = PUBLISH_LIST_PATH) {
  fs.writeFileSync(filePath, JSON.stringify(list, null, 2) + "\n");
}

export function selectPendingUploads(list) {
  return list.videos.filter((entry) => entry.publish === true && !entry.videoId);
}

export function recordVideoId(list, id, videoId) {
  return { ...list, videos: list.videos.map((entry) => (entry.id === id ? { ...entry, videoId } : entry)) };
}

export function buildVideoResource(entry, { publicVideo }) {
  return {
    snippet: {
      title: entry.title,
      description: entry.description,
      tags: entry.tags,
      categoryId: entry.categoryId,
    },
    status: {
      privacyStatus: publicVideo ? "public" : "unlisted",
      selfDeclaredMadeForKids: false,
    },
  };
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

export function resolveQuotaProject(env = process.env) {
  return env.GOOGLE_CLOUD_QUOTA_PROJECT || DEFAULT_QUOTA_PROJECT;
}

let cachedSecretsManagerClient = null;

function getSecretsManagerClient() {
  if (!cachedSecretsManagerClient) {
    cachedSecretsManagerClient = new SecretsManagerClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cachedSecretsManagerClient;
}

async function readSecret({ smClient, secretId }) {
  try {
    const result = await smClient.send(new GetSecretValueCommand({ SecretId: secretId }));
    return result.SecretString;
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      return null;
    }
    throw error;
  }
}

async function readSecretRequired({ smClient, secretId, notFoundMessage }) {
  const value = await readSecret({ smClient, secretId });
  if (value === null) {
    throw new Error(notFoundMessage);
  }
  return value;
}

// Secrets Manager has no upsert call: try an update first (the common case, once the secret
// exists) and only create it when that fails because it doesn't exist yet.
async function writeSecret({ smClient, secretId, secretString, description }) {
  try {
    await smClient.send(new UpdateSecretCommand({ SecretId: secretId, SecretString: secretString }));
  } catch (error) {
    if (error.name !== "ResourceNotFoundException") {
      throw error;
    }
    await smClient.send(new CreateSecretCommand({ Name: secretId, SecretString: secretString, Description: description }));
  }
}

export async function storeClientCredentials({ clientFile, smClient = getSecretsManagerClient() }) {
  const raw = fs.readFileSync(clientFile, "utf8");
  const parsed = JSON.parse(raw);
  if (!parsed.installed || !parsed.installed.client_id || !parsed.installed.client_secret) {
    throw new Error(`${clientFile} does not look like a Desktop OAuth client JSON (expected an "installed" object with client_id and client_secret)`);
  }
  await writeSecret({
    smClient,
    secretId: CLIENT_SECRET_NAME,
    secretString: raw,
    description: "YouTube Data API OAuth Desktop client for the video upload script",
  });
  console.log(`Stored the OAuth client credentials in Secrets Manager secret ${CLIENT_SECRET_NAME}`);
}

export async function resolveClientCredentials({ clientFile, smClient } = {}) {
  const raw = clientFile
    ? fs.readFileSync(clientFile, "utf8")
    : await readSecretRequired({
        smClient,
        secretId: CLIENT_SECRET_NAME,
        notFoundMessage: `No OAuth client credentials found in Secrets Manager secret ${CLIENT_SECRET_NAME}. Download a Desktop OAuth client JSON from the Google Cloud console and run:\n\n  node scripts/youtube-upload.js --store-client <path-to-downloaded-json>`,
      });
  const parsed = JSON.parse(raw);
  const installed = parsed.installed;
  if (!installed || !installed.client_id || !installed.client_secret) {
    throw new Error(`OAuth client credentials from ${clientFile || CLIENT_SECRET_NAME} do not have the expected {"installed": {"client_id", "client_secret"}} shape`);
  }
  return { client_id: installed.client_id, client_secret: installed.client_secret };
}

function getFreeTcpPort() {
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

function waitForAuthorizationCode({ port, redirectUri }) {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      const error = url.searchParams.get("error");
      const code = url.searchParams.get("code");
      if (error) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(`Consent failed: ${error}`);
        server.close();
        reject(new Error(`Google consent failed: ${error}`));
        return;
      }
      if (!code) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("No authorization code in the request");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Signed in. You can close this tab and return to the terminal.");
      server.close();
      resolve(code);
    });
    server.listen(port, "127.0.0.1");
  });
}

function openInBrowser(url) {
  const platform = process.platform;
  const [command, args] = platform === "darwin" ? ["open", [url]] : platform === "win32" ? ["cmd", ["/c", "start", "", url]] : ["xdg-open", [url]];
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {}); // best effort: the URL above is already printed for opening by hand
  child.unref();
}

// The loopback flow for Desktop OAuth clients: a local HTTP server receives the authorization
// code Google redirects to, so nothing but this machine ever sees it.
export async function runLoopbackConsent({ clientCredentials, scopes = OAUTH_SCOPES, OAuth2ClientImpl = OAuth2Client, openUrl = openInBrowser } = {}) {
  const port = await getFreeTcpPort();
  const redirectUri = `http://127.0.0.1:${port}/`;
  const oAuth2Client = new OAuth2ClientImpl({ clientId: clientCredentials.client_id, clientSecret: clientCredentials.client_secret, redirectUri });
  const authUrl = oAuth2Client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: scopes });

  const codePromise = waitForAuthorizationCode({ port, redirectUri });
  console.log(`Open this URL to sign in as the channel owner:\n\n  ${authUrl}\n`);
  openUrl(authUrl);
  const code = await codePromise;

  const { tokens } = await oAuth2Client.getToken({ code, redirect_uri: redirectUri });
  if (!tokens.refresh_token) {
    throw new Error("Google did not return a refresh token. Revoke the app's access at https://myaccount.google.com/permissions and run again so Google issues a fresh one.");
  }
  return tokens.refresh_token;
}

export async function obtainAccessToken({
  clientFile,
  smClient = getSecretsManagerClient(),
  OAuth2ClientImpl = OAuth2Client,
  runConsentFlow = runLoopbackConsent,
} = {}) {
  const clientCredentials = await resolveClientCredentials({ clientFile, smClient });
  const storedRefreshTokenJson = await readSecret({ smClient, secretId: REFRESH_TOKEN_SECRET_NAME });

  let refreshToken;
  if (storedRefreshTokenJson) {
    console.log(`using the stored refresh token from Secrets Manager secret ${REFRESH_TOKEN_SECRET_NAME}`);
    refreshToken = JSON.parse(storedRefreshTokenJson).refresh_token;
  } else {
    console.log("no stored refresh token found; starting the browser consent flow");
    refreshToken = await runConsentFlow({ clientCredentials, OAuth2ClientImpl });
    await writeSecret({
      smClient,
      secretId: REFRESH_TOKEN_SECRET_NAME,
      secretString: JSON.stringify({ refresh_token: refreshToken }),
      description: "YouTube Data API refresh token for the video upload script",
    });
    console.log(`stored the refresh token in Secrets Manager secret ${REFRESH_TOKEN_SECRET_NAME}`);
  }

  const oAuth2Client = new OAuth2ClientImpl({ clientId: clientCredentials.client_id, clientSecret: clientCredentials.client_secret });
  oAuth2Client.setCredentials({ refresh_token: refreshToken });
  const { token } = await oAuth2Client.getAccessToken();
  if (!token) {
    throw new Error(`Google did not return an access token for the stored refresh token. Delete Secrets Manager secret ${REFRESH_TOKEN_SECRET_NAME} and run again to re-consent.`);
  }
  return token;
}

export async function fetchOwnChannelTitle({ accessToken, quotaProject, fetchImpl = fetch }) {
  const response = await fetchImpl(`${CHANNELS_ENDPOINT}?part=snippet&mine=true`, {
    headers: { Authorization: `Bearer ${accessToken}`, "x-goog-user-project": quotaProject },
  });
  if (!response.ok) {
    throw new Error(`Failed to look up the signed-in channel: ${response.status} ${await response.text()}`);
  }
  const data = await response.json();
  const channel = data.items && data.items[0];
  if (!channel) {
    throw new Error("The signed-in account has no YouTube channel linked to it.");
  }
  return channel.snippet.title;
}

async function initiateResumableUpload({ accessToken, quotaProject, resource, fileSize, mimeType, fetchImpl }) {
  const response = await fetchImpl(`${UPLOAD_VIDEOS_ENDPOINT}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-goog-user-project": quotaProject,
      "Content-Type": "application/json; charset=UTF-8",
      "X-Upload-Content-Length": String(fileSize),
      "X-Upload-Content-Type": mimeType,
    },
    body: JSON.stringify(resource),
  });
  if (!response.ok) {
    throw new Error(`Failed to start resumable upload: ${response.status} ${await response.text()}`);
  }
  const location = response.headers.get("location");
  if (!location) {
    throw new Error("Resumable upload did not return a Location header");
  }
  return location;
}

export async function uploadVideo({ entry, accessToken, quotaProject = resolveQuotaProject(), publicVideo, fetchImpl = fetch }) {
  const resource = buildVideoResource(entry, { publicVideo });
  const fileSize = fs.statSync(entry.videoFile).size;
  const uploadUrl = await initiateResumableUpload({ accessToken, quotaProject, resource, fileSize, mimeType: "video/mp4", fetchImpl });
  const response = await fetchImpl(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(fileSize) },
    body: fs.readFileSync(entry.videoFile),
  });
  if (!response.ok) {
    throw new Error(`Failed to upload video for ${entry.id}: ${response.status} ${await response.text()}`);
  }
  const video = await response.json();
  if (!video.id) {
    throw new Error(`Upload for ${entry.id} did not return a video id`);
  }
  return video.id;
}

function buildMultipartRelated(parts) {
  const boundary = `diyaccounting-${Date.now().toString(16)}`;
  const segments = [];
  for (const part of parts) {
    segments.push(Buffer.from(`--${boundary}\r\nContent-Type: ${part.contentType}\r\n\r\n`));
    segments.push(Buffer.isBuffer(part.body) ? part.body : Buffer.from(part.body));
    segments.push(Buffer.from("\r\n"));
  }
  segments.push(Buffer.from(`--${boundary}--`));
  return { body: Buffer.concat(segments), contentType: `multipart/related; boundary=${boundary}` };
}

export async function uploadCaption({ entry, videoId, accessToken, quotaProject = resolveQuotaProject(), fetchImpl = fetch }) {
  const metadata = { snippet: { videoId, language: "en", name: "English", isDraft: false } };
  const { body, contentType } = buildMultipartRelated([
    { contentType: "application/json; charset=UTF-8", body: JSON.stringify(metadata) },
    { contentType: "text/vtt", body: fs.readFileSync(entry.captionFile) },
  ]);
  const response = await fetchImpl(`${UPLOAD_CAPTIONS_ENDPOINT}?uploadType=multipart&part=snippet`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "x-goog-user-project": quotaProject,
      "Content-Type": contentType,
      "Content-Length": String(body.length),
    },
    body,
  });
  if (!response.ok) {
    throw new Error(`Failed to upload caption for ${entry.id}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function main() {
  const { publicVideo, check, clientFile, storeClient } = parseArgs(process.argv.slice(2));

  if (storeClient) {
    await storeClientCredentials({ clientFile: storeClient });
    return;
  }

  const quotaProject = resolveQuotaProject();
  const accessToken = await obtainAccessToken({ clientFile });

  if (check) {
    const title = await fetchOwnChannelTitle({ accessToken, quotaProject });
    console.log(`Signed in as channel: ${title}`);
    return;
  }

  let list = loadPublishList();
  const pending = selectPendingUploads(list);
  if (pending.length === 0) {
    console.log("Nothing to upload: every publish:true entry already has a videoId.");
    return;
  }

  for (const entry of pending) {
    requireFile(entry.videoFile, `video file for ${entry.id}`);
    requireFile(entry.captionFile, `caption file for ${entry.id}`);
  }

  for (const entry of pending) {
    console.log(`Uploading ${entry.id} (${publicVideo ? "public" : "unlisted"})...`);
    const videoId = await uploadVideo({ entry, accessToken, quotaProject, publicVideo });
    console.log(`  video id: ${videoId}`);
    await uploadCaption({ entry, videoId, accessToken, quotaProject });
    console.log("  caption uploaded");
    list = recordVideoId(list, entry.id, videoId);
    savePublishList(list);
    console.log(`  https://youtu.be/${videoId}`);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
