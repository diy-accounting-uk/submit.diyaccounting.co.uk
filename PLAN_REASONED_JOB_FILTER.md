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

Open. The trial table is recorded under Trial results. Still open:

- 32 `test.yml` job classes have one or more misses, so none of them meets the bar.
- Three classes are short of 50 advised skips (named under Trial results). Re-run both commands once they reach 50.
- Two runs in the window could not be read (40135982978 and 39711517243). The script skips them after retries; a fix to read them is open.
- The classes that meet the bar are ready for JF-2 and JF-3 (see Trial results).

Model: Haiku. Size: ~1 file.

### Trial results

Run window read (first and last run date, completed runs only):

- `deploy.yml` source: 2026-09-30 to 2026-10-25, 199 runs.
- `test.yml` source: 2026-09-28 to 2026-10-25, 200 runs. The `test.yml` catalogue also reads the `deploy.yml` source above for its `test /` jobs.

#### deploy.yml

| Job class | Advised skips | Would have missed | Minutes saved | Meets bar |
| --- | --- | --- | --- | --- |
| deploy-account | 85 | 0 | 0 | yes |
| deploy-api | 64 | 0 | 174.2 | yes |
| deploy-auth | 81 | 0 | 0 | yes |
| deploy-billing | 83 | 0 | 0 | yes |
| deploy-companies-house | 65 | 0 | 0 | yes |
| deploy-diya-gl | 86 | 0 | 0 | yes |
| deploy-edge | 66 | 0 | 0 | yes |
| deploy-hmrc | 80 | 0 | 0 | yes |
| deploy-hmrc-itsa | 81 | 0 | 0 | yes |
| deploy-mcp | 31 | 0 | 0 | no |
| deploy-ops | 74 | 0 | 0 | yes |
| deploy-publish | 29 | 0 | 67.8 | no |
| web-test | 77 | 0 | 0 | yes |
| web-test-auth | 82 | 0 | 0 | yes |
| web-test-bundle | 82 | 0 | 0 | yes |
| web-test-change-registered-email | 82 | 0 | 0 | yes |
| web-test-change-registered-office | 78 | 0 | 0 | yes |
| web-test-companies-house | 59 | 0 | 0 | yes |
| web-test-compliance-synthetic | 86 | 0 | 0 | yes |
| web-test-diya-gl-subscription | 83 | 0 | 0 | yes |
| web-test-fraud-prevention-headers-vat-synthetic | 82 | 0 | 0 | yes |
| web-test-generate-pass-activity | 84 | 0 | 0 | yes |
| web-test-get-vat-return-synthetic | 86 | 0 | 0 | yes |
| web-test-help-synthetic | 85 | 0 | 0 | yes |
| web-test-itsa-annual-submission-synthetic | 80 | 0 | 0 | yes |
| web-test-itsa-business-details-synthetic | 86 | 0 | 0 | yes |
| web-test-itsa-final-declaration-synthetic | 80 | 0 | 0 | yes |
| web-test-itsa-losses-and-claims-synthetic | 82 | 0 | 0 | yes |
| web-test-itsa-obligations-synthetic | 87 | 0 | 0 | yes |
| web-test-itsa-self-employment-period-synthetic | 79 | 0 | 0 | yes |
| web-test-itsa-uk-property-annual-synthetic | 84 | 0 | 0 | yes |
| web-test-itsa-uk-property-period-synthetic | 83 | 0 | 0 | yes |
| web-test-liability-synthetic | 88 | 0 | 0 | yes |
| web-test-obligation-synthetic | 83 | 0 | 0 | yes |
| web-test-pass-redemption | 86 | 0 | 0 | yes |
| web-test-payment | 81 | 0 | 0 | yes |
| web-test-post-vat-return-synthetic | 78 | 0 | 0 | yes |
| web-test-practice-licence-synthetic | 88 | 0 | 0 | yes |
| web-test-token-enforcement | 84 | 0 | 0 | yes |
| web-test-vat-payment-synthetic | 88 | 0 | 0 | yes |
| web-test-vat-penalty-synthetic | 88 | 0 | 0 | yes |
| web-test-vatSchemes-synthetic | 89 | 0 | 0 | yes |
| web-test-vatValidation-synthetic | 85 | 0 | 0 | yes |

