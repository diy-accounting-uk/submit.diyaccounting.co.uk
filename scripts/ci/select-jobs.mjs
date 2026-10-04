#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/ci/select-jobs.mjs
//
// Builds the prompt for a workflow's select-jobs job and parses its answer. The mechanical
// `changes` job already turns every job below off on a docs-only push (see test.yml); this
// script only ever ADDS skips on top of that, for a job the mechanical filter still runs but
// that the diff shows has nothing left to prove for this change (e.g. a change confined to
// web/public leaves the Java CDK stack tests with nothing new to check). Skipping a job here
// means it had nothing this change could have broken, never that the job is unimportant.
//
// A malformed, failed, or empty answer is read as "skip nothing": every job stays on. An
// unrecognised job name in the answer is dropped rather than acted on.
//
// Two modes, named by what a decision does with its own advised skip list:
//   advisory  - the decision artifact records what the model would have skipped, but the
//               skip-json output is always "[]": every job still runs. This is the default.
//   enforcing - the skip-json output is the model's advised list, so a dependent job's `if:`
//               (test.yml's pattern) actually turns it off.
// Both modes still obey "main always runs everything" and "a malformed/failed/empty answer
// skips nothing" - the mode only changes what a NON-main, VALID answer gets to do.
//
// CLI usage from the select-jobs job in .github/workflows/test.yml or deploy.yml:
//   node scripts/ci/select-jobs.mjs prompt --context <json-file> --diff <file> --changed-files <file> [--catalogue test.yml|deploy.yml]
//   node scripts/ci/select-jobs.mjs decide --ref <github.ref> --claude-output <file> --context <json-file> --out <file> [--model-id <id>] [--prompt-hash <hash>] [--catalogue test.yml|deploy.yml] [--mode advisory|enforcing]
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
  {
    id: "behaviour-test-simulator-hmrc-assist",
    description: "HMRC Assist feedback on a VAT return and an Income Tax calculation, simulator.",
  },
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

// One entry per behaviour suite and stack-deploy job in deploy.yml that this trial (advisory
// only, see the module comment above) records an opinion on. No dependent job in deploy.yml
// reads this decision's output yet - unlike test.yml's catalogue above, nothing here is
// mechanically skippable - so the ids only need to match deploy.yml's own job keys closely
// enough for the comparison script (scripts/ci/select-jobs-trial.mjs) to look up each job's
// actual conclusion from the same run.
export const DEPLOY_SKIPPABLE_JOBS = [
  { id: "deploy-auth", description: "Deploys AuthStack (Cognito user pool, hosted UI, identity providers) via CDK." },
  { id: "deploy-hmrc", description: "Deploys HmrcStack (the VAT MTD Lambda functions and their API Gateway routes) via CDK." },
  { id: "deploy-hmrc-itsa", description: "Deploys HmrcItsaStack (the Income Tax MTD Lambda functions and routes) via CDK." },
  {
    id: "deploy-companies-house",
    description: "Deploys CompaniesHouseStack (confirmation statement and accounts filing Lambdas) via CDK.",
  },
  { id: "deploy-account", description: "Deploys AccountStack (customer account and bundle entitlement data) via CDK." },
  { id: "deploy-billing", description: "Deploys BillingStack (Stripe billing Lambdas and webhooks) via CDK." },
  { id: "deploy-diya-gl", description: "Deploys DiyaGlStack (the diya-gl subscription bundle's own resources) via CDK." },
  { id: "deploy-api", description: "Deploys the API Gateway stage and its stack wiring for this deployment." },
  { id: "deploy-edge", description: "Deploys EdgeStack (CloudFront distribution, WAF, and edge Lambdas) via CDK." },
  { id: "deploy-publish", description: "Publishes web/public assets to S3 and invalidates the CloudFront distribution." },
  { id: "deploy-ops", description: "Deploys OpsStack (alarms, dashboards, and the self-destruct timer) via CDK." },
  { id: "web-test-auth", description: "End-to-end sign-in and authentication behaviour against the deployed environment." },
  { id: "web-test-token-enforcement", description: "OAuth token enforcement behaviour against the deployed environment." },
  { id: "web-test-payment", description: "Stripe payment behaviour against the deployed environment." },
  { id: "web-test", description: "End-to-end VAT return submission journey against the deployed environment." },
  { id: "web-test-bundle", description: "Bundle purchase and entitlement behaviour against the deployed environment." },
  { id: "web-test-pass-redemption", description: "Practice licence pass redemption behaviour against the deployed environment." },
  { id: "web-test-post-vat-return-synthetic", description: "VAT return posting behaviour against the deployed environment." },
  { id: "web-test-practice-licence-synthetic", description: "Practice licence issuing behaviour against the deployed environment." },
  { id: "web-test-get-vat-return-synthetic", description: "Retrieval of a submitted VAT return against the deployed environment." },
  { id: "web-test-obligation-synthetic", description: "VAT obligations lookup against the deployed environment." },
  { id: "web-test-liability-synthetic", description: "VAT liabilities lookup against the deployed environment." },
  { id: "web-test-vat-payment-synthetic", description: "VAT payments lookup against the deployed environment." },
  { id: "web-test-vat-penalty-synthetic", description: "VAT penalties lookup against the deployed environment." },
  { id: "web-test-diya-gl-subscription", description: "diya-gl subscription bundle behaviour against the deployed environment." },
  {
    id: "web-test-fraud-prevention-headers-vat-synthetic",
    description: "HMRC fraud prevention header behaviour on a VAT return post, against the deployed environment.",
  },
  { id: "web-test-compliance-synthetic", description: "Compliance-page behaviour against the deployed environment." },
  { id: "web-test-help-synthetic", description: "Help pages behaviour against the deployed environment." },
  { id: "web-test-vatValidation-synthetic", description: "VAT return field validation behaviour against the deployed environment." },
  { id: "web-test-vatSchemes-synthetic", description: "VAT scheme selection behaviour against the deployed environment." },
  {
    id: "web-test-companies-house",
    description: "Companies House confirmation statement and accounts filing behaviour against the deployed environment.",
  },
  {
    id: "web-test-change-registered-office",
    description: "Companies House registered-office change behaviour against the real sandbox (only runs when opted in).",
  },
  {
    id: "web-test-change-registered-email",
    description: "Companies House registered-email change behaviour against the real sandbox (only runs when opted in).",
  },
  { id: "web-test-itsa-business-details-synthetic", description: "ITSA business details behaviour against the deployed environment." },
  { id: "web-test-itsa-obligations-synthetic", description: "ITSA obligations behaviour against the deployed environment." },
  { id: "web-test-itsa-uk-property-period-synthetic", description: "ITSA UK property period behaviour against the deployed environment." },
  {
    id: "web-test-itsa-uk-property-annual-synthetic",
    description: "ITSA UK property annual submission behaviour against the deployed environment.",
  },
  { id: "web-test-itsa-losses-and-claims-synthetic", description: "ITSA losses and claims behaviour against the deployed environment." },
  {
    id: "web-test-itsa-self-employment-period-synthetic",
    description: "ITSA self-employment period behaviour against the deployed environment.",
  },
  { id: "web-test-itsa-annual-submission-synthetic", description: "ITSA annual submission behaviour against the deployed environment." },
  { id: "web-test-itsa-final-declaration-synthetic", description: "ITSA final declaration behaviour against the deployed environment." },
  { id: "web-test-generate-pass-activity", description: "Pass-generation activity logging behaviour against the deployed environment." },
];

