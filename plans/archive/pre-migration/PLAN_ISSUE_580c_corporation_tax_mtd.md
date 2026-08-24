# PLAN: Issue #580c — HMRC Corporation Tax MTD

> Split from #580 on 2026-04-22 (user confirmed Q580.1 direction).
> Parent plan: `plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` (pre-migration #580, now issue #15).
> Siblings: #580a (CH reads, covered by the parent plan), #580b (CH filings, `plans/archive/pre-migration/PLAN_ISSUE_580b_companies_house_filings.md`).

## Elaboration

HMRC is consulting on Making Tax Digital for Corporation Tax (MTD CT) but **no production API is available as of 2026 knowledge cutoff**. The timeline (per HMRC public statements) has slipped multiple times; best public estimate is 2027+ for a live sandbox and 2028+ for mandate. Nothing to build today.

This issue exists to track the eventual work so it isn't forgotten. When HMRC announces a sandbox, we re-open with real scope.

## Likely source files to change

**When API exists**:
- New Lambdas under `app/functions/hmrc/ct/` mirroring the VAT + self-employment pattern.
- New frontend pages under `web/public/hmrc/ct/`.
- New bundle activity in `web/public/submit.catalogue.toml`.
- OAuth scope `read:corporation-tax`, `write:corporation-tax`.

## Acceptance criteria (future)

1. HMRC MTD CT sandbox is live and accepting third-party developer registrations.
2. DIY Accounting registered as a software vendor for CT MTD.
3. At least read-only obligations + view-return implemented against the sandbox.

## Implementation approach

**Recommended — wait and watch.**

1. Subscribe to HMRC Developer Hub newsletter for MTD CT announcements.
2. When sandbox goes live, reopen this issue with a concrete spec.
3. Mirror the pattern from VAT + self-employment rollouts.

## Questions (for QUESTIONS.md)

- Q580c.1: Should we register early interest with HMRC's MTD CT programme to influence the API design?

## Good fit for Copilot?

Not applicable — nothing to build.
