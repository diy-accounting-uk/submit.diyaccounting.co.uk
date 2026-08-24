# PLAN: Issue #7 (pre-migration #736) — Telegram channel shows login event but not logout

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/7
> Original body: (empty)
> Existing plans: `_developers/archive/PLAN_TELEGRAM_ALERTING.md`, `PLAN_GOOGLE_LOGOUT.md` (logout mechanics).

## Elaboration

The activity EventBridge bus (`ActivityStack.java`) receives events like `user.login.succeeded` which are fanned out to Telegram via `app/functions/ops/activityTelegramForwarder.js`. The Telegram channel shows a message per login. No matching message appears on logout, which means:

- The event is not being published on logout (most likely), or
- The Telegram forwarder filters out the event type (less likely — it's configured to forward most/all events).

`PLAN_GOOGLE_LOGOUT.md` in the archive discusses logout wiring with Cognito's Hosted UI sign-out flow; today `auth-status.js:216-232` navigates to `/auth/signed-out.html` via the Cognito logout URL. The client-side handler has no hook that calls a `/api/v1/session/beacon`-style endpoint on logout, and the server-side Lambda equivalent of "user logged out" is missing.

Fix: emit a `user.logout.succeeded` activity event from the client (or via the signed-out callback page) and extend the Telegram forwarder to format it.

## Likely source files to change

- `web/public/auth/signed-out.html` — add a small JS snippet that fires-and-forgets `POST /api/session/beacon` with `{ kind: "user.logout.succeeded", userSub: <from-pre-logout-token> }` before clearing localStorage. The beacon endpoint already exists (`app/functions/ops/sessionBeaconPost.js`, route `POST /api/session/beacon`, per recon it's wired in AccountStack).
- `app/functions/ops/sessionBeaconPost.js` — ensure it forwards to the activity bus (it probably does for the existing login beacon; extend the event kind list to include `user.logout.succeeded`).
- `app/functions/ops/activityTelegramForwarder.js` — add a mapping for `user.logout.succeeded` → a one-line message template (e.g. "🔒 user `<hashedSub prefix>…` logged out").
- `web/public/widgets/auth-status.js:216-232` — expand the logout handler to fire the beacon before navigating to the Cognito logout URL. Keep it synchronous (use `navigator.sendBeacon` to survive the page transition).

## Likely tests to change/add

- Unit test in `app/unit-tests/functions/activityTelegramForwarder.test.js` covering the logout event formatting.
- Unit test in `app/unit-tests/functions/sessionBeaconPost.test.js` (create if missing) covering the logout event path.
- Behaviour test in `behaviour-tests/auth.behaviour.test.js` — after `logOutAndExpectToBeLoggedOut`, poll the Telegram channel (or the activity bus via EventBridge test, if tappable) for the logout message. Since tapping the bus is invasive, an indirect assertion is OK: assert the beacon fires and receives 200 via `expect(response.status).toBe(200)`.
- System test for the beacon endpoint with the logout kind.

## Likely docs to change

- `_developers/archive/PLAN_TELEGRAM_ALERTING.md` — add logout as a documented event.
- `_developers/archive/PLAN_GOOGLE_LOGOUT.md` — mark this issue as the follow-up.

## Acceptance criteria

1. On clicking the Sign out link in the header, a `POST /api/session/beacon` call with `{ kind: "user.logout.succeeded", ... }` fires and returns 200 (observable via network tab or synthetic test).
2. The activity bus receives a `user.logout.succeeded` event within 2 s.
3. The Telegram channel receives a formatted message within 10 s, including a hashed-sub prefix for correlation but no raw email/username.
4. Logout still works on browsers where `navigator.sendBeacon` is unavailable — falls back to a synchronous fetch on the unload event (or an explicit pre-redirect await).
5. Synthetic test asserts the beacon call happens on logout.

## Implementation approach

**Recommended — client-side beacon before redirect.**

1. In `auth-status.js`, before building the Cognito logout URL, call `navigator.sendBeacon("/api/session/beacon", JSON.stringify({ kind: "user.logout.succeeded", ts: Date.now() }))`.
2. The Lambda pulls user sub from the JWT in the request (available because localStorage still holds the id token until after the beacon fires).
3. Forwarder receives the event and posts a one-line message.
4. Test path.

### Alternative A — server-driven logout
Introduce an explicit `POST /api/v1/auth/logout` Lambda that (a) emits the activity event, then (b) returns the Cognito logout URL. Cleaner, server-authoritative, but slower (adds a round-trip before redirect).

### Alternative B — Cognito post-logout trigger
Cognito supports a post-confirmation Lambda trigger but not a native post-logout trigger for Hosted UI flows; this route is not straightforward and is discouraged.

## Questions (for QUESTIONS.md)

- Q7.1: Any PII concern with sending the hashedSub-prefix to Telegram on logout, or should logout be userless (just a count)?
- Q7.2: Do we also want `user.login.failed` events on the Telegram channel for security awareness, or is that noise?

## Good fit for Copilot?

Yes — well-scoped. Needs: hook in `auth-status.js`, Lambda enum extension, forwarder mapping, tests. Assign after Q7.1 answered.
