# PLAN_FLAGGED.md — antonycc / xn--intenton-z2a flagging & suspension

> Forensic record of the GitHub flagging incident, captured 2026-05-06 from local Claude Code session transcripts. **No GitHub-side data** has been pulled — this is reconstructed entirely from the user's own record.

## Status

- **2026-05-03 ~12:30 UTC** — orgs `polycode-projects` and `xn--intenton-z2a` flagged ("hidden from public"); Copilot seats auto-revoked; GitHub Actions disabled. Personal account `@antonycc` and Enterprise account `@Antony-at-Polycode` both affected.
- **2026-05-06** — `antonycc` is now **fully suspended** (escalated from org-only flagging). New account `support-at-diyaccounting` (GitHub Pro) created and SSH/gh authenticated.

## GitHub support correspondence

- **Support ticket #4350278** — opened 2026-05-03 15:49:45Z via Enterprise channel (Polycode Limited Enterprise), category "Account restrictions".
- Filed via the **Appeal and Reinstatement** form (Appeal path — disputing the flag — not Reinstatement, which would admit a violation).
- Request IDs for log correlation: `EC62:1E4C:34829CD:41E2097:69F74273`, `F228:1C1F6:12DA946:1793579:69F747B2`.
- Initial form submission attempt earlier that day did not produce an email confirmation; resubmitted via Enterprise channel.

## Appeal text submitted (verbatim, 2026-05-03 15:36:24Z)

> Two organizations under the Polycode Limited Enterprise — `polycode-projects` and `xn-intenton-z2a` (display name "intention") — have been flagged and are showing as hidden from the public. The member accounts affected are @antonycc and @Antony-at-Polycode; both also received `cfb_seat_assignment_unassigned` events for Copilot at the same time, which appears to be a downstream effect of the org flag. I believe the orgs have been flagged in error. Both are my own work hosting open-source software development projects. The recent large PR #7 was a one-time scaffold rewrite of a fresh template, hence the size. The repositories contain real CDK, Lambda, TypeScript, and Java code with tests, plus AWS infrastructure.

## Likely trigger — high-confidence signals

The merge commit the user shared as the suspected trigger:
**`70dcf49955c529f166fe0f83dda8d793513a1285`** — `xn--intenton-z2a/forum`, PR #7.

Eight high-weight signals matching GitHub's account-takeover / abuse heuristics:

