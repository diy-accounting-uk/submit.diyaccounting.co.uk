<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Alarm triage's cost at the budget cap, and how to triage more

Window: `31f3e436` (the commit that added the budget guard, 2026-09-14T00:54+01:00 /
2026-09-13T23:54Z) to 2026-09-16T22:39Z — 71 hours, every run of `alarm-triage.yml` in that time.

## The cap is 4 a day, not 3

`alarm-triage.yml` line 77 reads `if [ "${COUNT}" -gt 3 ]`. `COUNT` is the number of *prior* runs
that posted a result, so a run proceeds whenever `COUNT` is 0, 1, 2 or 3 — a fourth post is always
allowed before the fifth is blocked. The skip comment (line 94) still says "the budget of 3 triage
runs per 24 hours", which is off by one against the code. Issue #249's skip comment confirms it:
"4 posted a result since 2026-09-15T03:21:59Z".

## What ran

15 workflow runs, covering 11 distinct `[ALARM]` issues (one pair, #210/#212, is the same
`prod-env-github-probe-failed` alarm firing twice one second apart; #229 was re-dispatched by hand
three times after its first automatic run).

| Run | Issue | Trigger | Outcome | Turns | Duration | Sonnet in/cache-w/cache-r/out tokens |
|---|---|---|---|---:|---:|---|
| 34802164594 | #208 | issue opened | posted a result | 18 | 84.5s | 93 / 53,417 / 496,036 / 2,739 |
| 34862117821 | #210 | issue opened | posted a result | 11 | 46.6s | 963 / 47,977 / 295,537 / 1,808 |
| 34862119217 | #212 | issue opened | **job failed, no comment at all** | — | — | — |
| 34996436587 | #223 | issue opened | posted a result | 16 | 88.7s | 87 / 66,248 / 607,147 / 3,885 |
| 34996555373 | #224 | issue opened | posted a result | 13 | 63.9s | 71 / 47,698 / 372,393 / 1,932 |
| 35030341835 | #229 | issue opened | posted a result | 13 | 69.3s | 73 / 73,989 / 476,227 / 2,669 |
| 35030353081 | #230 | issue opened | **used its turn budget, posted a partial answer, run failed red** | 30 | 155.3s | 146 / 23,868 / 826,845 / 4,167 |
| 35030523352 | #231 | issue opened | budget skip | — | — | — |
| 35047203778 | #229 | manual re-dispatch | budget skip | — | — | — |
| 35051512783 | #249 | issue opened | budget skip (still open) | — | — | — |
| 35077619700 | #256 | issue opened | budget skip | — | — | — |
| 35123832901 | #229 | manual re-dispatch | stopped: agent kill switch was on | — | — | — |
| 35123965723 | #229 | manual re-dispatch | posted a result | 16 | 79.9s | 87 / 62,886 / 553,832 / 2,371 |
| 35147049788 | #273 | issue opened | posted a result | 11 | 58.1s | 55 / 62,731 / 369,499 / 1,857 |
| 35147050639 | #274 | issue opened | budget skip | — | — | — |

Run #212's "Comment that triage was skipped" step failed outright (`gh issue comment` errored on
"not a git repository") before it could post anything, so #212 got no comment of any kind — not a
result, not a skip notice. The command in that run's log has no `--repo` flag; the workflow file
at HEAD already carries `--repo "${{ github.repository }}"` on that line, so this specific failure
mode is already closed by a later commit.