export const DEPLOY_SKIPPABLE_JOB_IDS = new Set(DEPLOY_SKIPPABLE_JOBS.map((job) => job.id));

// Keyed by the workflow file that calls this script, so the CLI can pick the matching catalogue
// with one flag instead of the caller assembling a jobs list by hand.
export const JOB_CATALOGUES = {
  "test.yml": SKIPPABLE_JOBS,
  "deploy.yml": DEPLOY_SKIPPABLE_JOBS,
};

export const JOB_ID_CATALOGUES = {
  "test.yml": SKIPPABLE_JOB_IDS,
  "deploy.yml": DEPLOY_SKIPPABLE_JOB_IDS,
};

// test.yml's push trigger already excludes main, but a workflow_dispatch or a workflow_call
// (deploy.yml's prod deploy) can still name it, and main's own deploy is the integration proof
// that always runs everything - so this job never advises anything there.
export function isEligibleRef(ref) {
  return ref !== "refs/heads/main";
}

// A built or generated file (a bundled library, a lockfile) can carry a diff larger than the
// model's prompt allows, and the job then fails with "Prompt is too long". Each file's diff over
// maxCharactersPerFile characters is replaced by its header and a one-line note; the file stays
// in the changed-files list, so the model still knows it changed.
export function limitDiff(diff, maxCharactersPerFile = 60000) {
  if (!diff) return diff;
  return diff
    .split(/(?=^diff --git )/m)
    .map((section) => {
      if (section.length <= maxCharactersPerFile) return section;
      const header = section.split("\n")[0];
      return `${header}\n(diff of ${section.length} characters omitted: over ${maxCharactersPerFile} characters)\n`;
    })
    .join("");
}

export function buildPrompt({ context, diff, changedFiles, jobs = SKIPPABLE_JOBS }) {
  const jobList = jobs.map((job) => `- ${job.id}: ${job.description}`).join("\n");
  const changedFilesList =
    changedFiles.length > 0 ? changedFiles.map((f) => `- ${f}`).join("\n") : "(none listed - judge from the diff below)";
  const diffBlock = diff && diff.trim().length > 0 ? diff : "(no diff available - treat every job as still needing to run)";
  return `You are deciding which of this workflow's jobs listed below can be skipped for this run
because this change has nothing left for them to prove. Skipping a job here means it has nothing
this change could have broken; it never means the job is unimportant. When genuinely unsure, do
not skip.

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
skipped. Return the bare JSON object with no markdown code fence.`;
}