1. **Time-to-merge: 17 seconds** — created 01:05:12Z, merged 01:05:29Z. Account-takeover scripts merge instantly.
2. **PR body: empty.**
3. **Reviewers/comments: 0.** No human-in-the-loop signal.
4. **Self-merge** — same user (`Antony-at-Polycode`) opened and merged.
5. **283 files changed** in one PR — mass-upload signature.
6. **−9k net lines** (+14.7k / −23.7k). Deletion-heavy, ransomware/wipe pattern.
7. **Author identity churn** — two distinct emails (`antonyccartwright@gmail.com`, `antony@polycode.co.uk`); unverified email = committer-spoofing flag.
8. **Non-canonical Claude co-author trailer** — `Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>` (extra version/context info outside Anthropic's canonical form).

## Lower-confidence contributors discussed

- **Bedrock-driven multi-agent activity** on `xn--intenton-z2a/forum` (forum-tune, librarian web-fetch fallback). User uses Bedrock (Haiku/Sonnet/Nova) rather than Copilot for that project.
- **Near-recursive scheduled GitHub Actions** on `xn--intenton-z2a/agentic-lib` and `xn--intenton-z2a/repository0` — schedules sometimes overlapped to run continuously.
- **One-off `gh copilot` summarisation across ~160 repositories** — mentioned in user background context. No transcript evidence this was a trigger but timing is plausible.
- **Suspected Claude-as-AI detection / penalisation** — the user's hypothesis (no evidence). Claude Code commits carry a co-author trailer that is identifiable as an AI assistant.

## Workarounds adopted during the flag

- **CDK deploys from local** instead of GitHub Actions for the duration of the disabled-Actions period (forum project, 2026-05-03 onward).
- A `PLAN_APPEAL.md` was committed in the forum repo during the event.

## What changed between flag (2026-05-03) and full suspension (2026-05-06)

The transcripts cover the initial flag in detail but do not contain a forensic record of the full suspension three days later. Possible escalation triggers (speculation):

- Continued CI activity on flagged orgs after Actions were nominally disabled.
- Additional bot-authored or AI-assisted commits during the appeal window.
- A reviewer at GitHub Trust & Safety closing the case as "not in error".

This file should be updated once the user has any GitHub-side notification of the suspension reason.

## Sources

Local Claude Code session transcripts (no GitHub data pulled):
- `/Users/antony/.claude/projects/-Users-antony-projects-xn--intenton-z2a-forum/cb84832f-93a9-4d8e-8bae-9df55ba3dcef.jsonl` — 2026-05-03 ~12:30 UTC, first report.
- `…/1ad8c055-ed77-4021-a07b-e6881d98408c.jsonl` — 2026-05-03, commit-trigger analysis + appeal text drafting.
- `…/fc909fbc-7474-427e-8541-1f6bf743af39.jsonl` — 2026-05-04 00:43 UTC, continued under CDK-from-local workaround.

## Next actions on the appeal

- Monitor ticket #4350278 (Enterprise My Tickets queue) — accessible from the new account or via direct ticket URL.
- Do not submit any further forms — duplicate submissions get auto-merged at best, ignored at worst.
- If reinstated: archive `antonycc/*` repos with a pointer to the new home rather than deleting them, so the audit trail survives.
- If denied or no response in 14 days: reply to the existing ticket with the request IDs above and a one-paragraph status update.
- Reference this file in any further correspondence so the timeline is unambiguous.

---

# Policy & community-chatter research (2026-05-07)

> Captured as a knowledge base for two future projects:
> 1. **Chatter monitor** — watch GitHub Community Discussions and other surfaces for new flag/suspension reports, build a deduplicated record of triggers and remediation paths.
> 2. **AUP-compliance review** — keep the migrated repos and any future automation within GitHub's Acceptable Use Policies.

## GitHub Acceptable Use Policy clauses relevant to AI/automation accounts

Source: <https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies>

### §3 — Intellectual Property and Authentic Use

> "impersonates any person or entity, including any of our employees or representatives, including through false association with GitHub, or by fraudulently misrepresenting your identity"

Pattern this catches: workflow identity churn (user committing as two emails); arguably, non-canonical AI co-author trailers that imply an unverified human-like identity. The PR #7 trigger had two distinct emails on author records (`antonyccartwright@gmail.com` and `antony@polycode.co.uk`), one unverified — direct hit on this clause.

### §4 — Spam and Inauthentic Activity

> "automated excessive bulk activity and coordinated inauthentic activity, such as spamming"
> "using our servers for any form of excessive automated bulk activity, to place undue burden on our servers through automated means"
> "inauthentic interactions, such as fake accounts and automated inauthentic activity"

The most relevant clause for our patterns. Catches:
- High-frequency scheduled workflows that self-commit
- Mass-file-change commits (the daily generate-* workflows committing 50–300 Excel files each)
- Self-merging PRs with no human review (the PR #7 fingerprint)
- LLM-output committed back to git in CI (`update-tax-data.yml` original form)
- Token churn from AI-tool integrations (Cursor / Claude Code / Copilot regenerating OAuth tokens)

### §9 — Excessive Bandwidth Use

> "If we determine your bandwidth usage to be significantly excessive in relation to other users of similar features, we reserve the right to suspend your Account"

Catches: large binary commits, CDN-like usage of repo content, mass artifact downloads. Our generate-* workflows bring this into range cumulatively (hundreds of bot commits per week × packaged xlsx outputs).

## GitHub Terms of Service clauses

Source: <https://docs.github.com/en/site-policy/github-terms/github-terms-of-service>

### §H — API Terms

> "Abuse or excessively frequent requests to GitHub via the API may result in the temporary or permanent suspension of your Account's access to the API."
> "You may not share API tokens to exceed GitHub's rate limitations."

Relevant to: AI tools that issue many API calls (Cursor / Continue / Cline / Claude Code in agent mode), `gh` CLI in tight loops, scheduled workflows hitting `gh api` repeatedly.

### §B.4 — Account Security

> "You will promptly notify GitHub by contacting us through the GitHub Support portal if you become aware of any unauthorized use of, or access to, our Service through your Account..."
> "GitHub cannot and will not be liable for any loss or damage from your failure to comply with this security obligation."

Relevant to: token regeneration and OAuth churn read by GitHub's heuristics as account compromise.

### §J — AI Features, Training, and Your Data

> "Output may contain material that resembles code or content in the model's training data..."

Relevant for awareness only; not directly invoked for suspensions, but cited in some flagging discussions when the org disputes IP-related allegations.

## GitHub Appeal and Reinstatement — official process

Source: <https://docs.github.com/en/site-policy/acceptable-use-policies/github-appeal-and-reinstatement>

Stated abuse categories (verbatim):

> spam or inauthentic activity, phishing, **excessive automated bulk activity**, crypto mining, malware or exploit delivery, unauthorized attacks, **excessive bandwidth or infrastructure strain**, and other acceptable use or legal-compliance issues

Process:
- Up to **6 months** to file an appeal after a moderation decision.
- **Reinstatement**: acknowledge violation + agree to comply going forward.
- **Appeal**: dispute that a violation occurred + provide evidence.
- Reviews are manual; community reports indicate **3 days–4 months** turnaround. Escalation by community moderator is a documented resolution path.

## AI contribution attribution feature (separate machinery)

Source: <https://github.com/orgs/community/discussions/188915>

GitHub has explicit machinery to detect AI-generated code and synthesize an "AI" contributor entry on a repo's Insights → Contributors page. This is **separate from suspension heuristics** but confirms GitHub maintains a classifier that identifies AI-authored commits. Disable for any repo via:

> Settings → Code security and analysis → AI-powered features → uncheck "AI contribution attribution"

The classifier and the abuse heuristics are separate systems but presumably share signal infrastructure.

## Community chatter — recurring patterns (March–April 2026 wave)

Direct Reddit searches via WebSearch returned no relevant results — the active equivalent forum is **GitHub Community Discussions** (`github.com/orgs/community/discussions`). Cataloguing the most-cited cases:

### Pattern A — heavy AI-tool usage triggering automated flags

- **[Discussion #192402](https://github.com/orgs/community/discussions/192402)** — `dorkman42` flagged 1 April 2026. Cause attributed to: Cursor + Copilot Chat + Claude Code regenerating OAuth tokens 15+ times automatically; "GitHub System" auto-revoked them. Account became invisible, OAuth permanently blocked. 21+ days unresolved as of latest activity. Ticket #4245695.
- **[Discussion #189315](https://github.com/orgs/community/discussions/189315)** — Copilot suspended for *"automated requests"* with the user explicitly using "VS Code Claude mode + Local mode only". Title quote: *"false positive?"* Ticket #4142954.
- **[Discussion #187254](https://github.com/orgs/community/discussions/187254)** — verified education student suspended for "Copilot Agent Mode" usage. False positive.
- **[Discussion #160013](https://github.com/orgs/community/discussions/160013)** — official abuse-detection-system warnings sent. GitHub later admitted some warnings were sent in error and reversed.

### Pattern B — batch / mass commits triggering suspension

- **[Discussion #183919](https://github.com/orgs/community/discussions/183919)** — `YashedBin` suspended for pushing 20–25 commits across 3 repos in a 3-minute window. Eventually reversed (3 days) by GitHub staff `shinybrightstar`.
- **[Discussion #150705](https://github.com/orgs/community/discussions/150705)** — account suspended, projects gone, no notice received.

### Pattern C — org-level flagging (closest match to the antonycc incident)

- **[Discussion #191536](https://github.com/orgs/community/discussions/191536)** — game-dev org flagged before launch. Community moderator `PrimeSalad` quote:

> "A flag usually means the org tripped one of GitHub's broader safety or abuse categories rather than some simple single-rule check."

The same moderator listed common avoidance areas:

> "unusual GitHub Actions volume, mass automation, promotional or spam-like behavior, large binary hosting or CDN-like usage, exposed credentials"

### Pattern D — `Co-Authored-By: Claude` controversy (inside Anthropic itself)

- **[`anthropics/claude-code` Issue #53571](https://github.com/anthropics/claude-code/issues/53571)** — *"Auto-mode safety classifier denies the Co-Authored-By trailer that the Bash tool's own system prompt instructs the model to add"*. Internal contradiction inside Claude Code: the system prompt tells the model to add the trailer, then the safety classifier rejects commits that contain it.
- **[Issue #17085](https://github.com/anthropics/claude-code/issues/17085)** — `CLAUDE.md` instructions to exclude AI attribution are overridden by system prompt.
- **[Issue #47579](https://github.com/anthropics/claude-code/issues/47579)** — Co-Authored-By added to commits without user consent or opt-out.
- **[VelvetShark TIL](https://velvetshark.com/til/claude-code-github-co-author)** — practical guide to suppressing the trailer via project-level instruction.

### Pattern E — scheduled-workflow auto-disable (separate problem)

GitHub auto-disables scheduled workflows after 60 days of repo inactivity. Different mechanism from abuse flags but worth noting:

- **[dev.to: Preventing GitHub from suspending cronjob-based triggers](https://dev.to/gautamkrishnar/how-to-prevent-github-from-suspending-your-cronjob-based-triggers-knf)** — author of `keepalive-workflow` notes: *"performing automated commits may also breach their Terms of Service"*. Self-aware admission that the workaround for one mechanism may put you in scope of the other.
- 5-minute minimum cron interval is a hard technical limit (not a policy limit).

## Avoidance synthesis — checklist for staying within AUP

Layered, in order of impact:

1. **No LLM-output self-commits in CI.** If an LLM is generating code/config/data, the human reviews and commits. Run LLM tooling on a developer machine; commit the output manually.
2. **No mass-file self-commits at scheduled cadence.** If artefacts must be regenerated, store them outside git (S3, GH Releases, package registry) or batch them weekly with a single coalesced commit.
3. **Use the canonical Anthropic co-author trailer**, `Co-Authored-By: Claude <noreply@anthropic.com>`, not the long-form variant. Even better, configure Claude Code to skip the trailer on a project — see VelvetShark TIL.
4. **No instant self-merges on large PRs.** Wait at least an hour, prefer rebase-then-merge for human-authored PRs, leave a substantive PR body.
5. **Disable AI contribution attribution** if you don't want GitHub auto-tagging your repos.
6. **Don't name workflows `copilot-*`, `agent-*`, `auto-*`** — heuristic visibility is real even if not strictly policy.
7. **Manage OAuth tokens proactively** — don't let AI tools regenerate them unbounded; revoke unused integrations.
8. **For scheduled workflows**: keep cron intervals daily-or-slower, stagger schedules across the day, prefer `workflow_dispatch` for low-frequency tasks.
9. **Avoid `git push --force`, `--force-with-lease` from automation** — even if benign, force-pushes are a heuristic signal.
10. **For appeals**: file once, monitor, do not re-submit; if no response in 14 days, reply to the existing ticket; reference timeline files.

## Knowledge-base ideas (for the chatter-monitor project)

Suggested data model for tracking community reports:

| Field | Notes |
|---|---|
| `discussion_id` | community.github.com discussion or external URL |
| `date_reported` | ISO 8601 |
| `account_type` | personal / org / enterprise |
| `flag_type` | account suspended / org flagged / Copilot suspended / Actions disabled |
| `trigger_pattern` | one of the patterns above (A/B/C/D/E) or "other" |
| `tools_in_use` | Cursor / Claude Code / Copilot Chat / Continue / Cline / etc. |
| `resolution` | reinstated / denied / pending / community-escalated |
| `resolution_time_days` | nullable |
| `ticket_number` | GitHub Trust & Safety reference |
| `verbatim_quotes` | snippets that capture the user's report and any GitHub staff response |

Polling strategy: monitor https://github.com/orgs/community/discussions for new threads tagged with relevant labels (`account-restrictions`, `support`); cross-reference against keyword sets (suspended, flagged, copilot, agent, automated, false positive).

## Sources

- <https://docs.github.com/en/site-policy/acceptable-use-policies/github-acceptable-use-policies>
- <https://docs.github.com/en/site-policy/github-terms/github-terms-of-service>
- <https://docs.github.com/en/site-policy/acceptable-use-policies/github-appeal-and-reinstatement>
- <https://github.com/orgs/community/discussions/192402>
- <https://github.com/orgs/community/discussions/189315>
- <https://github.com/orgs/community/discussions/187254>
- <https://github.com/orgs/community/discussions/183919>
- <https://github.com/orgs/community/discussions/191536>
- <https://github.com/orgs/community/discussions/150705>
- <https://github.com/orgs/community/discussions/160013>
- <https://github.com/orgs/community/discussions/188915>
- <https://github.com/anthropics/claude-code/issues/53571>
- <https://github.com/anthropics/claude-code/issues/17085>
- <https://github.com/anthropics/claude-code/issues/47579>
- <https://velvetshark.com/til/claude-code-github-co-author>
- <https://dev.to/gautamkrishnar/how-to-prevent-github-from-suspending-your-cronjob-based-triggers-knf>
