#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-143 Remove unlisted pages from the published sitemap
// - **Use when:** a deployed web root must not list pages for activities that the environment does not list, such as preview pages on prod.
// - **Does:** publish-sitemap.mjs reads submit.catalogue.toml and videos/publish.json. filterSitemap removes the url entries for pages of unlisted activities and for videos pages whose videos are all unlisted. It adds a lastmod to each entry from the last commit that changed the page's file, and leaves it out when the checkout is shallow. It rewrites sitemap.xml in the built web root. web/public/sitemap.xml keeps the full list and no lastmod. deploy.yml, deploy-app.yml and deploy-app.js run it.
// - **Run:** `node scripts/publish-sitemap.mjs <web-root> <environment-name>`
// - **Entry:** `scripts/publish-sitemap.mjs:filterSitemap`
// - **Files:** scripts/publish-sitemap.mjs, app/unit-tests/scripts/publishSitemap.test.js, scripts/deploy-app.js, .github/workflows/deploy.yml, .github/workflows/deploy-app.yml
// - **Keywords:** sitemap, publish sitemap, unlisted pages, preview pages, seo, catalogue environments
// - **Related:** OPS-01
// @end-capability

// Removes from a web root's sitemap.xml every page that the environment does not list: a page
// that is the catalogue page of an activity the environment does not list, and a videos area
// page whose videos all name unlisted activities. The web root is output of the build, not a
// second source: web/public/sitemap.xml stays the full list. Each kept entry gets a lastmod from the
// page file's last commit, so the deploy jobs that run this check out the full history.
// Usage: node scripts/publish-sitemap.mjs <web-root> <environment-name>   (the deploy workflow and deploy-app.js)

import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import TOML from "@iarna/toml";
import { isActivityListedInEnvironment } from "../app/services/productCatalog.js";
import { AREA_PAGES } from "../web/public/widgets/video-pages.js";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PAGES_DIRECTORY = "web/public";
const URL_BLOCK = /[ \t]*<url>[\s\S]*?<\/url>\n?/g;

function pageOf(urlBlock) {
  const location = /<loc>([^<]+)<\/loc>/.exec(urlBlock)?.[1] ?? "";
  return new URL(location).pathname.replace(/^\//, "") || "index.html";
}

/**
 * @param {string} sitemapXml the full sitemap
 * @param {object} catalog the parsed catalogue
 * @param {{videos: {group: string, catalogueActivity?: string}[]}} manifest the parsed videos/publish.json
 * @param {string} environmentName
 * @param {(page: string) => string|undefined} [lastModifiedOf] the date (YYYY-MM-DD) a page last changed; an entry whose page answers undefined gets no lastmod
 * @returns {string} the sitemap without the pages the environment does not list, with a lastmod on each page that has a date
 */
export function filterSitemap(sitemapXml, catalog, manifest, environmentName, lastModifiedOf = () => undefined) {
  const activities = catalog.activities ?? [];
  const isListed = (activityId) => {
    if (!activityId) return true;
    const activity = activities.find((candidate) => candidate.id === activityId);
    return activity !== undefined && isActivityListedInEnvironment(activity, environmentName);
  };
  const unlistedPages = new Set(
    activities.filter((activity) => !isActivityListedInEnvironment(activity, environmentName)).flatMap((activity) => activity.paths ?? []),
  );
  const emptyAreaPages = new Set(
    Object.entries(AREA_PAGES)
      .filter(([group]) => {
        const groupVideos = manifest.videos.filter((video) => video.group === group);
        return groupVideos.length > 0 && groupVideos.every((video) => !isListed(video.catalogueActivity));
      })
      .map(([, page]) => page),
  );
  return sitemapXml.replace(URL_BLOCK, (block) => {
    const page = pageOf(block);
    if (unlistedPages.has(page) || emptyAreaPages.has(page)) return "";
    const lastModified = lastModifiedOf(page);
    return lastModified ? block.replace(/(<loc>[^<]+<\/loc>)/, `$1\n    <lastmod>${lastModified}</lastmod>`) : block;
  });
}

/**
 * The date of the last commit that changed a page's source file. A shallow clone holds one commit,
 * whose date is not the page's, so a shallow clone and a failed git call both answer undefined.
 *
 * @param {string} page the page path relative to the site root
 * @param {string} [repositoryRoot]
 * @returns {string|undefined} YYYY-MM-DD
 */
export function pageLastCommitDate(page, repositoryRoot = REPOSITORY_ROOT) {
  const git = (...args) =>
    execFileSync("git", ["-C", repositoryRoot, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
  try {
    if (git("rev-parse", "--is-shallow-repository") !== "false") return undefined;
    return git("log", "-1", "--format=%cs", "--", `${SOURCE_PAGES_DIRECTORY}/${page}`) || undefined;
  } catch {
    return undefined;
  }
}

/**
 * @param {string} webRoot directory whose contents are served at the site root
 * @param {string} environmentName
 * @param {(page: string) => string|undefined} [lastModifiedOf]
 * @returns {string} the path written
 */
export function publishSitemap(webRoot, environmentName, lastModifiedOf = pageLastCommitDate) {
  const catalog = TOML.parse(readFileSync(join(webRoot, "submit.catalogue.toml"), "utf8"));
  const manifest = JSON.parse(readFileSync(join(webRoot, "videos", "publish.json"), "utf8"));
  const sitemapPath = join(webRoot, "sitemap.xml");
  writeFileSync(sitemapPath, filterSitemap(readFileSync(sitemapPath, "utf8"), catalog, manifest, environmentName, lastModifiedOf));
  return sitemapPath;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [webRoot, environmentName] = process.argv.slice(2);
  if (!webRoot || !environmentName) {
    console.error("Usage: node scripts/publish-sitemap.mjs <web-root> <environment-name>");
    process.exit(1);
  }
  console.log(`Filtered ${publishSitemap(webRoot, environmentName)} for ${environmentName}`);
}
