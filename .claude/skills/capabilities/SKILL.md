---
name: capabilities
description: Find the tooling this repository already has before building any. Invoke before you add or write a script, workflow, job, Lambda, check, test harness, sync, report, alarm, dashboard panel, page or skill; when a task says add, build, create, automate, check, sync, report, measure, record, publish, deploy, destroy or clean up; and when you need the command that does something here. Also keeps REPORT_CAPABILITIES.md current.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-43 Find existing tooling before building any
- **Use when:** a task would add a script, workflow, Lambda, check, sync, report, alarm, page or skill
- **Does:** The capabilities skill reads REPORT_CAPABILITIES.md before any new mechanism is written. It finds the entry that does the job, or confirms that none fits. It also says how to add or change an entry in its home file. The generator builds the report from those headers.
- **Run:** `/capabilities`; `npm run capabilities:generate`; `npm run capabilities:check`
- **Entry:** `.claude/skills/capabilities/SKILL.md`; `scripts/capabilities-generate.mjs:generateReport`; `scripts/capabilities-index.mjs:render`
- **Files:** .claude/skills/capabilities/SKILL.md, REPORT_CAPABILITIES.md, _developers/capabilities/skeleton.md, scripts/capabilities-generate.mjs, scripts/capabilities-index.mjs, scripts/lib/capabilityHeaders.mjs, app/unit-tests/capabilities.test.js, app/unit-tests/capabilityHeaders.test.js
- **Keywords:** capability, existing tooling, find command, index, reuse, duplicate mechanism, what does the repo do
@end-capability -->

# capabilities

This repository has more tooling than a session can see from the tree, and so does its sibling
`spreadsheets.diyaccounting.co.uk`. `REPORT_CAPABILITIES.md` lists every capability in both
repositories with the command that runs it. Look there first. Use or extend what you find. Add a
new mechanism only when no entry fits.

**One file, two repositories.** `REPORT_CAPABILITIES.md` lives here, at this repo's root. Its
areas prefixed `SITE`, `HMRC`, `CH`, `BILL`, `OPS`, `DATA`, `MCP` and `DEV` cover this repository.
Its `SS` area covers `spreadsheets.diyaccounting.co.uk` (the diya-gl engine, CLI and MCP server;
the package pipeline; the three web properties it serves; its analytics and tracking; its
workflows and deploys; its tests and CI gates; its skills). An `SS` entry's **Files** and **Entry**
paths are relative to `../spreadsheets.diyaccounting.co.uk/`, since the file itself sits here; open
them from that checkout, not this one. A session working in `spreadsheets.diyaccounting.co.uk`
reads this file the same way, from `../submit.diyaccounting.co.uk/REPORT_CAPABILITIES.md`.

## Find a capability

1. Read the Index at the top of `REPORT_CAPABILITIES.md`. Each line has an id, a name and a
   "use when" phrase. Match the task against the "use when" phrases, whichever repository it is
   about.
2. If nothing matches, search:

   ```bash
   grep -n -i '<word>' REPORT_CAPABILITIES.md | tee /tmp/cap-hits.txt | head -40
   ```

   Try the words the task uses and their synonyms. The Keywords section at the end maps words to
   ids, across both repositories.
3. Open the entry (`#### <ID> <name>`). Its fields:
   - **Use when**: the situations it covers.
   - **Does**: what it does, and the function or job that does it.
   - **Run**: the command, dispatch, route or import to use.
   - **Entry**: the code to read or extend, as `path:symbol`. An `SS-*` id's path starts under
     `../spreadsheets.diyaccounting.co.uk/`.
   - **Files**: every file that belongs to it, tests included.
   - **Keywords** and **Related**: other ways in. A `Related` id from the other repository (an
     `SS-*` id here, or a `BILL-*`/`MCP-*`/`DATA-*` id on an `SS-*` entry) marks a real seam between
     the two: the diya-gl cloud store submit's `/api/v1/books` routes back, or a GA4/RUM config the
     two share.
4. Read the Entry code before you rely on the entry. The code is the truth; the entry is a map.

## Decide

- An entry does the job: run it as **Run** says.
- An entry does most of the job: extend its Entry code. Do not write a second tool beside it.
- Two entries overlap with your task: extend the one whose **Does** is closest, and say which in
  the commit.
- No entry fits after the Index, a grep and the Keywords: build the new capability, and add its
  entry in the same commit (see below).

