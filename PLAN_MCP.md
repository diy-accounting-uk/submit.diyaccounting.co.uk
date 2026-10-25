<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: an HMRC grant the MCP starts itself

## The ask

An HMRC grant the MCP can start, so VAT filing through the MCP needs no token from elsewhere. A tool returns HMRC's authorisation link for the needed scopes with a state bound to the MCP session. The user completes it in the browser. Submit's existing HMRC callback, seeing that state, exchanges the code and stores the access and refresh tokens server side against the MCP session, never returning them to the chat. The VAT tools then read the token from the session instead of an argument, locally and hosted, and fail with a plain message naming the authorisation tool when none is held. `submit_vat_return` and `list_vat_obligations` join `HOSTED_TOOL_NAMES`. The same path serves Income Tax and the CT600 later.

## The flow

1. The chat calls `request_hmrc_authorisation` with `services` (`vat`, `itsa`; default `vat`) and `hmrcAccount` (`synthetic` or `live`; default `live`).
2. The tool posts to `POST /api/v1/mcp/hmrc-grants` with the session bearer. The route stores a pending grant and answers `{grantId, url, expiresAt}`.
3. The tool keeps `grantId` on the MCP session and answers only `{url, expiresAt, services, hmrcAccount}`. The chat shows the user the link.
4. The user signs in to HMRC and grants access. HMRC redirects to the registered redirect URI, `activities/submitVatCallback.html`, with `code` and `state`.
5. The callback page sees a state that starts `mcp.`. It posts `{code, state}` to `POST /api/v1/mcp/hmrc-grants/callback` and tells the user to go back to the chat. The page keeps no token and needs no Submit sign-in in that browser.
6. The callback route checks the state, exchanges the code at HMRC's token endpoint, seals both tokens and marks the grant granted. It answers `{state: "granted"}` and nothing else.
7. `list_vat_obligations` and `submit_vat_return` read the grant with `GET /api/v1/mcp/hmrc-grants/{grantId}` and send the access token to the VAT routes as today. The token stays in the MCP process memory for that one call.

## The pieces

| Piece | Where |
|-------|-------|
| The tool and the token lookup | `mcp/lib/submit-tools.js`; `mcp/lib/server.js` |
| The three routes | `app/functions/mcp/mcpHmrcGrant.js` (new), registered in `app/bin/server.js` |
| The store | `app/data/dynamoDbHmrcGrantRepository.js` (new), in the `mcp-sessions` table |
| The seal | `app/lib/codesSeal.js`, given a purpose argument so the grant uses its own derived key |
| The callback branch | `web/public/activities/submitVatCallback.page.js` |
| The hosted session pointer | `app/functions/mcp/mcpHttp.js`; `app/data/dynamoDbMcpSessionRepository.js` |
| The stack | `McpStack.java` (new Lambda, three routes); `SubmitApplication.java` passes the HMRC settings |

## The table item

One item per grant in `{env}-env-mcp-sessions`, beside the session items and the codes entries.

| Attribute | Value |
|-----------|-------|
| `sessionId` | `hmrc-grant:<grantId>`, where `grantId` is a UUID |
| `hashedSub` | the owner's hashed sub |
| `hmrcAccount` | `synthetic` or `live` |
| `scope` | the HMRC scope string asked for, then the scope HMRC granted |
| `stateHash` | SHA-256 of the state's secret part, hex |
| `state` | `pending`, `exchanging` or `granted` |
| `sealed` | granted only: `{accessToken, refreshToken}` sealed with AES-256-GCM, the grant id as the bound data |
| `accessExpiresAt` | granted only: epoch seconds when the access token expires (`expires_in` from HMRC) |
| `ttl` | pending: 10 minutes after the request; granted: 24 hours after the grant, the MCP session's lifetime |

The seal key is HKDF-SHA256 of the MCP blob key with the info `hmrc-grant`, so a codes entry key cannot open a grant and a grant key cannot open a codes entry.

## The state

`mcp.<grantId>.<secret>`, where `secret` is 32 random bytes in base64url. The item holds only the secret's hash. The `mcp.` prefix is what sends the callback page down the MCP branch; the web journey's own states never start with it.

## The callback route

- Splits the state, reads the item by `grantId`, and compares the secret's hash in constant time.
- Moves the item from `pending` to `exchanging` with a condition on `state = pending` and `ttl > now`. A second post of the same state fails that condition and answers 409.
- Exchanges the code with the HMRC client id and secret for the grant's `hmrcAccount`, through `performTokenExchange`, so the request is audited as the web exchange is. The callback carries no signed-in user, so the audit record is filed under `mcp-hmrc-grant:<grantId>`.
- On success, seals the tokens, sets `granted`, `accessExpiresAt` and the 24-hour `ttl`. On failure, deletes the item and answers HMRC's error, so the user asks again.

