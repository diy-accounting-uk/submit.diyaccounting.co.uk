// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-191 Render the operator dashboard without a browser session
// - **Use when:** the operator dashboard must be read as a person sees it, by a job that has no signed-in browser.
// - **Does:** dashboard-review-render.mjs serves web/public from the checkout on http://localhost inside Playwright's Chromium and answers the page's API calls from stored data (snapshot, console index and images, held passes). It opens each tab with the tab button only, reads the tabs, panels, observation rows and capture items from the page, and takes one in-memory screenshot for each panel and each capture item. It aborts every request to another origin and fails the render when the page tries to write (POST /api/v1/pass/release).
// - **Run:** `node -e 'import("./scripts/dashboard-review-render.mjs").then((m) => m.renderDashboard({ publicDir: "web/public", data }))'`
// - **Entry:** `scripts/dashboard-review-render.mjs:renderDashboard`
// - **Files:** scripts/dashboard-review-render.mjs, scripts/dashboard-review-data.mjs, scripts/dashboard-review-checks.mjs, web/browser-tests/dashboardReviewRender.browser.test.js
// - **Keywords:** dashboard review, render dashboard, operator dashboard, playwright, no sign-in, screenshots in memory, console capture images
// - **Related:** DEV-55
// @end-capability

// scripts/dashboard-review-render.mjs
//
// The page code is the checkout's own. A failure throws an Error whose message is one of a fixed
// list of codes (refused-write, render-timeout tab=<id>, image-load-failed), never page text.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { snapshotAnswer } from "./dashboard-review-data.mjs";
import { readSubmitCss } from "../web/browser-tests/submitCss.js";

const ORIGIN = "http://localhost:3000";
const VIEWPORT = { width: 1280, height: 900 };
const WAIT_MS = 15000;

const CONTENT_TYPES = {
  ".html": "text/html",
  ".js": "application/javascript",
  ".mjs": "application/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webmanifest": "application/manifest+json",
  ".txt": "text/plain",
  ".toml": "text/plain",
  ".woff2": "font/woff2",
};

const SILENT_POSTS = new Set(["/api/v1/session/beacon", "/api/v1/activity/started"]);
const SUBMIT_ENV_BODY = "ENVIRONMENT_NAME=prod\n";

function json(status, body) {
  return { status, contentType: "application/json", body: JSON.stringify(body) };
}

