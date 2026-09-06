#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Upload the videos drafted in videos/publish.json to https://www.youtube.com/@DIYAccountingSubmit.
//
// Usage: node scripts/youtube-upload.js [--public]
//
// Requires YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in the environment, from an
// OAuth 2.0 client of type "Desktop app" in the Google Cloud console, with the
// https://www.googleapis.com/auth/youtube.upload scope enabled.
//
// On first run this prints a consent URL. Open it, sign in, and grant access. The
// browser then redirects to a localhost address that refuses the connection - that
// is expected, because this script has no server listening there. Copy the address
// from the browser's address bar (or just the "code" value in it) and paste it back
// into this terminal. The resulting refresh token is stored at
// ~/.config/diyaccounting/youtube-token.json, never in this repository, so later
// runs need no further consent.
//
// Uploads are unlisted by default. Pass --public to publish publicly instead.
// Re-running is safe: an entry that already carries a videoId is skipped.

import fs from "fs";
import os from "os";
import path from "path";
import readline from "readline";
import { fileURLToPath } from "url";

export const PUBLISH_LIST_PATH = path.resolve("videos/publish.json");
export const TOKEN_PATH = path.join(os.homedir(), ".config", "diyaccounting", "youtube-token.json");

const OAUTH_SCOPE = "https://www.googleapis.com/auth/youtube.upload";
const OAUTH_REDIRECT_URI = "http://127.0.0.1:8912/oauth2callback";
const OAUTH_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const OAUTH_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const UPLOAD_VIDEOS_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos";
const UPLOAD_CAPTIONS_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/captions";

export function parseArgs(argv) {
  return { publicVideo: argv.includes("--public") };
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

export function requireEnv(name, env = process.env) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Missing ${label}: ${filePath}`);
  }
}

function loadStoredToken(tokenPath) {
  if (!fs.existsSync(tokenPath)) return null;
  return JSON.parse(fs.readFileSync(tokenPath, "utf8"));
}

function saveStoredToken(token, tokenPath) {
  fs.mkdirSync(path.dirname(tokenPath), { recursive: true });
  fs.writeFileSync(tokenPath, JSON.stringify(token, null, 2) + "\n", { mode: 0o600 });
}

export function buildConsentUrl(clientId) {
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: OAUTH_REDIRECT_URI,
    response_type: "code",
    scope: OAUTH_SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `${OAUTH_AUTH_ENDPOINT}?${params.toString()}`;
}

export function extractAuthorizationCode(input) {
  const trimmed = input.trim();
  try {
    const url = new URL(trimmed);
    const code = url.searchParams.get("code");
    if (code) return code;
  } catch {
    // Not a URL - treat the whole input as the code.
  }
  return trimmed;
}

async function promptForCode(consentUrl) {
  console.log("Open this URL, sign in, and grant access:");
  console.log(consentUrl);
  console.log("");
  console.log("The browser then redirects to a localhost address that refuses the connection - that is expected.");
  console.log('Paste the full address from the browser\'s address bar (or just the "code" value) below:');
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const answer = await new Promise((resolve) => rl.question("> ", resolve));
  rl.close();
  return extractAuthorizationCode(answer);
}

async function exchangeCodeForToken({ clientId, clientSecret, code, fetchImpl }) {
  const response = await fetchImpl(OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: OAUTH_REDIRECT_URI,
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to exchange authorization code: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

async function refreshAccessToken({ clientId, clientSecret, refreshToken, fetchImpl }) {
  const response = await fetchImpl(OAUTH_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!response.ok) {
    throw new Error(`Failed to refresh access token: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function ensureAccessToken({ clientId, clientSecret, tokenPath = TOKEN_PATH, fetchImpl = fetch, prompt = promptForCode }) {
  const stored = loadStoredToken(tokenPath);
  if (stored?.refreshToken) {
    const refreshed = await refreshAccessToken({ clientId, clientSecret, refreshToken: stored.refreshToken, fetchImpl });
    return refreshed.access_token;
  }
  const code = await prompt(buildConsentUrl(clientId));
  const token = await exchangeCodeForToken({ clientId, clientSecret, code, fetchImpl });
  if (!token.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Revoke the app's access at https://myaccount.google.com/permissions and run this again.",
    );
  }
  saveStoredToken({ refreshToken: token.refresh_token }, tokenPath);
  return token.access_token;
}

async function initiateResumableUpload({ accessToken, resource, fileSize, mimeType, fetchImpl }) {
  const response = await fetchImpl(`${UPLOAD_VIDEOS_ENDPOINT}?uploadType=resumable&part=snippet,status`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
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

export async function uploadVideo({ entry, accessToken, publicVideo, fetchImpl = fetch }) {
  const resource = buildVideoResource(entry, { publicVideo });
  const fileSize = fs.statSync(entry.videoFile).size;
  const uploadUrl = await initiateResumableUpload({ accessToken, resource, fileSize, mimeType: "video/mp4", fetchImpl });
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

export async function uploadCaption({ entry, videoId, accessToken, fetchImpl = fetch }) {
  const metadata = { snippet: { videoId, language: "en", name: "English", isDraft: false } };
  const { body, contentType } = buildMultipartRelated([
    { contentType: "application/json; charset=UTF-8", body: JSON.stringify(metadata) },
    { contentType: "text/vtt", body: fs.readFileSync(entry.captionFile) },
  ]);
  const response = await fetchImpl(`${UPLOAD_CAPTIONS_ENDPOINT}?uploadType=multipart&part=snippet`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": contentType, "Content-Length": String(body.length) },
    body,
  });
  if (!response.ok) {
    throw new Error(`Failed to upload caption for ${entry.id}: ${response.status} ${await response.text()}`);
  }
  return response.json();
}

export async function main() {
  const { publicVideo } = parseArgs(process.argv.slice(2));
  const clientId = requireEnv("YOUTUBE_CLIENT_ID");
  const clientSecret = requireEnv("YOUTUBE_CLIENT_SECRET");

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

  const accessToken = await ensureAccessToken({ clientId, clientSecret });

  for (const entry of pending) {
    console.log(`Uploading ${entry.id} (${publicVideo ? "public" : "unlisted"})...`);
    const videoId = await uploadVideo({ entry, accessToken, publicVideo });
    console.log(`  video id: ${videoId}`);
    await uploadCaption({ entry, videoId, accessToken });
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
