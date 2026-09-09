# ITSA phase 2: the sandbox year

`scripts/itsa-sandbox-year.js` files a whole tax year against the HMRC sandbox with one test
user: four quarterly self-employment updates, an annual submission, a triggered and adjusted
business source adjustable summary, an intent-to-finalise calculation, and a final declaration.
It proves the phase 2 endpoints work end to end against real sandbox behaviour, the way
`_developers/hmrc/ITSA_SPIKE.md` proved the phase 1 read.

The script drives the sandbox directly with Playwright and `fetch`, the way the spike did. It
does not call this application's own deployed API, so it needs no ci deployment to run - only
the sandbox application's own credentials and a sandbox test user.

## What it proves

- A `204` from the final declaration.
- The fraud prevention header validator clean on the same header set every other call in the
  run used.

Both print at the end of the run and are written into the transcript.

## Prerequisites

- An AWS SSO session for the `submit-ci` profile: `aws sso login --sso-session diyaccounting`.
- `.env.proxy` at the repo root, with `HMRC_SANDBOX_BASE_URI`, `HMRC_SANDBOX_CLIENT_ID` and
  `DIY_SUBMIT_BASE_URL` set (already there for the proxy variant).
- Playwright's browsers installed: `npm run playwright:install`.
- A sandbox test user enrolled in `mtd-income-tax`, with a NINO:
  ```bash
  HMRC_TEST_USER_SERVICE_NAMES=mtd-income-tax scripts/proxy-secrets.sh node scripts/create-hmrc-test-user.js
  ```
  This writes `hmrc-test-user.json` (`userId`, `password`, `nino`) at the repo root. Point
  `ITSA_SANDBOX_TEST_USER_FILE` at it directly, or reuse an existing test user file that has
  the same three fields.

## The command

```bash
ITSA_SANDBOX_TEST_USER_FILE=./hmrc-test-user.json \
ITSA_SANDBOX_TAX_YEAR=2023-24 \
scripts/proxy-secrets.sh node scripts/itsa-sandbox-year.js
```

`ITSA_SANDBOX_TAX_YEAR` must be 2024-25 or earlier. The self-employment period-summary endpoint
this script calls only accepts submissions up to that year; from 2025-26 HMRC moves to a
cumulative submission model with different endpoints, which is out of this script's scope.

Add `ITSA_SANDBOX_HEADFUL=true` to watch the sign-in browser, and `ITSA_SANDBOX_OUT_DIR` to
change where the transcript and checkpoint id land (default `./target/itsa-sandbox-year`).

## What each phase should return

| Phase | Call | Expected |
|---|---|---|
| Reset | `DELETE .../vendor-state` (first run) or `POST .../checkpoints/{id}/restore` (later runs) | `204`/`404`, or `200`/`201`/`204` |
| Reset | `POST .../vendor-state/checkpoints` (first run only) | `201` with a checkpoint id |
| Setup | `POST .../test-support/business/{nino}` | `201` with `businessId` |
| Setup | `POST .../test-support/itsa-status/{nino}/{taxYear}` | `204` |
| Quarterly x4 | `POST .../self-employment/{nino}/{businessId}/period` | `200`/`201`, once per open obligation HMRC returned |
| Annual | `PUT .../self-employment/{nino}/{businessId}/annual/{taxYear}` | `204` |
| BSAS trigger | `POST .../adjustable-summary/{nino}/trigger` | `200` with `calculationId` |
| BSAS retrieve | `GET .../adjustable-summary/{nino}/self-employment/{calculationId}/{taxYear}` | `200` |
| BSAS adjust | `POST .../adjustable-summary/{nino}/self-employment/{calculationId}/adjust/{taxYear}` | `200`/`204` |
| Calculation trigger | `POST .../calculations/{nino}/self-assessment/{taxYear}/trigger/intent-to-finalise` | `202` with `calculationId` |
| Calculation retrieve | `GET .../calculations/{nino}/self-assessment/{taxYear}/{calculationId}` | `404` while HMRC is still calculating, then `200` with `metadata.calculationType` of `"intent-to-finalise"` |
| Final declaration | `POST .../calculations/{nino}/self-assessment/{taxYear}/{calculationId}/final-declaration` | `204` |
| Validator | `GET .../test/fraud-prevention-headers/validate` | no errors; the only acceptable warning names `gov-client-multi-factor` |

The script throws on any other status, with HMRC's response body in the error, rather than
skip a step or fall back to a guess.

## Where the responses go

Every call's request and response lands in
`${ITSA_SANDBOX_OUT_DIR:-./target/itsa-sandbox-year}/itsa-sandbox-year-transcript.json`, in call
order, with the NINO masked and the bearer token redacted. A run that fails partway still writes
what it has so far.

Use the transcript to correct the phase 2 simulator scenarios the way `_developers/hmrc/
ITSA_SPIKE.md`'s transcript corrected the phase 1 ones: for each new endpoint's route file under
`app/http-simulator/routes/itsa-*.js` and scenario file under `app/http-simulator/scenarios/
itsa-*.js`, compare the canned response against what the transcript recorded for the same call,
and fix any field name, status code or error shape that differs. The checkpoint-create response
is the one shape this script does not know in advance - `extractCheckpointId` in the script
tries several likely field names and fails loudly with the raw body if none match, so the first
real run either confirms the guess or tells you which field name to add.

## Idempotency

The script is safe to run repeatedly. The first run ever wipes the test user's sandbox data
with `DELETE .../vendor-state` and saves a checkpoint of that clean state to
`${ITSA_SANDBOX_OUT_DIR}/checkpoint-id.txt`. Every later run restores that checkpoint before
creating a fresh business, which undoes whatever the previous run left behind. Delete the
checkpoint file to force a fresh wipe-and-checkpoint on the next run.

## Assumptions taken from the plan's open questions

`PLAN_ITSA_PHASE_2.md`'s "Open questions" names five open points. Three affect what this script
does:

- **Q3, which approval stage to apply for.** The plan assumes in-year first. This script exists
  to test that stage's endpoints (Business Details, Obligations, Self-Employment Business,
  Individual Calculations) plus the end-of-year ones already built (BSAS, ITSA status). It does
  not touch Individual Losses or Individuals Tax Liability Adjustments, which have no build yet.
- **Q4, property income.** The plan assumes self-employment only. This script creates and files
  a self-employment business exclusively; a property business needs its own test-support and
  endpoint calls, not covered here.
- **Q5, whether the sandbox test user carries the year.** The plan assumes the existing test
  user plus test-support data, rather than a second test user. This script follows that: it
  takes any sandbox test user with a NINO and creates the business and ITSA status itself,
  rather than expecting a pre-configured one.

Two more choices are this script's own test data, not the plan's:

- The ITSA status it sets is `"MTD Mandated"` with reason `"Sign up - return available"`
  (`buildItsaStatusRequestBody` in the script). Change the constants there for a different
  status.
- The quarterly income and expense figures are fixed fixtures (`buildQuarterlyTestFigures`),
  turnover and a single `consolidatedExpenses` total rising slightly each quarter. They exist to
  give HMRC valid numbers, not to model a particular trader.
