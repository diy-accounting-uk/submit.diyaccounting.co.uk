#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/support-gmail-draft.mjs
//
// Puts one reply into the support@diyaccounting.co.uk mailbox as an unsent Gmail draft, threaded
// on the customer's message. It calls users.drafts.create and nothing else: the one scope it
// requests, gmail.compose, cannot read the mailbox, and the script has no send call.
//
// Authentication is a service account with domain-wide delegation, impersonating the support
// mailbox. The service account key arrives in the SUPPORT_GMAIL_DRAFT_KEY environment variable.
//
//   SUPPORT_GMAIL_DRAFT_KEY=<key json> node scripts/support-gmail-draft.mjs \
//     --thread-id <gmail thread id> --to <customer address> --subject <subject> \
//     --in-reply-to <Message-ID of the customer message> --body-file /tmp/support-reply.md \
//     --issue-number 12 --out /tmp/support-draft-row.json
//
// --out receives one JSON row for the acceptance measure: the draft id and the time it was made.
// The measure compares drafts to what the mailbox later sent (see PLAN_REPOSITORY_AUTOMATION.md,
// Phase 4).

import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JWT } from "google-auth-library";

export const MAILBOX = "support@diyaccounting.co.uk";
export const GMAIL_COMPOSE_SCOPE = "https://www.googleapis.com/auth/gmail.compose";
export const DRAFTS_URL = "https://gmail.googleapis.com/gmail/v1/users/me/drafts";

export function parseArgs(argv) {
  const opts = { threadId: "", to: "", subject: "", inReplyTo: "", bodyFile: "", issueNumber: "", out: "" };
  const names = {
    "--thread-id": "threadId",
    "--to": "to",
    "--subject": "subject",
    "--in-reply-to": "inReplyTo",
    "--body-file": "bodyFile",
    "--issue-number": "issueNumber",
    "--out": "out",
  };
  for (let i = 0; i < argv.length; i += 2) {
    const key = names[argv[i]];
    if (!key) throw new Error(`unknown argument ${argv[i]}`);
    opts[key] = argv[i + 1] ?? "";
  }
  for (const required of ["threadId", "to", "subject", "bodyFile"]) {
    if (!opts[required]) throw new Error(`--${required.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)} is required`);
  }
  return opts;
}

function assertNoLineBreak(name, value) {
  if (/[\r\n]/.test(value)) throw new Error(`${name} must be one line`);
}

/** The RFC 5322 message Gmail stores as the draft. */
export function buildRawMessage({ to, subject, inReplyTo, body }) {
  assertNoLineBreak("to", to);
  assertNoLineBreak("subject", subject);
  assertNoLineBreak("in-reply-to", inReplyTo || "");
  const headers = [
    `To: ${to}`,
    `Subject: ${/^re:/i.test(subject) ? subject : `Re: ${subject}`}`,
    ...(inReplyTo ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []),
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
  ];
  const message = `${headers.join("\r\n")}\r\n\r\n${body.replace(/\r?\n/g, "\r\n")}`;
  return Buffer.from(message, "utf8").toString("base64url");
}

/**
 * Calls users.drafts.create. `getToken` and `fetchImpl` are injected so a test replays a
 * recorded call instead of reaching the network.
 */
export async function createDraft({ threadId, to, subject, inReplyTo, body, getToken, fetchImpl = fetch }) {
  const token = await getToken();
  const response = await fetchImpl(DRAFTS_URL, {
    method: "POST",
    headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message: { threadId, raw: buildRawMessage({ to, subject, inReplyTo, body }) } }),
  });
  if (!response.ok) {
    const failure = await response.json().catch(() => ({}));
    const reason = [failure.error?.status, failure.error?.message].filter(Boolean).join(": ");
    throw new Error(`Gmail drafts.create answered ${response.status}${reason ? ` (${reason})` : ""}`);
  }
  const created = await response.json();
  return { draftId: created.id, messageId: created.message?.id ?? "", threadId: created.message?.threadId ?? threadId };
}

/** The body as the mailbox returns it: line ends as \n, outer whitespace removed. */
export function normaliseBody(body) {
  return String(body).replace(/\r\n?/g, "\n").trim();
}

export function bodyDigest(body) {
  return createHash("sha256").update(normaliseBody(body)).digest("hex");
}

export function acceptanceRow({ draft, issueNumber, createdAt, body }) {
  return {
    kind: "support-draft",
    draft_id: draft.draftId,
    thread_id: draft.threadId,
    issue_number: issueNumber === "" ? null : Number(issueNumber),
    created_at: createdAt,
    body_sha256: bodyDigest(body),
  };
}

function tokenGetterFromKey(keyJson) {
  const key = JSON.parse(keyJson);
  const client = new JWT({ email: key.client_email, key: key.private_key, scopes: [GMAIL_COMPOSE_SCOPE], subject: MAILBOX });
  return async () => (await client.getAccessToken()).token;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const keyJson = process.env.SUPPORT_GMAIL_DRAFT_KEY;
  if (!keyJson) throw new Error("SUPPORT_GMAIL_DRAFT_KEY is not set");
  const body = readFileSync(opts.bodyFile, "utf8");
  const draft = await createDraft({
    threadId: opts.threadId,
    to: opts.to,
    subject: opts.subject,
    inReplyTo: opts.inReplyTo,
    body,
    getToken: tokenGetterFromKey(keyJson),
  });
  const row = acceptanceRow({ draft, issueNumber: opts.issueNumber, createdAt: new Date().toISOString(), body });
  if (opts.out) writeFileSync(opts.out, JSON.stringify(row));
  console.log(`created draft ${draft.draftId} on thread ${draft.threadId}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
