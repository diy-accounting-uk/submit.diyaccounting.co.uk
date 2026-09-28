#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/ci/select-jobs.mjs
//
// Builds the prompt for test.yml's select-jobs job and parses its answer. The mechanical
// `changes` job already turns every job below off on a docs-only push (see test.yml); this
// script only ever ADDS skips on top of that, for a job the mechanical filter still runs but
// that the diff shows has nothing left to prove for this change (e.g. a change confined to
// web/public leaves the Java CDK stack tests with nothing new to check). Skipping a job here
// means it had nothing this change could have broken, never that the job is unimportant.
//
// A malformed, failed, or empty answer is read as "skip nothing": every job stays on. An
// unrecognised job name in the answer is dropped rather than acted on.
//
// CLI usage from the select-jobs job in .github/workflows/test.yml:
//   node scripts/ci/select-jobs.mjs prompt --context <json-file> --diff <file> --changed-files <file>
//   node scripts/ci/select-jobs.mjs decide --ref <github.ref> --claude-output <file> --context <json-file> --out <file> [--model-id <id>] [--prompt-hash <hash>]
//
// `decide` always writes a decision (never throws): on main it short-circuits to "skip nothing"
// without needing a claude-output file at all, and a missing or unreadable claude-output file
// (budget exhausted, kill switch on, or the agent step itself failed) reads the same as a
// malformed answer. The workflow job that calls this has no job-level `if:` and sets
// `continue-on-error: true`, so its own reported result is always success - GitHub Actions skips
// every job in a dependent's `needs:` whose result is 'skipped' or 'failure' by default (a plain
// `if:` with no status function has success() applied to it automatically), so a select-jobs job
// that could itself be skipped or fail would silently turn off every job depending on it,
// including the required npm test/maven test/eslint contexts. See:
// https://docs.github.com/en/actions/using-jobs/using-jobs-in-a-workflow ("If a job fails or is
// skipped, all jobs that need it are skipped unless the jobs use a conditional expression that
// causes the job to continue.") and
// https://docs.github.com/en/actions/learn-github-actions/expressions#status-check-functions ("A
// default status check of success() is applied unless you include one of these functions.")

import fs from "node:fs";

