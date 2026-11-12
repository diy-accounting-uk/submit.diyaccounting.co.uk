<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# NEXT — current state & kickoff

Living handover for this repository. Rules and shape: `../NEXT.md` (DONE or OPEN only, nothing
deferred; a bug found fixing item A is A's remainder, not a new item; this file holds ONLY what
to do next — completed work lives in `git log`). Plans of record: `PLAN_*.md` at this root. The ITSA production approval rows (IA1 to IA10) and the Income Tax, bundle and practice unhide rows (UH1 to UH3) are boarded in `PLAN_ITSA_APPROVAL.md`, not here.

## Open items

Every item ends with a tag line: **Source** (the `PLAN_*.md` that owns it, a GitHub issue, or
none), **Owner** (`Operator` for steps a workflow cannot do, `Claude Code` for steps a sub-agent
runs), and for Claude Code steps the **Model** a sub-agent should use (Fable > Opus > Sonnet >
Haiku; the lowest tier that fits). Anything touching code goes through a `claude/*` branch and
PR; the operator merges.

**Prod runs deployment prod-f86fc83** (PR #811's merge f86fc838d, deploy run 43187971599, 2026-11-12 09:41 UTC: the WAF attack alarms fire at 50 blocked requests in 5 minutes, and a confirmation statement costs no token).
**ci**: no ci set stands (the operator had ci-set1 destroyed, run 43195507044); `/submit/ci/last-known-good-deployment` is `None`; no slot is held. The next branch deploy creates a set.

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
`../private.diyaccounting.co.uk/operator/NEXT_OPERATOR_RUNBOOK.md`, one file rewritten in place. Every item
names its model: the lowest tier that fits (Fable > Opus > Sonnet > Haiku), or `none` for a human
step.

Facts several rows share. Every behaviour suite on the simulator lane takes the one simulator port: one suite at a time, under the lock `/tmp/submit-simulator.lock` (`lockf -k /tmp/submit-simulator.lock <suite>`; the lock is a file held with `lockf`, so a `mkdir` loop never acquires it). The latest Companies House review (00005D to 00005G, filed 2026-10-27; the judge passed all four; the XML team then issued the live package reference 4326 on 2026-11-02) was cleaned from `target/` with the build output, so a fresh run writes the next one; the skills are `.claude/skills/companies-house-review/SKILL.md` and `.claude/skills/companies-house-judge/SKILL.md` (capabilities CH-17 and CH-18). The harness page `web/public/mcp-harness.html` loads scripts from `web/public/mcp-harness/<name>.json` (`?script=<name>`); its call endpoint `/api/v1/dev/mcp-harness/call` exists on the local Express server only (`app/bin/server.js`), so a harness proof runs locally (MCP1). The hosted MCP tools read the session's HMRC grant through `hmrcAccessTokenFor` in `mcp/lib/submit-tools.js` (MCP1). `web/public/mtd-calendar.html` is generated: its availability table is `AVAILABILITY` in `scripts/build-mtd-calendar.mjs` (line 106) and its dates come from `.claude/skills/tax-sources/sources`, so a row that changes the calendar edits those and runs `npm run build:mtd-calendar` (B34g, UH7, MCP1). The `-ci` behaviour scripts run through `scripts/use-deployed-base-url.js`, which opens the set's own host so the Cognito callback keeps the page's `sessionStorage` state. Rows that change sign-in share three facts (the sign-in plan is `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_SOCIAL_SIGN_IN.md`). A push of any branch that touches `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java`, `.env.ci`, `cdk-environment/cdk.json` or `.github/workflows/deploy-env-secrets.yml` runs `deploy-environment.yml` for ci (its `paths` filter), which updates the one ci user pool that every ci set signs in to. `scripts/put-secret-with-rotation-tag.sh` refuses an empty value (line 34), so a provider's secret step in `deploy-env-secrets.yml` breaks every environment deploy until its GitHub environment secret exists on both ci and prod. In a worktree `npm run bundle` comes before the unit tests; each JS change passes `npx eslint <files>` and `npx prettier --check <files>`, and each Java change passes `./mvnw spotless:check`, with any `spotless:apply` kept to the row's own files.

## In flight

- [ ] **DEP184. Clear the `basic-ftp` advisory that `npm audit` reports.** `npm audit` in the main checkout reports 12 high-severity findings, all one advisory: GHSA-c475-qrg2-pj4r, a slow directory-listing parser in `basic-ftp` 6.2.0 and earlier. One copy is installed, `basic-ftp@5.3.1`, through `@axe-core/cli@4.14.0` > `chromedriver` > `proxy-agent` > `pac-proxy-agent` > `get-uri@8.0.1`; the other 11 findings are its parents (`lighthouse`, `pa11y`, `pa11y-ci`, `puppeteer`). It is a development tool path and no deployed code loads it. Dependabot shows no open alert. `npm audit fix` offers only major downgrades of the tools, so the change is an entry in `package.json`'s `overrides` (line 496) for `basic-ftp` at `^6.2.1` (6.2.6 is the latest) and the lock file. Proof: `npm audit` reports 0 high findings, `npm ls basic-ftp` shows one 6.2.x copy, and `npm run accessibility:axe-proxy` still starts its browser. A push that changes `package.json` starts `deploy.yml`. Built on the batch `claude/garnet-deadcode` (efce21fb0, worktree `.claude/worktrees/garnet`): the override is in, `npm ls` shows `basic-ftp@6.2.6`, `npm audit` finds 0 vulnerabilities, and `get-uri`, `proxy-agent`, `axe` and `pa11y-ci` load. Left: the batch's checks, PR and deploy with TD42. **Source**: `/clean`, 2026-11-12. **Owner**: Claude Code. **Model**: Haiku. **Size**: 2 files.

- [ ] **TD42. Remove the unused exports that `knip` reports.** `npx --yes knip@6 --no-progress --reporter json` reads the tracked `knip.json`; its JSON is the last stdout line that starts with `{`. It reports 127 unused exports in 60 files: `app/lib` 52 in 27 files, `app/services` 39 in 19, `infra/microsoft` 15 in 1, `app/http-simulator` 7 in 4, `web/marketing` 4 in 1, `mcp/lib` 3 in 3, `app/test-helpers` 3 in 2, `app/data` 3 in 2, `app/test-support` 1 in 1. For each export, grep the whole repository for the name (`.js`, `.mjs`, HTML script blocks, workflows, Java, `mcp/`). When nothing uses it: delete the symbol if its own file does not use it, otherwise drop the `export` keyword. When something knip cannot see uses it: keep it and add that entry point to `knip.json`. Delete no file; an earlier knip pass deleted one that was in use. The 27 unresolved imports (browser paths such as `/lib/services/catalog-service.js`), the 21 unlisted packages and the unused dev dependency `pa11y` are outside this row. Two agents by tree: `app/lib`; then `app/services` and the rest. Proof: the knip command reports 0 unused exports, `npm run bundle`, `npm test` and `npm run test:browser` pass, and `npx eslint` passes on the changed files. A push that changes `app/lib` or `app/services` starts `deploy.yml`. In flight on the batch `claude/garnet-deadcode`: one Sonnet agent on `claude/garnet-lib` (`app/lib`, 52 exports) and one on `claude/garnet-rest` (the other 75), each in its own worktree; neither edits `knip.json`, which the coordinator updates when they report. **Source**: `../private.diyaccounting.co.uk/engineering/REPORT_TECH_DEBT_AUDIT_2026-11-12.md` TD41; operator, 2026-11-12. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~60 files (two agents).

## Machine-only

## Machine-ask

## Human-driven

## Blocked

- [ ] **CT25. Pass the recognition scenarios.** Each scenario in SDST's pack goes to the test service it names (`scripts/hmrc-tpvs-ct600.js`, with B34g1's `--ets` mode for ETS) and passes. The XML and the response of each go to `../private.diyaccounting.co.uk/hmrc/ct/recognition/`, and `CT600_APPROVAL_CHECKLIST.md` gains one row per scenario. A scenario that needs a page or box Submit refuses becomes its own build row. Checklist C69. The operator's request went on 2026-11-11 21:35 (`../private.diyaccounting.co.uk/hmrc/ct/EMAIL_SDST_CT600_NEW_APPLICANT_PACK_SENT_2026-11-11.md`): it asks for the new applicant's pack or the next stage, and cites the recognition instructions. SDST's last reply took 8 days. CT30's runner files each scenario (`node scripts/hmrc-tpvs-ct600.js --scenario <file>`). Blocked on SDST's reply. **Source**: `PLAN_HMRC_CT_APPROVAL.md` CT25. **Owner**: Claude Code. **Model**: Sonnet. **Size**: ~3 files.

