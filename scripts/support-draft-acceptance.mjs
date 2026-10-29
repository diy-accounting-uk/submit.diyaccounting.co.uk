#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-draft-acceptance.mjs
//
// The acceptance rate of the support reply drafts. Each draft the triage workflow puts in the
// support mailbox has a row under curated/support-drafts/ in the analytics lake. This script reads
// those rows from a local folder, reads each draft's thread in the mailbox, and classes the draft:
//
//   accepted  a message was sent on the thread after the draft, and its body equals the draft's
//   edited    a message was sent on the thread after the draft, and its body differs
//   rejected  no message was sent and the draft is deleted (or the thread is gone)
//   pending   no message was sent and the draft still exists
//   unknown   the row carries no body digest, so a sent body cannot be compared
//
// The rate is accepted over the drafts that are at least seven days old. It prints counts only,
// and writes one summary row for the lake (curated/support-draft-acceptance/dt=<date>/).
//
// The mailbox is read with the gmail.readonly key (SUPPORT_GMAIL_READ_KEY). The script makes no
// send, draft, label or delete call.
//
// usage: support-draft-acceptance.mjs --rows-dir <folder of support-drafts rows> [--out <summary row file>]
// env:   SUPPORT_GMAIL_READ_KEY

import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { bodyDigest } from "./support-gmail-draft.mjs";
import { gmailGet, messageText, tokenGetterFromKey } from "./support-mail-intake.mjs";

export const MIN_AGE_DAYS = 7;
export const SUMMARY_KIND = "support-draft-acceptance";
export const SUMMARY_PREFIX = "curated/support-draft-acceptance";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Every `support-draft` row found as a .json file anywhere under the folder. */
export function readDraftRows(dir) {
  const rows = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      rows.push(...readDraftRows(path));
    } else if (name.endsWith(".json")) {
      const row = JSON.parse(readFileSync(path, "utf8"));
      if (row.kind === "support-draft") rows.push(row);
    }
  }
  return rows;
}

const isSentAfter = (message, createdAtMs) => (message.labelIds ?? []).includes("SENT") && Number(message.internalDate) >= createdAtMs;

/**
 * The class of one old draft. `thread` is the Gmail thread (format=full) or null when it is gone;
 * `draftExists` says whether drafts.get still finds the draft.
 */
export function classifyDraft({ row, thread, draftExists }) {
  if (!row.body_sha256) return "unknown";
  const sent = (thread?.messages ?? []).filter((message) => isSentAfter(message, Date.parse(row.created_at)));
  if (sent.length > 0) return sent.some((message) => bodyDigest(messageText(message)) === row.body_sha256) ? "accepted" : "edited";
  return draftExists && thread ? "pending" : "rejected";
}

/** The summary row: counts per class, the drafts too recent to judge, and the rate. */
export function summarise({ classes, tooRecent, nowMs }) {
  const counts = { accepted: 0, edited: 0, rejected: 0, pending: 0, unknown: 0 };
  for (const cls of classes) counts[cls] += 1;
  const older = classes.length;
  const comparable = older - counts.unknown;
  return {
    kind: SUMMARY_KIND,
    measured_at: new Date(nowMs).toISOString(),
    drafts_older_than_days: MIN_AGE_DAYS,
    older,
    too_recent: tooRecent,
    ...counts,
    acceptance_rate: comparable > 0 ? counts.accepted / comparable : null,
  };
}

/** One pass. `getToken` and `fetchImpl` are injected so a test replays recorded answers. */
export async function runAcceptance({ rows, getToken, fetchImpl = fetch, nowMs = Date.now() }) {
  const classes = [];
  let tooRecent = 0;
  for (const row of rows) {
    if (nowMs - Date.parse(row.created_at) < MIN_AGE_DAYS * DAY_MS) {
      tooRecent += 1;
      continue;
    }
    if (!row.body_sha256) {
      classes.push("unknown");
      continue;
    }
    const gmail = { getToken, fetchImpl };
    const thread = await gmailGet(`/threads/${encodeURIComponent(row.thread_id)}?format=full`, gmail).catch(notFoundIsNull);
    const draftExists =
      (await gmailGet(`/drafts/${encodeURIComponent(row.draft_id)}?format=minimal`, gmail).catch(notFoundIsNull)) !== null;
    classes.push(classifyDraft({ row, thread, draftExists }));
  }
  return summarise({ classes, tooRecent, nowMs });
}

function notFoundIsNull(error) {
  if (error.status === 404) return null;
  throw error;
}

function parseArgs(argv) {
  const opts = { rowsDir: "", out: "" };
  for (let i = 0; i < argv.length; i += 2) {
    const key = { "--rows-dir": "rowsDir", "--out": "out" }[argv[i]];
    if (!key) throw new Error(`unknown argument ${argv[i]}`);
    opts[key] = argv[i + 1] ?? "";
  }
  if (!opts.rowsDir) throw new Error("--rows-dir is required");
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyJson = process.env.SUPPORT_GMAIL_READ_KEY;
  if (!keyJson) throw new Error("SUPPORT_GMAIL_READ_KEY is not set");
  const summary = await runAcceptance({ rows: readDraftRows(opts.rowsDir), getToken: tokenGetterFromKey(keyJson) });
  if (opts.out) writeFileSync(opts.out, JSON.stringify(summary));
  const rate = summary.acceptance_rate === null ? "n/a" : `${(summary.acceptance_rate * 100).toFixed(1)}%`;
  console.log(
    `drafts older than ${MIN_AGE_DAYS} days ${summary.older}: accepted ${summary.accepted}, edited ${summary.edited}, rejected ${summary.rejected}, pending ${summary.pending}, unknown ${summary.unknown}; too recent ${summary.too_recent}; acceptance rate ${rate}`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
