#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-213 Write the videos, the bundles and the home activity list into the deployed pages for the environment
// - **Use when:** the deployed videos pages and the bundles page must hold, in their HTML, only the videos and bundles that the environment lists, for a crawler or an assistant that runs no JavaScript.
// - **Does:** publish-content.mjs fills the marked block of videos.html, the five videos-*.html pages, bundles.html, index.html and cy/index.html in a built web root. The home block holds one link for each activity that a signed-out visitor sees, grouped by area, by the rule of catalog-service.js. A video page block holds each listed video's title, description, thumbnail and one VideoObject JSON-LD block. The bundles block holds each listed bundle's name, price and the activities it files. It adds a video:video entry per listed video to the pages' sitemap.xml entries. The listing rule is the rule of the page scripts: an item that names a catalogue activity shows where the activity lists the environment, a bundle where its listedInEnvironments lists it. The page scripts replace the block when they run. It is a pure function of the web root's files and the environment name. deploy-stacks.yml, deploy-app.yml and deploy-app.js run it after publish-sitemap.mjs.
// - **Run:** `node scripts/publish-content.mjs <web-root> <environment-name>`
// - **Entry:** `scripts/publish-content.mjs:renderVideoPageBlock`; `scripts/publish-content.mjs:renderBundlesBlock`
// - **Files:** scripts/publish-content.mjs, scripts/page-markers.mjs, app/unit-tests/scripts/publishContent.test.js, scripts/deploy-app.js, .github/workflows/deploy-stacks.yml, .github/workflows/deploy-app.yml, web/public/videos.html, web/public/bundles.html, web/public/index.html, web/public/cy/index.html
// - **Keywords:** home page, activities, videos, bundles, prices, video object, video sitemap, json-ld, no javascript, crawler, catalogue environments
// - **Related:** OPS-143, SITE-31
// @end-capability

// Usage: node scripts/publish-content.mjs <web-root> <environment-name>   (the deploy workflows and deploy-app.js)
// Run it after publish-sitemap.mjs, which removes the sitemap entries of pages the environment does not list.

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isActivityListedInEnvironment,
  isBundleListedInEnvironment,
  parseCatalog,
  getBundlePrices,
} from "../app/services/productCatalog.js";
import {
  activityArea,
  activityName,
  activityPagePath,
  areaName,
  isActivityShown,
  tokenCostLabel,
} from "../web/public/lib/services/catalog-service.js";
import { AREA_PAGES, FEATURED_IDS } from "../web/public/widgets/video-pages.js";
import { escapeHtml, replaceBetweenMarkers } from "./page-markers.mjs";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SITE_ORIGIN = "https://submit.diyaccounting.co.uk";
const EMBED_BASE = "https://www.youtube-nocookie.com/embed/";
const THUMBNAIL_BASE = "https://i.ytimg.com/vi/";
const WATCH_BASE = "https://youtu.be/";
const INDEX_PAGE = "videos.html";
const OWN_HOSTS = new Set([
  "submit.diyaccounting.co.uk",
  "spreadsheets.diyaccounting.co.uk",
  "diyaccounting.co.uk",
  "www.diyaccounting.co.uk",
  "diya-gl.co.uk",
]);
const TOKEN_PATTERN = /\{\{video:([a-z0-9-]+)\}\}|https?:\/\/[^\s<>"]+/g;
const MANIFEST_PATHS = ["web/public/videos/publish.json", "videos/publish.json"];
const SITEMAP_VIDEO_NAMESPACE = 'xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"';

/** The videos the page scripts list in an environment: published to YouTube, and listed by their catalogue activity. */
export function listedVideos(manifest, catalog, environmentName) {
  const activities = catalog.activities ?? [];
  const isListed = (activityId) => {
    if (!activityId) return true;
    const activity = activities.find((candidate) => candidate.id === activityId);
    return activity !== undefined && isActivityListedInEnvironment(activity, environmentName);
  };
  return manifest.videos.filter((video) => video?.videoId).filter((video) => isListed(video.catalogueActivity));
}

/** The videos one of the six videos pages shows: the featured ones on the index, one group on an area page. */
export function videosOfPage(page, videos) {
  if (page === INDEX_PAGE) return videos.filter((video) => FEATURED_IDS.includes(video.id));
  const group = Object.entries(AREA_PAGES).find(([, areaPage]) => areaPage === page)?.[0];
  return videos.filter((video) => video.group === group);
}

function areaPageOf(video) {
  return AREA_PAGES[video.group] ?? INDEX_PAGE;
}

function shortTitle(video) {
  return video.title.replace(/ \| DIY Accounting Submit$/, "");
}

function trimTrailingPunctuation(url) {
  const trailing = /[.,;:!?)]+$/.exec(url)?.[0] ?? "";
  return { url: url.slice(0, url.length - trailing.length), trailing };
}

