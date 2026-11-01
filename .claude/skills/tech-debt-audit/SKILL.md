---
name: tech-debt-audit
description: Audit the technical debt of the workspace repositories (submit, spreadsheets, www, root, private documents, archive references) with six published methods (Fowler quadrant, SQALE cost, Tornhill hotspots, ISO/IEC 25010, DORA, dependency and supply-chain debt). Every figure comes from a command. The output is one ranked report in the private repository, with proposed TD board rows. Invoke when the operator asks for a tech-debt audit, a repository hygiene report, a debt report, or "how much tech debt do we have".
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability DEV-56 Audit the workspace's technical debt
- **Use when:** the operator asks for a tech-debt audit, a repository hygiene report, or how much debt the repositories carry.
- **Does:** The tech-debt-audit skill measures the five workspace repositories with six published methods and a set of hygiene checks. It ranks the findings by value against cost, compares them with the previous audit, and writes one report to the private repository. The report holds proposed TD rows for NEXT.md.
- **Run:** `/tech-debt-audit`
- **Entry:** `.claude/skills/tech-debt-audit/SKILL.md`
- **Files:** .claude/skills/tech-debt-audit/SKILL.md
- **Keywords:** tech debt, technical debt audit, repository hygiene, hotspots, sqale, fowler quadrant, dora, dependabot alerts, pinned actions, iso 25010
- **Related:** DEV-29, DEV-43, DEV-55
@end-capability -->

# tech-debt-audit

One read-only pass over the workspace repositories. It writes one file:
`../private.diyaccounting.co.uk/engineering/REPORT_TECH_DEBT_AUDIT_<YYYY-MM-DD>.md`.
The first audit is `REPORT_TECH_DEBT_AUDIT_2026-10-30.md` in the same folder. Use it as the model
for the shape and as the baseline for the trend.

The pass changes no file in any repository except the report. It writes nothing to GitHub,
AWS or any service. All GitHub and AWS calls are reads.

## 0. Before the pass

1. `git -C <repo> fetch -q origin && git -C <repo> pull -q --ff-only origin main` in each repository. Record each `main` head in the report.
2. Read the previous audit, the newest `REPORT_TECH_DEBT_AUDIT_*.md`. Copy its **Decisions** table. A row the operator declined (on 2026-10-30: TD3, one sync for the shared-conventions block; TD14, untrack the spreadsheets packages) is not proposed again. Its finding stays in the figures, marked "declined".
3. Read `NEXT.md` for the TD rows that are open now. Take the next free TD number from `NEXT.md` and `git log -S'**TD' -- NEXT.md`. Use rank order as the label order, and one numbering only. The first audit had two numberings (finding IDs and rank IDs), and the board had to renumber them.
4. Read each repository's `CLAUDE.md`. Judge each repository against its own rules.

## 1. Scope

| Repository | What is read |
|---|---|
| `submit.diyaccounting.co.uk` | code, tests, workflows, docs |
| `spreadsheets.diyaccounting.co.uk` | code, tests, workflows, docs |
| `www.diyaccounting.co.uk` | code, tests, workflows, docs |
| `root.diyaccounting.co.uk` | code, tests, workflows, docs |
| `private.diyaccounting.co.uk` | documents only: structure, drafts, names, working tree |
| `diy-accounting-archive` | only the live references to it from the other five |

Read tracked files only (`git -C <repo> ls-files`). Never read `node_modules/`, `target/`,
`cdk.out/`, `packages/` or `.claude/worktrees/`. A count over the file system instead of
`ls-files` counts every worktree again. In the first audit the duplicate-file counts included
three worktrees.

## 2. How to run it

Dispatch one Sonnet sub-agent for the measurement, from a fresh `origin/main` in each repository.
Its brief is sections 1, 3, 4 and 5 of this skill, plus the brief constants (no `Agent` tool, no
edits, every figure with its command). The sub-agent returns the whole report as Markdown in its
final message. Sub-agents in this environment cannot write files in the private repository, so
the coordinator writes the file and commits it (section 6).

When the session has no free agent budget, run the same commands in the main context.

## 3. Methods

Name each method and its source in the report.

