#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * Multi-URL Lighthouse
 *
 * Audits every URL in web/public/sitemap.xml for performance, accessibility, SEO and
 * best-practices, against the gates in lighthouse.config.json. Runs a bounded number of
 * `lighthouse` CLI processes at a time (each audit gets its own Chrome, so this avoids the
 * global performance-mark state the Lighthouse Node API shares across concurrent in-process
 * runs), writes one HTML report per URL, and writes an aggregate JSON summary consumed by
 * scripts/generate-compliance-report.js.
 *
 * Usage:
 *   node scripts/lighthouse-multi.js --base-url https://submit.diyaccounting.co.uk
 *
 * Options:
 *   --base-url URL       Origin to audit against (required)
 *   --config FILE         Gate config (default: lighthouse.config.json)
 *   --sitemap FILE         Sitemap to read URLs from (default: web/public/sitemap.xml)
 *   --output-dir DIR        Per-URL HTML report directory
 *                            (default: web/public/tests/accessibility/lighthouse)
 *   --results-file FILE      Aggregate JSON summary
 *                            (default: web/public/tests/accessibility/lighthouse-multi-results.json)
 *   --concurrency N          `lighthouse` processes to run at a time (default: 3)
 *
 * CHROME_PATH picks the Chrome binary when no system Chrome is on PATH (chrome-launcher's own
 * lookup), e.g. Playwright's bundled Chromium for a local run.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, "..");

const LIGHTHOUSE_BIN = join(projectRoot, "node_modules/.bin/lighthouse");
const CATEGORIES = ["performance", "accessibility", "seo", "best-practices"];

/**
 * Pulls every <loc> pathname out of a sitemap.xml document, in document order.
 *
 * @param {string} xml
 * @returns {string[]} pathnames, e.g. "/", "/about.html"
 */
export function parseSitemapPaths(xml) {
  const locs = [...xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]);
  return locs.map((loc) => new URL(loc).pathname);
}

/**
 * Sitemap paths the config's url list does not cover.
 *
 * @param {string[]} sitemapPaths
 * @param {string[]} configuredPaths
 * @returns {string[]}
 */
export function findDriftingPaths(sitemapPaths, configuredPaths) {
  const configured = new Set(configuredPaths);
  return sitemapPaths.filter((path) => !configured.has(path));
}

/**
 * Merges a URL's threshold overrides onto the config's defaults.
 *
 * @param {{performance: number, accessibility: number, seo: number, bestPractices: number}} defaultThresholds
 * @param {{thresholds?: object}} urlConfig
 */
export function resolveThresholds(defaultThresholds, urlConfig) {
  return { ...defaultThresholds, ...(urlConfig.thresholds || {}) };
}

/**
 * Turns a sitemap path into a filesystem-safe report filename stem.
 *
 * @param {string} path
 */
