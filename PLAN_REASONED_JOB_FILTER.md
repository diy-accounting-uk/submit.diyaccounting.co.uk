<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Reasoned job filter

A model-driven job filter (`select-jobs`) that skips CI jobs a change has nothing left to prove
for, earned by evidence before it may skip anything.

## Operator assertions

- 2026-09-27 (backlog rows 82a to 82d): `main` always runs everything; `deploy.yml` goes first in
  the trial, because its behaviour suites and stack jobs are the 35 to 45 minutes; decisions are
  pinned as artifacts so the comparison is like with like; the miss bar is set before the trial
  starts; repeated skips become mechanical rules.
- 2026-09-29: "Pull all of the chain of B82b2/82b and B82d/82d and B82c/82c out of NEXT.md and
  out of BACKLOG.md (if present) and into a PLAN_*.md doc (creating 1 if non exists)."

## Where it stands

- `select-jobs` runs in advisory mode on every branch push. In `.github/workflows/deploy.yml`
  (the `select-jobs` job, comment at line 235) nothing reads its output. It uploads a decision
  artifact per run (`select-jobs-decision-deploy-<run-id>`, `select-jobs-decision-test-<run-id>`).
- `.github/workflows/test.yml` already gates `lint-workflows` (line 158) and `lint-js` (line 201)
  on its `skip-json` output, so those two jobs can already be skipped; JF-1's table shows their
  record like any other class.
- `scripts/ci/select-jobs-trial.mjs --workflow deploy.yml|test.yml [--limit <n>]` compares each
  advised skip with what that job did in the same run and prints a Markdown table per job class:
  advised skips, misses (a skipped job that would have failed), minutes saved.
- PR #408 fixed the trial's parsing (the fenced answer) and moved the prompt to stdin after the
  argument overflowed on a large batch.

## The bar

Zero missed failures across at least 50 advised skips per job class. Set before the trial; a
job class that meets it goes to JF-3 with the minutes it would have saved.

## Tasks

### JF-1. The trial table (was B82b2, BACKLOG 82b)

Once branch pushes have accrued at least 50 advised skips per job class, run
`node scripts/ci/select-jobs-trial.mjs --workflow deploy.yml --limit 200` and
`--workflow test.yml`, record the per-job table in this plan under "Trial results", and name the
job classes that meet the bar. A class short of 50 is listed with its count. Blocked on 50
advised skips per job class accruing (branch pushes only; no date). Model: Haiku. Size: ~1 file.

### JF-2. Rules from evidence (was B82d, BACKLOG 82d)

When JF-1's records show the model skipping the same job for the same kind of change, propose
that as a mechanical `paths:` or `changes` rule in a PR (as electron/forge #4387 did), so the
deterministic filter grows from the model's evidence and the run-time call is left to the cases a
rule cannot express. After JF-1. Model: Sonnet. Size: ~1 file.

### JF-3. Gradual rollout (was B82c, BACKLOG 82c)

Enforce the filter one workflow and one job class at a time: unit-level jobs first, then
behaviour suites, deploy stack jobs last. Each step stays only while the miss count stays at zero,
with a switch to run everything; `main` stays on a full run. After JF-1, for the classes that met
the bar. Model: Sonnet. Size: ~3 files.

## Trial results

None recorded yet.
