# PLAN_ISSUES_DELIVERY — phased grouping and Copilot recommendations

Covers the 23 open issues on `diy-accounting-uk/submit.diyaccounting.co.uk` as of 2026-04-22.

Per-issue plans live under `plans/issues/PLAN_ISSUE_<n>_<slug>.md`. Open questions are aggregated in `plans/QUESTIONS.md`.

---

## Grouping by delivery phase

Issues are grouped by shared code areas (so one PR / sprint can land related ones together) and by blocking dependencies. Five phases; order within a phase is free.

### Phase 1 — Quick wins & hygiene (1–2 PRs each; low risk)

Frontend hygiene and internal naming — mechanical, low-blast-radius.

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [745](issues/PLAN_ISSUE_745_home_button_canonical.md) | Home button without `index.html` | S | **Yes** |
| [746](issues/PLAN_ISSUE_746_retire_link_tree.md) | Retire Linktree | S | Partial (repo audit) |
| [737](issues/PLAN_ISSUE_737_pass_link_navigation.md) | Pass link navigation | M | **Yes** (after Q737.1) |
| [707](issues/PLAN_ISSUE_707_synthetic_naming_alignment.md) | synthetic/sandbox naming alignment | M | **Yes** (mechanical renames) |
| [703](issues/PLAN_ISSUE_703_multi_url_lighthouse.md) | Multi-URL Lighthouse | S | **Yes** |

These share the `web/public/` + workflow-config surface and do not touch Lambdas or DynamoDB.

### Phase 2 — Mobile & theme UX (single design sprint)

These three are the same mental model — the site's responsive and accessibility posture.

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [740](issues/PLAN_ISSUE_740_manage_subscription_button_mobile.md) | Mobile Manage-subscription button | S | Partial (needs visual check) |
| [735](issues/PLAN_ISSUE_735_packed_mobile_ui.md) | Packed mobile UI | M | Partial (visual audit) |
| [651](issues/PLAN_ISSUE_651_dark_mode_high_contrast.md) | Dark mode / high contrast | M/L | Partial (token audit + tests) |
| [655](issues/PLAN_ISSUE_655_multi_language_support.md) | Multi-language support | L | Partial (scaffolding) |

#735 + #740 share a CSS/media-query audit. #651 adds themes, #655 adds locales — both benefit from the same CSS token discipline and are cheaper to land after #735/#740.

### Phase 3 — Observability / ops platform

Shared stacks: Slack/Telegram forwarders, CloudWatch alarms, SNS/EventBridge wiring, GitHub App for issue-raising, detection surface.

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [736](issues/PLAN_ISSUE_736_telegram_logout_event.md) | Telegram logout event | S | **Yes** (after Q736.1) |
| [572](issues/PLAN_ISSUE_572_slack_alerting_agent_issues.md) | Slack alerting + agent-raised issues | L | Partial |
| [720](issues/PLAN_ISSUE_720_scan_detection.md) | Scan detection | L | Partial |
| [719](issues/PLAN_ISSUE_719_data_theft_detection.md) | Data theft detection | L | Partial (CloudTrail wiring yes; anomaly design no) |
| [645](issues/PLAN_ISSUE_645_metric_son.md) | metric-son RUM alternative | L | Partial |

