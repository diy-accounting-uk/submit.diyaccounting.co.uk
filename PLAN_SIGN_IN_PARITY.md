<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: sign-in parity across Submit and spreadsheets

## Operator's words

> Please add tasks to uplift all the sign-in paths in this repository and ../spreadsheets.* so that we have every route at the same level with no gaps

Added to the same row: every route must say whether a user authenticated (a fresh sign-in) or a token refresh started a new session.

Read against `origin/main` in both repositories. Where the batch branch `claude/arclight-itsa` changes the picture, the row says so. Build rows cut from `main` merge `claude/arclight-itsa` first.

## Routes

All Cognito routes use one pool and three app clients in `infra/main/java/co/uk/diyaccounting/submit/stacks/IdentityStack.java`: Submit (line 258), books (line 284), MCP (line 315). The Pre Token Generation trigger (line 217, `app/functions/auth/preTokenGeneration/index.js`) runs for all three.

| Id | Route | Client | Token exchange |
|---|---|---|---|
| R1 | Submit web, Google | Submit | Submit's `cognitoTokenPost.js` |
| R2 | Submit web, native (test lanes) | Submit | Submit's `cognitoTokenPost.js` |
| R3 | Submit web, refresh | Submit | Submit's `cognitoTokenPost.js` |
| R4 | Direct InitiateAuth scripts | Submit | Cognito API from Node |
| R5 | DIYA-GL cloud, sign-in | books | Cognito, from the browser |
| R6 | DIYA-GL cloud, refresh | books | Cognito, from the browser |
| R7 | DIYA-GL behaviour test | books | Cognito, from Node |
| R8 | MCP sign-in | MCP | Cognito, from the CLI |
| R9 | MCP refresh | MCP | Cognito, from the CLI |
| R10 | MCP borrowed Submit token | Submit | none (token copied in) |
| R11 | Local mock and simulator | none | local mock server |

- R1, R2: `web/public/lib/auth-url-builder.js` line 15 builds the authorize URL. `web/public/auth/loginWithCognitoCallback.html` line 144 posts the code to `/api/v1/cognito/token`. R2 is the same client with `COGNITO` added to the hosted UI by `scripts/toggle-cognito-native-auth.js`; users are `synthetic-<lane>@test.diyaccounting.co.uk`.
- R3: `web/public/lib/services/auth-service.js`. On page load, an expired token triggers `ensureSession({ force: true })` (line 36). In a live page, a token within 5 minutes of expiry triggers a pre-emptive refresh (line 74). Refresh posts to the same `cognitoTokenPost.js`.
- R4: `scripts/ensure-cognito-test-user.js` line 176, `USER_PASSWORD_AUTH` plus TOTP, rotating each lane's user. On `claude/arclight-itsa`, `scripts/itsa-sandbox-year.js` line 519 also signs in this way and uses the ID token for `Gov-Client-Multi-Factor`.
- R5, R6: `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud.js`. Sign-in at line 211, code exchange at line 236 (`/oauth2/token` at line 245), return at line 1670, refresh at line 348 (lazy, only on an API call within a minute of expiry or after a 401), sign-out at line 1568. Client id in `cloud-config.js` line 24.
- R7: `behaviour-tests/steps/behaviour-diya-gl-subscription-steps.js` line 29. It blanks `cloud.js` and exchanges the code in Node.
- R8, R9: `mcp/lib/auth.js`. `signIn()` at line 217, `accessToken()` refresh at line 254. `signIn()` has no caller: no MCP tool and no `mcp/bin` command reaches it, on `main` or on the batch branch. `book-tools.js` lines 105 and 222 send the MCP ID token.
- R10: `mcp/lib/submit-tools.js` line 26 and `mcp/lib/practice-tools.js` line 27 read `DIYA_SUBMIT_ACCESS_TOKEN`, a Submit-client access token the user copies in. VAT, practice and Companies House tools use it.
- R11: `web/public/auth/loginWithMockCallback.html` and `scripts/simulator-lambda-server.mjs` line 393. No Cognito, no trigger.

Excluded from the matrix because they grant access to a third party and are not sign-ins to the pool: HMRC OAuth, Companies House OAuth (`app/functions/companies-house/companiesHouseTokenPost.js`), and the Google Drive store (`../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/drive.js`, off while `googleClientId` is null).