| # | Method | Source | What to produce |
|---|---|---|---|
| 1 | Technical-debt quadrant | Martin Fowler, "TechnicalDebtQuadrant" (martinfowler.com, 2009) | Each finding as reckless or prudent, deliberate or inadvertent. The basis is the repository's own rules and whether a tool exists that would have caught it |
| 2 | SQALE remediation cost | Jean-Louis Letouzey, "The SQALE Method" (2010) | Hours for one engineer per finding, summed by characteristic. Say that the hours are estimates |
| 3 | Hotspots | Adam Tornhill, "Your Code as a Crime Scene" (2015) | Top files per repository: commits in 12 months × lines, with the maximum indent as the nesting proxy and the longest function |
| 4 | Quality characteristics | ISO/IEC 25010:2011 | Maintainability, reliability, security, performance efficiency and portability as the frame for every finding |
| 5 | Delivery view | Forsgren, Humble, Kim, "Accelerate" (2018); dora.dev | Deploy frequency, change failure rate, p50 and maximum duration per key workflow |
| 6 | Dependency and supply-chain debt | OWASP Top 10 2021 A06; OpenSSF Scorecard "Pinned-Dependencies", "Dependency-Update-Tool" | Open Dependabot alerts by severity and scope, packages a major version behind, SHA-pinned actions, Java, CDK and Node versions |

## 4. Commands

Every figure comes from a command. Give each command an appendix reference (A-n) and cite it
next to the figure. Never estimate a count that a command can measure.

| Ref | Measure | Command |
|---|---|---|
| A-1 | Tracked files | `git -C <repo> ls-files \| wc -l` |
| A-3 | Hotspots | `git -C <repo> log --format= --name-only --since=12.months \| grep -E '\.(js\|mjs\|java\|yml\|css\|html)$' \| grep -v -E 'node_modules\|^packages/\|bundle\|package-lock' \| sort \| uniq -c \| sort -rn \| head -40`, then `wc -l` and the deepest leading-space count per file with `awk` |
| A-4 | Largest code files | `git ls-files \| grep -E '\.(js\|mjs\|java)$' \| xargs wc -l \| sort -rn \| head` |
| A-5 | Longest function | `grep -n -E '^(export )?(async )?function ' <file>` and the gap to the next match |
| A-6 | Delivery | `gh run list --repo diy-accounting-uk/<repo> --created ">=$(date -u -v-30d +%F)" --limit 1000 --json conclusion,workflowName,createdAt,updatedAt`, grouped by `workflowName`; duration = `updatedAt − createdAt` |
| A-7 | Dependabot alerts | `gh api "repos/diy-accounting-uk/<repo>/dependabot/alerts?state=open&per_page=100" --paginate --jq '.[] \| "\(.security_advisory.severity) \(.dependency.scope)"'` |
| A-8 | Outdated packages | `npm outdated --json` where `node_modules` exists; major = the first version segment differs |
| A-9 | Pinned actions | `git grep -h -E '^\s*-?\s*uses:\s+[^./ "'"'"']' -- .github`, then count the lines with `@[0-9a-f]{40}` |
| A-10 | Lint state | `.eslint-baseline.json`; `git grep -c 'eslint-disable' -- '*.js' '*.mjs'`; `git grep -I -n -E '\b(TODO\|FIXME\|HACK\|XXX)\b'` |
| A-11 | Skipped tests | `git grep -E '\b(it\|test\|describe)\.(skip\|fixme\|todo)\b' -- '*.js' '*.mjs'` |
| A-12 | Test shape | `git ls-files <dir> \| grep -E '\.(test\|spec)\.(js\|mjs)$\|Test\.java$'` and the line count per test directory |
| A-13 | Unit-test time | `npm test` in submit; the vitest `Duration` line, with the import and test split |
| A-15 | Dead code | the tools in `node_modules/.bin` (`knip`, `ts-prune`, `depcheck`); when none is installed, the `^export ` count in `app/lib` and `app/services` as the base, and the finding goes under "Not measured" |
| A-16 | Duplicate files | `git -C <repo> ls-files -s` per repository, joined on blob hash, without lock files, images and `.md` |
| A-17 | Shared-conventions drift | `diff <(sed -n '/^## Shared conventions/,$p' submit/CLAUDE.md) <(sed -n '/^## Shared conventions/,$p' <repo>/CLAUDE.md) \| grep -c '^[<>]'` |
| A-18 | Rotting docs | every backtick path in `CLAUDE.md`, `NEXT.md`, `PLAN_*.md` and `.github/copilot-instructions.md`, checked against `git ls-files` by path, then by basename; `.html` paths resolve against `web/public` |
| A-19 | Size of live docs | `wc -l REPORT_CAPABILITIES.md NEXT.md PLAN_*.md CLAUDE.md`; `git log --since=12.months --oneline -- <file> \| wc -l` |
| A-20 | Branches and worktrees | `git branch -r \| wc -l`; `git branch \| wc -l`; `git worktree list` |
| A-21 | Workflows | `git ls-files .github/workflows \| xargs wc -l \| sort -rn`; `git grep -c "NODE_VERSION" -- .github/workflows` |
| A-22 | npm scripts | `node -p 'Object.keys(require("./package.json").scripts).length'` |
| A-23 | Repository weight | `du -sh <repo>/.git` |
| A-24 | Archive references | `git -C <repo> grep -I -l 'diy-accounting-archive'` |
| A-25 | Migration leftovers | `git -C <repo> grep -I -l 'antonycc/'` |

