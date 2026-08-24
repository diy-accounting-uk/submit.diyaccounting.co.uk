# PLAN: Issue #652 — Phase 6: Campaign Passes & Referral System (Backend + Frontend)

> Source issue: https://github.com/antonycc/submit.diyaccounting.co.uk/issues/652 (assigned to @antonycc)
> Original body: the full Phase 6 specification (copied from `PLAN_PASSES_V2.md`); 20 KB — complete design.
> Existing plans:
> - `_developers/backlog/PLAN_PASSES_V2-PART-2.md` (506 lines — continuation)
> - `_developers/archive/PLAN_PASSES_V2.md`, `PLAN_PASSES.md`, `PASSES_AND_CREDITS.md`, `campaign.md`, `PLAN_CAMPAIGN_AND_REFERRALS.md` (parent), `PLAN_CAMPAIGN_AND_REFERRALS_*.svg` (UX sketches)
> Also: parent repo root has `PLAN_CAMPAIGN_AND_REFERRALS.md` (workspace-level).

## Elaboration

The issue body is the delivery-ready specification for Phase 6 of the passes rollout. It defines:

1. **Campaign pass issuance** — authenticated users can issue "invite" passes (`invited-guest` bundle, 1-month validity, 3-day redemption window). 3 free per month (Starter tier), additional cost 10 tokens each.
2. **Progressive referral rewards** — 2 tokens back on redemption, 5 tokens on first VAT submit, 1 free month on subscription.
3. **Ambassador tiers** — Starter/Silver/Gold based on cumulative redemptions, granting more free passes.
4. **Accountant-partner track** — bulk pass issuance with longer validity for high-volume referrers.
5. **Abuse controls** — no self-referral, one referrer per account, rate limits.
6. **Pass admin UI** — list/revoke/create passes at admin scale.
7. **QR codes**, commission (deferred), and validation criteria.

This is the largest single issue in the backlog. Everything is scoped already; this plan summarises what remains to translate from spec to code.

## Likely source files to change

Per issue body (sections 6.1–6.10):

- New Lambda `app/functions/account/passIssuePost.js` — authenticated endpoint for user-issued campaign passes.
- `app/services/passService.js` — campaign pass type handling + issuance rate limit.
- `app/data/dynamoDbPassRepository.js` — add `issuedBy` field; add monthly-issuance counter table or fields.
- `app/services/bundleManagement.js` / `dynamoDbBundleRepository.js` — referral crediting logic (2 tokens on redemption, 5 on submit, 1 month on subscription).
- `app/functions/hmrc/hmrcVatReturnPost.js` — hook post-successful-submit to emit `referral.first_vat_submission` event.
- `app/functions/billing/billingWebhookPost.js` — hook on subscription success to emit `referral.conversion` event.
- New `app/functions/account/passRevokePost.js` — admin revoke (if not already via admin endpoint).
- `infra/main/java/.../stacks/AccountStack.java` — add the new Lambda + API Gateway route.
- `infra/main/java/.../stacks/DataStack.java` — add referrals GSI or table; add ambassador-tier counter table.
- Frontend (`web/public/bundles.html`) — new sections for "Issue Invitation", "My Issued Passes", "Referral Rewards"; QR code display.
- New page `web/public/admin/passes.html` — pass admin UI (list, revoke, create). Gate behind admin-only bundle or IAM.
- `web/public/submit.catalogue.toml` — add `accountant-partner` pass type; gate by `resident-pro` or `resident-pro-comp`.
- Shared: `web/public/lib/qrCode.js` or use `qrcode` npm package client-side to render QR.

## Likely tests to change/add

- `app/unit-tests/services/passService.campaign.test.js` — campaign pass issuance, rate-limit, token deduction.
- `app/system-tests/campaign/campaignPassIssuance.test.js`.
- `app/system-tests/campaign/referralTracking.test.js` — end-to-end: issue, redeem, verify referral recorded.
- `behaviour-tests/campaignIssuePass.behaviour.test.js` — UI flow.
- Extend existing bundle behaviour tests with self-referral attempt → expect 4xx.

## Likely docs to change

- `_developers/archive/PLAN_PASSES_V2.md` — mark Phase 6 delivered.
- `_developers/archive/campaign.md` — resolved questions section update.
- `PLAN_CAMPAIGN_AND_REFERRALS.md` at repo root — delivery log.
- `guide.html`, `about.html` — campaign / referral marketing copy.
- `about.html` and `help.html` — "Invite a colleague" FAQ section.

## Acceptance criteria

Per the issue's "Validation" section:
1. A resident-pro user can issue a campaign pass, share the URL, another user redeems it and gets `invited-guest` access.
2. Referral is tracked.
3. After the referred user subscribes and submits a VAT return, the referrer receives a free month credit.

Plus:
4. Rate limits prevent a single user from issuing >5 paid passes/day beyond the tier allowance.
5. No self-referral: pass issuer cannot redeem their own pass (returns 4xx).
6. Ambassador tier progression visible in the UI; unlocks at 5 + 15 redemptions.
7. Pass admin UI supports search/filter/revoke/create.
8. QR code renders inline and downloads as PNG for physical use.
9. Expired campaign passes auto-delete via DynamoDB TTL.
10. CloudWatch alarm fires on unusually high pass issuance rate (abuse signal).

## Implementation approach

**Recommended — follow the issue body as-is; break into PRs per 6.x subsection.**

Delivery slicing (each is a mergeable PR):
1. **6.1** — Campaign pass issuance Lambda + API route + tests. No UI yet.
2. **6.2 + 6.3** — Referral tracking + progressive rewards + subscription credit system.
3. **6.5** — Frontend: Issue Invitation + My Issued Passes sections on bundles.html.
4. **6.5 cont.** — Referral Rewards section + ambassador tier progress.
5. **6.6** — QR code rendering.
6. **6.7** — Abuse controls (rate limits, self-referral prevention).
7. **6.9** — Accountant-partner pass type.
8. **6.10** — Pass admin UI (separate page, bigger PR).
9. **6.4** — Commission (deferred until payment lifecycle).

Each is 1–3 days of work. Total Phase 6 ≈ 3–4 weeks at full focus.

### Alternative A — launch 6.1–6.5 minimum, defer the rest
Ship the core referral loop without ambassador tiers, accountant partners, or admin UI. Get data on whether referrals happen at all before investing in tier mechanics.

### Alternative B — use a SaaS referral platform (e.g. Rewardful, PartnerStack)
External vendor handles tracking + commission. Loses the token economics integration (users spending tokens to issue passes). Probably not a fit.

## Questions (for QUESTIONS.md)

- Q652.1: Any changes to the spec since the issue body was written? (2026-02-01 date on the doc; land as-is or revisit?)
- Q652.2: Ambassador tier thresholds — 5 / 15 / ? — should Gold open at 15 or later based on expected conversion funnel?
- Q652.3: Commission track (6.4) — tie to Stripe payment integration PR timeline.
- Q652.4: Accountant-partner verification — manual review OK, or want a self-serve workflow?
- ~~Q652.5: Admin UI gating~~ — **answered 2026-04-22: Cognito user group (IAM-based).** Admin Lambda checks `cognito:groups` claim for `admin`; reject otherwise. Group membership managed via Cognito console / IAM; no bundle hack.

## Good fit for Copilot?

Partial. Each sub-6.x item is well-scoped — Copilot can draft. But the data model changes (referrals GSI, counters) and abuse controls need careful human review. The Pass admin UI is its own significant feature.

**Already assigned to @antonycc** on GitHub — treat as owner's priority list.