**11 alarm issues, 6 got a real triage answer** (#208, #210, #223, #224, #229, #230-partial).
**5 got nothing usable**: #212 (silently dropped), #231/#249/#256/#274 (budget-skip comment only).
Untriaged: 5 of 11, 45%.

## What it actually costs

Claude Code's own `total_cost_usd` field on these eight runs sums to **$0.32** (about $0.04 a
run). That figure is wrong: on every one of the eight runs it equals exactly
`output_tokens × $15 / 1,000,000` — the non-regional Sonnet output rate, and nothing else. It
prices no input tokens, no cache-write tokens, no cache-read tokens, and does not apply the 10%
Bedrock regional-endpoint premium that a cross-region inference profile like
`eu.anthropic.claude-sonnet-4-5-20250929-v1:0` carries (confirmed against
[Anthropic's pricing page](https://platform.claude.com/docs/en/about-claude/pricing): Sonnet 4.5
is $3/$3.75(5m-cache-write)/$0.30(cache-read)/$15 per MTok at the global rate, ×1.10 regional;
Haiku 4.5 is $1/$1.25/$0.10/$5, ×1.10 regional).

Pricing the same eight runs' own token counts at those regional rates gives **$3.49** in Sonnet
spend. `AWS/Bedrock` CloudWatch metrics in `submit-prod` (`eu-west-2`, dimension `ModelId`) for
`InputTokenCount`, `OutputTokenCount`, `CacheReadInputTokenCount` and `CacheWriteInputTokenCount`
reconcile **exactly**, token for token, against the sum of these runs' own usage in every one of
the three 24-hour buckets measured — confirming alarm-triage is the only Sonnet/Haiku consumer in
that account during the window. The same CloudWatch metrics show Haiku 4.5 usage (Claude Code's
background small/fast model, invisible in the per-run JSON) worth a further **$0.12** priced the
same way. **True total: $3.60 for 8 triaged runs.**

- **Cost per triage: $0.45**, not the $0.04 the tool reports.
- **Cost on the one day the cap was actually hit** (4 runs posted, 2026-09-14T23:54Z–
  2026-09-15T23:54Z): **$1.90**.
- **At today's effective 4/day cap, 30 days: about $54/month.**
- GitHub Actions minutes: about 37 minutes across all 15 runs. The repository is public, so
  Actions minutes are unmetered — no cost there.
- A separate, small `Amazon Bedrock` line (guardrail `apply-guardrail` calls, one per triaged run)
  shows in the account's cost data, but it can't be isolated to alarm-triage: the same line item
  has spend on 2026-09-13, a day before the budget guard existed and before any triage run in this
  window. Something else in the account also calls it. Not included in the figures above; order of
  magnitude is cents to a few tens of cents a day, not a material share of the $3.60.

## Every run was blocked from reading the evidence it asked for

All eight analysed runs hit permission denials — 21 in total — every one an `aws` command the
agent invented with a `--profile submit-prod` (or `submit-ci`) flag: `aws --profile submit-prod
logs start-query ...`, `aws --profile submit-prod cloudwatch describe-alarm-history ...`, plus a
few `aws s3`/`aws cloudformation` calls outside the allow-list entirely. `--allowedTools` (line
296) grants `Bash(aws logs:*)` and the two `cloudwatch` verbs, but Claude Code's Bash permission
patterns match from the start of the command string, and `aws --profile X logs ...` does not start
with `aws logs`, so every one of these calls was denied even though the underlying command was
meant to be allowed. Nothing in `prompts/alarm-triage.md` or the workflow tells the agent to add
`--profile` — it adds one unprompted on every run, and the OIDC role chain already assumes a
single identity on the runner, so no profile is needed or configured there.

The result: none of the eight runs ever read a real CloudWatch log line or alarm-history record.
Every "What broke?" answer is code-reading and prior-issue pattern-matching, and every "Is it
still broken?" answer ends "cannot determine without log access". The $0.45 a triage currently
buys code analysis, not incident evidence.

## Options

Figures below use $0.45/triage (current design) and $0.15/triage (an all-Haiku run, scaling
Sonnet's per-MTok rates down by the ~3× that separates every one of Haiku 4.5's rates from
Sonnet 4.5's), at 30 days.

| Option | Change | $/triage | Runs/day | $/month |
|---|---|---:|---:|---:|
| Today | `-gt 3` (effective 4/day) | $0.45 | 4 | $54 |
| (a) fix the off-by-one to a true 3/day | `-gt 2` | $0.45 | 3 | $40.50 |
| (a) raise to 6/day | `-gt 5` | $0.45 | 6 | $81 |
| (a) raise to 12/day | `-gt 11` | $0.45 | 12 | $162 |
| (b) Haiku first pass, Sonnet on escalation (est. 3-in-4 resolve on Haiku) | new escalation logic | $0.225 blended | 4 | $27 |
| (b) same blend, 6/day | new escalation logic | $0.225 blended | 6 | $40.50 |
| (c) turn/duration/sub-agent constraints | see below | ~$0.45 (little change) | 4 | ~$54 |
| (a)+fixing the `--profile` block | `-gt 5` + prompt fix | $0.45 | 6 | $81, but each run now reads real evidence |

**(c) in detail.** Successful runs used 11-18 turns; the one run that stopped early used 30, against
a *configured* `--max-turns 60` (line 293) — the ceiling that actually stopped it at 30 is not the
one in this file, an open question this measurement could not resolve. Cache-read tokens (the
largest cost line on every run, 40-65% of its spend) grow with each turn's re-read of the
accumulating context, so a lower turn ceiling bounds cost directly, but the data does not show a
strong turns-to-cost relationship: the 30-turn run cost $0.44, inside the $0.35-0.54 range of the
11-18-turn runs. A cap around 20 turns would give headroom over every observed successful run
while stopping a runaway earlier — worth doing for reliability (a clean stop instead of a red run),
not a meaningful saving on its own. A 5-minute step timeout would not have caught anything observed
(max was 155s); a tighter one would cut the one long run short for no benefit to the other seven.
`--allowedTools` (line 296) already excludes the Task/Agent tool, so there is no sub-agent spend to
remove.

## Recommendation

Fix the `--profile` mismatch before spending more on volume: it costs nothing (same tokens, same
turns) and it is why every run so far has answered from code alone. Combine it with raising the
cap to 6/day and correcting the off-by-one at the same time, since the true cost of a triage is
$0.45 not $0.04 and the account can absorb $81/month for a cap twice today's untriaged rate.

Exact changes, not applied:
- `.github/workflows/alarm-triage.yml` line 77: `-gt 3` → `-gt 5`.
- `.github/workflows/alarm-triage.yml` line 94: "the budget of 3 triage runs" → "the budget of 6
  triage runs".
- `prompts/alarm-triage.md`, after line 47 (the `aws logs`/`aws cloudwatch describe-alarm-history`
  guidance): add one line telling the agent to call `aws` with no `--profile` flag, since the OIDC
  role is already assumed on the runner.

## What this could not measure

- The guardrail `apply-guardrail` cost per run: the AWS Cost and Usage Report's `Amazon Bedrock`
  line mixes triage's calls with at least one other consumer in the account and can't be split by
  workflow.
- What actually stopped run #230 at 30 turns against a configured 60-turn budget — the mismatch is
  reported as observed, not explained.
- Whether the `--profile`-prefixed `aws` commands would have succeeded if the pattern had matched:
  no profile is configured on the runner, so they may have failed for a different reason once
  allowed through. Not tested here, since this task changes no code.
