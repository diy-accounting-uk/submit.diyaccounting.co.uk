# PLAN: Issue #14 (pre-migration #634) — Other social providers (Apple, Microsoft)

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/14
> Original body: (empty)
> Existing plans: none specific; related to `_developers/archive/PLAN_COGNITO_HOSTED_UI_NATIVE_AUTH_TOGGLE.md` and the existing Google Cognito integration.

## Elaboration

Cognito Hosted UI today supports Google federation (recon: `IdentityStack.java:218-230` shows `UserPoolIdentityProviderGoogle` wiring). To broaden the demographic (small business owners on macOS/iOS + Microsoft 365 shops), add:

1. **Sign in with Apple** — mandatory on iOS apps that offer any third-party sign-in; also valuable for the mature UK small-business demographic heavy on iPhones/iPads. Apple requires a registered Developer Program account (£79/year), a Services ID, an Apple team ID, and a signing key. Cognito supports Apple natively (`UserPoolIdentityProviderApple`).
2. **Sign in with Microsoft / Azure AD** — appeals to the Microsoft 365 small-business segment. Cognito supports this via a generic OIDC provider pointed at the Microsoft identity platform (`v2.0/.well-known/openid-configuration` with the `common` tenant). Alternatively `UserPoolIdentityProviderOidc`.

Both need:
- Client registration on each provider's side.
- Cognito user-pool IdP configuration (CDK).
- Attribute mapping (email, given_name, family_name).
- UI button on `auth/login.html`.
- Tests (behaviour tests against live Cognito with dummy Apple/MSFT test accounts in ci).

## Likely source files to change

- `infra/main/java/.../stacks/IdentityStack.java` — add `UserPoolIdentityProviderApple` and `UserPoolIdentityProviderOidc` (Microsoft).
- Secrets Manager — new secrets: `apple/team-id`, `apple/services-id`, `apple/key-id`, `apple/private-key`, `microsoft/client-id`, `microsoft/client-secret`.
- GitHub Actions vars/secrets — populate from the provider consoles during deploy.
- `web/public/auth/login.html` — add two new provider buttons.
- `web/public/lib/auth-url-builder.js` — add provider IDs (`SignInWithApple`, `Microsoft`) as options on the Hosted UI redirect URL.
- `web/public/auth/loginWithCognitoCallback.html` — ensure it handles all providers uniformly.
- `.env.ci`, `.env.prod` — any provider-specific values (likely only IdP names; secrets stay in Secrets Manager).

## Likely tests to change/add

- Behaviour tests: hard to run against real Apple/Microsoft flows in CI (2FA, device verification). Practical approach: use mock IdPs in `proxy`/`simulator` (similar to the mock-oauth2 server already used for Google in proxy).
- Unit tests for `auth-url-builder.js` covering provider lookup.
- CDK assertion: Cognito user pool has 3 IdPs configured (Google, Apple, Microsoft).

## Likely docs to change

- `_developers/archive/PLAN_COGNITO_HOSTED_UI_NATIVE_AUTH_TOGGLE.md` — supersede with multi-provider context.
- New `_developers/setup/APPLE_DEVELOPER_SETUP.md` — walk through registering the Services ID and key. Needed once only; save effort for future engineers.
- New `_developers/setup/MICROSOFT_ENTRA_SETUP.md` — walk through the Azure AD app registration.
- `guide.html` / `help.html` — "Sign in with Apple/Microsoft" sections.

## Acceptance criteria

1. Login page shows three provider buttons: Google, Apple, Microsoft. Keyboard-focusable, WCAG-compliant.
2. A test user can complete the Apple flow (external — manual verification once), returning to the callback and landing on the home page authenticated.
3. Same for Microsoft.
4. User attributes (email, given_name, family_name) are correctly mapped from each provider.
5. Existing Google flow is unaffected.
6. Secrets held in Secrets Manager, never in env files or source.
7. Apple/Microsoft developer-account details documented so a second engineer can rotate keys.

## Implementation approach

**Recommended — provider-at-a-time, Apple first.**

1. **Apple**:
   - Register an Apple Developer account (if none exists) and a Services ID.
   - Generate a signing key.
   - Store (team ID, services ID, key ID, PEM) in Secrets Manager.
   - Add `UserPoolIdentityProviderApple` to IdentityStack.
   - Add button to login page; test.
2. **Microsoft**:
   - Register an Azure AD App in the Microsoft Entra admin centre.
   - Configure redirect URI to Cognito's `/oauth2/idpresponse`.
   - Grant delegated `openid profile email` scopes.
   - Add `UserPoolIdentityProviderOidc` with the Microsoft discovery URL.
   - Button; test.
3. **Retire native auth if still toggled on** — verify no regression; Native auth is already a feature-flag per CLAUDE.md ("Cognito Hosted UI Native Auth Toggle").

### Alternative A — federate via a third-party (Auth0, Clerk)
Outsource identity to Auth0/Clerk, which handle Apple/Microsoft/etc uniformly. Loses AWS-native simplicity; adds vendor cost and a data-processor.

### Alternative B — only Microsoft (drop Apple)
Apple has higher setup cost (Dev Program fee). But iOS is common in the UK small-business demographic; dropping Apple leaves a gap. Recommendation: do both.

## Questions (for QUESTIONS.md)

- Q14.1: Apple Developer Program — do we have one, or will we set one up? (Required before any work lands.)
- Q14.2: Microsoft — single-tenant or `common` (multi-tenant, any Microsoft user)? (Recommendation: `common`.)
- Q14.3: Is there a marketing / segmentation case for prioritising one over the other?
- Q14.4: Do we want Facebook as well (Cognito supports it natively)? The brand case is weaker but setup is cheapest of all.

## Good fit for Copilot?

Partial. The CDK IdP blocks and login-page buttons are mechanical — Copilot-good. The provider-console side (registering Services IDs, generating keys) is human-only.
