---
name: ga4-property-sync
description: Sync a per-environment GA4 property, data stream and BigQuery link for submit, and land the measurement id on the matching GitHub Environment. Invoke when a submit environment needs its own GA4 property, or when its hostname or BigQuery link changes.
---

# ga4-property-sync — one GA4 property per submit environment

`scripts/ga4-property-sync.js` finds or creates, for one submit environment, the GA4
property, its web data stream, and its BigQuery link to the `diyaccounting-ga4` project.
It then sets `SUBMIT_GA4_MEASUREMENT_ID` on the matching GitHub Environment.

This is a separate split from the single shared "DIY Accounting" property that already
covers the gateway, spreadsheets and submit production sites (recorded in
`google-analytics.toml`). This script never touches that property.

## When to run it

- A new submit environment needs its own GA4 property (for example, a fresh ci rebuild).
- The environment's hostname changed, so the data stream needs to point somewhere new.
- The BigQuery link's location or export settings need to change.

## Display name convention

A property is named `DIY Accounting Submit (ci)` or `DIY Accounting Submit (prod)`. The
script finds a property by matching this display name exactly, so a property renamed by
hand in the GA4 UI stops being found — the next run proposes creating a duplicate. If you
rename a property, update it back to the convention first.

## Prerequisites

```bash
aws sso login --sso-session diyaccounting
npm ci
```

The service account's key lives in AWS Secrets Manager as
`prod/submit/ga4/service_account`, in the submit-prod account. Fetch it into the
environment of a single command, so it never lands in a shell history file or a log:

```bash
GA4_SERVICE_ACCOUNT_JSON="$(aws --profile submit-prod secretsmanager get-secret-value --secret-id prod/submit/ga4/service_account --query SecretString --output text)"
```

## Step 1 — dry run first

Always dry run before a real sync:

```bash
GA4_SERVICE_ACCOUNT_JSON="$GA4_SERVICE_ACCOUNT_JSON" node scripts/ga4-property-sync.js --environment ci --hostname ci-submit.diyaccounting.co.uk --dry-run
```

This reads the current GA4 account, properties, data streams and BigQuery links — real
read calls, no writes — and prints what it would create or update, plus the
`SUBMIT_GA4_MEASUREMENT_ID` value it would set. Nothing changes in Google or GitHub. Show
the operator this plan before doing anything else.

## Step 2 — for real, on a "go"

Drop `--dry-run` once the operator has seen the plan:

```bash
GA4_SERVICE_ACCOUNT_JSON="$GA4_SERVICE_ACCOUNT_JSON" node scripts/ga4-property-sync.js --environment ci --hostname ci-submit.diyaccounting.co.uk
```

This creates whatever the plan proposed, then runs `gh variable set SUBMIT_GA4_MEASUREMENT_ID --env ci --body <measurement id>`.

Repeat for `--environment prod --hostname submit.diyaccounting.co.uk` on its own separate
"go", per this repo's confirm rule (`CLAUDE.md`).

## Where the measurement id lands

`SUBMIT_GA4_MEASUREMENT_ID` is a GitHub Environment variable, one value per environment
(`ci`, `prod`), set with `gh variable set --env <environment>`. It is not a secret —
measurement ids are visible in every page's source.

`web/public/lib/analytics.js` does not read this variable yet: it still calls `gtag`
with the single shared property's hardcoded measurement id (`G-T81V5NL5MB`). Wiring that
file to read `SUBMIT_GA4_MEASUREMENT_ID` at build or deploy time is separate work; this
script only makes the value available for that wiring, in each environment.

## Useful flags

- `--environment <ci|prod>` — which submit environment to sync. Required.
- `--hostname <host>` — the hostname the web data stream should track. Required.
- `--dry-run` — read and list only, no writes to Google or GitHub.