## Matrix A: the sign-in event

"yes" means the route has it today. Detail follows, keyed by route.

| Id | Server event | Actor and mask | Fresh or refresh | GA4 | Test tag |
|---|---|---|---|---|---|
| R1 | yes | yes | grant type only | `login` | yes |
| R2 | yes | yes | grant type only | `login` | yes |
| R3 | every refresh | yes | no session marker | none | yes |
| R4 | no | no | no | n/a | no |
| R5 | no | no | no | `cloud_sign_in` | no |
| R6 | no | no | no | none | no |
| R7 | no | no | no | blanked | no |
| R8 | no | no | no | n/a | no |
| R9 | no | no | no | n/a | no |
| R10 | no sign-in | email absent | n/a | n/a | requestId only |
| R11 | local only | yes | grant type only | `login` | yes |

- R1, R2: `app/functions/auth/cognitoTokenPost.js` lines 88 to 101 publish `login` with `classifyActor(email)` and `maskEmail`, and `userSub` (hashed at `app/lib/activityAlert.js` line 54). The event carries no app client and no session id. GA4 `login` at `loginWithCognitoCallback.html` line 225 sends `method: "cognito"` for every provider. Test tag: GA4 `visitor_kind` (`web/public/lib/analytics.js` line 61) and actor `test-user` from the synthetic email.
- R3: the same file publishes `token-refresh` on every refresh. A refresh at page load after a long gap and a pre-emptive refresh in a live page look the same. Customer refreshes reach the LIVE Telegram channel (`app/functions/ops/activityTelegramForwarder.js` line 107).
- R4: the trigger only logs (`preTokenGeneration/index.js` line 17). Its `triggerSource` is `TokenGeneration_Authentication`.
- R5: GA4 `cloud_sign_in` with `step` started, returned or failed (`cloud.js` lines 191, 1701; builder `diya-gl-events.js` line 40). There is no GA4 `login`. `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/analytics.js` sets no `visitor_kind`, so synthetic sessions are not tagged.
- R7: the test blanks `cloud.js`, so it sends no GA4 event, and it leaves no server event either.
- R10: the custom authorizer flattens access-token claims (`customAuthorizer.js` line 234), which carry no email, so `resolveActorClass` (`activityAlert.js` line 114) falls to the requestId prefix and reads `customer`.

What tells a fresh sign-in from a refresh today:

| Source | Fresh sign-in | Refresh |
|---|---|---|
| Trigger `triggerSource` | `TokenGeneration_HostedAuth` | `TokenGeneration_RefreshTokens` |
| Trigger, direct API | `TokenGeneration_Authentication` | same |
| Trigger, first password | `TokenGeneration_NewPasswordChallenge` | same |
| Trigger, device auth | `TokenGeneration_AuthenticateDevice` | same |
| `cognitoTokenPost.js` | `grant_type=authorization_code` | `grant_type=refresh_token` |

- HostedAuth covers R1, R2, R5, R7 and R8. Authentication and NewPasswordChallenge cover R4. Device tracking is not configured on the pool, so AuthenticateDevice is not expected. It maps to a fresh sign-in if it appears.
- The trigger event carries `callerContext.clientId`, so it names the client for every route.

## Matrix B: session, MFA and data

| Id | MFA claim | Multi-Factor header | Sign-out | Revocation | Book events |
|---|---|---|---|---|---|
| R1–R3 | yes | yes | beacon + `/logout` | none | n/a |
| R4 | yes | arclight only | n/a | n/a | n/a |
| R5–R7 | yes | n/a | `/logout` only | none | GA4 save only |
| R8–R9 | yes | n/a | none | none | none |
| R10 | from the copy | missing | n/a | n/a | n/a |

