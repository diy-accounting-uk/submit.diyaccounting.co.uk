# PLAN: Issue #16 (pre-migration #579) — Implement self-employed endpoints

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/16
> Original body: (empty)
> Existing plans:
> - **`_developers/backlog/self-employed-api-operations.md`** (56 lines — authoritative design for MTD ITSA Self-Employment API v5.0)
> - `_developers/backlog/European VAT reform and API requirements 2026-2027 _ Claude.mhtml` (related context for upcoming regulatory changes)

## Elaboration

**MTD ITSA (Making Tax Digital for Income Tax Self-Assessment)** is mandatory from April 2026 for sole traders and landlords with income >£20k (moved to £30k at one point but pegged at £20k — confirm current HMRC threshold). DIY Accounting's catalogue already references a `self-employed` activity and `basic` / `legacy` bundles can unlock it. The backend is empty.

The HMRC MTD Self-Employment Business API v5.0 exposes three categories:

1. **Annual summaries** — `GET/PUT/DELETE /income-tax/self-employment/{nino}/{businessId}/annual-summaries/{taxYear}` — the year-end aggregate return.
2. **Period summaries** — `POST/GET/PUT` periodic income/expense updates during the year (quarterly under MTD rules).
3. **Cumulative summaries** — `GET/PUT` running cumulative figures.

OAuth scopes needed: `read:self-assessment`, `write:self-assessment`.

This is strategically important — HMRC approval for MTD ITSA broadens DIY Accounting's addressable market from ~2M VAT-registered SMEs to ~4M sole traders/landlords.

## Likely source files to change

Follow `self-employed-api-operations.md` section "Back-end functions":

- New Lambdas under `app/functions/hmrc/`:
  - `hmrcSelfEmployAnnualGet.js` / `...Put.js` / `...Delete.js`
  - `hmrcSelfEmployPeriodPost.js` / `...List.js` / `...Get.js` / `...Put.js`
  - `hmrcSelfEmployCumulativeGet.js` / `...Put.js`
- New shared helpers in `app/lib/`:
  - `selfEmployClient.js` (wraps `hmrcClient.js` with self-employment base URI).
  - Extend `hmrcClient.js` if needed for PUT/DELETE methods.
- `infra/main/java/.../stacks/HmrcStack.java` — register the new Lambdas (9 new functions).
- `infra/.../ApiStack.java` — add the routes.
- OAuth flow: extend `app/lib/auth-url-builder.js` (frontend) + `app/functions/auth/hmrcTokenPost.js` to handle the new scopes.
- New frontend pages under `web/public/hmrc/self-employment/`:
  - `selfEmploymentDashboard.html`
  - `selfEmploymentAnnual.html`
  - `selfEmploymentPeriods.html`
  - `selfEmploymentPeriodForm.html`
  - `selfEmploymentCumulative.html`
- Update `web/public/submit.catalogue.toml`:
  - Ensure `self-employed` activity exists, gated by `basic` + `legacy` bundles.
- Update main nav on every page to link to `self-employment/selfEmploymentDashboard.html` when entitled.

## Likely tests to change/add

- Unit tests for each Lambda (9 new test files).
- System tests under `app/system-tests/hmrc/selfEmployment/`.
- Behaviour tests `behaviour-tests/selfEmployment.behaviour.test.js` for each flow:
  - Create a period, view, edit, delete.
  - View + edit annual.
  - View cumulative.
- Use the HMRC Create Test User API to provision a NINO for CI smoke tests.
- Extend the probe test matrix once sandbox testing is stable.

## Likely docs to change

- `_developers/backlog/self-employed-api-operations.md` — update progress.
- `_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md` — add MTD ITSA endpoints to the approval submission.
- `web/public/guide.html` — new section on self-employment.
- `about.html` — mention ITSA support (marketing).
- `REPORT_REPOSITORY_CONTENTS.md` — add the new module.

## Acceptance criteria

1. User with a `basic` or `legacy` bundle can navigate to `/hmrc/self-employment/selfEmploymentDashboard.html`, see their businesses (provided via HMRC API or a manual entry), and access the annual / periods / cumulative flows.
2. All 9 endpoints implemented, each with sandbox `Gov-Test-Scenario` header support in dev.
3. End-to-end test: create a period, verify via GET, amend via PUT, delete.
4. Schema validation (via `ajv` per the existing plan) rejects malformed submissions client-side before hitting HMRC.
5. Token consumption: submitting a period or annual summary costs 1 token (analogous to VAT submission).
6. Sandbox smoke-test passes against HMRC's test API.
7. HMRC approval artefact lists the 9 endpoints.

## Implementation approach

**Recommended — phase by read-before-write.**

1. **Phase 1 — reads only**: annual GET, period LIST + GET, cumulative GET. Ship to CI + sandbox; verify auth/scopes work.
2. **Phase 2 — writes**: period POST/PUT (adds real value for users).
3. **Phase 3 — annual write + deletion + cumulative write**.
4. **Phase 4 — frontend polish + guide updates**.

Each phase is its own PR so HMRC approval can progress alongside.

### Alternative A — OpenAPI client generation
Generate client from `hmrc-mtd-self-employment-business-api-5.0.yaml` via `openapi-generator-cli`. Better long-term hygiene. Bigger initial investment. Recommended for self-employment specifically — the API is large enough that hand-rolling adds maintenance burden.

### Alternative B — third-party bookkeeping adapter
Some accountancy-data vendors (FreeAgent, Xero) expose pre-normalised self-employment data via their APIs. Not a substitute for HMRC submission — that must go through HMRC's API directly. Ignored.

## Questions (for QUESTIONS.md)

- Q16.1: Confirm MTD ITSA mandate date and income threshold — still April 2026 / £20k? Check HMRC's current public announcement.
- Q16.2: OpenAPI client generation (Alt A) or hand-rolled? (Recommendation: generate, because the API is large.)
- Q16.3: Token cost per self-employment submission — same 1 token as VAT, or different?
- Q16.4: Do we also implement the business-details API (list businesses for a NINO), or require users to enter their businessId manually?
- Q16.5: Which bundles unlock self-employment? Current catalogue says `basic` / `legacy` — should a new `resident-itsa` bundle be created for ITSA-specific pricing?

## Good fit for Copilot?

Partial. Each Lambda is well-bounded — Copilot-good. The OAuth scope plumbing, entitlement gating, and HMRC approval doc need a human HMRC expert pass.
