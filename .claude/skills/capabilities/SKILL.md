---
name: capabilities
description: Find the tooling this repository already has before building any. Invoke before you add or write a script, workflow, job, Lambda, check, test harness, sync, report, alarm, dashboard panel, page or skill; when a task says add, build, create, automate, check, sync, report, measure, record, publish, deploy, destroy or clean up; and when you need the command that does something here. Also keeps REPORT_CAPABILITIES.md current.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

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

An entry sits under its area (`## <Area> (<PREFIX>)`) and group (`### <Group> (<PREFIX>)`):

```markdown
#### OPS-71 Sweep stale ci deployments

- **Use when:** a ci set must be destroyed, or leftover stacks cleaned up after deploys
- **Does:** Short sentences in simplified technical English. Name the function or job.
- **Run:** `gh workflow run destroy-ci.yml -f sweep-for-stacks=true`
- **Entry:** `.github/workflows/destroy-ci.yml:sweep-for-stacks`
- **Files:** .github/workflows/destroy-ci.yml, .github/actions/claim-ci-slot/slot-claim-active.mjs
- **Keywords:** teardown, destroy, cleanup, sweep, leftover stacks
- **Related:** OPS-70
```

Rules for the text: one fact per sentence, at most 20 words, active voice, present tense, no
idioms. Use the names the code uses. Check every **Run** command against the code with grep. Take
the next free number in the area — `SS-59` for the next entry under `## Spreadsheets and diya-gl
(SS)`, wherever in that area it lands; the group's contents block resorts it into place. An entry
about `spreadsheets.diyaccounting.co.uk` code always goes under the `SS` area, never a new one:
extend a group in it, or add a group in the order the skill's own groups follow (engine/CLI/MCP,
package pipeline, web properties, analytics, workflows, tests, skills).

Then regenerate the index, area contents, group contents and keywords, and check them, from this
repository's root regardless of which repository the entry describes — the script and the file it
rewrites both live here:

```bash
npm run capabilities:index
npx vitest run app/unit-tests/capabilitiesIndex.test.js
```

Edit only the entries. The blocks between `<!-- generated:... -->` markers are rewritten by the
script. The unit test fails when they are stale.

## Rebuild after a large change

When many files changed in either repository since the commits named at the top of the report:

1. **This repository**: `git diff --name-only <submit-commit>..HEAD` lists the files to check
   against the non-`SS` areas.
2. **`spreadsheets.diyaccounting.co.uk`**: from that checkout, `git diff --name-only
   <spreadsheets-commit>..HEAD` lists the files to check against the `SS` area. A session working
   there has no write access to this repository's worktree; hand the diff, and the entries it
   should change, to a session working here, or make the change here directly once both checkouts
   are in reach.
3. For each changed file, find its entries (`grep -n '<path>' REPORT_CAPABILITIES.md`, matching on
   the path after `../spreadsheets.diyaccounting.co.uk/` for an `SS` entry) and correct them. A new
   file with no entry gets one, or joins an entry's **Files**.
4. Run `npm run capabilities:index` and the unit test.
5. Update both commits named at the top of the report (`Built <date> from submit.diyaccounting.co.uk
   commit \`<hash>\` and spreadsheets.diyaccounting.co.uk commit \`<hash>\`.`), each to the commit the
   check in step 1 or 2 ran against.

For a full rebuild, follow the report's Method section.
