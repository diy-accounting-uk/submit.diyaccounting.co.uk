---
name: do-next
description: Dispatch NEXT.md's open items as worktree-isolated coordinator sub-agents and land each one as it lands. Invoke when the operator says "do next", "work the backlog", "clear NEXT.md", or when a landed batch leaves items still open.
---

# do-next — work `NEXT.md`'s open items with the coordinator model

This skill turns this repo's `NEXT.md` **Open items** section into a dispatched batch of
worktree-isolated sub-agents, keeps `NEXT.md` itself as the live tracking surface while they run,
and lands each one's work the moment it's ready rather than waiting for the whole batch.

This repo's `NEXT.md` points at the workspace root's `../NEXT.md` for the rules governing its own
shape (DONE-or-OPEN only, nothing deferred; a bug found fixing item A is A's remainder, not a new
item; `NEXT.md` holds only what to do next — completed work lives in `git log`). Plans of record
are `PLAN_*.md` files at this repo's root.

> **Invoke it by telling a session:** *"Follow the `do-next` skill"*, or "work the open items in
> NEXT.md", or "do NEXT".

## When to run this

- `NEXT.md`'s **Open items** section has one or more entries and nobody is actively working them.
- A prior batch just landed and items remain — dispatch the next batch rather than stopping (see
  the workspace `CLAUDE.md`'s "an approved plan is authorization" rule).
- The operator asks to "work the backlog", "clear NEXT.md", or names this skill directly.

## Procedure

1. **Read `NEXT.md`'s Open items fresh, don't work from memory of a prior run.** The list changes
   shape every time a batch lands.
2. **Filter before dispatching.** Not every open item is actionable code work. A gotcha note
   documenting something already correct stays in `NEXT.md` as reference; it doesn't get a track.
   Only dispatch items that describe a real, boundable change.
3. **Decompose into tracks with clear file-ownership boundaries.** This repo's natural
   boundaries: `app/functions/**` (Lambda handlers, grouped by feature), `app/unit-tests/` /
   `app/system-tests/` (their matching tests), `web/public/` (site pages — never touch
   `web/public-simulator/`, it's a generated export), `web/browser-tests/`, `behaviour-tests/`
   (E2E journeys), `cdk/**` (Java CDK stacks), `.github/workflows/**` (deploy/test pipelines).
   Two tracks that both need to touch the same file are a merge-collision risk, not two
   independent tracks — either sequence them or scope each to non-overlapping regions and say so
   in both briefs.
4. **Pick each track's model tier deliberately**, per the workspace `CLAUDE.md`'s coordinator
   ladder — group tracks needing similar depth so one hard track doesn't price a whole batch at
   the top tier:
   - **Opus** — novel design work: a new CDK stack, a decision with real architectural weight,
     anything touching HMRC obligation/auth flows.
   - **Sonnet** — a bounded decision plus mechanical implementation against an existing pattern
     (a new Lambda handler following `{feature}{Method}.js` naming, a new behaviour test journey).
   - **Haiku** — pure mechanical sweeps: renames, manifest updates, format-only edits.
5. **Write `NEXT.md`'s in-flight tracking block before dispatching**, one line per track naming
   what it covers and its status (`started`). Commit this alone, docs-only — it's the record that
   a batch is running even if the session dispatching it ends before any track lands.
6. **Dispatch each track as an isolated-worktree agent**, self-contained (fresh agents carry no
   conversation context — the brief must stand alone). Every brief needs:
   - Enough project background to work without asking (submit.diyaccounting.co.uk deploys to two
     AWS accounts, submit-ci and submit-prod — see this repo's `CLAUDE.md`; HMRC obligations are
     unpredictable, tests must never hardcode specific periods).
   - The exact file-ownership list — what it owns, what it must not touch and why.
   - **Testing, in this repo's four-tier pyramid**: `npm run test:unit` for `app/unit-tests/` and
     `web/unit-tests/` changes, `npm run test:system` for `app/system-tests/` (Docker
     integration), `npm run test:browser` for `web/browser-tests/` UI components, `./mvnw clean
     verify` for any CDK/Java change. No behaviour-test tier (`npm run test:*Behaviour-*`) inside
     a track — that's the coordinator's job at the actual deploy/push moment, since it needs a
     live proxy/CI environment and takes minutes.
   - **Git discipline**: confirm repo-local identity, commit early and often with clean messages,
     never `git stash`/`reset --hard`/`checkout --`/`clean`, never push, never merge to `main`,
     never edit `NEXT.md` (the coordinator owns it).
   - **For any item whose result is visual** (a `web/public/` page, a UI component), a screenshot
     the agent actually looks at. Drive the page with Playwright, save a PNG under `target/`,
     **open that PNG with the Read tool**, and describe what it shows against what the item asked
     for.
   - **A report-back contract**: what it implemented and why, any bugs found along the way even
     if unrelated to the task (name file/line), exact test commands run with pass/fail counts,
     screenshot paths if any, and anything deliberately left out of scope and why.
7. **As each track's completion notification arrives**, land it immediately — don't wait for
   siblings:
   - `git status --short` inside the agent's worktree first. Uncommitted work is a real loss if
     skipped.
   - `cd` to the actual repo root and confirm (`pwd`, `git branch --show-current`) before merging.
   - `git merge --no-ff` with a message naming the track and what it covers.
   - Run that track's blast-radius tests on the merged `main`, not just trust the agent's own
     report.
   - Green: `git push`. Then `git worktree remove` and `git branch -d` the merged branch.
   - Red: don't push through it. Diagnose before merging the next track.
8. **Update `NEXT.md` in the same breath as each landing**, not batched at the end. Move the
   track's in-flight line to a landed note (commit SHA, test counts), and remove the item it
   resolved from Open items — but only once nothing that item's own track surfaced is still
   outstanding. Narrow the item's text instead of removing it, if the track only closed part of a
   multi-part item.
   **A bug the track's report surfaces is that item's remainder, not a new item.**
   **A failing test a track reports is an open item and a job for this batch**, whether or not the
   track caused it.
9. **Before a push to `main` or any branch feeding `deploy.yml`, run the full local validation**
   (`npm test`, `./mvnw clean verify`, `npm run test:submitVatBehaviour-proxy`) — the one moment
   the full local suite is mandatory, regardless of how narrow every track's own testing was.
10. **Loop.** Anything still open — an item no track picked up, a bug logged during landing, a
    track that failed and needs a retry — becomes the next batch. Dispatch it the same way, don't
    stop to ask permission if the operator's own instruction already covers "keep going" for this
    kind of batch.

## What NOT to do

- Don't dispatch a track for an item that's a documentation note, not a task — check first.
- Don't let a sub-agent push, merge to `main`, or edit `NEXT.md` — those are the coordinator's own
  integration work.
- Don't run the behaviour-test tier inside a sub-agent — the targeted unit/system/browser rung
  replaces it for worktree work; behaviour tests need a live environment and are the
  coordinator's job at deploy time.
- Don't batch every track's merge for the end of the session — merge, test, and push each one as
  it lands, so a slow track doesn't hold back four fast ones.
- Don't silently drop a bug a sub-agent surfaces because it's outside the current track's scope —
  track it in `NEXT.md` as a sub-clause of the item that surfaced it.
- Don't leave a merged worktree or its branch behind — remove both in the same breath as the
  merge.