Traps the first audit hit:

- `gh run list --limit 200` covered only 18.5 hours of submit runs. Use the date window in A-6, so that each repository reads the same 30 days.
- A skip pattern with `xit(` matched `exit(`. Use the word-bounded pattern in A-11.
- The `uses:` count took in some quoted local-action lines. Exclude `./` and quoted paths, as A-9 does.
- `npm test` ran while other sessions loaded the machine. Check `uptime` first. When the load average is above the core count, report the time as an upper bound.
- Lead time, time to restore and flaky tests need a join that `gh run list` does not give. Put them under "Not measured" with that reason, or join the run list to `git log` and to the next green run when the session has time.

## 5. Report shape

Simplified Technical English, tables over prose, no stance words. Never write that a fix is
permanently impossible; name the horizon.

1. **Header**: scope, the `main` head of each repository, and one result line (the count of findings, the total hours, the largest characteristic and its share, the three cheapest fixes of high value).
2. **Not measured**: each measure with the reason.
3. **Decisions**: the operator's decisions from the previous audits, copied.
4. **Trend**: one row per figure that the previous audit measured, with the old value, the new value and the change. A TD row closed since the last audit shows as its figure going to its target.
5. **Ranked summary**: the top 15 by value against cost. Columns: rank, repo, finding, quadrant, characteristic, hours, value (H when it affects security, delivery time or every session; M when it affects one workflow or one repository), proposed fix.
6. **One section per method** (section 3), with its evidence table.
7. **Other checks**: one table, check, result and command reference.
8. **One scorecard per repository**: area, grade (A no action, B minor, C planned work, D work before the next feature), basis.
9. **Proposed board rows**: one row per ranked fix in the style of `NEXT.md`. Each row has a TD label, a title, the fix with its paths, the proof command, the owning repository, **Source**, **Owner**, **Model** (the lowest of Haiku, Sonnet or Opus that fits) and **Size** (~n files). A row over about 25 files is a two-agent chain. Then one table of the smaller rows.
10. **Appendix**: the commands by reference, and a caveat per figure that has one.

## 6. Write and commit

The coordinator writes the file. The private tree can hold other sessions' work, so add only the
report:

```bash
git -C ../private.diyaccounting.co.uk add engineering/REPORT_TECH_DEBT_AUDIT_<date>.md
git -C ../private.diyaccounting.co.uk commit -m "Tech-debt audit <date>: <n> findings, <h> hours, ranked rows TD<a> to TD<b>"
```

End the message with the commit trailers that `CLAUDE.md` names. If `index.lock` exists, wait
and retry. Push as its own command; the report is Markdown, so the docs exception covers it.

## 7. Summarise and hand over

The chat reply opens with the result line, then:

1. The top five findings, one line each, with the hours.
2. The trend lines that moved most.
3. The measures that were not measured.
4. One question with the proposed TD rows as options (`AskUserQuestion`, multi-select): which rows go onto the board, and which the operator declines.

Rows go onto `NEXT.md` only after the operator's answer, and then through `/refine`, which checks
each reference and brief. Write each declined row and its reason into the report's **Decisions**
table and commit that change, so the next audit does not propose it again.
