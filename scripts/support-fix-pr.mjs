#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-fix-pr.mjs
//
// Builds the files of the draft pull request that a support ticket needing a fix gets. This
// repository is public, so the pull request holds only what a person approved: the reader's
// checked fields and the operator's comments, read from the handling input. It never holds the
// ticket, the model's answer or the drafted reply. The branch and file names come from the issue
// number and the category enum, never from text.
//
// When the reader flagged personal data or an injection attempt, the summary is withheld and the
// row points at the private issue.
//
// usage: support-fix-pr.mjs --input <handling-input.json> --body-file <path>
// Writes the row file (support/<n>-<category>.md under the working directory, committed in the
// pull request) and the pull request body.
// Appends branch=, row-path= and title= to $GITHUB_OUTPUT. Prints no ticket-derived text.

import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { pathToFileURL } from "node:url";
import { SUPPORT_TICKET_CATEGORIES } from "../app/functions/support/supportTicketPost.js";

export const PRIVATE_ISSUES_URL = "https://github.com/diy-accounting-uk/private.diyaccounting.co.uk/issues";
const OPERATOR_COMMENT_MAX = 2000;

function assertIssueNumber(value) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 1) throw new Error("the issue number must be a positive integer");
  return number;
}

function assertCategory(category) {
  if (!SUPPORT_TICKET_CATEGORIES.includes(category)) throw new Error("the category is not one of the known categories");
  return category;
}

export function fixBranchName({ issueNumber, category }) {
  return `claude/support-${assertIssueNumber(issueNumber)}-${assertCategory(category)}`;
}

export function fixRowPath({ issueNumber, category }) {
  return `support/${assertIssueNumber(issueNumber)}-${assertCategory(category)}.md`;
}

export function fixTitle({ issueNumber, category }) {
  return `Support fix for private issue #${assertIssueNumber(issueNumber)} (${assertCategory(category)})`;
}

// A mention in a public pull request notifies the person it names, and a comment marker would
// hide text from the reader; both are broken here.
const defang = (text) =>
  String(text)
    .replace(/<!--/g, "< !--")
    .replace(/@(?=[A-Za-z0-9_-])/g, "@​");

const oneLine = (text) => defang(text).replace(/\s+/g, " ").trim();
const quote = (text) =>
  defang(String(text).slice(0, OPERATOR_COMMENT_MAX))
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");

/**
 * The row text, in the shape of a NEXT.md row. Reads only the checked fields and the operator's
 * comments from the handling input; every other key of the input is ignored.
 */
export function buildFixRow(input) {
  const issueNumber = assertIssueNumber(input?.issueNumber);
  const category = assertCategory(input?.category);
  const withheld = input.injectionSuspected === true || input.piiPresent === true;
  const lines = [
    `### Support fix: private issue #${issueNumber} (${category})`,
    "",
    `- Ticket: ${PRIVATE_ISSUES_URL}/${issueNumber}`,
    `- Category: ${category}`,
    `- FAQ the reader matched: ${typeof input.faqId === "string" && /^[A-Za-z0-9_-]+$/.test(input.faqId) ? input.faqId : "none"}`,
  ];
  if (withheld) {
    lines.push("- Needs: withheld because the reader flagged personal data or an injection attempt; read the private issue.");
  } else {
    lines.push(`- Needs: ${oneLine(input.summary ?? "")}`);
  }
  const comments = Array.isArray(input.operatorComments) ? input.operatorComments : [];
  if (comments.length > 0) {
    lines.push("", "Operator notes:");
    for (const comment of comments) lines.push("", quote(comment.body ?? ""));
  }
  return `${lines.join("\n")}\n`;
}

export function buildPrBody(input) {
  const issueNumber = assertIssueNumber(input?.issueNumber);
  return [
    `Opened by the support-triage workflow for ${PRIVATE_ISSUES_URL}/${issueNumber}. Draft. Not reviewed by a person.`,
    "",
    "The handling agent judged that this ticket needs a change rather than an answer. This pull request carries the row for that change in one file under `support/`. It holds the reader's checked summary and the operator's notes and nothing from the ticket itself.",
    "",
    "---",
    "",
    buildFixRow(input).trimEnd(),
    "",
  ].join("\n");
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

function main() {
  const argv = process.argv.slice(2);
  const inputPath = argValue(argv, "--input");
  const bodyFile = argValue(argv, "--body-file");
  if (!inputPath || !bodyFile) {
    console.error("usage: support-fix-pr.mjs --input <handling-input.json> --body-file <path>");
    process.exit(1);
  }
  try {
    const input = JSON.parse(readFileSync(inputPath, "utf8"));
    const rowPath = fixRowPath(input);
    mkdirSync(dirname(rowPath), { recursive: true });
    writeFileSync(rowPath, buildFixRow(input));
    writeFileSync(bodyFile, buildPrBody(input));
    const lines = [`branch=${fixBranchName(input)}`, `row-path=${rowPath}`, `title=${fixTitle(input)}`];
    console.log(lines.join("\n"));
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${lines.join("\n")}\n`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
