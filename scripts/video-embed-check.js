#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

//
// Check that every public video on the DIY Accounting Submit YouTube channel is embedded on a
// page linked from <base>videos.html, that every video in the live publish.json is embedded,
// that every publish.json group has an area page, and that YouTube's oEmbed answers 200 for
// every embedded video.
//
// Usage: AWS_PROFILE=diya-submit-prod node scripts/video-embed-check.js [--base <url>]

import { fileURLToPath } from "url";
import { obtainAccessToken, resolveQuotaProject } from "./youtube-upload.js";

export const DEFAULT_BASE_URL = "https://submit.diyaccounting.co.uk/";
const API = "https://www.googleapis.com/youtube/v3";
const OEMBED = "https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=";

export function parseArgs(argv) {
  const args = { base: DEFAULT_BASE_URL };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--base") {
      const value = argv[++i];
      if (!value) throw new Error("--base needs a URL");
      args.base = value.endsWith("/") ? value : `${value}/`;
    } else {
      throw new Error(`Unknown argument: ${argv[i]}`);
    }
  }
  return args;
}

const AREA_PAGE_SUFFIX = { "vat": "vat", "itsa": "itsa", "account": "account", "companies-house": "ch", "accounting": "accounting" };

/** The linked area page a manifest group is shown on, or null. */
export function groupAreaPageMatches(group, areaPages) {
  const suffix = AREA_PAGE_SUFFIX[String(group).toLowerCase()];
  if (!suffix) return null;
  return areaPages.find((page) => new RegExp(`(^|/)videos-(.+-)?${suffix}\\.html$`).test(page)) ?? null;
}

export function extractEmbedId(src) {
  const id = String(src).split("/embed/")[1]?.split(/[?#]/)[0];
  return id ? decodeURIComponent(id) : null;
}

/**
 * Compare what the channel, the manifest and the site say.
 *
 * @param {{
 *   channelVideos: {videoId: string, title?: string, privacyStatus: string}[],
 *   manifestVideos: {id: string, group?: string, videoId?: string|null}[],
 *   areaPages: string[],
 *   embeds: Map<string, string>,
 *   oembedStatus: Map<string, number>,
 * }} input
 * @returns {{rows: {id: string, videoId: string, page: string|null, ok: boolean}[], problems: string[]}}
 */
export function compareEmbeds({ channelVideos, manifestVideos, areaPages, embeds, oembedStatus }) {
  const problems = [];
  const rows = [];
  const manifestById = new Map(manifestVideos.filter((v) => v.videoId).map((v) => [v.videoId, v]));

  for (const video of channelVideos.filter((v) => v.privacyStatus === "public")) {
    if (!embeds.has(video.videoId)) {
      problems.push(`public channel video ${video.videoId} (${video.title ?? "untitled"}) is embedded on no page`);
    }
  }

  for (const entry of manifestVideos.filter((v) => v.videoId)) {
    const page = embeds.get(entry.videoId) ?? null;
    const status = oembedStatus.get(entry.videoId);
    let ok = true;
    if (!page) {
      ok = false;
      problems.push(`manifest video ${entry.id} (${entry.videoId}) is embedded on no page`);
    }
    if (page && status !== 200) {
      ok = false;
      problems.push(`oEmbed for ${entry.id} (${entry.videoId}) answered ${status ?? "nothing"}, not 200`);
    }
    rows.push({ id: entry.id, videoId: entry.videoId, page, ok });
  }

  for (const [videoId, page] of embeds) {
    if (manifestById.has(videoId)) continue;
    const status = oembedStatus.get(videoId);
    if (status !== 200) problems.push(`oEmbed for embedded ${videoId} on ${page} answered ${status ?? "nothing"}, not 200`);
  }

  // A group only needs a linked area page once one of its videos is uploaded: the index links an
  // area page through its published videos alone.
  const groups = [...new Set(manifestVideos.filter((v) => v.group && v.videoId).map((v) => v.group))];
  for (const group of groups) {
    if (!groupAreaPageMatches(group, areaPages)) problems.push(`manifest group ${group} has no area page linked from videos.html`);
  }

  return { rows, problems };
}

export function formatReport({ rows, problems }) {
  const lines = rows.map((r) => `${r.ok ? "ok  " : "MISS"} ${r.id.padEnd(30)} ${r.videoId} ${r.page ?? "not embedded"}`);
  for (const p of problems) lines.push(`PROBLEM ${p}`);
  const okCount = rows.filter((r) => r.ok).length;
  lines.push(`${rows.length} videos, ${okCount} embedded and playable, ${problems.length} problems`);
  return lines.join("\n");
}

async function getJson(url, { accessToken, quotaProject, fetchImpl }) {
  const response = await fetchImpl(url, { headers: { "Authorization": `Bearer ${accessToken}`, "x-goog-user-project": quotaProject } });
  if (!response.ok) throw new Error(`YouTube request failed: ${response.status} ${await response.text()}`);
  return response.json();
}

/** Every upload on the signed-in channel with its privacy status and title. */
export async function listChannelVideos({ accessToken, quotaProject, fetchImpl = fetch }) {
  const auth = { accessToken, quotaProject, fetchImpl };
  const channels = await getJson(`${API}/channels?part=contentDetails&mine=true`, auth);
  const uploads = channels.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploads) throw new Error("The signed-in channel has no uploads playlist.");
  const ids = [];
  let pageToken = "";
  do {
    const page = await getJson(`${API}/playlistItems?part=contentDetails&maxResults=50&playlistId=${uploads}&pageToken=${pageToken}`, auth);
    for (const item of page.items ?? []) ids.push(item.contentDetails.videoId);
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  const videos = [];
  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50);
    const data = await getJson(`${API}/videos?part=snippet,status&id=${batch.join(",")}`, auth);
    for (const item of data.items ?? []) {
      videos.push({ videoId: item.id, title: item.snippet?.title, privacyStatus: item.status?.privacyStatus });
    }
  }
  return videos;
}