Deliver roughly in this order: Slack first (it's the fan-out everything else depends on), then logout-event (piggy-backs), then #720/#719 (shared SecurityDetectionStack), then metric-son (independent but also feeds into the alert fan-out).

### Phase 4 — Infrastructure, disaster recovery

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [715](issues/PLAN_ISSUE_715_backups_outside_account.md) | Backups outside the account | L | Low — multi-account IAM |

Single issue but substantial (multi-account infra, restore test workflow). Its dependency on `submit-backup` account bootstrap means it has to be a dedicated sprint.

### Phase 5 — HMRC / feature expansion

Big product moves. Each needs Product sign-off + HMRC coordination before code.

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [425](issues/PLAN_ISSUE_425_optional_vat_endpoints.md) | Optional VAT endpoints (liabilities/payments/penalties) | M | **Yes** (pattern-matches existing) |
| [579](issues/PLAN_ISSUE_579_self_employed_endpoints.md) | Self-employed (ITSA) endpoints | XL | Partial |
| [580](issues/PLAN_ISSUE_580_limited_company_endpoints.md) | Limited company endpoints | ?? | Blocked on Q580.1 |
| [634](issues/PLAN_ISSUE_634_apple_microsoft_social.md) | Apple + Microsoft login | M | Partial |
| [648](issues/PLAN_ISSUE_648_mcp_server.md) | MCP Server | L | Partial |

Order within this phase: #425 first (reinforces HMRC approval case), #634 (UX breadth), then #579 (prep for 2026 mandate), #648 (strategic differentiator), #580 (blocked). Any Phase 5 item is a programme of work, not a sprint.

### Phase 6 — Growth & community

| # | Title | Effort | Copilot? |
|---|---|---|---|
| [652](issues/PLAN_ISSUE_652_campaign_referral_phase6.md) | Campaign Passes & Referrals (Phase 6) | XL | Partial — already scoped |
| [576](issues/PLAN_ISSUE_576_diy_merch.md) | DIY Merch | S (Path A) / L (Path B) | Path A yes |
| [646](issues/PLAN_ISSUE_646_battery_pack.md) | battery-pack prototype | M | **Yes** for the promote+first test |

#652 is the big strategic item — assigned to @antonycc. #646 is independent and can be a side-track. #576 is lowest value but cheapest to ship in Path A.

---

## Dependency/ordering summary

```
Phase 1 (hygiene) ──┐
Phase 2 (UX)   ────┤── no dependency
Phase 3 (ops)  ────┘
                 │
                 ▼
Phase 4 (backups) ── independent; needs submit-backup account
                 │
                 ▼
Phase 5 (HMRC features) ── depends on Phase 1 (naming) + Phase 3 (observability useful during rollout)
                 │
                 ▼
Phase 6 (growth) ── depends on Phase 5 (subscription + #634 breadth)
```

Phases 1–3 can run in parallel. Phase 4 is independent. Phase 5 ideally lands after Phase 1 (so we don't rename concurrently with new endpoints).

---

## Copilot recommendations

### Assign to Copilot with minimal oversight
These are bounded, pattern-matching, and have clear acceptance criteria once their Q is answered:

- **#745** — Home button (mechanical search/replace + test).
- **#703** — Multi-URL Lighthouse (config + script).
- **#707** — synthetic naming rename (mechanical across codebase, migration shim per plan).
- **#737** — Pass link navigation (after Q737.1).
- **#736** — Telegram logout event (after Q736.1).
- **#425** — Optional VAT endpoints (parallels existing Lambdas).
- **#646** Phase 1 — promote battery-pack into `packages/` + first test.
- **#576** Path A — merch storefront link page.

### Assign to Copilot after a human picks a small design decision
Human picks the decision (2–5 minutes), Copilot then delivers:

- **#740** — after Q740.1 (mobile target).
- **#735** — after Q735.1 (which page).
- **#651** — after Q651.1 (scope) and Q651.3 (palette).
- **#655** — after Q655.1 + Q655.2 (languages + library).
- **#572** — after Q572.1 + Q572.2 (workspace + GitHub App).
- **#645** — after Q645.1 (packaging location).
- **#634** — after Q634.1 (Apple Dev Program).
- **#746** — after Q746.1 (credentials).
- **#720/#719** — after Q720.1 + Q720.2 (routing + auto-block policy).

### Do not assign to Copilot — needs continuous human judgment
These have either security blast radius, multi-account changes, or product strategy:

- **#715** — multi-account IAM, prod data in CI.
- **#648** — MCP auth model + security review.
- **#579** — big HMRC programme; approval artefact coupling.
- **#580** — blocked on product strategy (Q580.1).
- **#652** — Phase 6 is 10+ subtasks; @antonycc-owned strategic programme.

---

## First 30 days — recommended cadence

Week 1–2: Phase 1 quick wins (#745, #746, #703, #707 scaffolding) — all assignable to Copilot.

Week 2–3: Phase 2 mobile audit (#740, #735). Land dark mode (#651) scaffolding in parallel.

Week 3–4: Phase 3 ops — Slack (#572) + logout event (#736). Start #720/#719 once Slack channel exists.

Then: pick the Phase 5 item that matches the next HMRC approval checkpoint.

---

## Not-on-this-list (noted for completeness)

These are **closed** issues or not in the open set and so are not covered by the plans in this directory:
- PLAN_ACCOUNT_SEPARATION, PLAN_COGNITO_TOTP_MFA, PLAN_PAYMENT_* — covered by archive docs, already done or in-flight.

## Maintenance of this directory

When an issue closes: move its plan file into `plans/issues/archive/` with a final status note.

When a new issue opens: the author (or a follow-up pass through this doc generator) adds a new `PLAN_ISSUE_<n>_<slug>.md` and updates this index.
