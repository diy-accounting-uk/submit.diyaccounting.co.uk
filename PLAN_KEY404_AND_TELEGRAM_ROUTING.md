# PLAN: Fix periodKey 404 phantom error + Telegram routing to LIVE

Branch: `key404`
Created: 2026-05-11
Status: in progress

## User assertions (verbatim)

> "Issue 1" - yes, apply to hmrcVatReturnPost and hmrcVatReturnGet.
>
> "Issue 2" - yes, as recommended and check anywhere else that doesn't use the JWT-extraction helper, then actually I think the logic should route unknown to LIVE, but after fixing anywhere we should know but didn't set the context.
>
> Also given this long running bug, please check `prod-env-hmrc-api-requests` for any requests to a non-test URL and list the associated user details.
>
> You'll need to scan to check the URLs by value and also if you could work out if there are non-test receipts that would be handy.

## Context

- Trace `4485761b270edfd7421193f76c762462` (W3C traceparent reused by SPA across the session) belongs to:
  - User: Andrew Shutler (Cognito sub `b6b252d4-9001-708e-7778-1264e34ac341`, federated via Google)
  - VRN `860611051`
  - hashedSub `3f828e07a90d38983fe411dbb2aee8b939902d667a2769029148680eb33e809e` (saltVersion `v2`)
  - Submitted period 26A1 (2026-02-01 → 2026-04-30) successfully on 2026-05-11 14:01:01Z
  - Receipt `formBundleNumber 096056627239` (paymentIndicator BANK)
- The customer saw a red error `Submission failed: Failed to resolve period key: HMRC returned 404` AFTER the submission had already succeeded.
- Telegram channel `diy-prod-live` only got the 13:54 login event; everything 14:00–14:06 went to `diy-prod-test`.

## Issue 1 — periodKey 404 surfaced after a successful submission

### Root cause

`app/functions/hmrc/hmrcVatReturnPost.js` re-resolves the periodKey on every call (initial + polls). Right after submission HMRC flips the obligation status `O → F`, so the `?status=O` query 404s and the handler returns `Failed to resolve period key: HMRC returned 404` to the customer even though the async record already holds the completed result with the formBundleNumber. Same anti-pattern in `hmrcVatReturnGet.js`.

### Fix

In both handlers, on a non-initial request:

1. Look up the persisted async request by `(userSub, requestId)` first.
2. If found, return its persisted status (completed / failed / processing).
3. Only if no persisted record exists, fall through to periodKey resolution + re-initiation.

Files:
- `app/functions/hmrc/hmrcVatReturnPost.js` — gate the periodKey block (~lines 320–395) and token-enforcement block behind `isInitialRequest`; check `getAsyncRequest` first for poll calls.
- `app/functions/hmrc/hmrcVatReturnGet.js` — same shape (~lines 237–298).

### Verification

- Existing unit tests `app/unit-tests/functions/hmrcVatReturnPost.test.js` and `hmrcVatReturnGet.test.js` must continue to pass.
- Add a test: poll-after-success path returns the persisted completed result without calling the obligations endpoint.

## Issue 2 — customer events going to `diy-prod-test` instead of `diy-prod-live`

### Root cause (confirmed from telegram-forwarder logs for the customer's window)

`activityTelegramForwarder.resolveTargetChatIds()` only routes `actor === "customer" || "visitor"` to LIVE; everything else falls through to TEST. `cognitoTokenPost.js` calls `classifyActor(email)` so login events arrive with `actor=customer` → LIVE. Every other customer-journey publisher omits `actor`/`flow`, and `publishActivityEvent` defaults a real (non-`test_`) requestId to `actor=unknown` → TEST.

### Fix (per user direction: route `unknown` to LIVE; also set context everywhere we know the user)

1. **Plumb `userSub` through AsyncLocalStorage context** (`app/lib/logger.js` already exposes a request-scoped `context`):
   - In the JWT-extraction helper (e.g. `extractUserFromAuthorizerContext` / wherever `userSub` is first known), call `context.set("userSub", userSub)`.
   - Audit handlers that DON'T go through that helper but still know the user (e.g. SQS-replay paths in `hmrcVatReturnPost.js`, `billingWebhookPost.js`, the cognito flow itself) and add `context.set("userSub", ...)` at the entry point.
2. **Default unknown → LIVE** in `app/lib/activityAlert.js` (`publishActivityEvent`):
   ```js
   const requestId = context.get("requestId") || null;
   const userSub  = context.get("userSub")   || null;
   const effectiveActor = actor || (
     requestId?.startsWith("test_") ? "test-user" :
     userSub                        ? "customer"  :
                                      "customer"   // fail-safe: route unknown to LIVE
   );
   const effectiveFlow = flow || (userSub ? "user-journey" : "unknown");
   ```
   (Operational events are unaffected — `resolveTargetChatIds` checks `flow === "operational"` BEFORE actor.)
