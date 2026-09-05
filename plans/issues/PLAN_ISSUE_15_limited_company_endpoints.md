# PLAN: Issue #15 (pre-migration #580) — Limited company: split tracker

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/15
> Original body: (empty)
> **Scope decision 2026-04-22 (Q15.1, pre-migration Q580.1): split into three discrete issues**, because "limited company" overloads three very different surfaces with different lead times.
> Proposed children (pre-migration #580a/#580b/#580c; not recreated as their own issues in the post-migration renumbering):
> - **#580a — Companies House reads** (fast, available now). Covered below as the deliverable under this plan.
> - **#580b — Companies House filings** (weeks of accreditation before code, no current-issue counterpart). See `plans/archive/pre-migration/PLAN_ISSUE_580b_companies_house_filings.md`.
> - **#580c — HMRC Corporation Tax MTD** (no production API yet, no current-issue counterpart). See `plans/archive/pre-migration/PLAN_ISSUE_580c_corporation_tax_mtd.md`.
>
> **Correction 2026-09-05.** The Companies House REST filing API does not file accounts: it covers
> transactions, registered office address, registered email address and insolvency. Accounts go
> through the XML Gateway as iXBRL in an XML envelope, with test presenter credentials obtained by
> email from xml@companieshouse.gov.uk. The April 2027 software-only mandate is paused with no new
> date. The filing half is therefore two items on `NEXT.md`: B34.3a (registered office and email
> changes via the REST filing API, buildable now against the sandbox with an OAuth client) and
> B34.3b (micro-entity accounts via the XML Gateway, blocked on presenter credentials).
>
> Existing plans: none specific in `_developers/`. Related: `_developers/backlog/self-employed-api-operations.md` (pattern to follow).
> External: HMRC's Corporation Tax (CT) MTD is still pre-mandate (as of 2026 knowledge cutoff); Companies House filing is the other strand.

## Elaboration

"Limited company endpoints" could mean two different HMRC/UK government surfaces — this issue is ambiguous and needs a product decision:

1. **HMRC Corporation Tax** — submission of Company Tax Returns (CT600). HMRC has an MTD-for-Corporation-Tax consultation but no production API as of 2026 — this is **pre-mandate**. Filing today is via HMRC's legacy CT Online services (SOAP/XML channel for agents, or Companies House co-filing service). Any implementation would be against legacy infrastructure subject to change.
2. **Companies House filing** — annual accounts, confirmation statement, director changes. Companies House has a **production REST API** for company information, and a **filing API in beta** (requires written application/accreditation). Scope: read-only company info + beta filing of accounts (if accreditation granted).

Recommendation: this issue is worth splitting into two. Likely the intent is (2) Companies House, since the catalogue uses "limited-company" to imply incorporated entity workflows rather than CT specifically, and CT MTD isn't a thing yet. But we need confirmation.

Current state: no code for either surface; catalogue has no `limited-company` activity registered (needs adding).

## Likely source files to change

If the decision is **Companies House (read + beta filing)**:

- Register as a Companies House API user; obtain API key (free for reads); separately apply for filing accreditation (manual, takes weeks).
- New Lambdas under `app/functions/companies-house/`:
  - `companiesHouseCompanyGet.js` — search company by number / name, return company profile.
  - `companiesHouseFilingHistoryGet.js` — list recent filings.
  - `companiesHouseOfficersGet.js` — list directors/secretaries.
  - (If accredited) `companiesHouseAccountsFilePost.js` — file annual accounts.
  - (If accredited) `companiesHouseConfirmationStatementPost.js` — file confirmation statement.
- New `app/lib/companiesHouseClient.js` — basic-auth wrapper, rate-limit handling (600 req / 5 min).
- `infra/main/java/.../stacks/` — a new `CompaniesHouseStack.java` (keeps concerns separate from HMRC).
- Secrets Manager — `companies-house/api-key`.
- New frontend under `web/public/companies-house/` — company lookup page, filings list, accounts filing wizard (phase 2).
- `web/public/submit.catalogue.toml` — add a `limited-company` activity gated by a new bundle (e.g. `resident-company`).

If the decision is **HMRC Corporation Tax (MTD pre-mandate)** — defer until HMRC publishes a production API.

## Likely tests to change/add

- Unit tests per Lambda, with `nock` mocking the Companies House REST responses.
- Behaviour test: lookup a real test company (e.g. our own DIY Accounting Ltd), assert the profile renders.
- Filing tests (once accredited): sandbox-only — Companies House has a test environment for filing.

## Likely docs to change

- `_developers/backlog/companies-house-api-operations.md` (new) — design doc mirroring the self-employed one.
- `_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md` — companies house is out of scope; keep distinct.
- `guide.html`, `about.html`, `help.html` — new section on limited-company support.

## Acceptance criteria

1. **Phase 1** (read-only Companies House): user can search for their company, view profile + filing history + officers.
2. **Phase 2** (filing, if accredited): user can file annual accounts for a micro-entity (simplest form) via a wizard.
3. Entitlement gating: `limited-company` activity visible only for bundles that unlock it.
4. Secrets in Secrets Manager; no keys in code.
5. Compliance: accreditation documentation stored in `_developers/` and summarised in the HMRC approval artefact if it overlaps.

## Implementation approach

**Recommended — Phase 1 (Companies House reads) first, defer filing + CT.**

1. Register a Companies House API user account.
2. Build the three read Lambdas + company-lookup page.
3. Ship.
4. In parallel: apply for Companies House filing accreditation.
5. After accreditation (weeks later), scope Phase 2.

### Alternative A — CT MTD prep only
If the product intent is corporation tax rather than Companies House, pivot to scoping the HMRC CT MTD API when it's announced. Nothing to build today.

### Alternative B — both, split issues
Split this issue into two: #580a Companies House, #580b HMRC CT. Recommendation: do this once product intent confirmed.

## Questions (for QUESTIONS.md)

- Q15.1: **Which "limited company" endpoints?** HMRC Corporation Tax (pre-mandate, no production API), Companies House reads (available now), or Companies House filings (requires accreditation)? This is the key blocker.
- Q15.2: Are we willing to apply for Companies House filing accreditation (manual process, documentation)?
- Q15.3: Bundle pricing for limited-company access — new bundle `resident-company`, or fold into existing `resident-pro`?
- Q15.4: Would a Companies House integration actually help DIY Accounting's existing users (who are VAT / ITSA focused), or is this a new market entirely?

## Good fit for Copilot?

Blocked on Q15.1. Once product direction chosen, each Lambda is Copilot-friendly (parallel to the HMRC VAT/self-employed work).
