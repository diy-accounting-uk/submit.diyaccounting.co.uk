<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root.

## Open items

Items marked (Bn) are backlog rows in `BACKLOG.md`, which carries each one's full value
reasoning. Every item ends with a tag line: **Source** (backlog row, GitHub issue, plan doc, or
none), **Owner** (`Operator` for steps a workflow cannot do, `Claude Code` for steps a sub-agent
runs), and for Claude Code steps the **Model** a sub-agent should use (Fable > Opus > Sonnet >
Haiku; the lowest tier that fits). Anything touching code goes through a `claude/*` branch and
PR; the operator merges.

**Prod runs deployment prod-d545004** (PR #415's merge deploy, run 36569377490, 2026-09-29), the only prod set standing.
**ci**: `ci-set1` (last-known-good) stands, created 00:58 UTC 2026-09-29.

Rows F-BS3 and LP-* change the spreadsheets repository (`../spreadsheets.diyaccounting.co.uk/`): their batch branches, PRs and CI run there, under that repository's `CLAUDE.md` and tests; their plans (`PLAN_DIYA_GL_LAUNCH.md`, `PLAN_DIYA_GL_INDIA.md`, `PLAN_DIYACCOUNTING_BRAND.md`) are at this root. LP rows' briefs are in `PLAN_DIYA_GL_LAUNCH.md` under "Briefs"; `PLAN_DIYA_GL_INDIA.md` carries its own board.

The board runs in five sections, in this order: **in flight** (a branch, a pull request or a run
in motion, each named in the row), **machine-only**, **machine-ask**, **human-driven**,
**blocked**. The section is the classification — what it takes to carry the row to
completion, not who owns it now — so no row carries a separate tag that could drift from where it
sits. `machine-ask` is work a session drives end to end with a human present to authenticate or
approve: a second factor, an SSO login, a command the session's policy denies, a send from the
operator's address, a write to Google or GitHub the operator says go to. `human-driven` is work a
human must navigate themselves: a coding assistant's practical limits, a physical restriction
beyond one authentication (a proctored exam, a signature in person), or policy (a payment mandate,
a filing against the operator's own company, a decision between named alternatives). A row whose
only human step is merging its PR is machine-only; that is the standing workflow, not an action
the row needs. Within a section, items run by the size of the change to committed files, least
first (operator, 2026-09-13); a row that changes nothing committed — a comment, a run, a scan, a
console action — comes before any code. Operator items are briefed in
`../NEXT_OPERATOR_RUNBOOK.md` at the workspace root, one file rewritten in place. Every item
names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or `none` for a human
step.

## In flight

- [ ] **B-ITSA-CALC. The tax calculation page prints raw allowance names and £NaN; then the ITSA videos page's tenth video.** **In flight**: merged in PR #416 (79ca74ec); `main`'s prod deploy of it queued. The itsa-in-year-estimate video is republished (WSaN2igO9v4) and YouTube's titles match (`--sync-metadata --apply`). Remainder: after the deploy, a look at `videos-hmrc-itsa.html` on prod. The page fix is live on prod-eb16e78 (PR #413). Remainder: recapture, `publish.json` entry, publish, the videos-page test. `web/public/hmrc/itsa/taxCalculation.html` (the `allowancesAndDeductions` list, lines 215 to 218) lists `calc.allowancesAndDeductions` by its API keys (`blindPersonsAllowance`, `qualifyingLoanInterestFromInvestments`) and passes object values to `formatCurrency` (line 256, `Number(value).toFixed(2)`), which prints `£NaN` for `annuityPayments` and `marriageAllowanceTransferOut` (objects in HMRC's response). Seen in itsa-in-year-estimate's still (capture run 36484964781). Fix: plain labels for each allowance key, and nested objects rendered by their amount fields or left out; a browser test on the sandbox response shape. Then recapture `videos/itsa-in-year-estimate.json` (`video-capture.yml`, the site-video-capture skill), add its entry to `web/public/videos/publish.json` (it has none; nine `itsa` entries carry a `videoId`, `itsa-year-part` is deliberately absent) and publish it with the video-publish skill (`npm run video:publish`). Last: a case in `web/browser-tests/videos.browser.test.js` that `web/public/videos-hmrc-itsa.html` embeds every `group` `itsa` entry with a `videoId` (ten), each with its title and caption track (`web/public/widgets/video-pages.js` renders them), and a look at the page on ci. **Source**: VID14a stills, 2026-09-29; operator, 2026-09-28. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **VID17. Videos of features not yet on prod read "coming soon - sandbox example".** **In flight**: merged in PR #416 (79ca74ec); `main`'s prod deploy of it queued. The itsa-in-year-estimate video is republished (WSaN2igO9v4) and YouTube's titles match (`--sync-metadata --apply`). Remainder: after the deploy, a look at `videos-hmrc-itsa.html` on prod. Twelve published video titles end "(sandbox)" (`videos/publish.json`, copied to `web/public/videos/publish.json` by `scripts/copy-videos-manifest.js`), e.g. "DIY Accounting Submit: file a quarterly update with HMRC (sandbox)". Operator, 2026-09-29: where "sandbox" marks a feature customers cannot use yet, the embedded videos show "coming soon - sandbox example" instead. That is the nine `itsa` videos (Income Tax is not prod-listed until O11) and `file-micro-entity-accounts` (the catalogue's `environments` at `web/public/submit.catalogue.toml` line 447 has no `prod`). `change-registered-office` and `change-registered-email` are live on prod (lines 428, 437), so their titles drop " (sandbox)" altogether (operator, 2026-09-29: how a video was captured is not worth showing for a live feature). Change the ten titles in `videos/publish.json` from "(sandbox)" to "(coming soon - sandbox example)", strip it from the two, and re-copy the manifest; `web/public/widgets/video-pages.js` renders the title as the section heading (line 118), the iframe title (line 126) and, without its prefix, the Contents link (`contentsLinkText`, line 37), so the pages follow. The YouTube player shows YouTube's own title, which `scripts/youtube-upload.js` never updates after upload (it syncs status fields only, `--sync-status`, line 44): add a title and description sync (`videos.update` on `snippet`, dry run by default, `--apply` to write, reusing the stored credentials the video-publish skill names) and apply it for the twelve. When O11 or B34c lists a feature on prod, its titles drop the prefix back to plain text by the same path. Tests: `web/browser-tests/videos.browser.test.js` (heading, iframe title and Contents link for one relabelled and one stripped video) and the upload script's unit test for the sync plan. **Source**: operator, 2026-09-29. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~5 files.

