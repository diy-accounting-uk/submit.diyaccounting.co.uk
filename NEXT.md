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

**Prod runs deployment prod-afa6508** (dispatch 36621491788 of afa65083, 2026-09-29); main's deploy of PR #424 (8f10c301) replaces it.
**ci**: `ci-set2` (last-known-good) stands, created 18:51 UTC 2026-09-29 (PR #421's branch deploy).

Rows F-BS3 and LP-* change the spreadsheets repository (`../spreadsheets.diyaccounting.co.uk/`): their batch branches, PRs and CI run there, under that repository's `CLAUDE.md` and tests; their plans (`PLAN_DIYA_GL_LAUNCH.md`, `../PLAN_DIYA_GL_INDIA.md`, `PLAN_DIYACCOUNTING_BRAND.md`) are at this root. LP rows' briefs are in `PLAN_DIYA_GL_LAUNCH.md` under "Briefs"; `../PLAN_DIYA_GL_INDIA.md` carries its own board.

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

## Machine-only

## Machine-ask

- [ ] **PRV1. A private repository for the business's reference documents.** Create `diy-accounting-uk/private.diyaccounting.co.uk` as a private repository: no Actions workflows, no build, reference material only. Candidates are documents that say too much in a public repository or sit loose at the workspace root: the root's `DRAFT_EMAIL_*`, `REPORT_*` (Companies House identity, finance sources, HMRC header advisories, the session reports), `SECURITY_REVIEW_407.md`, `BRIEF_OPERATOR_TASKS_*`, `NEXT_OPERATOR_RUNBOOK.md`, `itsa-recognition-evidence/`, `hmrc-header-advisories/`, and what PR #423 and the `claude/rover-docs` branch moved out (`_developers/hmrc/`, `reference/`, `STRATEGY.md`, `PLAN_MARKETING_STRATEGY.md`, `PLAN_DIYA_GL_INDIA.md`, `REPORT_COMPETITOR_ANALYSIS.md`, `REPORT_PRICE_UPDATE_REVIEW.md`, `email.txt`); plus every file of that kind scattered through `submit.diyaccounting.co.uk` itself (tracked or untracked: operator notes, drafts, one-off reports, regulator copies, `_developers/` material nobody's build reads), then the same pass over the other public repositories. Out of scope: `drive/`, `mail/` and `index/` (mirrors kept by their own sync scripts) and anything holding a live secret. Steps: (1) the inventory, as a table of path, what it is, and proposed place in the new repository, for the operator to approve; (2) on the operator's yes, `gh repo create diy-accounting-uk/private.diyaccounting.co.uk --private` with a README and the licence header convention, and Actions disabled for it; (3) move the approved files (copy, compare, commit there; remove from the workspace root or `git rm` from a public repository with references rewritten), clone it at `../private.diyaccounting.co.uk/`; (4) every skill, doc and board row that names a moved file points at its path in `../private.diyaccounting.co.uk/` (`git grep` each basename across the repositories and the workspace root's own docs), and the workspace `CLAUDE.md` table, the session-report skills (reports land there) and the memory note on the private workspace root name it as the place for such documents. **Source**: operator, 2026-09-29. **Owner**: Claude Code (the inventory, the moves), Operator (approving the list and the repository creation). **Model**: Sonnet. **Size**: ~6 files in the public repositories.

## Human-driven

- [ ] **O11. The ITSA send day.** The proof is on `main` (PR #352, 2026-09-25): the eight ITSA suites pass on the simulator and run in CI, and the sandbox year ran clean on 2023-24, 2025-26 and 2026-27 on 2026-09-25 with a real `Gov-Client-Multi-Factor` header (`VALID_HEADERS`, no warnings), inside HMRC's 14 days until 2026-10-09. Evidence for every claim in the email, with how to check each, is in `../itsa-recognition-evidence/README.md`. Send `../_developers/hmrc/DRAFT_EMAIL_ITSA_RECOGNITION.md` to `SDSTeam@hmrc.gov.uk` from the operator's address (prod-d6f7537 carries PR #352), then `../_developers/hmrc/DRAFT_EMAIL_ITSA_PRODUCTION_CREDENTIALS.md` when SDST answers. After recognition, a session adds the Income Tax ad group to `infra/google/ads/ads.toml`'s "Search: MTD VAT" campaign (its keywords and ad copy are in the parent of 8816f93c, PR #414) and applies it with `npm run ads:sync -- --apply` on the operator's yes. **Source**: BACKLOG 11; `PLAN_ITSA_PHASE_2.md` T10. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Blocked

- [ ] **B30z. ci's GA4 BigQuery export dataset appears.** PR #424 (merged) gives ci's property 552917343 a managed `bigquery_link` (daily export, no streaming) and prints each property's event count in the Google plan; the plan counted 171 events on ci's property for yesterday to today, so events arrive, and the live link's flags differed from the config (applied by `google apply` on `main`). Check once on 2026-10-01: `bq ls --project_id=diyaccounting-ga4` lists `analytics_552917343`. If it does not, read the link through the Admin API in the next plan's log (the export's excluded events and the dataset location) and fix the layer it names. **Source**: refine, 2026-09-28. **Owner**: Claude Code. **Model**: Haiku. **Size**: 0 files.

- [ ] **B52i. The company P&L and balance sheet on the dashboard (BACKLOG 52i).** The company's diya-gl book, saved to the DIYA cloud by `../PLAN_FINANCE_AUTOMATION.md` phase 2 and derived nightly with the Ltd engine through `PLAN_SUBMISSION_MCP.md` M1 and M3, rendered above the eight objectives beside the last set filed at Companies House (`PLAN_ONE_STOP_DASHBOARD.md` D10). Blocked on the finance plan's phases 1 and 2 and on M3 of `PLAN_SUBMISSION_MCP.md`. **Source**: BACKLOG 52i. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~6 files.

- [ ] **LP-24a. Google Drive store: the prod check.** The Drive client id (`670010122633-56q89d0h9c4skb9cpj4h9j2gr3kq06vd.apps.googleusercontent.com`) is recorded in `infra/google/gcp/oauth.toml` (PR #425) and set in `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud-config.js` `googleClientId` (spreadsheets branch `claude/drive-client-id`). After that spreadsheets PR merges and deploys, save a book to Drive from your own account and check the folder, the file and a second revision at https://drive.google.com/drive/my-drive (`PLAN_DIYA_GL_LAUNCH.md` "Operator steps"). Blocked on the spreadsheets PR's prod deploy. **Source**: `PLAN_DIYA_GL_LAUNCH.md`. **Owner**: Operator. **Model**: none. **Size**: 0 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.