export function slugForPath(path) {
  if (path === "/") return "index";
  return path
    .replace(/^\//, "")
    .replace(/\.html$/, "")
    .replace(/\//g, "-");
}

/**
 * Reads a Lighthouse result's category scores as 0-100 integers.
 *
 * @param {{categories: object}} lhr
 */
export function scoresFromLhr(lhr) {
  const categories = lhr.categories ?? {};
  return {
    performance: Math.round((categories.performance?.score ?? 0) * 100),
    accessibility: Math.round((categories.accessibility?.score ?? 0) * 100),
    bestPractices: Math.round((categories["best-practices"]?.score ?? 0) * 100),
    seo: Math.round((categories.seo?.score ?? 0) * 100),
  };
}

/**
 * Which categories in `scores` fall short of `thresholds`.
 *
 * @param {{performance: number, accessibility: number, seo: number, bestPractices: number}} scores
 * @param {{performance: number, accessibility: number, seo: number, bestPractices: number}} thresholds
 * @returns {{category: string, score: number, threshold: number}[]}
 */
export function evaluateGates(scores, thresholds) {
  const failures = [];
  for (const category of Object.keys(thresholds)) {
    if (scores[category] < thresholds[category]) {
      failures.push({ category, score: scores[category], threshold: thresholds[category] });
    }
  }
  return failures;
}

function parseArgs(argv) {
  const options = {
    baseUrl: null,
    config: join(projectRoot, "lighthouse.config.json"),
    sitemap: join(projectRoot, "web/public/sitemap.xml"),
    outputDir: join(projectRoot, "web/public/tests/accessibility/lighthouse"),
    resultsFile: join(projectRoot, "web/public/tests/accessibility/lighthouse-multi-results.json"),
    concurrency: 3,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--base-url") options.baseUrl = argv[++i];
    else if (arg === "--config") options.config = argv[++i];
    else if (arg === "--sitemap") options.sitemap = argv[++i];
    else if (arg === "--output-dir") options.outputDir = argv[++i];
    else if (arg === "--results-file") options.resultsFile = argv[++i];
    else if (arg === "--concurrency") options.concurrency = Number(argv[++i]);
  }
  return options;
}

/**
 * Runs `tasks` with at most `concurrency` in flight at once, preserving input order in the
 * returned results.
 *
 * @param {(() => Promise<*>)[]} tasks
 * @param {number} concurrency
 */
async function runPool(tasks, concurrency) {
  const results = new Array(tasks.length);
  let next = 0;
  async function worker() {
    while (next < tasks.length) {
      const index = next;
      next += 1;
      results[index] = await tasks[index]();
    }
  }
  const workers = Array.from({ length: Math.min(concurrency, tasks.length) }, () => worker());
  await Promise.all(workers);
  return results;
}

function runLighthouseCli(targetUrl, outputBase) {
  return new Promise((resolve, reject) => {
    const args = [
      targetUrl,
      "--output=html",
      "--output=json",
      `--output-path=${outputBase}`,
      `--only-categories=${CATEGORIES.join(",")}`,
      "--chrome-flags=--headless=new --no-sandbox --disable-gpu",
      "--quiet",
    ];
    const child = spawn(LIGHTHOUSE_BIN, args, { env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) {
        reject(new Error(`lighthouse ${targetUrl} exited ${code}\n${stderr}`));
        return;
      }
      resolve();
    });
  });
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.baseUrl) {
    process.stderr.write("Usage: lighthouse-multi.js --base-url URL [--concurrency N]\n");
    process.exit(1);
  }

  const sitemapXml = readFileSync(options.sitemap, "utf8");
  const sitemapPaths = parseSitemapPaths(sitemapXml);
  const config = JSON.parse(readFileSync(options.config, "utf8"));
  const configuredPaths = config.urls.map((u) => u.path);

  const drifting = findDriftingPaths(sitemapPaths, configuredPaths);
  if (drifting.length > 0) {
    process.stderr.write(
      `lighthouse-multi: ${options.sitemap} has ${drifting.length} URL(s) missing from ${options.config}: ${drifting.join(", ")}\n`,
    );
    process.exit(1);
  }

  const urlConfigs = config.urls.filter((u) => sitemapPaths.includes(u.path));

  mkdirSync(options.outputDir, { recursive: true });

  let failed = false;
  const tasks = urlConfigs.map((urlConfig) => async () => {
    const targetUrl = new URL(urlConfig.path, options.baseUrl).toString();
    const thresholds = resolveThresholds(config.defaultThresholds, urlConfig);
    const slug = slugForPath(urlConfig.path);
    const outputBase = join(options.outputDir, slug);

    await runLighthouseCli(targetUrl, outputBase);

    const lhr = JSON.parse(readFileSync(`${outputBase}.report.json`, "utf8"));
    const scores = scoresFromLhr(lhr);
    const failures = evaluateGates(scores, thresholds);
    if (failures.length > 0) {
      failed = true;
      for (const failure of failures) {
        process.stderr.write(
          `lighthouse-multi: ${urlConfig.path} ${failure.category} ${failure.score} below threshold ${failure.threshold}\n`,
        );
      }
    }
    console.log(
      `${failures.length === 0 ? "PASS" : "FAIL"} ${urlConfig.path} perf=${scores.performance} a11y=${scores.accessibility} seo=${scores.seo} bp=${scores.bestPractices}`,
    );
    return { path: urlConfig.path, url: targetUrl, scores, thresholds, pass: failures.length === 0, failures };
  });

  const results = await runPool(tasks, options.concurrency);

  mkdirSync(dirname(options.resultsFile), { recursive: true });
  writeFileSync(options.resultsFile, JSON.stringify({ generatedAt: new Date().toISOString(), baseUrl: options.baseUrl, results }, null, 2));

  if (failed) {
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
