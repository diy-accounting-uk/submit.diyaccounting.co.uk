#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/github-issue-comment.mjs
//
// The one way the support and alarm reader workflows write to a GitHub issue: it creates a
// comment from a file and does nothing else. It cannot set a label, close an issue or edit a
// body, and it prints nothing from the comment or from GitHub's answer, because the workflow
// logs of this public repository are public and the comment can hold ticket-derived text.
//
// usage: github-issue-comment.mjs --repo <owner/name> --issue <number> --body-file <path>
// env:   GH_TOKEN
//
// The module also exports the read helpers the other issue scripts share.

import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const API = "https://api.github.com";
const REPO_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function headers(token) {
  return {
    "Authorization": `Bearer ${token}`,
    "Accept": "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": "diyaccounting-issue-scripts",
  };
}

export function assertRepo(repo) {
  if (!REPO_PATTERN.test(repo ?? "")) throw new Error("the repository must be owner/name");
  return repo;
}

export function assertIssueNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error("the issue number must be a positive integer");
  return number;
}

/** GET one page of a path under the GitHub API and return the parsed JSON. */
export async function githubGet(path, { token, fetchImpl = fetch }) {
  const response = await fetchImpl(`${API}${path}`, { headers: headers(token) });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for GET ${path.split("?")[0]}`);
  return response.json();
}

/** GET every page of a list path (100 per page) and return one array. */
export async function githubGetAll(path, { token, fetchImpl = fetch }) {
  const results = [];
  const separator = path.includes("?") ? "&" : "?";
  for (let page = 1; page <= 20; page += 1) {
    const items = await githubGet(`${path}${separator}per_page=100&page=${page}`, { token, fetchImpl });
    results.push(...items);
    if (items.length < 100) break;
  }
  return results;
}

export async function postIssueComment({ repo, issue, body, token, fetchImpl = fetch }) {
  assertRepo(repo);
  const number = assertIssueNumber(issue);
  const response = await fetchImpl(`${API}/repos/${repo}/issues/${number}/comments`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ body }),
  });
  if (!response.ok) throw new Error(`GitHub answered ${response.status} for POST issue comment`);
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const repo = argValue(argv, "--repo");
  const issue = argValue(argv, "--issue");
  const bodyFile = argValue(argv, "--body-file");
  if (!repo || !issue || !bodyFile) {
    console.error("usage: github-issue-comment.mjs --repo <owner/name> --issue <number> --body-file <path>");
    process.exit(1);
  }
  try {
    await postIssueComment({ repo, issue, body: readFileSync(bodyFile, "utf8"), token: process.env.GH_TOKEN });
    console.log(`commented on issue ${assertIssueNumber(issue)}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