- MFA claim: the trigger adds `custom:mfa_method` for TOTP users on every client (`preTokenGeneration/index.js` line 30). Federated Google users carry `identities` instead.
- Multi-Factor header: built server-side only for the Submit client. `customAuthorizer.js` lines 46 and 70 verify against `COGNITO_USER_POOL_CLIENT_ID` alone and read `X-Id-Token` (line 113). R10 sends no `X-Id-Token`, so `app/lib/buildFraudHeaders.js` line 257 logs the header as missing. R10 also sends `Gov-Client-Connection-Method: WEB_APP_VIA_SERVER` (line 187) for a desktop tool.
- Sign-out, Submit: `web/public/widgets/auth-status.js` line 241 posts an unauthenticated beacon. `app/functions/account/sessionBeaconPost.js` lines 41 to 57 publish `logout` from the email the browser sends, with no hashed sub and no client. Line 293 then goes to Cognito `/logout`. There is no GA4 `logout`.
- Sign-out, books: `cloud.js` line 1568 clears storage and goes to `/logout`. No server event and no GA4 event.
- Sign-out, MCP: there is none. The refresh token stays in `~/.config/diya-submit/credentials.json` until it expires (the Cognito default is 30 days; `IdentityStack.java` sets no validity).
- Revocation: no route calls `/oauth2/revoke`. Cognito's `/logout` clears the hosted UI cookie only, so a copied refresh token keeps working. The country-change revocation (`customAuthorizer.js` line 343) guards custom-authorized routes only. The books JWT authorizer (`ApiStack.java` line 315) does not check it.
- Book events: `app/functions/diyaGl/diyaGlPut.js` (line 357), `diyaGlVersionGet.js` (line 154), `diyaGlDelete.js` (line 84) and `app/functions/practice/practiceClientBookMovePost.js` (line 70) publish nothing. The books page sends GA4 `cloud_save` (`cloud.js` line 1206) but nothing on an open from the account store (Drive opens send `cloud_drive_open`). On `claude/arclight-itsa`, `companyBookPull.js` reads a book straight from S3 under its own role. That is a system read, and book-open events cover API reads only.

## Panels and alarms that count sign-ins

- No alarm counts sign-ins or sign-in failures.
- `infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/AnalyticsDashboard.java` line 337 charts `LoginToSubmissionConversion` from `v_login_to_submission_funnel.sql`. Its cohort (line 16) is every customer event with a hashed sub. Once books and MCP sign-ins carry a hashed sub, they join that cohort and lower the VAT conversion. `operatorSnapshotPublish.js` line 133 reads the same view.
- `v_active_users_daily.sql` line 10 counts every customer event, with no client split.
- `v_ga4_funnel_daily.sql` counts GA4 `login` on the Submit stream only (`13497119809`). The DIYA-GL pages send to the spreadsheets measurement ID `G-X4ZPD99X2K`.
- Cognito publishes `SignInSuccesses` and `TokenRefreshSuccesses` in `AWS/Cognito` by `UserPool` and `UserPoolClient`. No panel uses them.

## Event schema and lake

- `publishActivityEvent` (`app/lib/activityAlert.js` line 45) takes `site` (default `"submit"`, also the EventBridge `Source` `diy.<site>` and the Telegram prefix at `activityTelegramForwarder.js` line 76) and `clientId`. `clientId` is the practice's client, not the Cognito app client. No field names the app client.
- The lake's `activity_events` table (`AnalyticsStack.java` lines 1023 and 1060, flattened by `app/functions/analytics/activityEventTransform.js` lines 43 to 68, read through `activity_events_all.sql`) has `site` and `client_id` with the same meanings. `detail_json` keeps any extra detail field, but it has no column for the app client or a session.
- Bus rules match `detailType` only (`ActivityStack.java` line 154, `AnalyticsStack.java` line 349), so a new detail field or a new `site` value is routed as before.
- `classifyActor(email)` (`activityAlert.js` line 188) reads the email alone. A books or MCP ID token carries `email`, and the JWT authorizer passes it into context (`app/lib/httpResponseHelper.js` line 354), so book routes classify correctly. With no email (Submit access tokens on custom-authorized routes, R10) it returns `system` when called directly, and `resolveActorClass` falls back to the requestId prefix. The client makes no difference to either.

## Recommendation: where sign-in and refresh events come from

Emit sign-in and refresh events from the Pre Token Generation trigger. Emit sign-out and book events from per-client server routes.

