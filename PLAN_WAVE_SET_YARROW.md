<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: wave set `yarrow`

A tracking document. Each row's brief is on `NEXT.md`; this file says which rows are in the set,
which wave and batch builds each, and what state each wave is in. The method is the `wave-set`
skill (`.claude/skills/wave-set/SKILL.md`), section "How a set is delivered". Cloud workers build
the code rows under `/collab-loop`; the laptop lands, pushes and runs the proofs that need AWS,
Chrome or the operator.

## Operator assertions (verbatim, 2026-11-19)

> board TU1 and start LANG11c and OS18d and CH60 adding them to the wave set for /collab-loop

## Status

approved 2026-11-19 (the operator's message above). ops pushed: CH62 (7fc8c19b3) and RDR2
(6fad6e878) on `claude/yarrow-ops`, PR #851. sheets building (TU1). Beside: LANG11c, OS18d and
CH60 running on the laptop.

## The goal

One pull request per repository, gated in the cloud before its push, so the set costs one ci
deployment and one prod deployment for submit and one pull request run for spreadsheets.

## The set

- submit: 2 rows in one PR (CH62, RDR2).
- spreadsheets: 1 row in one PR (TU1).
- Beside, with no pull request: LANG11c (a test case and a draft email), OS18d (a recording and
  an unlisted upload), CH60 (a read of the ci receipts that proves the presenter poll).

## Waves

### Wave 1

| Batch | Rows | Model | Files the batch owns |
|---|---|---|---|
| ops (`claude/yarrow-ops`) | CH62, RDR2 | Sonnet | `app/services/companiesHousePresenterPoll.js`, `app/services/companiesHouseSubmissionStatus.js`, `app/services/companiesHouseXmlGateway.js`, their unit tests; `.github/workflows/deploy-cdk-stack.yml`, `.env.ci` |
| sheets (spreadsheets `claude/yarrow-sheets`) | TU1 | Opus (design), Sonnet (build) | the new workflow, its script and test, in `../spreadsheets.diyaccounting.co.uk` |

State: ops pushed (PR #851); sheets building.

### Beside

| Row | Runs where | What it leaves |
|---|---|---|
| LANG11c | laptop (mail mirror, `email-draft` on Opus) | `target/companies-house-review/2026-11-19-welsh/test-submission/`, a draft under `../private.diyaccounting.co.uk/companies-house/correspondence/` |
| OS18d | laptop (Claude in Chrome on claude.ai, prod YouTube credentials) | an unlisted video, `demo_recording_url`, `target/chatgpt-plugin/diya-submit.zip` |
| CH60 | laptop (ci AWS read) | the final status of 00006W to 00006Z on the synthetic user's ci receipts |

## Gates

- ops: `npm run bundle`, `npm test`, `./mvnw clean verify`, ESLint and Prettier on the changed
  files, actionlint on `deploy-cdk-stack.yml`, each run by a cloud worker on the batch head.
- sheets: the gates the spreadsheets `CLAUDE.md` names for the files TU1 touches, with
  `VITEST_MAX_WORKERS=2`; `test.yml` on the pull request runs the rest.

## The push

1. ops: push `claude/yarrow-ops` once both rows are landed and gated; open one PR; `/watch`;
   `/auto-merge`; `/watch` the prod deploy.
2. ci proof: RDR2, one HMRC connect on ci with an account that holds no test bundle.
3. prod proof: CH62, alarm #849 back to OK through office hours, then closed.
4. sheets: push `claude/yarrow-sheets` with `SKIP_PUSH_TESTS=1`; open one PR in spreadsheets;
   watch its `test.yml`; merge through that repository's `auto-merge`.

## After the deploy

- TU1's own proof: two runs on one commit with no gov.uk change commit nothing.

## When the set branch fails

Fix the failure as a task on the batch, gate again on the new head, push once.
