#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/ci/select-jobs-trial.mjs
//
// Compares select-jobs's advisory decisions against what each advised-skip job actually did in
// that same run. For each job class it tallies how many times the model advised a skip, how many
// of those skips were a miss (the job would have failed had it run), and the minutes that job's
// runtime would have saved. The bar this trial is judged against: zero misses across at least
// MIN_ADVISED_SKIPS_TO_MEET_BAR advised skips for a job class.
//
// deploy.yml calls test.yml with `uses:` (job id "test"), and a called workflow's `github.run_id`
// is the CALLER's - so test.yml's select-jobs job runs, and uploads its decision artifact, both
// on its own standalone runs and inside every deploy.yml run. The artifact name is prefixed by
// which catalogue produced it (select-jobs-decision-test-<run-id> / select-jobs-decision-deploy-
// <run-id>) so the two decisions in one deploy.yml run never collide, and gathering test.yml's
// catalogue reads both run sources - see runSourcesForCatalogue. Inside a deploy.yml run, GitHub
// Actions reports the called workflow's own jobs with the caller job's id as a prefix ("test / ");
// correlationNames applies that prefix before matching a decision's advised job ids against that
// run's job list.
//
// CLI usage:
//   node scripts/ci/select-jobs-trial.mjs --workflow test.yml|deploy.yml [--limit <n>] [--repo <owner/repo>]
//
// Prints a Markdown table to stdout. Requires the gh CLI to be authenticated against the target
// repository; the artifact download and job-conclusion lookups both go through it.

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";

export const MIN_ADVISED_SKIPS_TO_MEET_BAR = 50;

// Pure: reads the job-id -> display-name map straight from the workflow's own YAML, so a rename
// of a job's `name:` field can never desync this from what GitHub Actions actually reports. A
// job with no explicit `name:` is displayed as its own YAML key.
export function jobDisplayNames(workflowYamlText, jobIds) {
  const doc = yaml.load(workflowYamlText);
  const jobs = (doc && doc.jobs) || {};
  const names = {};
  for (const id of jobIds) {
    const job = jobs[id];
    names[id] = (job && job.name) || id;
  }
  return names;
}

// Pure: the artifact-name label each catalogue's select-jobs job uploads under. Kept as its own
// lookup, not a string transform of the catalogue name, so a third catalogue is a deliberate
// addition here rather than an accidental match on whatever the workflow file happens to be
// called.
export function artifactLabelForCatalogue(catalogue) {
  if (catalogue === "test.yml") return "test";
  if (catalogue === "deploy.yml") return "deploy";
  throw new Error(`select-jobs-trial.mjs: unknown catalogue "${catalogue}"`);
}

// Pure: which runs to gather one catalogue's decisions from, and what to prefix that catalogue's
// job display names with before matching them against each source's own job list. test.yml's
// select-jobs job runs, and uploads a decision, both standalone and inside every deploy.yml run
// (deploy.yml calls test.yml with `uses:`, job id "test") - GitHub Actions reports a called
// workflow's jobs with the caller job's id prefixed ("test / <job name>"), so the deploy.yml
// source carries that prefix. deploy.yml's own select-jobs job is never itself called this way,
// so its catalogue has a single, unprefixed source.
export function runSourcesForCatalogue(catalogue) {
  if (catalogue === "test.yml") {
    return [
      { workflowFile: "test.yml", jobNamePrefix: "" },
      { workflowFile: "deploy.yml", jobNamePrefix: "test / " },
    ];
  }
  if (catalogue === "deploy.yml") {
    return [{ workflowFile: "deploy.yml", jobNamePrefix: "" }];
  }
  throw new Error(`select-jobs-trial.mjs: unknown catalogue "${catalogue}"`);
}

// Pure: applies one source's job-name prefix to a catalogue's id -> display-name map, giving the
// exact names to look up in that source's own run job list.
export function correlationNames(displayNames, jobNamePrefix) {
  const prefixed = {};
  for (const [id, name] of Object.entries(displayNames)) prefixed[id] = `${jobNamePrefix}${name}`;
  return prefixed;
}

// Pure: durationSeconds is null when either timestamp is missing (the job never started, or the
// run is still in progress), which the tally below treats as "no minutes-saved evidence" rather
// than zero.
export function jobDurationSeconds(job) {
  if (!job || !job.started_at || !job.completed_at) return null;
  const started = Date.parse(job.started_at);
  const completed = Date.parse(job.completed_at);
  if (Number.isNaN(started) || Number.isNaN(completed) || completed < started) return null;
  return (completed - started) / 1000;
}

