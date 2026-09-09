<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

## Goals

- **Full API coverage** – implement handlers for creating, listing, retrieving, amending and deleting self‑employment annual and period summaries, plus cumulative summaries:contentReference[oaicite:27]{index=27}:contentReference[oaicite:28]{index=28}.
- **User‑facing pages** – build a dashboard with forms and tables for managing self‑employment data: create period summaries, view and amend existing periods, view and amend annual summaries and cumulative summaries.
- **Dynamic scopes and entitlements** – ensure the OAuth flow requests `read:self-assessment` and `write:self-assessment` scopes when required, and that only users with the `basic` or `legacy` bundle can access the pages:contentReference[oaicite:29]{index=29}.
- **Robust testing** – provide stubbed data and tests for each endpoint and scenario; incorporate HMRC’s `Gov‑Test‑Scenario` values to simulate acceptance and error conditions.

## Current state

There is no self‑employment code in the repository.  The product catalogue includes a `self-employed` activity assigned to `basic` and `legacy` bundles:contentReference[oaicite:30]{index=30}.  The self‑employment API spec defines endpoints for period and annual summaries and includes test scenarios for sandbox use:contentReference[oaicite:31]{index=31}:contentReference[oaicite:32]{index=32}.

## Implementation plan

### Back‑end functions

1. **Annual summaries**:
    - `getSelfEmploymentAnnual.js` to call `GET /income-tax/self-employment/{nino}/{businessId}/annual-summaries/{taxYear}` and return the summary or `404`.
    - `putSelfEmploymentAnnual.js` to send `PUT` with a validated body; use `ajv` to validate against the spec schema.
    - `deleteSelfEmploymentAnnual.js` to send `DELETE` and return `204` or error.
2. **Period summaries**:
    - `createSelfEmploymentPeriod.js` to `POST` a new period with `startDate`, `endDate` and monetary fields; return the new `periodId`.
    - `listSelfEmploymentPeriods.js` to `GET` all periods for a business; accept optional `from`/`to` query parameters.
    - `getSelfEmploymentPeriod.js` to `GET` a single period by ID.
    - `putSelfEmploymentPeriod.js` to `PUT` updates to an existing period.
3. **Cumulative summaries**:
    - `getSelfEmploymentCumulative.js` and `putSelfEmploymentCumulative.js` to manage cumulative summaries:contentReference[oaicite:33]{index=33}.
4. **Common helpers** – create utilities to extract NINO and business ID from request paths and to build HMRC URLs.  Use the same base URI and fraud‑prevention headers as other HMRC calls.
5. **Routing** – mount each handler under `/api/self-employment/...` with `requireActivity('self-employed')` middleware.  Expose via CDK `FunctionUrl`s and define necessary environment variables (e.g. `DIY_SUBMIT_SELF_ASSESS_BASE_URI`).

### Front‑end pages

1. **selfEmploymentDashboard.html** – list businesses (by `businessId`) and tax years.  Provide links to manage annual, period and cumulative summaries.
2. **selfEmploymentAnnual.html** – form to view and edit annual summaries.  Use default values when no summary exists.  Buttons to save (`PUT`) and delete.
3. **selfEmploymentPeriods.html** – list all periods with columns for `periodId`, `startDate`, `endDate`, `totalIncome`, `totalExpenses`.  Provide **Create** and **Edit/Delete** actions.
4. **selfEmploymentPeriodForm.html** – form for creating or editing a period.  Validate that the end date is after the start date and that numeric fields are positive.
5. **selfEmploymentCumulative.html** – view and edit cumulative summaries.

### Libraries and tools

- **OpenAPI client generation:** Run `openapi-generator-cli` on `hmrc-mtd-self-employment-business-api-5.0.yaml` to create a client.  Use the generated functions in handlers.
- **Date handling:** Use `luxon` or `date-fns` for date comparisons and formatting.
- **Schema validation:** Use `ajv` to validate request bodies against JSON schemas extracted from the OpenAPI spec.
- **Form rendering:** Use plain JavaScript or a lightweight library; avoid frameworks to keep the bundle small.

## Testing & iteration strategy

1. **Stubbed data:** For each handler, provide stubbed JSON via environment variables (e.g. `TEST_SE_LIST_PERIODS`).  Use examples from the HMRC spec.
2. **Unit tests:** Write Jest tests to verify parameter extraction, validation and error handling.  Use `nock` to mock HMRC responses.  Test JSON schema validation with both valid and invalid bodies.
3. **Integration tests:** Use `supertest` to call the Express routes, including entitlements middleware.  Ensure unauthorized access returns `403`.
4. **Playwright tests:** Build end‑to‑end flows: create a period, view it, amend it, delete it; view and edit annual summaries; view cumulative summaries.  Validate error handling (overlapping periods, invalid dates).  Use `Gov‑Test‑Scenario` values to simulate HMRC errors.
5. **Sandbox testing:** Deploy to a staging environment with HMRC sandbox credentials.  Use test NINOs via the Create Test User API and verify each endpoint.  Compare responses to stubbed data and adjust.
6. **Repeat cycles:** After implementing each endpoint, run the full test suite.  Ensure VAT functions and entitlements still work.  Deploy to dev, test manually, then promote to stage.

## HMRC context & roll‑out

Making Tax Digital for Income Tax (MTD ITSA) is planned to start in April 2026.  Sole traders and landlords with income over £20 k must send quarterly updates using compatible software:contentReference[oaicite:34]{index=34}.  HMRC’s self‑employment API (v5.0) provides endpoints for period and annual summaries that will underpin these quarterly submissions.  Implementing this integration now positions the platform to support MTD ITSA well before it becomes mandatory.