/** Load videos.html, follow its area-page links, and collect each embedded video id with its page. */
export async function collectSiteEmbeds({ base, chromium }) {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto(new URL("videos.html", base).href, { waitUntil: "networkidle" });
    const hrefs = await page.$$eval("a[href*='videos-']", (as) => as.map((a) => a.getAttribute("href").split("#")[0]));
    const areaPages = [...new Set(hrefs)];
    const embeds = new Map();
    for (const href of areaPages) {
      await page.goto(new URL(href, base).href, { waitUntil: "networkidle" });
      const srcs = await page.$$eval("iframe", (frames) => frames.map((f) => f.src));
      for (const src of srcs) {
        const id = extractEmbedId(src);
        if (id) embeds.set(id, href);
      }
    }
    return { areaPages, embeds };
  } finally {
    await browser.close();
  }
}

export async function fetchOembedStatuses({ videoIds, fetchImpl = fetch }) {
  const statuses = new Map();
  for (const id of videoIds) {
    const response = await fetchImpl(`${OEMBED}${id}`);
    statuses.set(id, response.status);
  }
  return statuses;
}

export async function main(argv = process.argv.slice(2)) {
  const { base } = parseArgs(argv);
  const { chromium } = await import("playwright");
  const accessToken = await obtainAccessToken({});
  const quotaProject = resolveQuotaProject();
  const channelVideos = await listChannelVideos({ accessToken, quotaProject });
  const manifestResponse = await fetch(new URL("videos/publish.json", base).href);
  if (!manifestResponse.ok) throw new Error(`Could not load ${base}videos/publish.json: ${manifestResponse.status}`);
  const manifestVideos = (await manifestResponse.json()).videos;
  const { areaPages, embeds } = await collectSiteEmbeds({ base, chromium });
  const oembedStatus = await fetchOembedStatuses({ videoIds: [...embeds.keys()] });
  const result = compareEmbeds({ channelVideos, manifestVideos, areaPages, embeds, oembedStatus });
  console.log(formatReport(result));
  if (result.problems.length > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
