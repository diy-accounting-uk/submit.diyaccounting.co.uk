<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN_WAVE_SET_BRAMBLE: company reports, the due list, operator tokens and diya-gl distribution

## Operator assertions (verbatim)

> Please build a /wave-set out of plans: agent credentials, PLAN_COMPANY_REPORTS, PLAN_DUE_LIST,  and PLAN_DIYA_GL_DISTRIBUTION.

(operator, 2026-11-25.) Answers to the questions that finalised the set (2026-11-25): CR14 is held for the next set, so the operator looks at the reports on ci first; AC3 to AC5 join waves 3 and 4 if the operator approves AC2's permission set before wave 3 starts, otherwise they start the next set.

## Status

defined 2026-11-25; its rows are off `NEXT.md` (operator, 2026-11-25), so nothing of it is dispatched. Boarding them again needs the operator's word; wave 1 then branches from `origin/main`.

## The goal

Use what is paid for (the laptop, the subscriptions, the cloud workers) and spend least on what is billed by use. All the work is built and gated in local waves by the cloud workers (`/collab-loop`), then each repository pays for one ci deployment and one prod deployment.

## The set

- **submit, 18 rows**: CR4, CR5, CR6, CR7, CR8, CR9 (`PLAN_COMPANY_REPORTS.md`); CL4, DUE5 to DUE13 (`PLAN_DUE_LIST.md`); AC6, AC7 (`PLAN_AGENT_CREDENTIALS.md`). AC3, AC4, AC5 join waves 3 and 4 when AC2 is approved before wave 3 starts.
- **spreadsheets, 7 rows**: DIST1, DIST2, DIST3, DIST4, DIST5, DIST6, DIST9 (`PLAN_DIYA_GL_DISTRIBUTION.md`; the code is in `../spreadsheets.diyaccounting.co.uk`).
- **Beside**: AC1 (the inventory, private repository), AC2 (the permission set; the operator approves it), GLX1 (design rounds with the operator; `PLAN_DIYA_GL_PRODUCT.md` at the workspace root).
- **Left out, with the test that removed each**:
  - CR14 (test 4, the operator's answer): the reports launch in the next set, after the operator's look on ci.
  - ODUE2 (test 4): the operator tries the due list on this set's ci deploy; DUE14 (the launch) follows it in the next set.
  - DIST7 (test 1): it needs an npm release that carries `mcpName`, which only the merge of this set makes. DIST8 and DIST13 follow DIST7.
  - DIST10, DIST11, DIST12 (test 4): the operator's go on the signing costs (about £79 a year for Apple, about £95 a year for Microsoft) and the vendor accounts.
  - AC8, AC10 (test 1): they follow AC5 and AC7 live. AC9 (test 4): the operator's settings file.
  - OCR1 (test 4): the operator posts the licence question.

## Rules for this set

- **Append-only shared files.** In the company reports rows, `web/public/companies-house/companyReports.page.js`, the `REPORT_MODULES` map in `app/functions/companies-house/companiesHouseCompanyReportGet.js`, `app/lib/companyReports/wording.js` and the simulator files `app/http-simulator/routes/companies-house.js`, `app/http-simulator/scenarios/companies.js` and `app/http-simulator/scenarios/filing-history.js` are treated as registries: each row adds its own render function, its own map entry and its own route or scenario block, and edits no other row's lines. The integrator merges them by keeping both sides. `i18n/cy.toml`, `web/public/submit.catalogue.toml`, `app/bin/server.js`, `REPORT_CAPABILITIES.md`, the Java names classes and the counts in `infra/test/java` are registries as always. In spreadsheets, `diya-gl/README.md` is append-only per task.
- **Nothing unlaunched shows on prod.** DUE10's change to `web/public/privacy.html` moves to DUE14, the launch, so the prod privacy page describes no processing before the due list is live. DUE13's entry links on `company-filing-deadlines.html`, `get-started.html` and the home page render only where the `due-list` activity is listed (`isActivityListedInEnvironment`), so prod shows none before DUE14.
- **DUE12's routes.** Its two Lambdas get API Gateway routes in `infra/main/java/co/uk/diyaccounting/submit/ApiRoutes.java` and a stack beside the other due-list Lambdas (`AccountStack.java`), and the public feed path `/api/v1/public/due-calendar/` joins the `due-list` activity's `paths` in the catalogue. The feed answers only to a hashed token, so the route on prod exposes no data before DUE14.
- **AC6's Lambda** goes in the stack that holds `operatorSnapshotGet`, not in `IdentityStack.java` (AC3 and AC4 own that file). Its JWT signing key is a secret the stack generates; no console step.
- **HMRC sandbox and Companies House.** DUE7 and DUE8 prove on the proxy lane against the HMRC sandbox from a worker given ci credentials (`new-cloud-session.sh creds`). CR9 fetches its three real documents with ci's Companies House key the same way when Submit has none yet.

## Waves (submit)

| Wave | Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|---|
| W1 | cr4 | CR4 | Sonnet | `app/lib/companyReports/filings.js`, its tests |
| W1 | cr5 | CR5 | Sonnet | `app/lib/companyReports/people.js`, its tests |
| W1 | cr7 | CR7 | Sonnet | `app/lib/companyReports/charges.js`, its tests |
| W1 | cr9 | CR9 | Sonnet | `app/lib/companyReports/accounts.js`, `app/services/companiesHouseCache.js`, the document fixtures |
| W1 | due5 | DUE5 | Sonnet | `app/services/dueListCompaniesHouse.js`, `app/functions/account/dueListRefresh.js`, `app/functions/companies-house/companiesHouseCompanyGet.js`, `AccountStack.java` |
| W1 | cl4 | CL4 | Sonnet | `web/public/companies-house/companySearch.page.js` and `companySearch.html` |
| W1 | ac6 | AC6 (Opus design, then Sonnet build) | Opus, Sonnet | `operator-keys/`, the token Lambda, its stack entry, `ApiRoutes.java` |
| W2 | cr8 | CR8 | Sonnet | `app/lib/companyReports/history.js`, its tests |
| W2 | cr6 | CR6 | Sonnet | `app/lib/companyReports/capital.js`, its tests |
| W2 | due-page | DUE6 | Sonnet | `web/public/due.html`, its page script, `web/browser-tests/dueList.browser.test.js` |
| W2 | due-mail | DUE10 | Sonnet | `app/functions/account/dueListReminders.js`, `app/lib/accountSettings.js`, `web/public/settings.html`, `app/lib/customerEmailTemplates.js`, `app/lib/customerEmailRequest.js`, `app/data/dynamoDbDueListRepository.js`, `AccountStack.java` |
| W2 | ac7 | AC7 | Sonnet | `app/functions/auth/customAuthorizer.js`, `scripts/operator-api.mjs`, `app/functions/analytics/operatorSnapshotGet.js` |
| W3 | due-page | DUE7 | Sonnet | the due page and its script |
| W3 | due-mail | DUE11 | Sonnet | `app/functions/account/accountSettingsPut.js`, `dueListRefresh.js`, `AccountStack.java`, the settings and email files |
| W3 | ac3 | AC3 (if AC2 approved) | Sonnet | `.github/workflows/coordinator-credentials.yml`, `IdentityStack.java` |
| W4 | due-page | DUE8 | Sonnet | the due page and its script |
| W4 | ac4 | AC4, then AC5 (if AC2 approved) | Sonnet | `.github/workflows/prod-proof.yml`, `IdentityStack.java`, `scripts/aws-session.sh` |
| W5 | due-page | DUE9 | Sonnet | `app/functions/account/dueListUserRowPut.js`, `ApiRoutes.java`, the due page |
| W6 | due-page | DUE12 | Sonnet | `app/functions/account/dueListCalendarFeedPost.js`, `dueListCalendarGet.js`, `app/lib/dueListIcs.js`, `EdgeStack.java`, `ApiRoutes.java`, `scripts/delete-user-data.js`, the due page |
| W7 | look | DUE13, then the look pass | Sonnet | `web/public/company-filing-deadlines.html`, `get-started.html`, `index.html`, `web/public/lib/guide-journeys.js`; the guide screenshots (`npm run video:walkthrough`), `visual-review` and `ui-ux-pro-max` on the reports views, the due page and the drill-down |

The due page chain (DUE6, DUE7, DUE8, DUE9, DUE12) and the email chain (DUE10, DUE11) each stay on one worker across waves, as a queue. AC4 and AC5 run in one batch because AC5 follows AC3 and both read the coordinator key.

W1 state: pending.

## Waves (spreadsheets)

| Wave | Batch | Rows in order | Model | Files the batch owns |
|---|---|---|---|---|
| W1 | dist1 | DIST1 | Sonnet | `app/bin/view.js`, `app/lib/diya-gl-view-server.js`, `app/test/diya-gl-view.test.js` |
| W1 | dist4 | DIST4 | Sonnet | `app/bin/check.js`, `diya-gl/bin/diya-gl-check.js`, `diya-gl/bin/diya-gl.js`, `diya-gl/package.json`, `app/test/diya-gl-check.test.js` |
| W1 | dist6 | DIST6 | Sonnet | `app/bin/diya-gl-mcp.js`, `app/lib/mcp/server.js`, `app/lib/mcp/diya-gl-tools.js`, `app/test/diya-gl-mcp.test.js` |
| W2 | dist2 | DIST2 | Sonnet | `scripts/build-diya-gl-web-snapshot.mjs`, `.github/workflows/publish-diya-gl.yml`, `app/test/diya-gl-web-snapshot.test.js` |
| W2 | dist3 | DIST3 | Sonnet | `app/bin/shortcut.js`, `app/lib/desktop-shortcut.js`, `diya-gl/bin/diya-gl-shortcut.js`, `diya-gl/bin/diya-gl.js`, `diya-gl/package.json`, `diya-gl/scripts/engine-closure.mjs` |
| W3 | dist5 | DIST5 | Sonnet | `diya-gl/Dockerfile`, `diya-gl/image-smoke.sh`, `.github/workflows/publish-diya-gl.yml`, `.github/workflows/test.yml` |
| W4 | dist9 | DIST9 | Opus | `diya-gl/launcher/`, `scripts/build-desktop.mjs`, `.github/workflows/publish-diya-gl.yml`, `app/test/desktop-launcher.test.js` |

W1 state: pending.

## Gates

- **Each wave branch** (by the integrator worker, "The integrator" in `.claude/skills/collab-loop/SKILL.md`): the merge checks and gates of `scripts/batch-check.sh` without the docker build, `npm run build:welsh` with the Welsh proof, and the simulator suites the wave touches (`companies-house` for the CR rows and CL4, the due list journey from DUE6 on, `auth` and `submitVat` for AC6 and AC7). DUE7 and DUE8 add their proxy-lane journeys on a worker with ci credentials. A wave with a stack change runs `./mvnw clean verify` and names the stack resource totals against 500.
- **The set branch** (`claude/bramble-set`): every gate split across the idle workers (unit, java, browser, lint, all simulator suites), and the docker build on the laptop.
- **spreadsheets**: `npm test` (the router) on each wave branch on a spreadsheets worker; the set branch's pre-push hook runs on the laptop, or `SKIP_PUSH_TESTS=1` when the PR's `test.yml` runs the suite.

## The push

1. Rebase the set branch on `origin/main` (with aurora merged) and gate it again.
2. Push `claude/bramble-set`, open one PR whose body lists the rows by wave, and `/watch` it. The push makes the ci set.
3. ci proofs, inside the set's self-destruct delay:
   - CR4 to CR9: the drill-down page of a test company shows the reports index and each of the six views.
   - CL4: the accounts list shows the due filings as rows.
   - DUE5: one invoke of the refresh Lambda writes the Companies House rows of a watched test company.
   - DUE6 to DUE9, DUE12: the due page lists rows, a user row saves, the feed URL answers an iCalendar file.
   - DUE10, DUE11: the reminder job runs with the setting off and sends nothing; with it on, one email reaches the synthetic test user.
   - AC6, AC7: a token from a listed key reads `/api/v1/operator/snapshot` on ci; an unlisted key and an expired token get 401.
   - ODUE2: the operator tries the due list on the ci set (`PLAN_DUE_LIST.md` ODUE2).
4. `/auto-merge` with `--merge`; `/watch` over `main`; `deploy-finish.yml` destroys the outgoing prod set.
5. prod proofs: the deploy is healthy and no new activity is listed (`company-reports` and `due-list` list no `prod`); AC7's `scripts/operator-api.mjs /api/v1/operator/snapshot` returns the prod snapshot with the operator's key.
6. spreadsheets: its PR merges after submit's; its `test.yml` builds the pages snapshot (DIST2), the multi-arch image (DIST5) and the unsigned desktop apps (DIST9) in build-only mode.

## After the deploy

- The next set: CR14 (reports launch), DUE14 (due list launch, after ODUE2, with DUE10's privacy text), DIST7 then DIST8 and DIST13, AC8 and AC10 (after AC5 and AC7 are live), and AC3 to AC5 if AC2 was approved after wave 3 started.
- AC9 is the operator's: the ask rule in `.claude/settings.json`.

## When the set branch fails

Push a prefix: the tip of the last wave whose gates passed and whose rows need nothing from the waves after it. Wave 2 is a valid prefix (the reports, CL4, the due list's first page and emails, the operator token). The waves after it start the next set, rebased on the new `main`.