// Pure: one row per (run, catalogue job) that a decision artifact named. `conclusion` is
// whatever GitHub Actions reported for that job in that same run ('success', 'failure',
// 'skipped', 'cancelled', or null when the job never appears in that run's job list at all -
// e.g. it was already gated off mechanically before select-jobs ever ran).
export function tallyAdvisedSkips(rows) {
  const byJob = new Map();
  for (const row of rows) {
    if (!row.advisedSkip) continue;
    const entry = byJob.get(row.job) || { job: row.job, advisedSkips: 0, misses: 0, secondsSaved: 0 };
    entry.advisedSkips += 1;
    if (row.conclusion === "failure") entry.misses += 1;
    if (typeof row.durationSeconds === "number") entry.secondsSaved += row.durationSeconds;
    byJob.set(row.job, entry);
  }
  return [...byJob.values()]
    .map((entry) => ({
      job: entry.job,
      advisedSkips: entry.advisedSkips,
      misses: entry.misses,
      minutesSaved: Math.round((entry.secondsSaved / 60) * 10) / 10,
      meetsBar: entry.misses === 0 && entry.advisedSkips >= MIN_ADVISED_SKIPS_TO_MEET_BAR,
    }))
    .sort((a, b) => a.job.localeCompare(b.job));
}

export function renderMarkdownTable(tally) {
  if (tally.length === 0) return "No advised skips recorded in this range.";
  const header = "| Job | Advised skips | Misses | Minutes saved | Meets bar |\n| --- | --- | --- | --- | --- |";
  const body = tally.map((t) => `| ${t.job} | ${t.advisedSkips} | ${t.misses} | ${t.minutesSaved} | ${t.meetsBar ? "yes" : "no"} |`);
  return [header, ...body].join("\n");
}

function gh(args) {
  // eslint-disable-next-line sonarjs/no-os-command-from-path -- gh comes from the runner's PATH, as every workflow step's does
  return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 1024 * 1024 * 64 });
}

function ghJson(args) {
  return JSON.parse(gh(args));
}

// Downloads one run's decision artifact into a scratch directory and reads it back, returning
// null when the run has none (select-jobs itself was skipped, or the artifact already expired).
function readDecisionArtifact(repo, runId, artifactName, scratchDir) {
  const dir = path.join(scratchDir, artifactName);
  try {
    gh(["run", "download", String(runId), "--repo", repo, "--name", artifactName, "--dir", dir]);
  } catch {
    return null;
  }
  const decisionPath = path.join(dir, "decision.json");
  if (!fs.existsSync(decisionPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(decisionPath, "utf8"));
  } catch {
    return null;
  }
}

function fetchRunJobs(repo, runId) {
  const jobs = [];
  let page = 1;
  for (;;) {
    const response = ghJson(["api", `repos/${repo}/actions/runs/${runId}/jobs?per_page=100&page=${page}`]);
    jobs.push(...response.jobs);
    if (response.jobs.length < 100) break;
    page += 1;
  }
  return jobs;
}

export async function gatherRows({ repo, catalogue, limit, jobIds, workflowYamlText, scratchDir }) {
  const displayNames = jobDisplayNames(workflowYamlText, jobIds);
  const artifactLabel = artifactLabelForCatalogue(catalogue);
  const sources = runSourcesForCatalogue(catalogue);

  const rows = [];
  for (const source of sources) {
    const names = correlationNames(displayNames, source.jobNamePrefix);
    const runs = ghJson([
      "run",
      "list",
      "--repo",
      repo,
      "--workflow",
      source.workflowFile,
      "--limit",
      String(limit),
      "--json",
      "databaseId,status",
    ]).filter((run) => run.status === "completed");

    for (const run of runs) {
      const artifactName = `select-jobs-decision-${artifactLabel}-${run.databaseId}`;
      const decision = readDecisionArtifact(repo, run.databaseId, artifactName, scratchDir);
      if (!decision || !Array.isArray(decision.advisedSkip) || decision.advisedSkip.length === 0) continue;
      const jobs = fetchRunJobs(repo, run.databaseId);
      const byName = new Map(jobs.map((job) => [job.name, job]));
      for (const jobId of decision.advisedSkip) {
        const job = byName.get(names[jobId]);
        rows.push({
          job: jobId,
          advisedSkip: true,
          conclusion: job ? job.conclusion : null,
          durationSeconds: jobDurationSeconds(job),
        });
      }
    }
  }
  return rows;
}

function parseArgs(argv) {
  const opts = { limit: "50", repo: null };
  for (let i = 0; i < argv.length; i += 2) {
    opts[argv[i].replace(/^--/, "")] = argv[i + 1];
  }
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.workflow !== "test.yml" && opts.workflow !== "deploy.yml") {
    throw new Error('select-jobs-trial.mjs: --workflow must be "test.yml" or "deploy.yml"');
  }
  const repo = opts.repo || ghJson(["repo", "view", "--json", "nameWithOwner"]).nameWithOwner;
  const workflowYamlText = fs.readFileSync(`.github/workflows/${opts.workflow}`, "utf8");
  const { JOB_ID_CATALOGUES } = await import("./select-jobs.mjs");
  const jobIds = [...JOB_ID_CATALOGUES[opts.workflow]];
  const scratchDir = fs.mkdtempSync(path.join(os.tmpdir(), "select-jobs-trial-"));
  const rows = await gatherRows({
    repo,
    catalogue: opts.workflow,
    limit: Number(opts.limit),
    jobIds,
    workflowYamlText,
    scratchDir,
  });
  fs.rmSync(scratchDir, { recursive: true, force: true });
  process.stdout.write(renderMarkdownTable(tallyAdvisedSkips(rows)) + "\n");
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