function stripMarkdownCodeFence(str) {
  const trimmed = str.trim();
  const fencedMatch = /^```(?:\w+)?\n([\s\S]*)\n```$/.exec(trimmed);
  return fencedMatch ? fencedMatch[1] : trimmed;
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
    answer = typeof envelope.result === "string" ? JSON.parse(stripMarkdownCodeFence(envelope.result)) : envelope.result;
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

const MODES = new Set(["advisory", "enforcing"]);

// An unrecognised mode value (a typo in the workflow env, say) reads as advisory, the safer of
// the two: every job still runs, only the decision artifact's record of what would have been
// skipped changes shape.
function normaliseMode(mode) {
  return MODES.has(mode) ? mode : "advisory";
}

// The one place the "main -> skip nothing" rule is enforced. Main always wins, regardless of
// what a claude-output file (if one even exists) says or what mode is active - the workflow's
// own job-level gating is only a cost optimisation on top of this, never the source of truth
// for it.
//
// `skip` is always the model's own advised list, unaffected by mode, so a caller comparing
// advised skips against actual job results (the dual-run trial) reads the same field whichever
// mode produced it. `enforcedSkip` is what a dependent job's `if:` should act on: the advised
// list in "enforcing" mode, always empty in "advisory" mode.
export function decideForContext({ context, claudeOutputRaw, knownJobIds = SKIPPABLE_JOB_IDS, mode = "advisory" }) {
  const resolvedMode = normaliseMode(mode);
  const ref = context && context.ref;
  if (!isEligibleRef(ref)) {
    return { ok: true, skip: [], decisions: [], error: null, reason: "main: full run", mode: resolvedMode, enforcedSkip: [] };
  }
  if (typeof claudeOutputRaw !== "string" || claudeOutputRaw.length === 0) {
    return {
      ok: false,
      skip: [],
      decisions: [],
      error: "no claude output available (budget spent, kill switch on, or the agent step did not complete)",
      reason: null,
      mode: resolvedMode,
      enforcedSkip: [],
    };
  }
  const answer = parseAnswer(claudeOutputRaw, knownJobIds);
  const enforcedSkip = resolvedMode === "enforcing" ? answer.skip : [];
  return { ...answer, reason: null, mode: resolvedMode, enforcedSkip };
}

export function buildDecisionArtifact({ modelId, promptHash, catalogue, context, answer }) {
  return {
    modelId: modelId || null,
    promptHash: promptHash || null,
    catalogue: catalogue || null,
    context,
    mode: answer.mode,
    advisedSkip: answer.skip,
    enforcedSkip: answer.enforcedSkip,
    decisions: answer.decisions,
    ok: answer.ok,
    error: answer.error,
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

// Falls back to test.yml's catalogue for an unrecognised or missing --catalogue value, the
// same "unknown reads as the safe default" rule normaliseMode applies to --mode.
function resolveCatalogue(name) {
  return JOB_CATALOGUES[name] ? name : "test.yml";
}

function runPrompt(opts) {
  const context = readJson(opts.context, {});
  const diff = limitDiff(opts.diff && fs.existsSync(opts.diff) ? fs.readFileSync(opts.diff, "utf8") : "");
  const changedFiles =
    opts["changed-files"] && fs.existsSync(opts["changed-files"])
      ? fs
          .readFileSync(opts["changed-files"], "utf8")
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
      : [];
  const catalogue = resolveCatalogue(opts.catalogue);
  process.stdout.write(buildPrompt({ context, diff, changedFiles, jobs: JOB_CATALOGUES[catalogue] }));
}

function runDecide(opts) {
  const context = readJson(opts.context, {});
  if (!context.ref) context.ref = opts.ref || "";
  const claudeOutputRaw =
    opts["claude-output"] && fs.existsSync(opts["claude-output"]) ? fs.readFileSync(opts["claude-output"], "utf8") : "";
  const catalogue = resolveCatalogue(opts.catalogue);
  const answer = decideForContext({
    context,
    claudeOutputRaw,
    knownJobIds: JOB_ID_CATALOGUES[catalogue],
    mode: opts.mode,
  });
  const artifact = buildDecisionArtifact({
    modelId: opts["model-id"],
    promptHash: opts["prompt-hash"],
    catalogue,
    context,
    answer,
  });
  fs.writeFileSync(opts.out, JSON.stringify(artifact, null, 2));
  process.stdout.write(JSON.stringify(answer.enforcedSkip));
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
