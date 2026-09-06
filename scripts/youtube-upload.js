#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Upload the videos drafted in videos/publish.json to https://www.youtube.com/@DIYAccountingSubmit.
//
// Usage: node scripts/youtube-upload.js [--check] [--public]
//
// Credentials come from gcloud's Application Default Credentials, never from an OAuth client
// created by hand in the Google Cloud console. Sign in once, as the channel owner:
//
//   gcloud auth application-default login --scopes=https://www.googleapis.com/auth/cloud-platform,https://www.googleapis.com/auth/youtube.upload,https://www.googleapis.com/auth/youtube.force-ssl
//
// That writes ~/.config/gcloud/application_default_credentials.json, an "authorized_user"
// credential owned by gcloud (never this repository). GoogleAuth (google-auth-library) finds
// it automatically; this script never stores a token of its own.
//
// The YouTube Data API bills quota to a Google Cloud project with youtube.googleapis.com
// enabled, so every request here carries an x-goog-user-project header naming that project -
// default diyaccounting-ga4, overridable with the GOOGLE_CLOUD_QUOTA_PROJECT env var.
//
// --check obtains a token, looks up the signed-in channel and prints its title, without
// uploading anything.
//
// Uploads are unlisted by default. Pass --public to publish publicly instead.
// Re-running is safe: an entry that already carries a videoId is skipped.

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleAuth } from "google-auth-library";

export const PUBLISH_LIST_PATH = path.resolve("videos/publish.json");

export const ADC_SCOPES = [
  "https://www.googleapis.com/auth/cloud-platform",
  "https://www.googleapis.com/auth/youtube.upload",
  "https://www.googleapis.com/auth/youtube.force-ssl",
];

export const ADC_LOGIN_COMMAND = `gcloud auth application-default login --scopes=${ADC_SCOPES.join(",")}`;

export const DEFAULT_QUOTA_PROJECT = "diyaccounting-ga4";

const CHANNELS_ENDPOINT = "https://www.googleapis.com/youtube/v3/channels";
const UPLOAD_VIDEOS_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/videos";
const UPLOAD_CAPTIONS_ENDPOINT = "https://www.googleapis.com/upload/youtube/v3/captions";

export function parseArgs(argv) {
  return { publicVideo: argv.includes("--public"), check: argv.includes("--check") };
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

// Mirrors the well-known file location google-auth-library checks for Application Default
// Credentials, so a missing-credential error can name the exact file it looked for.
export function resolveAdcPath(env = process.env) {
  if (env.GOOGLE_APPLICATION_CREDENTIALS) return env.GOOGLE_APPLICATION_CREDENTIALS;
  const home = process.platform === "win32" ? env.APPDATA : env.HOME;
  return home ? path.join(home, ".config", "gcloud", "application_default_credentials.json") : null;
}

function missingAdcMessage(adcPath) {
  const where = adcPath ? ` (expected at ${adcPath})` : "";
  return `No Application Default Credentials found${where}. Run:\n\n  ${ADC_LOGIN_COMMAND}\n\nthen sign in as the channel owner.`;
}

function scopelessAdcMessage(adcPath) {
  return `Application Default Credentials at ${adcPath} do not carry the YouTube scope. Run:\n\n  ${ADC_LOGIN_COMMAND}\n\nthen sign in as the channel owner.`;
}

export async function getAccessToken({ env = process.env, GoogleAuthImpl = GoogleAuth } = {}) {
  const adcPath = resolveAdcPath(env);
  if (!adcPath || !fs.existsSync(adcPath)) {
    throw new Error(missingAdcMessage(adcPath));
  }
  console.log(`using application default credentials from ${adcPath}`);
  const auth = new GoogleAuthImpl({ scopes: ADC_SCOPES });
  const client = await auth.getClient();
  let token;
  try {
    ({ token } = await client.getAccessToken());
  } catch (error) {
    if (/invalid_scope|insufficient/i.test(error.message)) {
      throw new Error(scopelessAdcMessage(adcPath));
    }
    throw error;
  }
  if (!token) {
    throw new Error(scopelessAdcMessage(adcPath));
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
    throw new Error("Application Default Credentials are valid but no YouTube channel is linked to this account.");
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
  const { publicVideo, check } = parseArgs(process.argv.slice(2));
  const quotaProject = resolveQuotaProject();
  const accessToken = await getAccessToken();

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
