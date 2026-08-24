# PLAN: Issue #19 (pre-migration #425) — Implement optional VAT endpoints

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/19
> Original body: "Implement optional endpoints — GET /organisations/vat/{vrn}/returns/{periodKey} (view return), /liabilities, /payments, /penalties. Add Playwright tests using Gov-Test-Scenario values. Providing these enhances customer experience and may speed up approval."
> Existing plans:
> - **`_developers/backlog/vat-api-operations.md`** (133 lines — authoritative design, includes a 2025-10-31 progress note: OAuth for `vatObligations.html` + `viewVatReturn.html` already done)
> - `_developers/archive/HMRC_MTD_APPROVAL_PLAN.md`, `HMRC_APPROVAL_READINESS.md`, `HMRC_PRODUCTION_APPROVAL_PLAN.md` (context)
> - `_developers/reference/` contains the HMRC MTD VAT end-to-end service guide HTML

## Elaboration

HMRC's MTD VAT API exposes six main operations; DIY Accounting must (for submission) implement obligations + submit return, and *optionally* the rest. The optional four are:

| Endpoint | Path | Purpose |
|---|---|---|
| **View return** | `GET /organisations/vat/{vrn}/returns/{periodKey}` | Fetch a submitted return (reconciling what was sent) |
| **Liabilities** | `GET /organisations/vat/{vrn}/liabilities?from&to` | Shows outstanding VAT liabilities |
| **Payments** | `GET /organisations/vat/{vrn}/payments?from&to` | History of VAT payments received |
| **Penalties** | `GET /organisations/vat/{vrn}/penalties` | MTD points / late-filing / late-payment penalties |

Why these matter for HMRC approval:
- Approval review favours fuller MTD API coverage.
- Better UX: users can reconcile penalties in-app rather than going to the HMRC portal.
- Per `vat-api-operations.md` progress note, the VAT return + obligations OAuth is already wired — these three extra endpoints reuse the same OAuth scopes (`read:vat`).

Current state (recon + `vat-api-operations.md` note):
- `app/functions/hmrc/hmrcVatReturnGet.js` (view return) **exists** but is marked as a Lambda only — the frontend `viewVatReturn.html` may already call it (needs verification against the 2025-10-31 progress note which says yes).
- Liabilities, payments, penalties: no Lambda, no page.

## Likely source files to change

- New Lambdas under `app/functions/hmrc/`:
  - `hmrcVatLiabilitiesGet.js` — `/api/v1/hmrc/vat/liabilities?vrn=&from=&to=`
  - `hmrcVatPaymentsGet.js` — `/api/v1/hmrc/vat/payments?vrn=&from=&to=`
  - `hmrcVatPenaltiesGet.js` — `/api/v1/hmrc/vat/penalties?vrn=`
- Reuse `app/lib/hmrcClient.js` (existing; adds fraud-prevention headers + bearer token) for the new calls.
- `infra/main/java/.../stacks/HmrcStack.java` — register three new Lambdas; API Gateway routes.
- `infra/.../stacks/ApiStack.java` — add the routes to the exported list.
- New pages:
  - `web/public/hmrc/vat/vatLiabilities.html`
  - `web/public/hmrc/vat/vatPayments.html`
  - `web/public/hmrc/vat/vatPenalties.html`
- Update `web/public/hmrc/vat/submitVat.html` and `viewVatReturn.html` to link to the new pages (per obligation row: "View liabilities" / "View payments" / "View penalties").
- `web/public/submit.catalogue.toml` — decide whether these pages are gated under the existing `vat-obligations` activity or need a new `vat-view` activity. Recommendation: keep under `vat-obligations` for simplicity (these are informational like obligations; no write/token consumption).
- `_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md` — update to declare support for the optional endpoints.

## Likely tests to change/add

- New unit tests for each Lambda under `app/unit-tests/functions/`.
- Test each with stubbed responses (mirroring the stub pattern from obligations).
- New Playwright behaviour tests under `behaviour-tests/`:
  - `vatLiabilities.behaviour.test.js`
  - `vatPayments.behaviour.test.js`
  - `vatPenalties.behaviour.test.js`
- Use `Gov-Test-Scenario` header values for sandbox scenarios (e.g. `VRN_NOT_FOUND`, `NO_LIABILITIES`, `ONE_LIABILITY`, `MULTIPLE_PENALTY_POINTS`).
- Extend the synthetic test workflow matrix (per the just-landed matrix) with one of these as another check.

## Likely docs to change

- `web/public/guide.html`, `help.html` — new sections for liabilities/payments/penalties.
- `_developers/backlog/vat-api-operations.md` — update the progress note with completion of these three endpoints.
- `_developers/hmrc/HMRC_MTD_API_APPROVAL_SUBMISSION.md` — enumerate the supported operations (HMRC approval submission artefact).
- `REPORT_REPOSITORY_CONTENTS.md` — add the new files.

## Acceptance criteria

1. Three new authenticated Lambdas serve `/api/v1/hmrc/vat/liabilities`, `/payments`, `/penalties`, each performing the corresponding HMRC GET call with fraud-prevention headers.
2. Three new pages render the response as a table with clear empty-state copy and a back link to obligations.
3. Each page supports the `Gov-Test-Scenario` header via the developer tools panel (already exists on the submitVat/obligations pages).
4. Stubbed responses available for unit tests (fixtures under `app/test/stubs/vat/`).
5. Playwright behaviour tests pass in `-proxy`, `-simulator`, `-ci` variants.
6. Sandbox smoke: deploy to CI, run against HMRC sandbox with at least one real scenario per endpoint; observe expected HTTP response and page render.
7. `HMRC_MTD_API_APPROVAL_SUBMISSION.md` updated with the newly supported endpoints.

## Implementation approach

**Recommended — follow `vat-api-operations.md` and the existing `hmrcVatReturnGet.js` pattern.**

1. Copy `hmrcVatReturnGet.js` → `hmrcVatLiabilitiesGet.js`; adjust URL + response shape.
2. Repeat for payments and penalties.
3. Build the three HTML pages modelled on `viewVatReturn.html`.
4. Wire API routes.
5. Tests.
6. Deploy to CI; smoke-test against HMRC sandbox; update HMRC approval artefact.

### Alternative A — generate the client from the OpenAPI spec
Per the existing plan: `openapi-generator-cli generate -i hmrc-md-vat-api-1.0.yaml -g typescript-fetch -o app/lib/hmrcVat`. More robust long-term (auto-aligns with HMRC API changes) but larger initial investment.

### Alternative B — build liabilities first, ship, then payments/penalties
Ship smaller PRs. Recommended if HMRC approval deadline pressure demands it.

## Questions (for QUESTIONS.md)

- Q19.1: Entitlement gating — reuse `vat-obligations`, or introduce a fine-grained `vat-view` activity?
- Q19.2: Do we need the `POST /organisations/vat/{vrn}/payments` (make a payment) endpoint too? (Not in this issue but sometimes requested.)
- Q19.3: OpenAPI client generation vs hand-rolled? (Recommendation: hand-rolled for parity with existing code; file a follow-up for generation later.)

## Good fit for Copilot?

Yes — highly structured, pattern-matches existing Lambdas. Assign after Q19.1 answered.
