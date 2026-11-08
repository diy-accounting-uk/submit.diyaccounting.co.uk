#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability OPS-190 Handle an approved mail notice with one fixed action
// - **Use when:** the operator has read a mail notice and its reader comment in the private repository and removed `maintainer-review`, and the notice needs its one answer.
// - **Does:** support-notice-handler.yml (hourly and on dispatch) runs notice-handle.mjs, with no model. It picks the oldest open `mail-notice` issue that has a valid reader comment, no handler comment, none of the labels `maintainer-review`, `rejected`, `injection-suspected` and `mail-withheld`, and that scripts/maintainer-review-gate.mjs approves. It takes exactly one action, in this order: run the read-only check that the issue's code-written `Registry-Check:` line names (`trusted-event` lists the open trusted-event issues of the last 7 days), draft a `NEXT.md` row from the checked reader fields when `actionRequired` is true, or say that no action is required and close the issue. The handler holds no AWS role and writes only a comment, the label `notice-handled` and the close. It takes no value from the message text. The logs hold counts and issue numbers only.
// - **Run:** `gh workflow run support-notice-handler.yml -f issue-number=<n>`
// - **Entry:** `scripts/notice-handle.mjs:handleNotice`
// - **Files:** scripts/notice-handle.mjs, .github/workflows/support-notice-handler.yml, scripts/support-mail-registry.toml, scripts/support-mail-lanes.mjs, scripts/support-label-sweep.mjs, app/unit-tests/scripts/noticeHandle.test.js, app/unit-tests/noticeHandlerWorkflow.test.js
// - **Keywords:** notice handler, mail notice, registry check, trusted-event, notice-handled, maintainer-review, draft board row, private repository
// - **Related:** OPS-142, DATA-61, OPS-18
// @end-capability

// scripts/notice-handle.mjs
//
// The deterministic handler for a mail notice the operator has approved. A notice waits behind
// `maintainer-review` after support-reader.yml posts the checked reader comment. When the operator
// removes the label, this script takes one action, and only one:
//
//   1. a registered read-only check, when the issue body holds the line `Registry-Check: <id>`
//      that support-mail-intake.mjs wrote from the registry entry that matched the mail;
//   2. a drafted board row, when the checked reader answer says an action is required;
//   3. a one-line "no action is required" comment and the close.
//
// The handler takes no value from the message. The reader's answer reaches it only after the
// schema check (the vendor must be in the registry), the check id comes from a code-written body
// line and must be in the fixed table below, and the comment text is built from those values and
// from code. The handler holds no write access to AWS, to a vendor or to code.
//
// This repository is public, so its logs are public. The script prints issue numbers and actions
// only: no title, summary or vendor text.
//
// usage: notice-handle.mjs select [--issue <number>]
//        notice-handle.mjs act --issue <number>
// env:   GH_TOKEN (issues read for select, issues write for act), GITHUB_OUTPUT

import { appendFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { mailReaderSchema } from "../app/lib/quarantineReaderSchema.js";
import { AGENT_APP_LOGIN, ALLOWED_LOGINS, OPS_APP_LOGIN } from "./issue-agent-allowlist.mjs";
import { assertLabelsKept } from "./support-mail-intake.mjs";
import { CHECK_IDS, loadRegistry, registryVendors } from "./support-mail-lanes.mjs";
import { issueApprovalState } from "./maintainer-review-gate.mjs";
import { PRIVATE_REPO } from "./support-reader-select.mjs";
import { READER_MARKER, extractReaderJson } from "./quarantine-reader-check.mjs";
import { assertIssueNumber, assertRepo, githubGet, githubGetAll, postIssueComment } from "./github-issue-comment.mjs";
import { NOTICE_HANDLED_LABEL, addLabel, closeWithoutReply, ensureLabel } from "./support-label-sweep.mjs";

export const HANDLER_MARKER = "<!-- notice-handler:v1 -->";
export const NOTICE_LABEL = "mail-notice";
export const BLOCKING_LABELS = ["maintainer-review", "rejected", "injection-suspected", "mail-withheld"];
export const TRUSTED_EVENT_LABEL = "trusted-event";
export const TRUSTED_EVENT_WINDOW_DAYS = 7;

const labelNames = (issue) => (issue.labels ?? []).map((label) => (typeof label === "string" ? label : label.name));
const oneLine = (text) =>
  String(text ?? "")
    .replace(/\s+/g, " ")
    .trim();

export function isHandlerCandidate(issue) {
  if (!issue || issue.pull_request || issue.state !== "open") return false;
  const labels = labelNames(issue);
  if (!labels.includes(NOTICE_LABEL) || BLOCKING_LABELS.some((label) => labels.includes(label))) return false;
  return ALLOWED_LOGINS.includes(String(issue.user?.login ?? "").toLowerCase());
}

/** Any comment with the handler marker, from any author, means the issue is handled or must be left alone. */
export function hasHandlerComment(comments) {
  return comments.some((comment) => String(comment.body ?? "").includes(HANDLER_MARKER));
}

/**
 * The checked reader answer: the newest reader comment from the agent App, read back and run through
 * the mail schema again. Null when there is none, when it was rejected, or when it suspects an injection.
 */
export function readerValueOf(comments, vendors) {
  const mine = comments.filter((comment) => comment.user?.login === AGENT_APP_LOGIN && String(comment.body ?? "").includes(READER_MARKER));
  const latest = mine.at(-1);
  if (!latest) return null;
  const json = extractReaderJson(latest.body);
  if (json === null) return null;
  const parsed = mailReaderSchema(new Set(vendors)).safeParse(json);
  if (!parsed.success || parsed.data.injectionSuspected) return null;
  return parsed.data;
}

const BODY_TEXT_HEADING = "Notice email text, data only:";

/** The id on the `Registry-Check:` line that the intake wrote above the fenced text, or null when there is none. */
export function registryCheckId(issueBody) {
  const body = String(issueBody ?? "");
  const cut = body.indexOf(BODY_TEXT_HEADING);
  const head = cut === -1 ? body : body.slice(0, cut);
  return /^Registry-Check: (\S+)$/m.exec(head)?.[1] ?? null;
}

/** The fixed table of read-only checks. Each returns the lines of the comment. The ids match CHECK_IDS in support-mail-lanes.mjs. */
export const CHECKS = {
  "trusted-event": async ({ repo, token, fetchImpl, now }) => {
    const cutoff = now.getTime() - TRUSTED_EVENT_WINDOW_DAYS * 86400000;
    const issues = await githubGetAll(
      `/repos/${repo}/issues?state=open&labels=${TRUSTED_EVENT_LABEL}&since=${new Date(cutoff).toISOString()}`,
      {
        token,
        fetchImpl,
      },
    );
    const recent = issues
      .filter((issue) => !issue.pull_request && issue.user?.login === OPS_APP_LOGIN && Date.parse(issue.created_at) >= cutoff)
      .sort((a, b) => a.number - b.number);
    if (recent.length === 0) return ["No trusted event issue is open."];
    return recent.map((issue) => `- #${issue.number} ${oneLine(issue.title)}`);
  },
};

// A fail-closed stop carries a rule code. The stop comment names the rule in this fixed text only.
export const STOP_RULES = {
  "unknown-check": "the registry check is not in the handler's table",
  "unregistered-vendor": "the checked vendor is not in the registry",
  "no-reader-comment": "the issue has no accepted reader comment",
};

const stop = (rule) => Object.assign(new Error(STOP_RULES[rule]), { rule });

/** Throws on an id outside the table. */
export function assertCheckId(id) {
  if (!Object.hasOwn(CHECKS, id) || !CHECK_IDS.includes(id)) throw stop("unknown-check");
  return id;
}

function fenceFor(text) {
  const longest = Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length));
  return "`".repeat(Math.max(3, longest + 1));
}

export const UNREGISTERED_SENDER = "an unregistered sender";

export function buildRow({ issue, value }) {
  const summary = oneLine(value.summary).replace(/[.!?]*$/, ".");
  return `- [ ] **MAIL${issue}. ${value.vendor ?? UNREGISTERED_SENDER}: a notice needs action.** ${summary} **Source**: mail notice, private issue #${issue}. **Owner**: operator. **Deadline**: ${value.deadline ?? "none"}.`;
}

export function buildRowComment({ issue, value }) {
  const row = buildRow({ issue, value });
  const fence = fenceFor(row);
  return [
    HANDLER_MARKER,
    "**Notice handler**: the reader says this notice needs action. Draft row for `NEXT.md`:",
    "",
    `${fence}markdown`,
    row,
    fence,
    "",
  ].join("\n");
}

export function buildCheckComment({ id, lines }) {
  return [HANDLER_MARKER, `**Notice handler**: ran the check \`${id}\`.`, "", ...lines, ""].join("\n");
}

export function buildStopComment(rule) {
  return [HANDLER_MARKER, `**Notice handler**: stopped. Rule: ${STOP_RULES[rule]}. Handle this notice by hand.`, ""].join("\n");
}

export function buildCloseComment() {
  return [HANDLER_MARKER, "**Notice handler**: no action is required.", ""].join("\n");
}

/**
 * Chooses the one action for an issue. Throws when a fail-closed rule trips.
 * @returns {{action: "check", id: string}|{action: "row", value: object}|{action: "close"}}
 */
