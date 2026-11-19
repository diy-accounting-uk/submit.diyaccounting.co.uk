#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-138 Check every public video is embedded on the site
// - **Use when:** a video was published, replaced or deleted, or a new `publish.json` shipped, and every public channel video must still play from a page linked off videos.html.
// - **Does:** video-embed-check.js lists the YouTube channel's public uploads, loads the site's videos.html with Playwright, follows its area-page links and collects the embedded video ids. It reads the site's catalogue and environment name and applies the pages' listing rule, so a video whose activity the environment does not list is not expected on its pages. It fails, one line per problem, when a public channel video or a listed publish.json video is embedded nowhere, a group with a listed video has no linked area page, or oEmbed does not answer 200 for an embedded id. A public channel video that the environment holds back is a note, not a problem.
// - **Run:** `AWS_PROFILE=diya-submit-prod npm run video:embed-check`; `AWS_PROFILE=diya-submit-prod npm run video:embed-check -- --base <url>`
// - **Entry:** `scripts/video-embed-check.js`
// - **Files:** scripts/video-embed-check.js, app/unit-tests/scripts/videoEmbedCheck.test.js, scripts/youtube-upload.js, web/public/videos.html
// - **Keywords:** video embed check, embedded videos, oembed, public videos, area pages, channel uploads, videos.html
// - **Related:** OPS-93, OPS-94
// @end-capability

//
// Check that every public video on the DIY Accounting Submit YouTube channel is embedded on a
// page linked from <base>videos.html, that every video the live publish.json lists in the site's
// environment is embedded, that every group with a listed video has an area page, and that
// YouTube's oEmbed answers 200 for every embedded video. The pages list a video only when the
// environment lists its catalogue activity (listedVideos in publish-content.mjs, the rule of the
// page scripts), so a video of an activity still in preview elsewhere is held back on purpose.
//
// Usage: AWS_PROFILE=diya-submit-prod node scripts/video-embed-check.js [--base <url>]

import { fileURLToPath } from "url";
import { parseCatalog } from "../app/services/productCatalog.js";
import { listedVideos } from "./publish-content.mjs";
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

export function extractFacadeId(src) {
  const id = String(src).match(/\/vi\/([^/?#]+)\//)?.[1];
  return id ? decodeURIComponent(id) : null;
}

/** Video ids on one page: swapped-in iframes carry /embed/<id>, unclicked facades carry /vi/<id>/ thumbnails. */
export function extractPageVideoIds({ iframeSrcs, facadeSrcs }) {
  const ids = [...iframeSrcs.map(extractEmbedId), ...facadeSrcs.map(extractFacadeId)];
  return [...new Set(ids.filter(Boolean))];
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
 *   listedIds: Set<string>,
 *   environmentName: string,
 * }} input listedIds holds the manifest ids the site's environment lists
 * @returns {{rows: {id: string, videoId: string, page: string|null, ok: boolean}[], problems: string[], notes: string[]}}
 */
export function compareEmbeds({ channelVideos, manifestVideos, areaPages, embeds, oembedStatus, listedIds, environmentName }) {
  const problems = [];
  const notes = [];
  const rows = [];
  const manifestById = new Map(manifestVideos.filter((v) => v.videoId).map((v) => [v.videoId, v]));
  const isHeldBack = (entry) => entry !== undefined && !listedIds.has(entry.id);

  for (const video of channelVideos.filter((v) => v.privacyStatus === "public")) {
    if (embeds.has(video.videoId)) continue;
    const entry = manifestById.get(video.videoId);
    if (isHeldBack(entry)) {
      notes.push(
        `public channel video ${video.videoId} (${entry.id}) is held back: ${environmentName} does not list ${entry.catalogueActivity}`,
      );
    } else {
      problems.push(`public channel video ${video.videoId} (${video.title ?? "untitled"}) is embedded on no page`);
    }
  }

  for (const entry of manifestVideos.filter((v) => v.videoId && listedIds.has(v.id))) {
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

  // A group only needs a linked area page once one of its videos is uploaded and listed: the index
  // links an area page through its listed videos alone.
  const groups = [...new Set(manifestVideos.filter((v) => v.group && v.videoId && listedIds.has(v.id)).map((v) => v.group))];
  for (const group of groups) {
    if (!groupAreaPageMatches(group, areaPages)) problems.push(`manifest group ${group} has no area page linked from videos.html`);
  }

  return { rows, problems, notes };
}

export function formatReport({ rows, problems, notes = [] }) {
  const lines = rows.map((r) => `${r.ok ? "ok  " : "MISS"} ${r.id.padEnd(30)} ${r.videoId} ${r.page ?? "not embedded"}`);
  for (const n of notes) lines.push(`NOTE ${n}`);
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
      const iframeSrcs = await page.$$eval("iframe", (frames) => frames.map((f) => f.src));
      const facadeSrcs = await page.$$eval(".video-facade img", (images) => images.map((i) => i.src));
      for (const id of extractPageVideoIds({ iframeSrcs, facadeSrcs })) embeds.set(id, href);
    }
    return { areaPages, embeds };
  } finally {
    await browser.close();
  }
}

/** The site's environment name and the manifest ids its pages list there. */
export async function fetchListing({ base, manifest, fetchImpl = fetch }) {
  const read = async (file) => {
    const response = await fetchImpl(new URL(file, base).href);
    if (!response.ok) throw new Error(`Could not load ${base}${file}: ${response.status}`);
    return response.text();
  };
  const environmentName = (await read("submit.environment-name.txt")).trim();
  const catalog = parseCatalog(await read("submit.catalogue.toml"));
  const listedIds = new Set(listedVideos(manifest, catalog, environmentName).map((video) => video.id));
  return { environmentName, listedIds };
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
  const manifest = await manifestResponse.json();
  const manifestVideos = manifest.videos;
  const { environmentName, listedIds } = await fetchListing({ base, manifest });
  const { areaPages, embeds } = await collectSiteEmbeds({ base, chromium });
  const oembedStatus = await fetchOembedStatuses({ videoIds: [...embeds.keys()] });
  const result = compareEmbeds({ channelVideos, manifestVideos, areaPages, embeds, oembedStatus, listedIds, environmentName });
  console.log(formatReport(result));
  if (result.problems.length > 0) process.exit(1);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