- [ ] **CT26. Send SDST the recognition scenario XML.** The operator replies to SDST with the XML of each scenario CT25 passed, and the supplier-list answers: "Produce and submit CT600" Yes, "Submit iXBRL documents" Yes, "Suitable for self-filers" Yes. SDST aims to decide within 2 weeks; the listing is the recognition (C71) that UH7 waits on. Claude drafts with the `email-draft` skill. The same email asks SDST one question from the long period design: both returns of a period of account over 12 months tick box 85A and carry the full-period accounts (CTM93190 example 2); is that what HMRC expects. Checklist C70, C71. Blocked on CT25. **Source**: `PLAN_HMRC_CT_APPROVAL.md` CT26; Basic guide for XML software developers, "Software recognition". **Owner**: Claude Code (draft), Operator (send). **Model**: Opus. **Size**: 0 files.

- [ ] **UH7. Unhide the CT600 filing form on prod (PLAN_HMRC_CT_APPROVAL UH7).** `prod` on the CT600 activity's `environments` (moved from B34g2b), the HIDE1 rule for it with `prod` added, and the availability table and dates on `web/public/mtd-calendar.html` in the same change. Blocked on: HMRC's Corporation Tax recognition (CT26's outcome, checklist C71; the CT electronic communications direction §5 requires software "successfully tested by HMRC"); the operator's approval. The activity is in Resident Ltd, which is listed on prod. **Source**: `PLAN_HMRC_CT_APPROVAL.md` UH7. **Owner**: Claude Code (build), operator (approval). **Model**: Sonnet. **Size**: ~3 files. Unblocks UH8, UH2 (`PLAN_ITSA_APPROVAL.md`), MCP1.

- [ ] **UH8. Unhide the joint accounts and CT600 filing on prod (PLAN_HMRC_CT_APPROVAL UH8).** `prod` on the `file-company-tax-return-with-accounts` activity that CT29 added, so the CT600 page offers "To Companies House and to HMRC with the Company Tax Return" on prod; the availability table and dates on `web/public/mtd-calendar.html` in the same change. The Companies House accounts activities (`file-micro-entity-accounts`, `file-small-company-accounts`) are already on prod. CT29's activity is on `main` since PR #803. Blocked on UH7 and the operator's approval. **Source**: `PLAN_HMRC_CT_APPROVAL.md` UH8; operator, 2026-11-11 (replaces DF2b). **Owner**: Claude Code (build), operator (approval). **Model**: Sonnet. **Size**: ~2 files.

- [ ] **MCP1. The hosted MCP launched on prod: every tool, the harness, and the listing.** HIDE1 narrowed the hosted MCP tools on prod to VAT (`submit_vat_return` and its reads) and hid `web/public/mcp-harness.html` behind the page guard. MCP1 brings both back and launches the MCP: each tool beyond VAT enabled on prod as the journey it files goes live (Income Tax, `PLAN_ITSA_APPROVAL.md` UH3; practice, UH1; CT600, `PLAN_HMRC_CT_APPROVAL.md` UH7), the harness on prod behind an operator-only activity, the accounts and confirmation statement tools renamed from `*_sandbox` now that RL2d lists them on prod's MCP page, and the MCP's public listing and connection guide once the tool set is whole; the availability table and dates on `web/public/mtd-calendar.html` change in the same change. Blocked on: UH1, UH3 and UH7 for the tools; the operator's approval to enable it for live users. **Source**: operator, 2026-10-30 (replaces the unhide rows for the MCP tools and the harness). **Owner**: Claude Code (build), operator (approval). **Model**: Sonnet. **Size**: ~5 files.

## Discipline

- **Push once per batch of landed tracks, never per track**, and prefer one dispatch that
  proves several things over several dispatches. A push per track turned one batch into six
  ci deploys and several environment deploys in a morning on 2026-09-06, each able to open
  alarm issues and cancel each other through the deploy concurrency group, and the operator
  froze pushes twice. A freeze, when the operator calls one, stops `git push`,
  `gh workflow run` and `gh pr create` until they lift it in their own words; local commits,
  worktree tracks and reading logs continue, and a failed job gets a proposed fix in the reply.