3. **Update routing comment** in `activityTelegramForwarder.js:resolveTargetChatIds` to reflect that `customer` is the live default.

### Files likely needing `context.set("userSub", ...)` audit

Customer-action handlers where the user is known but `userSub` may not yet be in context:
- `app/functions/hmrc/hmrcTokenPost.js`
- `app/functions/hmrc/hmrcVatObligationGet.js`
- `app/functions/hmrc/hmrcVatReturnGet.js`
- `app/functions/hmrc/hmrcVatReturnPost.js` (both handler entry and SQS replay path)
- `app/functions/hmrc/hmrcReceiptGet.js`
- `app/functions/account/interestPost.js`
- `app/functions/account/bundleDelete.js`, `bundlePost.js`, `bundleGet.js`
- `app/functions/account/passPost.js`, `passGeneratePost.js`, `passAdminPost.js`, `passMyPassesGet.js`, `passGet.js`
- `app/functions/account/sessionBeaconPost.js`
- `app/functions/billing/billingCheckoutPost.js`, `billingPortalGet.js`, `billingRecoverPost.js`
- `app/functions/billing/billingWebhookPost.js` (user-derived from Stripe customer metadata)
- `app/functions/auth/cognitoTokenPost.js`

### Verification

- Existing unit tests for `activityAlert.js`, `activityTelegramForwarder.js` updated to reflect new defaults.
- Local proxy run: the customer's submit-VAT journey logs `actor=customer flow=user-journey` for every event.

## Audit 3 — `prod-env-hmrc-api-requests` scan for non-test URLs

### Goal

Identify every HMRC API call in prod that hit a non-sandbox URL (anything NOT under `test-api.service.hmrc.gov.uk`, e.g. `api.service.hmrc.gov.uk`). Group by `hashedSub` and join with available identity hints (sub from CloudWatch logs cross-reference) to enumerate affected users.

### Steps

1. Parallel `dynamodb scan` of `prod-env-hmrc-api-requests` with a `FilterExpression` that excludes `test-api`. Project `hashedSub`, `id`, `url`, `method`, `httpResponse.body` (status code only), `createdAt`.
2. Group by `hashedSub`; for each, sample one URL to confirm prod vs sandbox, count unique `vatNumber`s extracted from URL path.
3. For each `hashedSub`, search CloudWatch logs across the same window for any log line containing that hashedSub (DynamoDB writes log it) — extract the corresponding `userId` (Cognito sub) from sibling lines in the same `requestId`.
4. Resolve Cognito sub → email/name via Cognito list-users API where possible (read-only).
5. Output: table of `{hashedSub, cognitoSub, providerIdentity, name, email, vrns[], firstSeen, lastSeen, requestCount}`.

## Audit 4 — `prod-env-receipts` non-test receipts

### Goal

Enumerate stored VAT submission receipts that came from real HMRC (not the sandbox / test simulator).

### Steps

1. Scan `prod-env-receipts` projecting `hashedSub`, `receiptId`, `createdAt`, `receipt.formBundleNumber`, `receipt.processingDate`, `receipt.paymentIndicator`, `saltVersion`.
2. Cross-reference each `(hashedSub, receiptId)` with `prod-env-hmrc-api-requests` for the same `hashedSub` to locate the originating POST URL — receipts whose POST went to `api.service.hmrc.gov.uk` are real submissions.
3. As a secondary signal: `formBundleNumber` is sandbox-shaped vs prod-shaped (sandbox often returns deterministic / shorter strings; prod returns 12-digit numeric). Use to corroborate.
4. For each real receipt, also reverse-resolve the Cognito sub via the same hashedSub→sub mapping built in Audit 3.
5. Output: table of `{receiptId, hashedSub, cognitoSub, name, email, vrn, formBundleNumber, processingDate, paymentIndicator, createdAt}`.

## Order of execution

1. Audits 3 & 4 in parallel (read-only, gives blast radius — informs whether to backfill anything later).
2. Issue 1 fix → unit tests → behaviour test (proxy).
3. Issue 2 fix (context plumbing + default flip) → unit tests → behaviour test (proxy).
4. Single commit per issue, push to `key404`, open PR.

## Out of scope

- No backfill of historical telegram messages (LIVE channel) for the affected users — surface in audit output, decide later.
- No DB migrations.
- No customer outreach automation; the user can decide based on the audit results.