function withoutQueryOnOwnSite(url) {
  const parsed = new URL(url);
  if (!OWN_HOSTS.has(parsed.hostname)) return url;
  parsed.search = "";
  return parsed.toString();
}

/**
 * A description as text with its links resolved: a link to one of our own sites loses its query
 * string, and {{video:<id>}} becomes the title of that video, or "the related video" when this
 * environment does not list it.
 * @returns {{text: string, html: string}} the same sentence as plain text and as HTML
 */
export function resolveDescription(description, videosById) {
  const pieces = [];
  let last = 0;
  for (const match of description.matchAll(TOKEN_PATTERN)) {
    pieces.push({ text: description.slice(last, match.index) });
    last = match.index + match[0].length;
    if (match[1]) {
      const target = videosById.get(match[1]);
      pieces.push(target ? { text: shortTitle(target), href: `${areaPageOf(target)}#${target.id}` } : { text: "the related video" });
    } else {
      const { url, trailing } = trimTrailingPunctuation(match[0]);
      const shown = withoutQueryOnOwnSite(url);
      pieces.push({ text: shown, href: shown }, { text: trailing });
    }
  }
  pieces.push({ text: description.slice(last) });
  return {
    text: pieces.map((piece) => piece.text).join(""),
    html: pieces
      .map((piece) => (piece.href ? `<a href="${escapeHtml(piece.href)}">${escapeHtml(piece.text)}</a>` : escapeHtml(piece.text)))
      .join(""),
  };
}

// A blank line starts a paragraph; a line break inside one stays a line break, so a list of chapter times reads as a list.
function paragraphsOf(html) {
  return html
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim().replace(/\s*\n\s*/g, "<br />"))
    .filter(Boolean);
}

function thumbnailUrl(video) {
  return `${THUMBNAIL_BASE}${encodeURIComponent(video.videoId)}/hqdefault.jpg`;
}

function embedUrl(video) {
  return `${EMBED_BASE}${encodeURIComponent(video.videoId)}`;
}

function jsonLdScript(data) {
  const json = JSON.stringify(data, null, 2).replace(/</g, "\\u003c");
  return `<script type="application/ld+json">${json}</script>`;
}

function videoObject(video, plainDescription, uploadDate) {
  return {
    "@context": "https://schema.org",
    "@type": "VideoObject",
    "name": video.title,
    "description": plainDescription,
    "thumbnailUrl": thumbnailUrl(video),
    "uploadDate": uploadDate,
    "embedUrl": embedUrl(video),
  };
}

/**
 * The HTML that fills the marked block of one videos page.
 * @param {object[]} pageVideos the videos the page shows
 * @param {Map<string, object>} videosById every video the environment lists
 * @param {(videoId: string) => string|undefined} uploadDateOf YYYY-MM-DD; a video without a date gets no JSON-LD block
 */
export function renderVideoPageBlock(pageVideos, videosById, uploadDateOf) {
  return pageVideos
    .map((video) => {
      const description = resolveDescription(video.description ?? "", videosById);
      const uploadDate = uploadDateOf(video.videoId);
      const jsonLd = uploadDate ? jsonLdScript(videoObject(video, description.text, uploadDate)) : "";
      const paragraphs = paragraphsOf(description.html)
        .map((paragraph) => `<p>${paragraph}</p>`)
        .join("");
      return `<section class="video-section" id="${escapeHtml(video.id)}" data-video-id="${escapeHtml(video.videoId)}"><h2>${escapeHtml(video.title)}</h2>${paragraphs}<p><a href="${WATCH_BASE}${encodeURIComponent(video.videoId)}"><img src="${thumbnailUrl(video)}" alt="Thumbnail of the video: ${escapeHtml(shortTitle(video))}" width="480" height="360" loading="lazy" /></a></p>${jsonLd}</section>`;
    })
    .join("");
}

function formatPounds(pence) {
  return `£${(pence / 100).toFixed(2)}`;
}

export function priceSentence(bundle) {
  const prices = getBundlePrices(bundle);
  if (prices.length === 0) return "Free.";
  const ordered = [...prices.filter((price) => price.default), ...prices.filter((price) => !price.default)];
  const words = { year: "a year", month: "a month" };
  return `${ordered.map((price) => `${formatPounds(price.amount)} ${words[price.interval] ?? `each ${price.interval}`}`).join(" or ")}.`;
}

/** The bundles the bundles page script lists to a visitor with no pass and no preview setting in an environment. */
export function listedBundles(catalog, environmentName) {
  return (catalog.bundles ?? [])
    .filter((bundle) => bundle.allocation && bundle.allocation !== "automatic")
    .filter((bundle) => bundle.enable !== "never")
    .filter((bundle) => !bundle.hidden)
    .filter((bundle) => isBundleListedInEnvironment(bundle, environmentName))
    .sort((a, b) => (a.allocation === "on-request") - (b.allocation === "on-request"));
}