1. The trigger stays a small zip asset. After its MFA lookup it makes one asynchronous `lambda:Invoke` (`InvocationType: Event`) with `callerContext.clientId`, `triggerSource`, `userName`, `request.userAttributes.sub`, `email` and `identities`. A failed invoke is logged and never blocks the token. No PII goes onto the bus.
2. A new `signInActivityPublish` Lambda in `ActivityStack` (env-scoped, app image, built like the Telegram forwarder at `ActivityStack.java` line 123) enriches and publishes. It maps the client id to `submit`, `books` or `mcp` using the SSM parameters `IdentityStack` writes (lines 304 and 333, plus a new one for the Submit client). It reads SSM at run time because a trigger environment variable holding client ids makes a CloudFormation cycle. It hashes the sub, classifies and masks the email, and applies the session rule below.
3. `cognitoTokenPost.js` stops publishing (lines 88 to 101), so Submit sign-ins are counted once.

Why the trigger: it sees every client and every token issue, including R4 and any client added later, so parity holds by construction. Per-client server paths would need the books and MCP exchanges proxied through Submit (a CORS token route for `diya-gl.co.uk`, a CLI change, a second copy of the event code), and R4 would stay unseen.

What the trigger path loses:

- Request context: no IP, country, user agent or requestId, so there is no `test_` prefix. Test lanes classify by their `@test.diyaccounting.co.uk` email instead. Today's `login` event carries none of these either.
- Time: it runs inside Cognito's trigger budget (5-second timeout, `IdentityStack.java` line 223). The handoff must stay fire-and-forget.
- Failed sign-ins: the trigger never runs for them. `AWS/Cognito` metrics and the threat-protection logs cover counts.
- Issued is not used: an event means Cognito issued tokens, even if the app then drops them. Unknown, to measure in ci: whether `TokenGeneration_HostedAuth` fires at the sign-in page or at code redemption. If at the page, an abandoned callback still records a `login`.
- Local lanes: R11 has no trigger, so proxy and simulator runs produce no sign-in event. The enrichment handler is covered by unit tests instead.

What per-client server paths lose: R4 and every new client, the single definition of the session rule, and parity itself, which would depend on each client remembering to call Submit.

### The session rule

A fresh sign-in is any `triggerSource` other than `TokenGeneration_RefreshTokens`. A refresh starts a new session when the previous token issue for the same user and app client is older than the access-token lifetime (60 minutes, the Cognito default) plus 5 minutes' grace. So the old tokens lapsed and nothing kept the session alive.

- Submit (R3): a live page refreshes 5 minutes before expiry, so its refreshes continue the session. A page opened after the token lapsed refreshes at load, so that refresh resumes a session.
- Books (R6) and MCP (R9): both refresh lazily, on the first call after expiry. After an idle gap longer than the lifetime, that refresh resumes a session.
- State: one item per user and client, `session#{hashedSub}#{appClient}`, in the security state table (`app/data/dynamoDbSecurityStateRepository.js`, already holding `geo#{hashedSub}`). It holds `lastIssuedAt`, `sessionId` and `sessionStartedAt`, with a 30-day `ttl`.

| Event | When | `sessionKind` | `sessionId` |
|---|---|---|---|
| `login` | fresh sign-in | `sign-in` | new |
| `session-resumed` | refresh after the lifetime | `resumed` | new |
| `token-refresh` | refresh within the lifetime | `continued` | carried |
| `logout` | sign-out route | `ended` | carried, then deleted |

Detail fields on every one: `appClient`, `triggerSource` (not on `logout`), `sessionKind`, `sessionId` (a random opaque id), `provider` (from `identities`), plus the existing `actor`, `hashedSub` and a masked-email `summary`. GA4 stays simpler: `login` on a fresh sign-in, `logout` on sign-out, and nothing on a refresh, because GA4 keeps its own `session_start`.

Sign-out has no Cognito trigger. Each client calls `/oauth2/revoke` with its refresh token (token revocation is on by default for these CDK clients), then calls a new authenticated `POST /api/v1/session/sign-out`, then goes to `/logout`. The route sits behind a JWT authorizer whose audience is all three clients. It reads `sub`, `email` and `aud` from verified claims, publishes `logout`, and deletes the session item. The beacon's `logout` branch goes away.

Book events come from the book handlers, which already have the verified claims. The app client comes from the `aud` claim.

## Build

All four rows use Sonnet. Brief for every row: merge `claude/arclight-itsa` first; `git add` only your own files; comments and test names carry no plan names, row ids or dates; run `npm run bundle` before unit tests in a worktree.

### SI-2a. Submit: sign-in and refresh events from the trigger (about 18 files)