Runs read: 199. Skipped runs: 2 (40135982978 and 39711517243; the jobs read failed after retries).

#### test.yml

| Job class | Advised skips | Would have missed | Minutes saved | Meets bar |
| --- | --- | --- | --- | --- |
| behaviour-test-proxy-submit-vat | 224 | 0 | 0 | yes |
| behaviour-test-simulator-auth | 196 | 2 | 155.4 | no |
| behaviour-test-simulator-bundle | 193 | 0 | 192.3 | yes |
| behaviour-test-simulator-company-tax-return | 39 | 0 | 56.4 | no |
| behaviour-test-simulator-compliance | 212 | 2 | 150 | no |
| behaviour-test-simulator-file-confirmation-statement | 181 | 2 | 341.5 | no |
| behaviour-test-simulator-file-micro-entity-accounts | 153 | 0 | 251.9 | yes |
| behaviour-test-simulator-fraud-prevention-headers | 202 | 2 | 228.6 | no |
| behaviour-test-simulator-generate-pass-activity | 210 | 2 | 228.9 | no |
| behaviour-test-simulator-get-vat-liabilities | 200 | 2 | 461.7 | no |
| behaviour-test-simulator-get-vat-obligations | 195 | 2 | 907.3 | no |
| behaviour-test-simulator-get-vat-payments | 200 | 2 | 466.8 | no |
| behaviour-test-simulator-get-vat-penalties | 199 | 2 | 582.1 | no |
| behaviour-test-simulator-get-vat-return | 198 | 2 | 290.3 | no |
| behaviour-test-simulator-help | 207 | 3 | 442 | no |
| behaviour-test-simulator-hmrc-assist | 114 | 2 | 366.8 | no |
| behaviour-test-simulator-itsa-annual-submission | 190 | 2 | 208.9 | no |
| behaviour-test-simulator-itsa-business-details | 197 | 2 | 389.3 | no |
| behaviour-test-simulator-itsa-final-declaration | 192 | 2 | 342.5 | no |
| behaviour-test-simulator-itsa-losses-and-claims | 191 | 2 | 215.1 | no |
| behaviour-test-simulator-itsa-obligations | 202 | 2 | 276.8 | no |
| behaviour-test-simulator-itsa-self-employment-period | 190 | 2 | 286 | no |
| behaviour-test-simulator-itsa-uk-property-annual-submission | 197 | 2 | 223 | no |
| behaviour-test-simulator-itsa-uk-property-period | 196 | 2 | 269.4 | no |
| behaviour-test-simulator-pass-redemption | 207 | 2 | 265.4 | no |
| behaviour-test-simulator-payment | 196 | 2 | 261.1 | no |
| behaviour-test-simulator-post-vat-return | 181 | 2 | 496.9 | no |
| behaviour-test-simulator-practice-licence | 210 | 3 | 224.7 | no |
| behaviour-test-simulator-submit-vat | 157 | 1 | 237.6 | no |
| behaviour-test-simulator-token-enforcement | 203 | 2 | 312.4 | no |
| behaviour-test-simulator-vat-schemes | 210 | 2 | 476 | no |
| behaviour-test-simulator-vat-validation | 206 | 2 | 150.4 | no |
| lint-js | 55 | 1 | 60.8 | no |
| lint-workflows | 149 | 0 | 20.5 | yes |
| mvn-test | 145 | 0 | 306.7 | yes |
| npm-browser-test | 141 | 1 | 764.1 | no |
| npm-mcp-test | 162 | 0 | 83.5 | yes |
| npm-system-test | 132 | 0 | 92.9 | yes |
| npm-test | 56 | 1 | 109.3 | no |
| npm-test-cdk-ci | 146 | 0 | 419.1 | yes |
| npm-test-cdk-prod | 146 | 0 | 431.3 | yes |
| npm-test-web-unit | 159 | 0 | 71.4 | yes |
| npm-unit-test | 63 | 1 | 137.5 | no |

