#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Tells IndexNow which pages changed in a deploy. The previous deployment's name ends in the
// short hash of the commit that was live before; the pages whose source file changed since that
// commit and that the published sitemap lists are sent in one POST. A missing previous name, an
// unknown commit, an empty list or a missing key sends nothing; an error answer prints a GitHub
// warning and still exits 0, so the step never fails a deploy.
// Usage: node scripts/indexnow-submit.mjs <previous-deployment-name> [web-root]
//   run after `node scripts/publish-sitemap.mjs web/public prod`, in a checkout with full history.

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_PAGES_DIRECTORY = "web/public";
const INDEXNOW_ENDPOINT = "https://api.indexnow.org/indexnow";
const KEY_FILE_NAME = /^[0-9a-f]{32}\.txt$/;

function pageOf(location) {
  return new URL(location).pathname.replace(/^\//, "") || "index.html";
}

/**
 * @param {string} sitemapXml the sitemap as published
 * @param {string[]} changedFiles repository paths that changed
 * @returns {string[]} the sitemap URLs whose page file is among the changed files
 */
export function indexNowUrlList(sitemapXml, changedFiles) {
  const changedPages = new Set(
    changedFiles
      .filter((file) => file.startsWith(`${SOURCE_PAGES_DIRECTORY}/`))
      .map((file) => file.slice(SOURCE_PAGES_DIRECTORY.length + 1)),
  );
  const locations = [...sitemapXml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
  return locations.filter((location) => changedPages.has(pageOf(location)));
}

/**
 * @param {string} deploymentName for example prod-1a2b3c4
 * @returns {string} the text after the last dash, or an empty string
 */
export function commitOfDeployment(deploymentName) {
  const index = deploymentName.lastIndexOf("-");
  return index < 0 ? "" : deploymentName.slice(index + 1);
}

/**
 * @param {string} webRoot
 * @returns {{key: string, fileName: string}|undefined} the one key file in the web root, or undefined
 */
export function findKeyFile(webRoot) {
  const matches = readdirSync(webRoot).filter((name) => KEY_FILE_NAME.test(name));
  if (matches.length !== 1) return undefined;
  return { key: matches[0].replace(/\.txt$/, ""), fileName: matches[0] };
}

function git(...args) {
  return execFileSync("git", ["-C", REPOSITORY_ROOT, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

function warn(message) {
  console.log(`::warning::IndexNow: ${message}`);
}

async function main() {
  const [previousDeploymentName = "", webRoot = join(REPOSITORY_ROOT, SOURCE_PAGES_DIRECTORY)] = process.argv.slice(2);
  const previousCommit = commitOfDeployment(previousDeploymentName);
  if (!previousCommit) return console.log("IndexNow: no previous deployment, nothing sent.");
  try {
    git("cat-file", "-e", `${previousCommit}^{commit}`);
  } catch {
    return console.log(`IndexNow: commit ${previousCommit} is not in this checkout, nothing sent.`);
  }
  const keyFile = findKeyFile(webRoot);
  if (!keyFile) return warn(`${webRoot} must hold exactly one key file; nothing sent.`);
  const changedFiles = git("diff", "--name-only", `${previousCommit}..HEAD`, "--", SOURCE_PAGES_DIRECTORY).split("\n").filter(Boolean);
  const sitemapXml = readFileSync(join(webRoot, "sitemap.xml"), "utf8");
  const urlList = indexNowUrlList(sitemapXml, changedFiles);
  if (urlList.length === 0) return console.log("IndexNow: no listed page changed, nothing sent.");
  const host = new URL(urlList[0]).hostname;
  const response = await fetch(INDEXNOW_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({ host, key: keyFile.key, keyLocation: `https://${host}/${keyFile.fileName}`, urlList }),
  });
  if (response.status === 200 || response.status === 202) {
    console.log(`IndexNow: sent ${urlList.length} URLs, answer ${response.status}.`);
  } else {
    warn(`answer ${response.status} for ${urlList.length} URLs.`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => warn(`${error.message}; nothing more sent.`));
}