// One entry per job in test.yml already gated by `needs.changes.outputs.code == 'true'`. The id
// is the workflow's own YAML job key, so a decision names something the workflow can act on
// directly. Descriptions say what each job proves, not how it runs, so the model can judge
// whether this diff still needs that proof.
export const SKIPPABLE_JOBS = [
  {
    id: "lint-workflows",
    description: "Validates every workflow file's YAML and actionlint rules, and this repository's nested workflow_call permissions.",
  },
  { id: "lint-js", description: "eslint and Prettier/Spotless formatting checks, gated on JavaScript this change adds." },
  { id: "npm-test", description: "The repository's combined unit and system test command (npm test)." },
  { id: "npm-unit-test", description: "Unit tests with coverage (npm run test:coverage)." },
  { id: "npm-mcp-test", description: "The mcp/ package's own vitest suite, including the accounts iXBRL derivation." },
  { id: "npm-system-test", description: "System tests against a Dockerised local stack (npm run test:system)." },
  { id: "npm-test-web-unit", description: "Browser-side unit tests against the built bundle (npm run test:web-unit)." },
  { id: "npm-browser-test", description: "Playwright component tests against the UI (npm run test:browser)." },
  { id: "mvn-test", description: "The Java CDK infrastructure's unit tests (./mvnw clean test)." },
  { id: "npm-test-cdk-ci", description: "Synthesises and verifies the CDK app against the ci account." },
  { id: "npm-test-cdk-prod", description: "Synthesises and verifies the CDK app against the prod account." },
  {
    id: "behaviour-test-simulator-submit-vat",
    description: "End-to-end VAT return submission journey, against the in-process HTTP simulator.",
  },
  { id: "behaviour-test-simulator-post-vat-return", description: "End-to-end VAT return posting behaviour, simulator." },
  { id: "behaviour-test-simulator-practice-licence", description: "End-to-end practice licence issuing behaviour, simulator." },
  { id: "behaviour-test-simulator-get-vat-return", description: "End-to-end retrieval of a submitted VAT return, simulator." },
  { id: "behaviour-test-simulator-get-vat-obligations", description: "End-to-end VAT obligations lookup, simulator." },
  { id: "behaviour-test-simulator-get-vat-liabilities", description: "End-to-end VAT liabilities lookup, simulator." },
  { id: "behaviour-test-simulator-get-vat-payments", description: "End-to-end VAT payments lookup, simulator." },
  { id: "behaviour-test-simulator-get-vat-penalties", description: "End-to-end VAT penalties lookup, simulator." },
  {
    id: "behaviour-test-simulator-fraud-prevention-headers",
    description: "HMRC fraud prevention header behaviour on a VAT return post, simulator.",
  },
  { id: "behaviour-test-simulator-compliance", description: "End-to-end compliance-page behaviour, simulator." },
  { id: "behaviour-test-simulator-vat-validation", description: "VAT return field validation behaviour, simulator." },
  { id: "behaviour-test-simulator-vat-schemes", description: "VAT scheme selection behaviour, simulator." },
  { id: "behaviour-test-simulator-auth", description: "Sign-in and authentication journeys, simulator." },
  { id: "behaviour-test-simulator-bundle", description: "Bundle purchase and entitlement behaviour, simulator." },
  { id: "behaviour-test-simulator-help", description: "Help pages behaviour, simulator." },
  { id: "behaviour-test-simulator-pass-redemption", description: "Practice licence pass redemption behaviour, simulator." },
  { id: "behaviour-test-simulator-token-enforcement", description: "OAuth token enforcement behaviour, simulator." },
  { id: "behaviour-test-simulator-payment", description: "Stripe payment behaviour, simulator." },
  { id: "behaviour-test-simulator-generate-pass-activity", description: "Pass-generation activity logging behaviour, simulator." },
  {
    id: "behaviour-test-simulator-file-confirmation-statement",
    description: "Companies House confirmation statement filing behaviour, simulator.",
  },
  {
    id: "behaviour-test-simulator-file-micro-entity-accounts",
    description: "Companies House micro-entity accounts filing behaviour, simulator.",
  },
  { id: "behaviour-test-simulator-itsa-business-details", description: "ITSA business details behaviour, simulator." },
  { id: "behaviour-test-simulator-itsa-obligations", description: "ITSA obligations behaviour, simulator." },
  { id: "behaviour-test-simulator-itsa-self-employment-period", description: "ITSA self-employment period behaviour, simulator." },
  { id: "behaviour-test-simulator-itsa-annual-submission", description: "ITSA annual submission behaviour, simulator." },
  { id: "behaviour-test-simulator-itsa-uk-property-period", description: "ITSA UK property period behaviour, simulator." },
  {
    id: "behaviour-test-simulator-itsa-uk-property-annual-submission",
    description: "ITSA UK property annual submission behaviour, simulator.",
  },
  { id: "behaviour-test-simulator-itsa-losses-and-claims", description: "ITSA losses and claims behaviour, simulator." },
  { id: "behaviour-test-simulator-itsa-final-declaration", description: "ITSA final declaration behaviour, simulator." },
  {
    id: "behaviour-test-proxy-submit-vat",
    description:
      "The same VAT submission journey against the real local TLS proxy, Docker OAuth2 and the HMRC sandbox; only runs at all when the caller opted into runProxyBehaviourTests.",
  },
];

export const SKIPPABLE_JOB_IDS = new Set(SKIPPABLE_JOBS.map((job) => job.id));

// test.yml's push trigger already excludes main, but a workflow_dispatch or a workflow_call
// (deploy.yml's prod deploy) can still name it, and main's own deploy is the integration proof
// that always runs everything - so this job never advises anything there.
export function isEligibleRef(ref) {
  return ref !== "refs/heads/main";
}

export function buildPrompt({ context, diff, changedFiles, jobs = SKIPPABLE_JOBS }) {
  const jobList = jobs.map((job) => `- ${job.id}: ${job.description}`).join("\n");
  const changedFilesList =
    changedFiles.length > 0 ? changedFiles.map((f) => `- ${f}`).join("\n") : "(none listed - judge from the diff below)";
  const diffBlock = diff && diff.trim().length > 0 ? diff : "(no diff available - treat every job as still needing to run)";
  return `You are deciding which of test.yml's already-mechanically-gated jobs can additionally be
skipped for this run, on top of the paths/changes filter that already decided whether to run at
all. Skipping a job here means it has nothing this change could have broken; it never means the
job is unimportant. When genuinely unsure, do not skip.

## Invocation context
${JSON.stringify(context, null, 2)}

## Changed files
${changedFilesList}

## Diff since the last green run of this workflow on this branch
\`\`\`diff
${diffBlock}
\`\`\`

## Jobs you may choose to skip
${jobList}

Read further with Read/Grep/Glob if the diff alone does not tell you enough about what a job
covers.

Answer with ONLY a JSON object, no prose outside it, shaped exactly like:
{"decisions": [{"job": "<job id from the list above>", "skip": true|false, "reason": "<one sentence>"}]}

Include one decision per job in the list above. A job you do not mention is treated as not
skipped.`;
}