## Machine-only

- [ ] **B30z. ci's analytics nightly fails: ci's GA4 export dataset does not exist.** The run started by hand (`manual-b30z-20260929`, operator yes, 2026-09-29) failed in `ci-env-ga4-event-export-pull` with `Not found: Dataset diyaccounting-ga4:analytics_552917343`: `bq ls --project_id=diyaccounting-ga4` lists only `analytics_523400333` (prod) and `ga4_daily`. So ci's GA4 property has never exported, and the earlier "table events_20260926 does not exist" failures were the same missing dataset read through `table().exists()` (`app/functions/analytics/ga4EventExportPull.js` line 209, `ga4DailyPull.js` line 168). PR #405's fix lists tables with `getTables()` (`ga4EventExportPull.js` line 106), which throws on the missing dataset. The link exists (`google apply` on `main`, 2026-09-29: `properties/552917343/bigQueryLinks/YMgIZ3AlTimUkRNIAua9lA`, daily export true, project 958354756046) and ci's `SUBMIT_GA4_MEASUREMENT_ID` is G-DV0SDVEZWC. Two parts: (1) find why GA4 writes no dataset for property 552917343 (whether ci's pages send events to G-DV0SDVEZWC at all: GA4 Realtime or the Data API `runRealtimeReport` through `infra/google/ga4/`; the link's export settings); (2) the pulls treat a missing dataset as a zero-row day, as they do a missing table once a later one exists, so ci's nightly and its data-quality run go through. Proof: another manual start of `ci-env-analytics-nightly` succeeds. Its alarm `ci-env-analytics-nightly-failed` is in ALARM with no actions. **Source**: refine, 2026-09-28. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

## Machine-ask