## The read route and refresh

`GET /api/v1/mcp/hmrc-grants/{grantId}` answers the owner only (the bearer's hashed sub must match). A pending grant answers `{status: "pending"}`. A granted one answers `{status: "granted", accessToken, expiresAt, scope, hmrcAccount}`. When the access token expires within five minutes and a refresh token is held, the route uses HMRC's `refresh_token` grant, seals the new pair and answers the new access token. Submit's web journey has no HMRC refresh today; this is its first use. HMRC's access token lasts four hours, so a 24-hour MCP session survives five refreshes.

## The tools

- `request_hmrc_authorisation` is a new tool, local and hosted. A second call replaces the session's grant.
- `list_vat_obligations` and `submit_vat_return` lose `hmrcAccessToken`. With no grant on the session they fail with: "No HMRC authorisation is held for this session. Call request_hmrc_authorisation, show the user its link, and call this tool again once they have granted access." A pending grant fails with a message that the user has not finished the HMRC page yet. An expired grant fails with the route's 404 message, which names the tool again.
- `hmrcAccount` defaults to the grant's own. A call that names the other account fails, since a sandbox token does not work on the live API.
- `request_hmrc_authorisation`, `list_vat_obligations` and `submit_vat_return` join `HOSTED_TOOL_NAMES`.
- `run_for_clients` passes the session through, so every client's call uses the one grant.

## Local and hosted

- Local (stdio, the harness): the grant id lives on the in-memory session. A restart of the MCP process needs a new grant.
- Hosted: `mcpHttp.js` copies `hmrcGrant` from the session item into the session before the request and writes it back when a tool changed it, the same way it keeps the cloud book pointer.

## Threat model

| Threat | Answer |
|--------|--------|
| A leaked `Mcp-Session-Id` | The hosted endpoint already refuses a session whose owner is not the bearer's. The read route checks the owner again. The session item holds only the grant id, never a token. |
| A leaked grant id | The grant id is part of the state in the link, so the user's browser history holds it. The read route also needs the owner's bearer, and the tool answers no grant id of its own. |
| A replayed state | The `pending` to `exchanging` condition admits one callback per state. HMRC also accepts each code only once. |
| A state used on the wrong grant | The secret's hash must match the item the grant id names. |
| Someone else's HMRC account bound to the user's session | The attacker would need the user's state before the user uses it. The state lives only in the user's browser, for ten minutes, once. |
| A read of the table | The tokens are sealed under a key derived from the blob key, bound to the grant id. |
| A token in the chat or the logs | No route or tool answers a token to the chat. The callback answers only `granted`. `performTokenExchange` masks the tokens in its log lines as it does for the web exchange. |

## The stack

- `McpStack.java` gets a fourth Lambda, `mcpHmrcGrant`, with three routes: `POST /api/v1/mcp/hmrc-grants` (JWT authoriser), `GET /api/v1/mcp/hmrc-grants/{grantId}` (JWT authoriser) and `POST /api/v1/mcp/hmrc-grants/callback` (no authoriser).
- Its grants: read and write on the sessions table, read on the blob key secret, the salt, and the two HMRC client secrets. Write on the HMRC API requests table for the audit record.
- `McpStackProps` gains the HMRC base URIs, client ids and secret ARNs, which `SubmitApplication.java` already holds for `HmrcStack`.
- The existing callback page serves the branch, so HMRC's registered redirect URIs stay as they are and no CloudFront behaviour changes; `/api/v1/*` already reaches API Gateway.
- `McpStackTest` counts four Lambda functions and lists the three new routes.

## Later services

- Income Tax: `services: ["itsa"]` already asks for `read:self-assessment write:self-assessment`. The ITSA filing tools read the token the same way once they join the MCP.
- The CT600 goes through HMRC's Transaction Engine with Government Gateway credentials, not OAuth. It would take its credentials on a page in the way the Companies House codes entry does.
- The practice tools `invite_client` and `client_authorisation_status` still take the practice's token as an argument. They move to the grant once Submit names the agent authorisation scope as a `services` value.

## Proof

- Unit: `mcp/test/hmrc-grant.test.js`, `mcp/test/submit-tools.test.js`, `app/unit-tests/functions/mcpHmrcGrant.test.js`, `app/unit-tests/functions/mcpHttp.test.js`, `app/unit-tests/lib/codesSeal.test.js`.
- Simulator lane: `behaviour-tests/mcpHmrcGrant.behaviour.test.js` starts the grant through the tool, walks the simulator's HMRC consent pages in a browser, lands on the real callback page, and lists obligations through the MCP with no token argument.
- Infra: `./mvnw clean verify`.
