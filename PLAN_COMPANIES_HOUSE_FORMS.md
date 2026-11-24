<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: Companies House forms on prod and the filing proofs

## Operator assertions (verbatim)

> "The changes I want are: The FSB offer chain, the donators offer chain, the CT in prod chain." (operator, 2026-11-24)

The operator asked to keep only those three chains and the defects on `NEXT.md`. This plan holds the tasks that left it.

Recorded in the moved rows: the XML team decides test accounts by hand and nobody asks it to (operator, 2026-11-20: no email); the OXF1 draft is the operator's to send.

## Goal

The new Companies House forms join prod's list when the XML team approves each form type, and the filing suites run on the proxy lane, on ci and on prod.

**Status**: 6 open tasks (OXF1, XF2, CHT1, CHT2, LOOK1, CH60), tracked here, not on `NEXT.md`. The Companies House approval plan is `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_COMPANIES_HOUSE_APPROVAL.md`.

## Tasks

| Label | Class | State | Blocked by | Unblocks | Repository |
| --- | --- | --- | --- | --- | --- |
| OXF1 | human-driven | ready | the operator sends the draft | XF2 | private |
| XF2 | machine-only | blocked | OXF1 (the XML team's approval) | nothing | submit |
| CHT1 | machine-only | ready | nothing | CHT2 | submit |
| CHT2 | machine-only | blocked | CHT1 (one worker builds both) | nothing | submit |
| LOOK1 | machine-only | ready | nothing | nothing | submit |
| CH60 | machine-only (a read) | blocked | a live accounts filing on prod that answers pending | nothing | submit |

Model, size and repository are in each entry. "Blocked by" lists the tasks and events not yet done.

## Briefs

### OXF1. The operator asks the XML team to review the new form types

Claude drafts with the `email-draft` skill: the form types, XF1's submission numbers, and the request that each form type joins the live package. The operator sends it. The email also asks what the builds could not read from a published source: ARD1, what the 4-character `ExtensionAuthorisedCode` is and which reject codes an extension past 18 months returns; LOC1, whether the charge codes `CHARGEEWNI` and `CHARGESC` mean what their names suggest, and which code carries AD03's "Historic register of members"; NAME1, how the copy of the resolution reaches Companies House for a change of name filed by software, whether form NM06 is needed for a sensitive name, and whether a test submission is charged; AD04, why a move of the registers back to the registered office answers "No element 'RemoveSAILAddressInd'"; NM01, why a change of name with a sensitive word answers "Unknown method get_NameAuthorisation". A form's activity is listed for prod only after the XML team approves its form type. Every form type passed the test gateway's envelope and schema on 2026-11-22; the submission numbers and answers are in `../private.diyaccounting.co.uk/companies-house/xmlgw-evidence/XF1_TEST_SUBMISSIONS_2026-11-22.md`, and a test filing does not reach the public register (60 reads over 30 minutes after 00008Q's ACCEPT). **Source**: CL5, 2026-11-22. The draft is written (`../private.diyaccounting.co.uk/companies-house/correspondence/DRAFT_EMAIL_XMLGW_NEW_FORM_TYPES_2026-11-22.md`, by the `email-draft` skill, a reply on the thread "Submission 000004 status and GetSubmissionStatus query"); the operator reads it and sends it from the operator's address to xml@companieshouse.gov.uk, and the reply goes into a file beside it. **Owner**: Operator (send). **Model**: none. **Size**: 0 files. **Repository**: private. **Class**: human-driven. **State**: ready. **Blocked by**: the operator sends the draft. **Unblocks**: XF2.

### XF2. List each new Companies House form on prod when the XML team approves its form type

The eleven form types (OFF1 to OFF3, PSC1 to PSC4, SH1, ARD1, NAME1 with NAME2's fee, LOC1) are on `main` (PR #860), each activity not listed for prod. When OXF1's reply approves a form type: add `prod` to that activity's `environments` in `web/public/submit.catalogue.toml`; change its row of `AVAILABILITY` in `scripts/build-mtd-calendar.mjs` and run `npm run build:mtd-calendar`; move the tests that list prod's activities (`app/unit-tests/services/prodSurface.test.js`). Gates: `npm test`; `web/browser-tests/hiddenContent.browser.test.js`. Blocked on OXF1 (the XML team's approval). **Source**: CL5, 2026-11-22. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files. **Repository**: submit. **Class**: machine-only. **State**: blocked. **Blocked by**: OXF1 (the XML team's approval). **Unblocks**: nothing.

### CHT1. The Companies House filing suites read the test sign-in on the proxy lane

The `ci` environment holds the test sign-in (the variable `TEST_COMPANIES_HOUSE_USER_ID`, the secrets `TEST_COMPANIES_HOUSE_PASSWORD` and `TEST_COMPANIES_HOUSE_TOTP_SECRET`, set on 2026-10-20), and `probe-test.yml` passes them on ci. The proxy lane gets none of them: `scripts/proxy-secrets.sh` reads Secrets Manager only, and a session cannot read a GitHub secret back. Build: `deploy-environment.yml` writes the two secrets to Secrets Manager under `ci/submit/companies-house/` on the pattern of `COMPANIES_HOUSE_SANDBOX_API_KEY`; `scripts/proxy-secrets.sh` exports them and the user ID (not secret: `.env.proxy` or `gh variable get`); `GITHUB_SETUP.md` lines 112, 148 and 184 say what is set. Then changeRegisteredOffice and changeRegisteredEmail run and pass on the proxy lane, and the Companies House checks of the set's ci deploy (`companiesHouseBehaviour-ci` in run 45219345641) are read for the sign-in. fileConfirmationStatement is CHT2. Gates: `npx prettier --check` and a YAML parse on the workflow; the two proxy suites in series inside an SSO window. **Source**: the zeppelin set's proxy run of 2026-11-23, where the three suites stopped at sign-in. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files. **Repository**: submit. Unblocks CHT2. **Class**: machine-only. **State**: ready. **Blocked by**: nothing. **Unblocks**: CHT2.

### CHT2. The confirmation statement suite runs on the proxy lane and on ci with the test company's authentication code

The `ci` environment holds the secret (set 2026-11-23). `deploy-environment.yml` writes `TEST_COMPANIES_HOUSE_CONFIRMATION_STATEMENT_AUTH_CODE` to Secrets Manager beside CHT1's two values, `scripts/proxy-secrets.sh` exports it, and `probe-test.yml` passes it to the filing matrix (no workflow passes it today). Then fileConfirmationStatement runs and passes on the proxy lane and on ci. Follows CHT1, which edits the same workflow and script: one worker builds CHT1 then CHT2. **Source**: the zeppelin set's proxy run of 2026-11-23. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files. **Repository**: submit. **Class**: machine-only. **State**: blocked. **Blocked by**: CHT1 (one worker builds both). **Unblocks**: nothing.

### LOOK1. The confirmation statement scene gives the register's people their other forenames

The shared register of fictitious companies (`app/http-simulator/fixtures/register.js`) and the scene runner's `{{register:<n>:<field>}}` templates are on `main` (PR #860). Left: the register gives its people no other forenames, so the confirmation statement scene types none. Give them other forenames in the register, use them in the scene script, take the scene's stills again on the simulator lane and run `visual-review` on them. Gates: `npm test`; the confirmation statement browser tests and `test:fileConfirmationStatementBehaviour-simulator`, one suite at a time under the lock. **Source**: the look pass, 2026-11-22. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~2 files. **Repository**: submit. **Class**: machine-only. **State**: ready. **Blocked by**: nothing. **Unblocks**: nothing.

### CH60. A Companies House filing that is still pending reaches the reader's filings when Companies House decides it

The scheduled presenter poll is live on prod (`cron(0/15 7-18 ? * MON-FRI *)`): it asks the gateway for every completed submission of the presenter, writes the receipt on ACCEPT, records the reject reasons on REJECT and emails the reader. Left: the proof on prod, on the first live accounts filing that answers pending. Read, with no filing page opened: `aws --profile diya-submit-prod --region eu-west-2 dynamodb query --table-name prod-env-companies-house-accounts-async-requests --key-condition-expression 'hashedSub = :h' --expression-attribute-values '{":h":{"S":"companies-house-xmlgw"}}'` lists the presenter's items; a filing that answered pending is an item `requestId = "pending#<submission number>"`, and after the gateway decides it the item carries the final status and the reader's receipts hold the filing. An ACCEPT or REJECT in the poll's log ("Companies House presenter GetSubmissionStatus response") with no record after it is a defect. At 17:15 UTC on 2026-11-23 the partition held only `presenter-poll-state`, so no live filing has answered pending. The ci proof is closed: the four test submissions of 2026-11-19 (00006W to 00006Z) wait on the XML team, which decides test accounts by hand, and nobody asks it to (operator, 2026-11-20: no email). Blocked on a live accounts filing on prod that answers pending. **Source**: the ridge set gate, 2026-11-18 (dusk's report on the gateway polling change). **Owner**: Claude Code. **Model**: Haiku (the remainder is a read). **Size**: 0 files. **Repository**: submit. **Class**: machine-only (a read). **State**: blocked. **Blocked by**: a live accounts filing on prod that answers pending. **Unblocks**: nothing.