- [ ] **BS5. Google Drive's browser OAuth client, as code.** `PLAN_BOOKS_TO_SUBMIT.md` BS5, taken ahead of the plan's approval because saving to Google Drive is independent of filing from diya-gl: decision 4 (accepted 2026-09-26) chose (b), a new web client in the sign-in client's project, JavaScript origins only, no secret. That project is `diy-accounting-submit` (project number 670010122633, `gcloud projects list`, 2026-09-29), which answers the plan's open question 1. Claude Code, as code, in one PR: the Drive and Picker APIs enabled for `diy-accounting-submit` (`project.toml`, `scripts/gcp-enable-apis.js`); a role for the GA4 service account on that project in `analytics/google-roles.toml`; the API key created and restricted (those sites plus `https://docs.google.com/*`, Drive and Picker APIs only) through the API Keys API from the Google apply workflow, and recorded; a script that takes the client's downloaded JSON and writes its id into `oauth.toml` (`purpose = "drive_browser"`); `google-oauth-assert.js` extended to check the new client. `drive.file` is a non-sensitive scope, so the consent screen needs no change. Operator, once, because Google has no API for standard OAuth clients: create the Web application client at https://console.cloud.google.com/auth/clients?project=diy-accounting-submit with the JavaScript origins (`https://submit.diyaccounting.co.uk`, the ci set hosts, `https://diya-gl.co.uk`, `https://ci.diya-gl.co.uk`), no redirect URIs, and download its JSON. Unblocks LP-24a. **Source**: `PLAN_BOOKS_TO_SUBMIT.md` BS5; operator, 2026-09-29. **Owner**: Claude Code (the PR), Operator (the client in the console). **Model**: Sonnet. **Size**: ~4 files.

## Human-driven

- [ ] **O11. The ITSA send day.** The proof is on `main` (PR #352, 2026-09-25): the eight ITSA suites pass on the simulator and run in CI, and the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 with a real `Gov-Client-Multi-Factor` header (`VALID_HEADERS`, no warnings), inside HMRC's 14 days until 2026-10-09. Evidence for every claim in the email, with how to check each, is in `../itsa-recognition-evidence/README.md`. Send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` from the operator's address (prod-d6f7537 carries PR #352), then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. After recognition, a session adds the Income Tax ad group to `infra/google/ads/ads.toml`'s "Search: MTD VAT" campaign (its keywords and ad copy are in the parent of 8816f93c, PR #414) and applies it with `npm run ads:sync -- --apply` on the operator's yes. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **B30aa. `activity_events`' freshness rule: the alarm to OK and #406 closed.** Proven: the prod analytics nightly started by hand (`manual-b30aa-20260929`, operator yes, 2026-09-29) scored prod's `activity_events` 1.0 with every rule passing (`aws --profile submit-prod glue get-data-quality-result --result-id dqresult-cec6b146f623ffeb30ae8693367672a8885276f6`). `prod-env-activity-events-data-quality-rules-failed` still reads ALARM at 16:47 UTC: it evaluates one datapoint over a 1-day period. Remainder: once it reads OK, #406 closes (the alarm triage closes it; if not, close it with that result id). Blocked on the alarm's next evaluation. **Source**: refine, 2026-09-28. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard (BACKLOG 52i).** The company's diya-gl book, saved to the DIYA cloud by `../PLAN_FINANCE_AUTOMATION.md` phase 2 and derived nightly with the Ltd engine through `PLAN_SUBMISSION_MCP.md` M1 and M3, rendered above the eight objectives beside the last set filed at Companies House (`PLAN_ONE_STOP_DASHBOARD.md` D10). Blocked on the finance plan's phases 1 and 2 and on BACKLOG 61 (M3). **Source**: BACKLOG 52i. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **LP-24a. Google Drive store: the client id and the prod check.** Once `PLAN_BOOKS_TO_SUBMIT.md` BS5 has created Drive's own browser-only OAuth client as code (`infra/google/gcp/oauth.toml`), post its client id here; it lands in `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud-config.js` `googleClientId`. After the prod deploy, save a book to Drive from your own account and check the folder, the file and a second revision at https://drive.google.com/drive/my-drive (`PLAN_DIYA_GL_LAUNCH.md` "Operator steps"). Blocked on BS5. **Source**: `PLAN_DIYA_GL_LAUNCH.md`. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