- `app/functions/auth/preTokenGeneration/index.js`: after line 39, send the async invoke to the function named in a new `SIGN_IN_ACTIVITY_FUNCTION_NAME` environment variable. Catch and log failures. Keep returning `event` (line 45).
- `app/functions/auth/signInActivityPublish.js` (new): the client-id map from SSM, `classifyActor`, `maskEmail`, the session rule, then `publishActivityEvent`.
- `app/data/dynamoDbSecurityStateRepository.js`: `getSignInSession` and `putSignInSession` beside `getSessionGeo` (line 57), plus `deleteSignInSession` for SI-2c.
- `app/lib/activityAlert.js`: new `appClient` and `sessionId` parameters, written into the detail (lines 66 to 77) when set. Update the JSDoc at line 33.
- `app/functions/auth/cognitoTokenPost.js`: delete lines 88 to 101, `extractUserInfoFromResponse` (line 111) and the now-unused imports (line 11).
- `app/functions/ops/activityTelegramForwarder.js`: `token-refresh` with `sessionKind: "continued"` goes to no chat (see open question 3).
- `infra/.../stacks/IdentityStack.java`: after line 235, grant `lambda:InvokeFunction` on the enrichment function ARN built from its name string (no token reference, so no cycle) and set the environment variable. Next to line 304, write `/submit/{env}/submit-app-client-id`.
- `infra/.../stacks/ActivityStack.java`: the enrichment Lambda, built like the forwarder at line 123. Grant SSM read on the three client-id parameters, read-write on the security state table, the salt secret read that other activity publishers have, and an errors alarm.
- `infra/.../SubmitSharedNames.java`: the function name, handler and ARN, next to `activityTelegramForwarderLambdaFunctionName`.
- Tests: `app/unit-tests/functions/preTokenGeneration.test.js` (invoke sent, invoke failure still returns the event), `app/unit-tests/functions/signInActivityPublish.test.js` (each `triggerSource`, the three clients, the lifetime boundary on both sides, the test-user and probe actors, a missing email), `app/unit-tests/data/dynamoDbSecurityStateRepository.test.js`, `app/unit-tests/lib/activityAlert.test.js`, `app/unit-tests/functions/cognitoTokenPost.test.js` (no publish), the forwarder test, and `IdentityStack` and `ActivityStack` CDK tests. Run `npm test` and `./mvnw clean verify`.
- Proof in ci: after the deploy, sign in on R1, R5 and R8 and run R4. Check one `login` each in the lake with the right `appClient`. Record which point in the hosted UI flow `TokenGeneration_HostedAuth` fires at.

### SI-2b. Submit: lake columns and panels (about 14 files)

- `app/functions/analytics/activityEventTransform.js` line 65: add `app_client` and `session_id`.
- `infra/.../stacks/AnalyticsStack.java` lines 1043 and 1091: append the two columns to both lists, at the end, so Parquet stays compatible.
- `infra/main/resources/analytics/views/activity_events_all.sql` lines 7 to 9 and 15 to 17: select the two columns.
- `v_login_to_submission_funnel.sql` line 16: add `AND coalesce(app_client, 'submit') = 'submit'`.
- `v_active_users_daily.sql`: group by `coalesce(app_client, 'submit')` (see open question 2).
- New `v_sign_ins_daily.sql`: count by day, `app_client`, `event` and `actor`. Register it in `infra/.../stacks/analytics/BusinessViews.java`.
- `AnalyticsDashboard.java` near line 337: a sign-ins panel from the new view, and a second panel of `AWS/Cognito` `SignInSuccesses` and `TokenRefreshSuccesses` by `UserPoolClient` as the reconcile line.
- Tests: the transform test, `AnalyticsStackTest` (columns), `AnalyticsDashboardTest`, `app/unit-tests/analytics/rawExportPublish.test.js` if the view list changes. Run `./mvnw clean verify`.

### SI-2c. Submit: sign-out, revocation, book events and the MCP (about 22 files)

