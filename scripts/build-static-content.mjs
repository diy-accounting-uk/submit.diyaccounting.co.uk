#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-31 Write the FAQ and the guide into the page HTML
// - **Use when:** faqs.toml, the guide's journeys or a video walkthrough changed, or a crawler or assistant must read the help page or the guide without JavaScript.
// - **Does:** build-static-content.mjs writes the entries of faqs.toml into web/public/help.html and the journeys of the guide, with each screenshot as an img with alt text, into web/public/guide.html, between marked comments. It writes only the entries and journeys that every environment that serves the page lists: an entry or video that names a catalogue activity must be listed on prod. The page scripts (help-page.js, guide.page.js) replace the written block when they run, so a reader sees the same page as before. The unit test fails when a committed page differs from the render.
// - **Run:** `npm run build:static-content`; `npx vitest run web/unit-tests/staticContentPages.test.js`
// - **Entry:** `scripts/build-static-content.mjs:renderHelpPage`; `scripts/build-static-content.mjs:renderGuidePage`
// - **Files:** scripts/build-static-content.mjs, scripts/page-markers.mjs, web/public/help.html, web/public/guide.html, web/public/lib/faq-markdown.js, web/public/lib/guide-journeys.js, web/unit-tests/staticContentPages.test.js
// - **Keywords:** static content, faq, guide, help page, no javascript, crawler, generated page
// - **Related:** SITE-10, SITE-22, OPS-143
// @end-capability

// Usage: node scripts/build-static-content.mjs   (npm run build:static-content)

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import prettier from "prettier";
import TOML from "@iarna/toml";
import { isActivityListedInEnvironment } from "../app/services/productCatalog.js";
import { escapeHtml, replaceBetweenMarkers } from "./page-markers.mjs";
import { renderFaqItem } from "../web/public/lib/faq-markdown.js";
import { GROUPS, splitTitle } from "../web/public/lib/guide-journeys.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const PUBLIC_DIRECTORY = join(ROOT, "web", "public");
export const HELP_PAGE_PATH = join(PUBLIC_DIRECTORY, "help.html");
export const GUIDE_PAGE_PATH = join(PUBLIC_DIRECTORY, "guide.html");

// A page that every environment serves holds only what prod lists; ci shows the rest when the page script runs.
const PUBLIC_ENVIRONMENT = "prod";

async function formatPage(html, path) {
  const config = (await prettier.resolveConfig(path)) ?? {};
  return prettier.format(html, { ...config, filepath: path });
}

function isListedEverywhere(catalog, activityId) {
  if (!activityId) return true;
  const activity = (catalog.activities ?? []).find((candidate) => candidate.id === activityId);
  return activity !== undefined && isActivityListedInEnvironment(activity, PUBLIC_ENVIRONMENT);
}

export function loadCatalog() {
  return TOML.parse(readFileSync(join(PUBLIC_DIRECTORY, "submit.catalogue.toml"), "utf8"));
}

export function loadFaqs() {
  return TOML.parse(readFileSync(join(PUBLIC_DIRECTORY, "faqs.toml"), "utf8")).faq;
}

export function loadManifest() {
  return JSON.parse(readFileSync(join(PUBLIC_DIRECTORY, "videos", "publish.json"), "utf8"));
}

export function renderFaqEntries(faqs, catalog) {
  return faqs
    .filter((faq) => isListedEverywhere(catalog, faq.activity))
    .map(renderFaqItem)
    .join("");
}

export async function renderHelpPage(html = readFileSync(HELP_PAGE_PATH, "utf8"), faqs = loadFaqs(), catalog = loadCatalog()) {
  return formatPage(replaceBetweenMarkers(html, "faq-entries", renderFaqEntries(faqs, catalog)), HELP_PAGE_PATH);
}

function guideStepHtml(scene, stepId) {
  const image = scene.thumb
    ? `<img src="${escapeHtml(scene.thumb)}" srcset="${escapeHtml(scene.thumb)} ${scene.thumbWidth}w, ${escapeHtml(scene.full)} ${scene.fullWidth}w" sizes="(min-width: 700px) 45vw, 92vw" width="${scene.thumbWidth}" height="${scene.thumbHeight}" alt="Screenshot: ${escapeHtml(scene.headline)}" loading="lazy" />`
    : "";
  return `<li class="guide-step" id="${escapeHtml(stepId)}"><div class="guide-step-header"><h3 class="guide-step-title">${escapeHtml(scene.headline)}</h3></div>${image}<p class="guide-caption">${escapeHtml(scene.caption)}</p></li>`;
}

function guideTextStepHtml([headline, caption], stepId) {
  return guideStepHtml({ headline, caption }, stepId);
}

function guideJourneyHtml(id, title, note, stepsHtml) {
  const noteHtml = note ? `<span class="guide-journey-note">${escapeHtml(note)}</span>` : "";
  return `<details class="guide-journey" id="${escapeHtml(id)}"><summary>${escapeHtml(title)}${noteHtml}</summary><ol class="guide-steps-list">${stepsHtml.join("")}</ol></details>`;
}

export function renderGuideJourneys(manifest, catalog) {
  const videosById = new Map(manifest.videos.map((video) => [video.id, video]));
  return GROUPS.map((group) => {
    const journeys = [];
    for (const journey of group.journeys) {
      if (journey.video) {
        const video = videosById.get(journey.video);
        if (!video || !isListedEverywhere(catalog, video.catalogueActivity)) continue;
        if (!Array.isArray(video.walkthrough) || video.walkthrough.length === 0) continue;
        const { title, note } = splitTitle(video.title);
        const steps = video.walkthrough.map((scene, index) => guideStepHtml(scene, `${video.id}-step-${index + 1}`));
        journeys.push({ id: video.id, title, html: guideJourneyHtml(video.id, title, note, steps) });
      } else {
        if (!isListedEverywhere(catalog, journey.catalogueActivity)) continue;
        const steps = journey.steps.map((step, index) => guideTextStepHtml(step, `${journey.id}-step-${index + 1}`));
        journeys.push({ id: journey.id, title: journey.title, html: guideJourneyHtml(journey.id, journey.title, "", steps) });
      }
    }
    if (journeys.length === 0) return "";
    const jumps = journeys.map((journey) => `<li><a href="#${escapeHtml(journey.id)}">${escapeHtml(journey.title)}</a></li>`).join("");
    return `<section class="guide-group"><h2>${escapeHtml(group.title)}</h2><p class="guide-group-intro">${escapeHtml(group.intro)}</p><nav class="guide-jump-nav" aria-label="Journeys: ${escapeHtml(group.title)}"><ul class="guide-jump">${jumps}</ul></nav>${journeys.map((journey) => journey.html).join("")}</section>`;
  }).join("");
}

export async function renderGuidePage(html = readFileSync(GUIDE_PAGE_PATH, "utf8"), manifest = loadManifest(), catalog = loadCatalog()) {
  return formatPage(replaceBetweenMarkers(html, "guide-journeys", renderGuideJourneys(manifest, catalog)), GUIDE_PAGE_PATH);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(HELP_PAGE_PATH, await renderHelpPage());
  writeFileSync(GUIDE_PAGE_PATH, await renderGuidePage());
}