// claudeOutputRaw is the text `claude -p --output-format json` printed: the CLI's own envelope
// (subtype/is_error/result), where `result` is the model's final message. Anything that doesn't
// parse into a recognised decision list is read as "skip nothing" - never as a reason to fail
// the run: a job whose relevance this call could not judge stays on.
export function parseAnswer(claudeOutputRaw, knownJobIds = SKIPPABLE_JOB_IDS) {
  let envelope;
  try {
    envelope = JSON.parse(claudeOutputRaw);
  } catch {
    return { ok: false, skip: [], decisions: [], error: "claude output is not valid JSON" };
  }

  if (!envelope || envelope.subtype !== "success" || envelope.is_error) {
    return {
      ok: false,
      skip: [],
      decisions: [],
      error: `claude run did not succeed (subtype=${envelope && envelope.subtype})`,
    };
  }

  let answer;
  try {
    answer = typeof envelope.result === "string" ? JSON.parse(envelope.result) : envelope.result;
  } catch {
    return { ok: false, skip: [], decisions: [], error: "claude's result is not valid JSON" };
  }

  if (!answer || !Array.isArray(answer.decisions)) {
    return { ok: false, skip: [], decisions: [], error: "claude's result has no decisions array" };
  }

  const decisions = [];
  const skip = [];
  for (const entry of answer.decisions) {
    if (!entry || typeof entry.job !== "string") continue;
    if (!knownJobIds.has(entry.job)) continue; // unknown job names are ignored, never acted on
    const reason = typeof entry.reason === "string" ? entry.reason : "";
    const shouldSkip = entry.skip === true;
    decisions.push({ job: entry.job, skip: shouldSkip, reason });
    if (shouldSkip) skip.push(entry.job);
  }

  return { ok: true, skip, decisions, error: null };
}

// The one place the "main -> skip nothing" rule is enforced. Main always wins, regardless of
// what a claude-output file (if one even exists) says - the workflow's own job-level gating is
// only a cost optimisation on top of this, never the source of truth for it.
export function decideForContext({ context, claudeOutputRaw, knownJobIds = SKIPPABLE_JOB_IDS }) {
  const ref = context && context.ref;
  if (!isEligibleRef(ref)) {
    return { ok: true, skip: [], decisions: [], error: null, reason: "main: full run" };
  }
  if (typeof claudeOutputRaw !== "string" || claudeOutputRaw.length === 0) {
    return {
      ok: false,
      skip: [],
      decisions: [],
      error: "no claude output available (budget spent, kill switch on, or the agent step did not complete)",
      reason: null,
    };
  }
  return { ...parseAnswer(claudeOutputRaw, knownJobIds), reason: null };
}

export function buildDecisionArtifact({ modelId, promptHash, context, answer }) {
  return {
    modelId: modelId || null,
    promptHash: promptHash || null,
    context,
    answer,
    decidedAt: new Date().toISOString(),
  };
}

function readJson(filePath, fallback) {
  if (!filePath) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i += 2) {
    opts[argv[i].replace(/^--/, "")] = argv[i + 1];
  }
  return opts;
}

function runPrompt(opts) {
  const context = readJson(opts.context, {});
  const diff = opts.diff && fs.existsSync(opts.diff) ? fs.readFileSync(opts.diff, "utf8") : "";
  const changedFiles =
    opts["changed-files"] && fs.existsSync(opts["changed-files"])
      ? fs
          .readFileSync(opts["changed-files"], "utf8")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  process.stdout.write(buildPrompt({ context, diff, changedFiles }));
}

function runDecide(opts) {
  const context = readJson(opts.context, {});
  if (!context.ref) context.ref = opts.ref || "";
  const claudeOutputRaw =
    opts["claude-output"] && fs.existsSync(opts["claude-output"]) ? fs.readFileSync(opts["claude-output"], "utf8") : "";
  const answer = decideForContext({ context, claudeOutputRaw, knownJobIds: SKIPPABLE_JOB_IDS });
  const artifact = buildDecisionArtifact({
    modelId: opts["model-id"],
    promptHash: opts["prompt-hash"],
    context,
    answer,
  });
  fs.writeFileSync(opts.out, JSON.stringify(artifact, null, 2));
  process.stdout.write(JSON.stringify(answer.skip));
}

function main() {
  const [command, ...rest] = process.argv.slice(2);
  const opts = parseArgs(rest);
  if (command === "prompt") return runPrompt(opts);
  if (command === "decide") return runDecide(opts);
  throw new Error(`select-jobs.mjs: unknown command "${command}" (expected "prompt" or "decide")`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