function staticAnswer(publicDir, pathname) {
  const relative = pathname === "/" ? "index.html" : decodeURIComponent(pathname).replace(/^\/+/, "");
  const file = path.resolve(publicDir, relative);
  if (!file.startsWith(path.resolve(publicDir) + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return { status: 404, contentType: "text/plain", body: "not found" };
  }
  return { status: 200, contentType: CONTENT_TYPES[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) };
}

function buildAnswerer({ publicDir, data, state }) {
  const submitCss = readSubmitCss(publicDir);
  const snapshot = snapshotAnswer(data);
  return (method, pathname, searchParams) => {
    if (method === "POST" && SILENT_POSTS.has(pathname)) return { status: 204, body: "" };
    if (method !== "GET") {
      state.refusedWrite = true;
      return null;
    }
    if (pathname === "/api/v1/operator/snapshot") {
      return snapshot ? json(200, snapshot) : json(404, { message: "snapshot-not-found", error: { code: "snapshot-not-found" } });
    }
    if (pathname === "/api/v1/operator/console-image") {
      const item = ((data.consoleIndex && data.consoleIndex.items) || {})[searchParams.get("id")];
      const png = item && item.imageKey ? data.images.get(searchParams.get("id")) : null;
      if (!png) return json(404, { message: "console-image-not-found", error: { code: "console-image-not-found" } });
      return { status: 200, contentType: "image/png", body: png };
    }
    if (pathname === "/api/v1/pass/held") return json(200, { passes: data.heldPasses });
    if (pathname === "/submit.env") return { status: 200, contentType: "text/plain", body: SUBMIT_ENV_BODY };
    if (pathname === "/api/v1/bundle") return json(401, { message: "not signed in" });
    if (pathname.startsWith("/api/")) {
      state.unansweredApis.add(pathname);
      return json(404, { message: "not-answered" });
    }
    if (pathname === "/submit.css") return { status: 200, contentType: "text/css", body: submitCss };
    return staticAnswer(publicDir, pathname);
  };
}

// The function below runs in the page and returns plain data only.
async function readTabState(page, tabId) {
  return page.evaluate((id) => {
    const isOpen = (element) => !element.hidden && !element.closest("[hidden]") && !element.closest(".tab-off");
    const tabsOf = (element) => {
      const holder = element.closest("[data-tab]");
      return holder ? holder.dataset.tab.split(" ") : [];
    };
    const panelElements = [...document.querySelectorAll("[data-tab][id]")].concat([
      ...document.querySelectorAll("[data-objective-slot][data-tab] > section[id]"),
    ]);
    const panels = panelElements.map((element) => ({
      id: element.id,
      tabs: tabsOf(element),
      hidden: element.hidden || Boolean(element.closest("[hidden]")),
      open: tabsOf(element).includes(id) && isOpen(element),
      holdsCaptures: element.querySelector(".console-capture-item") !== null,
    }));
    const captures = [...document.querySelectorAll(".console-capture-item")]
      .filter((element) => isOpen(element) && tabsOf(element).includes(id))
      .map((element) => {
        const image = element.querySelector("img.console-capture-image");
        const error = element.querySelector(".console-capture-error");
        const empty = element.querySelector(".console-capture-empty");
        return {
          captureId: element.dataset.captureId,
          caption: (element.querySelector(".console-capture-time") || {}).textContent || "",
          error: error ? error.textContent : null,
          empty: empty ? empty.textContent : null,
          hasImage: image !== null,
          imageLoaded: image !== null && image.complete && image.naturalWidth > 0,
        };
      });
    const snapshotOf = window.__reviewSnapshot || null;
    const rows = [...document.querySelectorAll("tr.observation[data-observation-id]")]
      .filter((element) => isOpen(element) && tabsOf(element).includes(id))
      .map((element) => {
        const cells = [...element.children].map((cell) => cell.textContent.trim());
        const section = element.closest("section[data-objective-id]");
        const objectiveId = section ? section.dataset.objectiveId : null;
        const observations = ((snapshotOf && snapshotOf.objectives) || []).flatMap((objective) =>
          (objective.observations || []).map((observation) => ({ objectiveId: objective.id, observation })),
        );
        const found =
          observations.find((entry) => entry.objectiveId === objectiveId && entry.observation.id === element.dataset.observationId) ||
          observations.find((entry) => entry.observation.id === element.dataset.observationId);
        let expected = null;
        if (found && !found.observation.notCollected) {
          const observation = found.observation;
          const unit = observation.unit || "count";
          const windowKeys = ["today", "previousDay", "last7", "last30", "last90"];
          if (!windowKeys.some((key) => observation[key] && observation[key].notApplicable)) {
            const last30 = observation.last30;
            expected = {
              today: window.formatWindowValue(unit, observation.today),
              previousDay: window.formatWindowValue(unit, observation.previousDay),
              last7: window.formatWindowValue(unit, observation.last7),
              last30: window.formatWindowValue(unit, observation.last30),
              trend: window.formatTrend(last30 && last30.trend, last30 && last30.isNew, observation.better).text,
              last90: window.formatWindowValue(unit, observation.last90),
            };
          }
        }
        return { observationId: element.dataset.observationId, objectiveId, cells, expected };
      });
    return { panels, captures, rows };
  }, tabId);
}

function readTabsScript() {
  return [...document.querySelectorAll(".dashboard-tab[data-tab-id]")].map((button) => button.dataset.tabId);
}

function mergePanels(panelsByTab) {
  const merged = new Map();
  for (const panels of panelsByTab) {
    for (const panel of panels) {
      const known = merged.get(panel.id);
      if (!known) merged.set(panel.id, { id: panel.id, tabs: panel.tabs, hidden: panel.hidden, openOn: panel.open ? [panel.openTab] : [] });
      else if (panel.open) known.openOn.push(panel.openTab);
    }
  }
  return [...merged.values()];
}

/**
 * Renders web/public/operator/dashboard.html from stored data and screenshots what a reader sees.
 *
 * @param {{ publicDir: string, data: object }} input data is the return of readReviewData()
 * @returns {Promise<{
 *   dom: {
 *     tabs: string[],
 *     panels: { id: string, tabs: string[], hidden: boolean, openOn: string[] }[],
 *     rows: { tabId: string, observationId: string, objectiveId: string|null, cells: string[],
 *             expected: null|{ today, previousDay, last7, last30, trend, last90 } }[],
 *     captures: { tabId: string, captureId: string, caption: string, error: string|null,
 *                 empty: string|null, hasImage: boolean, imageLoaded: boolean }[],
 *     freshness: { meta: string, age: string, ageShown: boolean, source: string },
 *     unansweredApis: string[],
 *     requestOrigins: string[],
 *     abortedOrigins: string[],
 *   },
 *   screenshots: { tabId: string, panelId: string, kind: "panel"|"capture", captureId: string|null, png: Buffer }[],
 * }>}
 */
export async function renderDashboard({ publicDir, data }) {
  const state = { refusedWrite: false, unansweredApis: new Set(), requestOrigins: new Set(), abortedOrigins: new Set() };
  const answer = buildAnswerer({ publicDir, data, state });
  const profileDir = fs.mkdtempSync(path.join(process.env.RUNNER_TEMP || os.tmpdir(), "review-"));
  let context;
  try {
    context = await chromium.launchPersistentContext(profileDir, {
      viewport: VIEWPORT,
      deviceScaleFactor: 1,
      locale: "en-GB",
      timezoneId: "UTC",
      serviceWorkers: "block",
    });
    await context.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.protocol === "data:" || url.protocol === "blob:" || url.protocol === "about:") {
        await route.continue();
        return;
      }
      state.requestOrigins.add(url.origin);
      if (url.origin !== ORIGIN) {
        state.abortedOrigins.add(url.origin);
        await route.abort();
        return;
      }
      const reply = answer(request.method(), url.pathname, url.searchParams);
      if (!reply) {
        await route.abort();
        return;
      }
      await route.fulfill(reply);
    });

    const page = context.pages()[0] || (await context.newPage());
    await page.addInitScript((snapshot) => {
      window.__reviewSnapshot = snapshot;
    }, snapshotAnswer(data));
    await page.goto(`${ORIGIN}/operator/dashboard.html`, { waitUntil: "domcontentloaded" });
    await page
      .waitForFunction(
        () => {
          const tabs = document.getElementById("dashboardTabs");
          return tabs && !tabs.hidden && !tabs.classList.contains("dashboard-tabs-pending");
        },
        null,
        { timeout: WAIT_MS },
      )
      .catch(() => {
        throw new Error("render-timeout tab=main");
      });

    const tabs = await page.evaluate(readTabsScript);
    const panelsByTab = [];
    const rows = [];
    const captures = [];
    const screenshots = [];

    for (const tabId of tabs) {
      await page.locator(`.dashboard-tab[data-tab-id="${tabId}"]`).click();
      const isAwsTab = (await page.locator(`section.console-capture[data-tab~="${tabId}"] .console-capture-item`).count()) > 0;
      if (isAwsTab) {
        await page
          .waitForFunction(
            (id) =>
              [...document.querySelectorAll(`section.console-capture[data-tab~="${id}"] img.console-capture-image`)].every(
                (image) => image.complete && image.naturalWidth > 0,
              ) || document.querySelector(`section.console-capture[data-tab~="${id}"] .console-capture-error`) !== null,
            tabId,
            { timeout: WAIT_MS },
          )
          .catch(() => {
            throw new Error("image-load-failed");
          });
        await page.waitForTimeout(300);
      }
      const read = await readTabState(page, tabId);
      panelsByTab.push(read.panels.map((panel) => ({ ...panel, openTab: tabId })));
      read.rows.forEach((row) => rows.push({ tabId, ...row }));
      read.captures.forEach((capture) => captures.push({ tabId, ...capture }));

      for (const panel of read.panels) {
        if (!panel.open || panel.holdsCaptures) continue;
        const png = await page.locator(`[id="${panel.id}"]`).first().screenshot();
        screenshots.push({ tabId, panelId: panel.id, kind: "panel", captureId: null, png });
      }
      for (const capture of read.captures) {
        const png = await page.locator(`.console-capture-item[data-capture-id="${capture.captureId}"]`).first().screenshot();
        screenshots.push({ tabId, panelId: `console-${capture.captureId}`, kind: "capture", captureId: capture.captureId, png });
      }
    }

    const freshness = await page.evaluate(() => {
      const age = document.getElementById("snapshotAge");
      return {
        meta: document.getElementById("snapshotMeta").textContent.trim(),
        age: age.textContent.trim(),
        ageShown: !age.hidden,
        source: document.getElementById("snapshotSource").textContent.trim(),
      };
    });
    await page.locator('.dashboard-tab[data-tab-id="main"]').click();

    if (state.refusedWrite) throw new Error("refused-write");
    return {
      dom: {
        tabs,
        panels: mergePanels(panelsByTab),
        rows,
        captures,
        freshness,
        unansweredApis: [...state.unansweredApis],
        requestOrigins: [...state.requestOrigins],
        abortedOrigins: [...state.abortedOrigins],
      },
      screenshots,
    };
  } finally {
    if (context) await context.close().catch(() => {});
    fs.rmSync(profileDir, { recursive: true, force: true });
  }
}