export function decideAction({ issue, comments, vendors }) {
  const value = readerValueOf(comments, vendors);
  if (!value) throw stop("no-reader-comment");
  const id = registryCheckId(issue.body);
  if (id !== null) return { action: "check", id: assertCheckId(id) };
  if (value.actionRequired) {
    if (value.vendor !== null && !vendors.includes(value.vendor)) throw stop("unregistered-vendor");
    return { action: "row", value };
  }
  return { action: "close" };
}

/**
 * Picks the oldest issue the handler may act on.
 * @param {object[]} issues open issues labelled mail-notice
 * @param {(n: number) => Promise<object[]>} commentsFor
 * @param {(n: number) => Promise<string>} gateFor the maintainer-review gate state
 * @param {number} [only] restrict to this issue number
 * @returns {Promise<number|null>}
 */
export async function selectNoticeToHandle({ issues, commentsFor, gateFor, vendors, only }) {
  const candidates = issues
    .filter((issue) => only === undefined || issue.number === only)
    .filter(isHandlerCandidate)
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
  for (const issue of candidates) {
    const comments = await commentsFor(issue.number);
    if (hasHandlerComment(comments) || !readerValueOf(comments, vendors)) continue;
    if ((await gateFor(issue.number)) === "approved") return issue.number;
  }
  return null;
}

/**
 * Runs the one action on one issue. It checks every rule again, so an issue the operator re-labelled
 * since the select job gets nothing. Returns the action name.
 */
export async function handleNotice({ repo = PRIVATE_REPO, number, token, fetchImpl = fetch, now = new Date(), registry = loadRegistry() }) {
  assertRepo(repo);
  const issue = assertIssueNumber(number);
  const opts = { token, fetchImpl };
  const record = await githubGet(`/repos/${repo}/issues/${issue}`, opts);
  if (!isHandlerCandidate(record)) throw new Error(`issue #${issue} is not an open notice the handler may act on`);
  const comments = await githubGetAll(`/repos/${repo}/issues/${issue}/comments`, opts);
  if (hasHandlerComment(comments)) throw new Error(`issue #${issue} already has a handler comment`);
  const state = await issueApprovalState({ repo, issue, token, fetchImpl });
  if (state !== "approved") throw new Error(`the maintainer-review gate is ${state} for issue #${issue}`);
  let decision;
  try {
    decision = decideAction({ issue: record, comments, vendors: registryVendors(registry) });
  } catch (error) {
    if (!error.rule) throw error;
    // The marker keeps select from picking this issue again, so the queue moves on.
    await postIssueComment({ repo, issue, body: buildStopComment(error.rule), ...opts });
    throw error;
  }

  if (decision.action === "close") {
    await postIssueComment({ repo, issue, body: buildCloseComment(), ...opts });
    await closeWithoutReply({ repo, issue, ...opts });
    return "close";
  }
  const body =
    decision.action === "check"
      ? buildCheckComment({ id: decision.id, lines: await CHECKS[decision.id]({ repo, ...opts, now }) })
      : buildRowComment({ issue, value: decision.value });
  // The label first, so a lost label stops the run before the comment that marks the issue handled.
  await ensureLabel({ repo, label: NOTICE_HANDLED_LABEL, ...opts });
  await addLabel({ repo, issue, label: NOTICE_HANDLED_LABEL, ...opts });
  assertLabelsKept(await githubGet(`/repos/${repo}/issues/${issue}`, opts), [NOTICE_HANDLED_LABEL]);
  await postIssueComment({ repo, issue, body, ...opts });
  return decision.action;
}

function argValue(argv, name) {
  const index = argv.indexOf(name);
  return index === -1 ? undefined : argv[index + 1];
}

async function main() {
  const argv = process.argv.slice(2);
  const [command] = argv;
  const token = process.env.GH_TOKEN;
  if (command === "select") {
    const input = argValue(argv, "--issue");
    const only = input ? assertIssueNumber(input) : undefined;
    const issues = await githubGetAll(`/repos/${PRIVATE_REPO}/issues?state=open&labels=${NOTICE_LABEL}`, { token });
    const number = await selectNoticeToHandle({
      issues,
      only,
      vendors: registryVendors(loadRegistry()),
      commentsFor: (n) => githubGetAll(`/repos/${PRIVATE_REPO}/issues/${n}/comments`, { token }),
      gateFor: (n) => issueApprovalState({ repo: PRIVATE_REPO, issue: n, token }),
    });
    const line = `issue-number=${number ?? ""}`;
    console.log(line);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${line}\n`);
  } else if (command === "act" && argValue(argv, "--issue")) {
    const number = assertIssueNumber(argValue(argv, "--issue"));
    const action = await handleNotice({ number, token });
    console.log(`#${number} ${action}`);
  } else {
    console.error("usage: notice-handle.mjs select [--issue <number>] | act --issue <number>");
    process.exit(1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