function bundleSummary(bundle) {
  const summary = typeof bundle.passSummary === "string" ? bundle.passSummary.trim() : "";
  if (summary) return `You can ${summary}.`;
  // The catalogue description can end with the price; the card shows the price on its own line.
  const description = bundle.description ?? "";
  const priceStart = description.indexOf(". £");
  return priceStart === -1 ? description : description.slice(0, priceStart + 1);
}

/** The HTML that fills the marked block of the bundles page. */
export function renderBundlesBlock(catalog, environmentName) {
  const bundles = listedBundles(catalog, environmentName);
  const cards = bundles.map((bundle) => {
    const activityNames = [
      ...new Set(
        (catalog.activities ?? [])
          .filter((activity) => Array.isArray(activity.bundles) && activity.bundles.includes(bundle.id))
          .filter((activity) => isActivityListedInEnvironment(activity, environmentName))
          .map((activity) => activity.name),
      ),
    ];
    const activities =
      activityNames.length > 0 ? `<p>It covers:</p><ul>${activityNames.map((name) => `<li>${escapeHtml(name)}</li>`).join("")}</ul>` : "";
    return `<div class="service-item" data-bundle-id="${escapeHtml(bundle.id)}"><h3>${escapeHtml(bundle.name)}</h3><p><strong>${priceSentence(bundle)}</strong></p><p>${escapeHtml(bundleSummary(bundle))}</p>${activities}</div>`;
  });
  return `<h2>Bundles</h2>${cards.join("")}`;
}

const HOME_AREA_ORDER = ["VAT", "Income Tax", "Companies House", "Passes", "More"];
const SIGNED_OUT_VIEWER = { preview: false, operatorFeatures: true, account: {} };

/**
 * The activities the home page lists to a signed-out visitor in an environment, as the page script
 * lists them: shown by the catalogue, with a page, and not display "never". A signed-out visitor
 * holds no bundle, so an activity that shows only on entitlement is left out, a display "always"
 * activity opens its page and an upsell activity opens the sign-in page.
 * @param {string} [language] "cy" gives the Welsh names; the area stays the English key
 * @returns {{area: string, name: string, href: string}[]} in catalogue order
 */
export function homeActivities(catalog, environmentName, language) {
  return (catalog.activities ?? [])
    .filter((activity) => Array.isArray(activity.bundles))
    .filter((activity) => isActivityShown(activity, environmentName, SIGNED_OUT_VIEWER))
    .filter((activity) => activity.display === "always" || activity.display === "always-with-upsell")
    .flatMap((activity) => {
      const page = activityPagePath(activity);
      if (!page) return [];
      const isMetered = activity.metered === true && activity.tokenCost > 0;
      const tokenLabel = activity.display === "always" && isMetered ? tokenCostLabel(activity.tokenCost, language) : "";
      return [
        {
          area: activityArea(page),
          name: `${activityName(activity, language)}${tokenLabel}`,
          href: activity.display === "always" ? page : "auth/login.html",
        },
      ];
    });
}

/**
 * The HTML that fills the marked block of a home page: the activity list a signed-out visitor sees.
 * @param {string} [rootPrefix] the page's distance from the site root: "" for /index.html, "../" for /cy/index.html
 * @param {string} [language] "cy" for the Welsh page
 */
export function renderHomeActivitiesBlock(catalog, environmentName, rootPrefix = "", language) {
  const entries = homeActivities(catalog, environmentName, language);
  let isFirst = true;
  return HOME_AREA_ORDER.filter((area) => entries.some((entry) => entry.area === area))
    .map((area) => {
      const items = entries
        .filter((entry) => entry.area === area)
        .map((entry) => {
          const buttonClass = isFirst ? "btn" : "btn activity-secondary";
          isFirst = false;
          return `<div class="activity-item"><a class="${buttonClass}" href="${escapeHtml(rootPrefix + entry.href)}">${escapeHtml(entry.name)}</a></div>`;
        })
        .join("");
      const heading = escapeHtml(areaName(area, language));
      return `<section class="activity-group" aria-label="${heading}"><h2>${heading}</h2>${items}</section>`;
    })
    .join("");
}

function videoSitemapEntry(video, description, uploadDate) {
  const lines = [
    `      <video:thumbnail_loc>${escapeHtml(thumbnailUrl(video))}</video:thumbnail_loc>`,
    `      <video:title>${escapeHtml(video.title)}</video:title>`,
    `      <video:description>${escapeHtml(description.text.slice(0, 2048))}</video:description>`,
    `      <video:player_loc>${escapeHtml(embedUrl(video))}</video:player_loc>`,
  ];
  if (uploadDate) lines.push(`      <video:publication_date>${uploadDate}</video:publication_date>`);
  return `    <video:video>\n${lines.join("\n")}\n    </video:video>\n`;
}

