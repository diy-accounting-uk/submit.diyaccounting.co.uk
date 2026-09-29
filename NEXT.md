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

**Prod runs deployment prod-554a499** (PR #417's merge deploy, 2026-09-29), the only prod set standing.
**ci**: `ci-set2` (last-known-good) stands, created 18:51 UTC 2026-09-29 (PR #421's branch deploy).

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

- [ ] **BS5. Google Drive's browser OAuth client, as code.** **In flight**: `claude/rook-drive`, PR #419, head 4b90e094; its Google plan is green (run 36618169985), and it merges through `/auto-merge` once `main`'s deploy of 03e11ba9 (run 36618680503) is terminal. The PR enables the Drive and Picker APIs on `diy-accounting-submit` (project number 670010122633) and the API Keys API on `diyaccounting-ga4`, grants the GA4 service account its roles there, creates the restricted browser key `drive-picker-browser` from the Google apply workflow, adds `scripts/drive-client-record.js` (writes the client id into `infra/google/gcp/oauth.toml` as `purpose = "drive_browser"`) and extends `google-oauth-assert.js`. After the merge, split out as O-BS5 below. **Source**: `PLAN_BOOKS_TO_SUBMIT.md` BS5; operator, 2026-09-29. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

- [ ] **LH13. Close issue #13 with a compliance run over all 19 sitemap pages.** **In flight**: waits on `main`'s deploy of 03e11ba9 (run 36618680503), which carries the four videos pages in `lighthouse.config.json` and the sitemap-equality test. When prod promotes, dispatch `gh workflow run compliance.yml --ref main`, read job `accessibility-lighthouse` for 19 audited pages at or above their thresholds, and close #13 with the run link. **Source**: issue #13. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

## Machine-only

- [ ] **B30ae. Alarm #420: `prod-env-rum-cls-p75` went above 0.25 at 17:55 UTC on 2026-09-29.** Two datapoints (0.323 at 18:00, 0.321 at 17:55) after prod-79ca74e went live (PR #416: the ITSA videos page's tenth embed, video titles); the alarm returned to OK at 18:58 UTC, so the read decides between a fix and closing #420 with the evidence. Read the CLS events by page for 17:30 to 19:00 UTC (`aws --profile submit-prod rum get-app-monitor-data --name prod-env-rum`, millisecond epochs, filter `event_type` `com.amazon.rum.cumulative_layout_shift_event`, group by `metadata.pageId`) to find the page, then, if one page carries it, fix its reserved heights (the video pages render one frame per `publish.json` entry, `web/public/widgets/video-pages.js`; the operator dashboard's reservations are in `web/public/operator/dashboard.html`). Close #420 with the page and the fix, or with the read showing no page above 0.25 outside that window. **Source**: alarm #420, 2026-09-29. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~1 file.

- [ ] **WT1. Every worktree the session creates gets its `node_modules` link, checked before a full run.** 2026-09-29: the spreadsheets batch worktree was created without the link (only agent worktrees got it); the router's diya-gl bundle step failed on a missing jszip and 72 Ltd browser tests failed after 46 minutes, about 2 hours and 124,551 agent tokens lost. `.claude/skills/do-next/SKILL.md` (line ~184) already says to symlink `node_modules`, but as `ln -s` for agent worktrees only. Change: one script (`scripts/worktree-add.sh <path> <branch> <base>`) that runs `git worktree add`, links `node_modules` with `ln -sfn` to the repository's own main checkout (and `mcp/node_modules` in submit), and fails if `ls -ld node_modules` is not a link; `do-next`, `iterate` and `refine` (line ~67) name it for the batch and every agent worktree; the full-run steps (`do-next`, `iterate`: `./mvnw clean verify` and `npm test` before a push, and the spreadsheets router) check the link first and stop with a message when it is missing. The same script and wording in `../spreadsheets.diyaccounting.co.uk/`. Memory `worktree-node-modules-link` already carries the rule. **Source**: session report TI94o6, 2026-09-29. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **AV1. A new Athena view is proven to create before its PR is pushed.** 2026-09-29: `v_visitors_by_kind_hourly` selected `from_iso8601_timestamp(hour)`, a `timestamp(3) with time zone`, which Athena cannot store in a view; the view's `Custom::AthenaView` failed in PR #415's environment deploy (run 36561635248), `ci-env-AnalyticsStack` rolled back and the app deploy was cancelled, about 45 minutes. The refine skill's query-brief rule (`.claude/skills/refine/SKILL.md` line ~92) asks for an `EXPLAIN` against ci, which checks the plan but not the view's column types. Two parts: (1) a test beside `BusinessViewsTest.java` that parses each view SQL under `infra/main/resources/analytics/views/` for a column Athena cannot store in a view (`with time zone`, and the other Hive-incompatible types Athena documents for `CREATE VIEW`), so the Maven build fails before any deploy; (2) the refine rule and the do-next/iterate brief constants say a new or changed view is also run as `SELECT ... LIMIT 0` against ci with its column types read back (`aws athena get-query-results` on the result metadata), read-only, and the brief names that proof. **Source**: session report TI94o6, 2026-09-29. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~4 files.

## Machine-ask

- [ ] **B30z. ci's analytics nightly fails: ci's GA4 export dataset does not exist.** Merged in PR #417 (554a4990): a missing export dataset writes a zero-row day, live on ci's environment stacks. The ask: the operator's yes to start `ci-env-analytics-nightly` by hand (`aws --profile submit-ci stepfunctions start-execution --state-machine-arn arn:aws:states:eu-west-2:367191799875:stateMachine:ci-env-analytics-nightly --name manual-b30z-2-20260929`), or its Monday run at 02:15 UTC on 2026-10-05; the cause part stays open. The run started by hand (`manual-b30z-20260929`, operator yes, 2026-09-29) failed in `ci-env-ga4-event-export-pull` with `Not found: Dataset diyaccounting-ga4:analytics_552917343`: `bq ls --project_id=diyaccounting-ga4` lists only `analytics_523400333` (prod) and `ga4_daily`. So ci's GA4 property has never exported, and the earlier "table events_20260926 does not exist" failures were the same missing dataset read through `table().exists()` (`app/functions/analytics/ga4EventExportPull.js` line 209, `ga4DailyPull.js` line 168). PR #405's fix lists tables with `getTables()` (`ga4EventExportPull.js` line 106), which throws on the missing dataset. The link exists (`google apply` on `main`, 2026-09-29: `properties/552917343/bigQueryLinks/YMgIZ3AlTimUkRNIAua9lA`, daily export true, project 958354756046) and ci's `SUBMIT_GA4_MEASUREMENT_ID` is G-DV0SDVEZWC. Two parts: (1) find why GA4 writes no dataset for property 552917343 (whether ci's pages send events to G-DV0SDVEZWC at all: GA4 Realtime or the Data API `runRealtimeReport` through `infra/google/ga4/`; the link's export settings); (2) the pulls treat a missing dataset as a zero-row day, as they do a missing table once a later one exists, so ci's nightly and its data-quality run go through. Proof: another manual start of `ci-env-analytics-nightly` succeeds. Its alarm `ci-env-analytics-nightly-failed` is in ALARM with no actions. **Source**: refine, 2026-09-28. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

## Human-driven

- [ ] **O11. The ITSA send day.** The proof is on `main` (PR #352, 2026-09-25): the eight ITSA suites pass on the simulator and run in CI, and the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 with a real `Gov-Client-Multi-Factor` header (`VALID_HEADERS`, no warnings), inside HMRC's 14 days until 2026-10-09. Evidence for every claim in the email, with how to check each, is in `../itsa-recognition-evidence/README.md`. Send `_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` from the operator's address (prod-d6f7537 carries PR #352), then `_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. After recognition, a session adds the Income Tax ad group to `infra/google/ads/ads.toml`'s "Search: MTD VAT" campaign (its keywords and ad copy are in the parent of 8816f93c, PR #414) and applies it with `npm run ads:sync -- --apply` on the operator's yes. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **B52i. The company P&L and balance sheet on the dashboard (BACKLOG 52i).** The company's diya-gl book, saved to the DIYA cloud by `../PLAN_FINANCE_AUTOMATION.md` phase 2 and derived nightly with the Ltd engine through `PLAN_SUBMISSION_MCP.md` M1 and M3, rendered above the eight objectives beside the last set filed at Companies House (`PLAN_ONE_STOP_DASHBOARD.md` D10). Blocked on the finance plan's phases 1 and 2 and on BACKLOG 61 (M3). **Source**: BACKLOG 52i. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **O-BS5. Create Drive's web OAuth client in the console.** Google has no API for standard OAuth clients. After PR #419 merges: create a Web application client at https://console.cloud.google.com/auth/clients?project=diy-accounting-submit with JavaScript origins `https://submit.diyaccounting.co.uk`, the ci set hosts, `https://diya-gl.co.uk` and `https://ci.diya-gl.co.uk`, no redirect URIs; download its JSON and run `node scripts/drive-client-record.js <path-to-json>`, which writes the id into `infra/google/gcp/oauth.toml` for a session to commit. Blocked on BS5 (PR #419) merging. **Source**: `PLAN_BOOKS_TO_SUBMIT.md` BS5. **Owner**: Operator. **Model**: none. **Size**: 0 files.

- [ ] **LP-24a. Google Drive store: the client id and the prod check.** Once O-BS5 has recorded Drive's browser-only OAuth client in `infra/google/gcp/oauth.toml`, post its client id here; it lands in `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud-config.js` `googleClientId`. After the prod deploy, save a book to Drive from your own account and check the folder, the file and a second revision at https://drive.google.com/drive/my-drive (`PLAN_DIYA_GL_LAUNCH.md` "Operator steps"). Blocked on O-BS5. **Source**: `PLAN_DIYA_GL_LAUNCH.md`. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