Say which entry you used, or that none fitted, in your report or PR body.

## Add or change an entry

`REPORT_CAPABILITIES.md` is generated. Never edit it. An entry is a comment block, a header, at the
top of its home file. The home is the first path in the entry's **Entry** field that git tracks
and that can hold a comment. The generator reads `git ls-files`, so `git add` a new home file
first.

A header goes after the SPDX and copyright lines and one blank line. Each line of a `//` file
(js, mjs, cjs, java), a `#` file (yml, sh, toml) or a `--` file (sql) starts with the leader and one
space. A Markdown or HTML file holds the same lines raw, inside one `<!--` comment:

```text
// @capability OPS-71 Sweep stale ci deployments
// - **Use when:** a ci set must be destroyed, or leftover stacks cleaned up after deploys
// - **Does:** Short sentences in simplified technical English. Name the function or job.
// - **Run:** `gh workflow run destroy-ci.yml -f sweep-for-stacks=true`
// - **Entry:** `.github/workflows/destroy-ci.yml:sweep-for-stacks`
// - **Files:** .github/workflows/destroy-ci.yml, .github/actions/claim-ci-slot/slot-claim-active.mjs
// - **Keywords:** teardown, destroy, cleanup, sweep, leftover stacks
// - **Related:** OPS-70
// @end-capability
```

Rules for the header:

- One line per field, in this order: Use when, Does, Run, Entry, Files, Keywords, Related. Related is the only optional field.
- No trailing space on any line. A Markdown or HTML body holds no `-->`. A `//` body holds no `\u` and, in Java, no slash-star.
- A Java header sits between a `// spotless:off` line and a `// spotless:on` line, so the formatter keeps one line per field.
- Text: one fact per sentence, at most 20 words, active voice, present tense, no idioms. Use the names the code uses. Check every **Run** command against the code with grep.
- A file that holds two entries stacks the headers in id order. A workflow family has its header in the first workflow of **Entry**. A skill has its header in `SKILL.md`.
- An entry about `spreadsheets.diyaccounting.co.uk` code goes in `_developers/capabilities/SS.md`, with the id prefix `SS`, because this repository's CI does not check out that repository. An entry with no tracked home file goes in `_developers/capabilities/submit.md`.

The id is the identity. `git mv` carries the header with its file. Never renumber an id. A new id
is the highest number in its area plus one: `node scripts/capabilities-generate.mjs --next <PREFIX>`
prints it.

A new entry also needs a slot line in `_developers/capabilities/skeleton.md`, in the group it
belongs to: `<!-- capability OPS-71 -->`. The skeleton holds the preamble, the area and group
headings and the slot order. A new group or area is a heading in the skeleton with empty
`<!-- generated:... -->` marker pairs, copied from a neighbour.

Then generate the report and check it, from this repository's root regardless of which repository
the entry describes:

```bash
npm run capabilities:generate
npm run capabilities:check
npx vitest run app/unit-tests/capabilities.test.js
```

Commit the header, the skeleton change and the regenerated `REPORT_CAPABILITIES.md` together. The
`capabilities` job of `test.yml` fails when the report is not what the headers generate. A push
straight to `main` (a Markdown-only change) skips that job, so run `npm run capabilities:check`
before the push and commit the regenerated file in the same commit. On a merge conflict in the
report, take either side and run `npm run capabilities:generate`.

## Rebuild after a large change

When many files changed in either repository since the entries were last checked:

1. **This repository**: `git diff --name-only <commit>..HEAD` lists the files to check against the
   non-`SS` entries.
2. **`spreadsheets.diyaccounting.co.uk`**: from that checkout, `git diff --name-only
   <spreadsheets-commit>..HEAD` lists the files to check against the `SS` entries in
   `_developers/capabilities/SS.md`. A session working there has no write access to this
   repository's worktree; hand the diff, and the entries it should change, to a session working
   here, or make the change here directly once both checkouts are in reach.
3. For each changed file, find its header (`grep -n '<path>' REPORT_CAPABILITIES.md` names the
   entries that list it; the header is in the entry's home file) and correct it. A new file with
   no entry gets one, or joins an entry's **Files**.
4. Run `npm run capabilities:generate` and the unit test.
5. Update the `spreadsheets.diyaccounting.co.uk` commit named in the preamble of
   `_developers/capabilities/skeleton.md` to the commit the check in step 2 ran against.
