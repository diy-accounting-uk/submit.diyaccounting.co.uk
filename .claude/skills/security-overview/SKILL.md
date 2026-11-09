---
name: security-overview
description: Build one ranked security report across the six workspace repositories in place of GitHub's paid security overview. Reads the open Dependabot, code-scanning and secret-scanning alerts, runs the local secret scan, gathers /clean's state, runs /security-review on open branches and runs /exposure-check, then proposes a board row for each finding with none. Invoke when the operator asks for a security overview, the security state of the estate, or an all-alerts read.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability OPS-211 Report the security state of every repository in one ranked report
- **Use when:** the operator asks for the security state of the estate, an all-alerts read, or a security overview.
- **Does:** the skill reads the open Dependabot, code-scanning and secret-scanning alerts of all six repositories, runs the secret-scan skill, gathers the clean skill's state, runs security-review over each repository's open branches and runs the exposure-check skill. It ranks the findings most severe first, puts an open secret-scanning or exposure finding at the top, and proposes a NEXT.md row for each finding with no row.
- **Run:** `/security-overview`
- **Entry:** `.claude/skills/security-overview/SKILL.md`
- **Files:** .claude/skills/security-overview/SKILL.md
- **Keywords:** security overview, alerts, dependabot, code scanning, secret scanning, estate, ranked report, security state
- **Related:** OPS-170, OPS-210
@end-capability -->

# security-overview

Findings stay in the private repository, by the rules of `.claude/skills/exposure-check/SKILL.md`:
no secret value reaches stdout, a log, a file or a report. The report is
`../private.diyaccounting.co.uk/security/SECURITY_OVERVIEW_<date>.md`.

The six repositories are `submit.diyaccounting.co.uk`, `spreadsheets.diyaccounting.co.uk`,
`www.diyaccounting.co.uk`, `root.diyaccounting.co.uk`, `diy-accounting-archive` and
`private.diyaccounting.co.uk`, all in the `diy-accounting-uk` organisation.

## Steps

Run in this order. Collect each step's findings into the report as you go.

1. **Alerts.** For each repository and each kind, read the open alerts:

   ```bash
   gh api "repos/diy-accounting-uk/<repo>/dependabot/alerts?state=open&per_page=100" --paginate
   gh api "repos/diy-accounting-uk/<repo>/code-scanning/alerts?state=open&per_page=100" --paginate
   gh api "repos/diy-accounting-uk/<repo>/secret-scanning/alerts?state=open&per_page=100" --paginate
   ```

   A 403 or 404 means the feature is off for that repository. Record that as a coverage line, not
   as zero alerts. Keep the number, severity, advisory or rule, and path. Never read a secret
   alert's `secret` field into the report. Find the `NEXT.md` row that carries each alert
   (`grep -n` for the alert number or advisory); write the row id or "no row".
2. **Local secret scan.** Run the `secret-scan` skill. Carry its counts and its `real key` findings
   into the report. The detail stays in its own report; link it by file name.
3. **Estate state.** Run the `clean` skill's Part 1 gather only. Run no removal unless the operator
   agrees. Carry the unpushed work, the stale branches and worktrees, the failing workflows and the
   open security alerts it lists.
4. **Branch review.** For each repository, list the open branches with `gh pr list` and
   `git branch -r --no-merged origin/main`. Run `/security-review` over each branch's diff against
   `main`. Carry the findings.
5. **Exposure.** Run the `exposure-check` skill. Its SSO check comes first. Carry its judgement and
   findings.

## Report

Write the report with these sections, in this order:

1. Ranking: every finding, most severe first. An open secret-scanning alert or an exposure finding
   is first, ahead of any severity. Each line gives severity, source step, repository, rule or
   advisory, and the board row or "no row".
2. Coverage: for each step and repository, what was read, and what could not be read and why.
3. Proposed rows: one `NEXT.md` row for each finding with no row. A row names the report, the
   finding id and the severity, and gives no surface, key or location of a live key.
4. Per-step detail.

Commit the report alone in the private repository. Add the proposed rows to `NEXT.md` when the
operator asks.