- New `app/functions/account/sessionSignOutPost.js`: verified claims, then `logout` with `appClient` from `aud` and `sessionId` from the session item, which it then deletes. `ApiStack.java` near line 315 gets a JWT authorizer with all three audiences. The route goes in `AccountStack.java` beside the beacon (line 123), with CORS from `app/lib/diyaGlCors.js` for the DIYA-GL origins. Its names go in `SubmitSharedNames.java`. Register it in `app/bin/server.js`.
- `app/functions/account/sessionBeaconPost.js`: delete the `logout` branch (lines 41 to 57).
- `web/public/widgets/auth-status.js`: replace `sendLogoutBeacon` (line 208) with refresh-token revoke plus a keepalive POST to the new route. Send GA4 `logout` before line 293.
- `web/public/auth/loginWithCognitoCallback.html` line 225: `method` becomes the provider from `identities`, or `cognito` for native users.
- Book events: `book-saved` in `diyaGlPut.js` before line 357 (product, retention, version, practice `clientId`). `book-opened` in `diyaGlVersionGet.js` before line 154. `book-deleted` in `diyaGlDelete.js` before line 84. `book-moved` in `practiceClientBookMovePost.js` before line 70. Each passes `appClient` from the `aud` claim.
- MCP: `mcp/lib/auth.js` gets `signOut()` (revoke, the sign-out route, delete the credentials file). `mcp/lib/server.js` registers `sign_in` and `sign_out` tools, so the MCP's own sign-in is reachable for the first time.
- Tests: the new route's unit test, `sessionBeaconPost.test.js`, `diyaGlPut.test.js`, `diyaGlVersionGet.test.js`, `diyaGlDelete.test.js`, the book-move test, the MCP `auth` test (sign-out deletes the file and calls revoke), the `ApiStack` and `AccountStack` CDK tests, and a browser test for the Submit logout (revoke and POST sent, GA4 `logout` pushed). Run `npm test`, `./mvnw clean verify`, and `npm run test:authBehaviour-proxy`.

### SI-2d. Spreadsheets: DIYA-GL GA4 and tagging (about 8 files)

- `web/spreadsheets.diyaccounting.co.uk/public/lib/analytics.js` after line 26: set `visitor_kind` the way Submit's `web/public/lib/analytics.js` line 61 does. `spreadsheets.behaviour.test.js` sets `requestIdPrefix=test_` in sessionStorage on its first page, as Submit's `gotoWithRetries.js` does.
- `web/diya-gl.co.uk/public/diya-gl-events.js`: add `buildLoginEvent(method)`, `buildLogoutEvent()` and `buildCloudOpenEvent(source)`.
- `web/diya-gl.co.uk/public/cloud.js`: GA4 `login` next to `sendSignInEvent("returned")` (line 1701), keeping `cloud_sign_in` for the funnel steps. In `signOut` (line 1568), revoke the refresh token and POST to Submit's `/api/v1/session/sign-out` with the ID token before `clearAllStorage()`, then send GA4 `logout`. Send `cloud_open` in `performOpen` (line 1084).
- Check `infra/main/resources/diya-gl-security-headers.json` `connect-src` covers the Submit API and the hosted UI `/oauth2/revoke` (it already covers `/oauth2/token`).
- Tests: `web/unit-tests/diya-gl-events.test.js`, `web/unit-tests/analytics.test.js`, `web/browser-tests/diya-gl-cloud.browser.test.js` (login and logout events, revoke and sign-out calls on sign-out). Lands after SI-2c is live in ci, because the sign-out route must exist.

## Open questions

1. Where the client goes. Recommended: a new `appClient` detail field and an `app_client` column, leaving `site` as `"submit"`. The alternative is `site` set to `"diya-gl"` or `"mcp"`. That needs no new column and labels Telegram lines by product, but it changes the EventBridge `Source` and mixes "which site" with "which client".
2. Active users. Recommended: split by client. The alternative is counting books and MCP users in one active-user total with Submit.
3. `token-refresh` inside a live session. Recommended: lake only, no Telegram. The alternative keeps it in the LIVE channel, as Submit's refreshes are today.
4. R10, the MCP's HMRC and Companies House calls. Option (a) keeps the borrowed Submit token and leaves `Gov-Client-Multi-Factor` missing on MCP submissions. Option (b) moves them to the MCP's own sign-in: `customAuthorizer.js` accepts the MCP client id, and the MCP sends its access token plus `X-Id-Token`. Option (b) also means deciding the MCP's `Gov-Client-Connection-Method`, which is `WEB_APP_VIA_SERVER` today (`buildFraudHeaders.js` line 187). It is not in the build rows until chosen.