Runs read: 200 `test.yml` runs and 199 `deploy.yml` runs. Skipped runs: 2 (40135982978 and 39711517243).

Meets the bar: deploy.yml: deploy-account, deploy-api, deploy-auth, deploy-billing, deploy-companies-house, deploy-diya-gl, deploy-edge, deploy-hmrc, deploy-hmrc-itsa, deploy-ops, web-test, web-test-auth, web-test-bundle, web-test-change-registered-email, web-test-change-registered-office, web-test-companies-house, web-test-compliance-synthetic, web-test-diya-gl-subscription, web-test-fraud-prevention-headers-vat-synthetic, web-test-generate-pass-activity, web-test-get-vat-return-synthetic, web-test-help-synthetic, web-test-itsa-annual-submission-synthetic, web-test-itsa-business-details-synthetic, web-test-itsa-final-declaration-synthetic, web-test-itsa-losses-and-claims-synthetic, web-test-itsa-obligations-synthetic, web-test-itsa-self-employment-period-synthetic, web-test-itsa-uk-property-annual-synthetic, web-test-itsa-uk-property-period-synthetic, web-test-liability-synthetic, web-test-obligation-synthetic, web-test-pass-redemption, web-test-payment, web-test-post-vat-return-synthetic, web-test-practice-licence-synthetic, web-test-token-enforcement, web-test-vat-payment-synthetic, web-test-vat-penalty-synthetic, web-test-vatSchemes-synthetic, web-test-vatValidation-synthetic. test.yml: behaviour-test-proxy-submit-vat, behaviour-test-simulator-bundle, behaviour-test-simulator-file-micro-entity-accounts, lint-workflows, mvn-test, npm-mcp-test, npm-system-test, npm-test-cdk-ci, npm-test-cdk-prod, npm-test-web-unit.

Short of 50 advised skips: deploy.yml: deploy-mcp (31), deploy-publish (29). test.yml: behaviour-test-simulator-company-tax-return (39).

### Rules from the evidence

Source: the `reason` of every advised skip in the last 149 `test.yml` and 118 `deploy.yml`
decision artifacts, for the classes at the bar.

| Pattern | Where | Classes | Skips for it |
| --- | --- | --- | --- |
| Markdown only | `changes` job `code` output (existing) | `npm test`, `maven test`, `eslint` and the rest | 2 to 4 per class |
| `.md`, `videos/` or `web/public/videos/` only | `changes` job `build` output (added) | `mvn-test`, `npm-test-cdk-ci`, `npm-test-cdk-prod`, `npm-mcp-test`, `lint-workflows` | 7 to 14 per class, including documentation-only |

`npm-test-web-unit` and `npm-system-test` stay on the model: `web/unit-tests/videos-manifest.test.js`
and `app/unit-tests/video/*` read `videos/*.json` and the video manifest.

Repeated reasons with no mechanical form: "behaviour tests only" for a change under
`behaviour-tests/` (the unit-level classes cannot be tied to a path list without reading each
suite's imports), and `runProxyBehaviourTests=false` for `behaviour-test-proxy-submit-vat`
(already an input of the job). No `.claude/` pattern is separable in the reasons.

### JF-2. Rules from evidence (was B82d, BACKLOG 82d)

Open: the 9 of 118 `deploy.yml` runs whose change was video assets only (the model skipped 40 or
more stack and web-test jobs each). `web/public/videos/**` is published by `PublishStack`, so a
rule needs a publish-only path; `paths:` and `skip deploy check` have no such path today.
Model: Sonnet. Size: ~1 file.

### JF-3. Gradual rollout (was B82c, BACKLOG 82c)

Enforce the filter one workflow and one job class at a time: unit-level jobs first, then
behaviour suites, deploy stack jobs last. Each step stays only while the miss count stays at zero,
with a switch to run everything; `main` stays on a full run. After JF-1, for the classes that met
the bar. Model: Sonnet. Size: ~3 files.

