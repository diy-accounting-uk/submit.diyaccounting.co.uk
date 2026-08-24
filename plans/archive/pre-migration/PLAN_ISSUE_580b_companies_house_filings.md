# PLAN: Issue #580b — Companies House filings

> Split from #580 on 2026-04-22 (user confirmed Q580.1 direction).
> Parent plan: `plans/issues/PLAN_ISSUE_15_limited_company_endpoints.md` (pre-migration #580, now issue #15).
> Siblings: #580a (CH reads, covered by the parent plan), #580c (HMRC CT MTD, `plans/archive/pre-migration/PLAN_ISSUE_580c_corporation_tax_mtd.md`).

## Elaboration

Companies House publishes a **beta filing API** enabling programmatic submission of:

- Annual accounts (micro-entity, small-company, full).
- Confirmation statement (CS01).
- Director appointments/resignations.
- Registered office address changes.
- Change of accounting reference date (AA01).

Access requires **accreditation**: a written application demonstrating software quality, security, and a customer base. Accreditation is a **manual process** (weeks) — this issue is dependency-gated on applying and succeeding.

## Likely source files to change

- After accreditation: new Lambdas under `app/functions/companies-house/`:
  - `companiesHouseAccountsFilePost.js`
  - `companiesHouseConfirmationStatementPost.js`
  - `companiesHouseDirectorAppointPost.js` / `companiesHouseDirectorResignPost.js`
  - `companiesHouseAddressChangePost.js`
  - `companiesHouseAA01Post.js`
- Extend `app/lib/companiesHouseClient.js` (from #580a) with presigner + submission helpers.
- Infra: `CompaniesHouseStack.java` (shared with #580a) gets the new routes.
- New UI wizard: `web/public/companies-house/accounts-filing.html` — uploads a zipped iXBRL accounts file or guides the user through a form-based micro-entity accounts prep.
- Secrets: Companies House filing presigner key pair.

## Likely tests to change/add

- Sandbox testing against Companies House test environment before any real prod filing.
- Behaviour test: generate a sample micro-entity accounts set, file to Companies House sandbox, assert 200.
- Contract test: the request body matches the published schema.

## Likely docs to change

- `_developers/backlog/companies-house-api-operations.md` (to be created in #580a).
- New `_developers/COMPANIES_HOUSE_ACCREDITATION.md` — the application + ongoing compliance posture.
- `privacy.html`, `terms.html` — filing data goes to Companies House (already public on the register).

## Acceptance criteria

1. Companies House filing accreditation granted in writing.
2. A test user can file a micro-entity accounts submission via the wizard to the Companies House sandbox and receive a 200.
3. Filing audit log captures: who filed, when, the Companies House submission ID, the original accounts PDF hash.
4. Token consumption: 1 token per filing (parallel to VAT submissions).
5. Production-ready UX: clear pre-submission preview, irreversibility warning, confirmation email post-file.

## Implementation approach

Blocked on accreditation. Applying for accreditation is the **first action**; code work starts only once granted.

1. Submit accreditation application (manual).
2. Await decision (weeks).
3. On approval: build micro-entity accounts filing first (simplest form, highest demand).
4. Extend to confirmation statement.
5. Other filings (director changes, address) last — low volume.

## Alternative

- Defer indefinitely; direct users to Companies House's own WebFiling portal with a deep link. Zero engineering; loses the "one-tool" story.

## Questions (for QUESTIONS.md)

- Q580b.1: Do we have the resource to apply for accreditation and maintain the quality bar it requires (security review, annual audit)?
- Q580b.2: Which filing type first — micro-entity accounts (highest demand) or confirmation statement (simplest)?
- Q580b.3: Token cost per filing — same 1 token as VAT, or higher because the downstream consequence of an incorrect filing is graver?

## Good fit for Copilot?

No. Accreditation-gated + high-stakes data. Each Lambda is bounded once accreditation is in hand; the surrounding governance is human-only.
