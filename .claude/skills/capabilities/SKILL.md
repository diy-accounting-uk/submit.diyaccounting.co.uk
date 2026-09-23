---
name: capabilities
description: Find the tooling this repository already has before building any. Invoke before you add or write a script, workflow, job, Lambda, check, test harness, sync, report, alarm, dashboard panel, page or skill; when a task says add, build, create, automate, check, sync, report, measure, record, publish, deploy, destroy or clean up; and when you need the command that does something here. Also keeps REPORT_CAPABILITIES.md current.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# capabilities

This repository has more tooling than a session can see from the tree. `REPORT_CAPABILITIES.md`
lists every capability with the command that runs it. Look there first. Use or extend what you
find. Add a new mechanism only when no entry fits.

## Find a capability

1. Read the Index at the top of `REPORT_CAPABILITIES.md`. Each line has an id, a name and a
   "use when" phrase. Match the task against the "use when" phrases.
2. If nothing matches, search:

   ```bash
   grep -n -i '<word>' REPORT_CAPABILITIES.md | tee /tmp/cap-hits.txt | head -40
   ```

   Try the words the task uses and their synonyms. The Keywords section at the end maps words to
   ids.
3. Open the entry (`#### <ID> <name>`). Its fields:
   - **Use when**: the situations it covers.
   - **Does**: what it does, and the function or job that does it.
   - **Run**: the command, dispatch, route or import to use.
   - **Entry**: the code to read or extend, as `path:symbol`.
   - **Files**: every file that belongs to it, tests included.
   - **Keywords** and **Related**: other ways in.
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
the next free number in the area.

Then regenerate the index, area contents, group contents and keywords, and check them:

```bash
npm run capabilities:index
npx vitest run app/unit-tests/capabilitiesIndex.test.js
```

Edit only the entries. The blocks between `<!-- generated:... -->` markers are rewritten by the
script. The unit test fails when they are stale.

## Rebuild after a large change

When many files changed since the commit named at the top of the report:

1. `git diff --name-only <commit>..HEAD` lists the files to check.
2. For each changed file, find its entries (`grep -n '<path>' REPORT_CAPABILITIES.md`) and correct
   them. A new file with no entry gets one, or joins an entry's **Files**.
3. Run `npm run capabilities:index` and the unit test.
4. Update the commit named at the top of the report.

For a full rebuild, follow the report's Method section.