/** The sitemap with a video:video entry on each videos page it lists, for the videos that page shows. */
export function addVideoEntries(sitemapXml, videos, uploadDateOf) {
  const videosById = new Map(videos.map((video) => [video.id, video]));
  const withoutVideos = sitemapXml.replace(/[ \t]*<video:video>[\s\S]*?<\/video:video>\n?/g, "");
  const pages = [INDEX_PAGE, ...Object.values(AREA_PAGES)];
  let result = withoutVideos;
  for (const page of pages) {
    const entries = videosOfPage(page, videos)
      .map((video) => videoSitemapEntry(video, resolveDescription(video.description ?? "", videosById), uploadDateOf(video.videoId)))
      .join("");
    if (!entries) continue;
    const block = new RegExp(
      `(<url>\\s*<loc>${SITE_ORIGIN.replace(/\./g, "\\.")}/${page.replace(/\./g, "\\.")}</loc>[\\s\\S]*?)(\\s*</url>)`,
    );
    result = result.replace(block, (_match, before, after) => `${before.trimEnd()}\n${entries.trimEnd()}${after}`);
  }
  if (result !== withoutVideos && !result.includes("xmlns:video="))
    result = result.replace("<urlset ", `<urlset ${SITEMAP_VIDEO_NAMESPACE} `);
  return result;
}

/**
 * The date each video id first appears in the videos manifest's history, from one git call. A
 * shallow clone and a failed git call answer an empty map, because a shallow clone's one commit
 * is not the upload.
 * @returns {Map<string, string>} video id to YYYY-MM-DD
 */
export function videoFirstPublishedDates(repositoryRoot = REPOSITORY_ROOT) {
  const dates = new Map();
  try {
    const git = (...args) =>
      execFileSync("git", ["-C", repositoryRoot, ...args], {
        encoding: "utf8",
        maxBuffer: 256 * 1024 * 1024,
        stdio: ["ignore", "pipe", "ignore"],
      });
    if (git("rev-parse", "--is-shallow-repository").trim() !== "false") return dates;
    let commitDate = "";
    for (const line of git("log", "--reverse", "--format=@@%cs", "-U0", '-G"videoId"', "-p", "--", ...MANIFEST_PATHS).split("\n")) {
      if (line.startsWith("@@")) commitDate = line.slice(2);
      else {
        const videoId = /^\+\s*"videoId": "([^"]+)"/.exec(line)?.[1];
        if (videoId && !dates.has(videoId)) dates.set(videoId, commitDate);
      }
    }
  } catch {
    return new Map();
  }
  return dates;
}

function lazyUploadDateOf() {
  let dates;
  return (videoId) => (dates ??= videoFirstPublishedDates()).get(videoId);
}

function fillPage(webRoot, page, markerName, content) {
  const path = join(webRoot, page);
  writeFileSync(path, replaceBetweenMarkers(readFileSync(path, "utf8"), markerName, content));
}

/**
 * Write the environment's videos, bundles and home activities into the pages of a built web root, and the videos into its sitemap.
 * @param {string} webRoot directory whose contents are served at the site root
 * @param {string} environmentName
 * @param {(videoId: string) => string|undefined} [uploadDateOf]
 */
export function publishContent(webRoot, environmentName, uploadDateOf = lazyUploadDateOf()) {
  const catalog = parseCatalog(readFileSync(join(webRoot, "submit.catalogue.toml"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(webRoot, "videos", "publish.json"), "utf8"));
  const videos = listedVideos(manifest, catalog, environmentName);
  const videosById = new Map(videos.map((video) => [video.id, video]));
  for (const page of [INDEX_PAGE, ...Object.values(AREA_PAGES)]) {
    fillPage(webRoot, page, "video-list", renderVideoPageBlock(videosOfPage(page, videos), videosById, uploadDateOf));
  }
  fillPage(webRoot, "bundles.html", "bundle-list", renderBundlesBlock(catalog, environmentName));
  fillPage(webRoot, "index.html", "home-activities", renderHomeActivitiesBlock(catalog, environmentName));
  fillPage(webRoot, "cy/index.html", "home-activities", renderHomeActivitiesBlock(catalog, environmentName, "../", "cy"));
  const sitemapPath = join(webRoot, "sitemap.xml");
  writeFileSync(sitemapPath, addVideoEntries(readFileSync(sitemapPath, "utf8"), videos, uploadDateOf));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [webRoot, environmentName] = process.argv.slice(2);
  if (!webRoot || !environmentName) {
    console.error("Usage: node scripts/publish-content.mjs <web-root> <environment-name>");
    process.exit(1);
  }
  publishContent(webRoot, environmentName);
  console.log(`Wrote the videos, bundles and home activities for ${environmentName} into ${webRoot}`);
}
