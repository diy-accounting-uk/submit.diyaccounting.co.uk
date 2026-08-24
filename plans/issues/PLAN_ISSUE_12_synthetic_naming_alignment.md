# PLAN: Issue #12 (pre-migration #707) — Unify sandbox/test/live/developer mode naming under "synthetic"

> Source issue: https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/issues/12
> Original body: "unify this: sandbox/test/live mode/developer mode options… 'synthetic' matches workflow, otherwise quite unique, variables can match vendor naming"
> Existing plans:
> - **`_developers/archive/PLAN_SYNTHETIC_NAMING_ALIGNMENT.md`** (authoritative design — keeps `sandbox` where it's a vendor contract term like HMRC, uses `synthetic` for our own controls)
> - `_developers/archive/NAMING_CLEANUP_PLAN.md`
> - `_developers/archive/PLAN_UI_CLEANUP_DEVELOPER_MODE.md`

## Elaboration

Conceptually one boolean — "am I talking to real production services with real customer data, or not?" — is currently named **6 ways**:

| Name | Where |
|---|---|
| `sandbox` | HMRC env vars (`HMRC_SANDBOX_*`), bundle qualifiers, sessionStorage `hmrcAccount`, HTML id `sandboxObligationsOption` |
| `testPass` | Pass records (`testPass: true`), catalogue TOML (`test = true`), pass type IDs `*-test-pass` |
| `test` | `.env.test`, `TEST_AUTH_PROVIDER`, bundle qualifier |
| `developer mode` / `developerOptions` | `developer-mode.js`, sessionStorage `showDeveloperOptions`, CSS class, HTML `developerSection` |
| `synthetic` | `classifyActor`, Telegram routing, workflow `synthetic-test.yml` |
| `live mode` | Inverse of "developer mode", mostly in UI copy |

The archive plan's **rule**:
- **Keep `sandbox`** for the HMRC-facing path (HMRC calls their test environment "sandbox" — our vendor contract matches their terminology).
- **Use `synthetic`** for our own internal "is this a test action" boolean (matches the workflow, matches the Cognito test-user concept, unique, no overload).
- **Retire** `testPass`, `developer mode`, `test` (env-overloaded), `live mode` as user-facing/code identifiers.

## Likely source files to change

This is a wide rename. A non-exhaustive list from recon + archive plans:

- `.env.test`, `.env.proxy`, `.env.ci`, `.env.prod`, `.env.simulator` — some vars renamed; `HMRC_SANDBOX_*` stays (HMRC vendor).
- `app/lib/env.js`, `app/lib/classifyActor.js` — already uses `synthetic`; extend.
- `app/services/passService.js` — rename `testPass` → `synthetic` on pass records (migration: back-compat read for old records).
- `app/data/dynamoDbPassRepository.js` — migration helper for existing records.
- `web/public/submit.catalogue.toml` — rename `test = true` → `synthetic = true` on pass types.
- `web/public/developer-mode.js` → `web/public/widgets/synthetic-tools.js` (file rename + class rename).
- `web/public/*.html` — rename every id/class including `developer*`, `sandboxObligationsOption` (check if renaming is safe for CSS/query selectors).
- `.github/workflows/synthetic-test.yml` — no change (already aligned).
- `behaviour-tests/` — occurrences of `testPass`/`developer` must be migrated; Playwright selectors updated.
- `_developers/archive/PLAN_SYNTHETIC_NAMING_ALIGNMENT.md` — this plan is the contract; mark progress.

## Likely tests to change/add

- All behaviour tests that refer to the old names must compile against the new ones.
- A migration test: given a DynamoDB record with `testPass: true`, the service reads it as `synthetic: true` and a new write normalises to `synthetic: true`.
- Grep guard in CI: fail if any new code introduces `developer[-_ ]mode` or `testPass` outside of legacy migration shims.

## Likely docs to change

- `CLAUDE.md` (repo) — glossary.
- `_developers/archive/PLAN_SYNTHETIC_NAMING_ALIGNMENT.md` — mark this as the delivery.
- `README.md` — if it uses old names.
- `about.html`, `guide.html`, `help.html` — user-facing copy (e.g. "Sandbox mode" → "Synthetic mode").

## Acceptance criteria

1. One canonical boolean — spelled `synthetic` — across JS, Java CDK, env vars (non-vendor), HTML, TOML, test names, and UI copy.
2. `sandbox` retained only in HMRC-specific contexts (env vars, obligation qualifier, session storage key `hmrcAccount`).
3. Existing DynamoDB records with legacy `testPass: true` continue to read correctly (back-compat).
4. No new CI regressions (behaviour tests green).
5. Grep: the words `developer mode`, `developerSection`, `testPass` only appear in migration shim comments.
6. Glossary added to `CLAUDE.md` explaining `synthetic` vs `sandbox`.

## Implementation approach

**Recommended — phased rename with a migration shim.**

1. **Phase 1 — glossary + shim**: land the renames for new code only; add a back-compat reader in `passService` that maps `testPass` → `synthetic` on read.
2. **Phase 2 — rename-in-place**: batch rename across JS, HTML, TOML, CDK, tests. One PR per concern (JS/HTML/TOML, CDK, tests) — easier to review.
3. **Phase 3 — data migration**: one-off Lambda run (or AWS Backup restore script) to rewrite DynamoDB records `testPass` → `synthetic`. Keep the shim for 90 days, then remove.
4. **Phase 4 — UI copy pass** — "Sandbox mode", "Test pass", "Developer mode" → "Synthetic mode", "Synthetic pass", "Developer tools".

### Alternative A — big-bang rename, no shim
Accept a brief window where in-flight DynamoDB records may be misread. Risky with customer data.

### Alternative B — leave the codebase, just document the mapping
Write a "these all mean the same thing" doc, don't rename. Cheapest; does not reduce confusion. Not recommended.

## Questions (for QUESTIONS.md)

- Q12.1: Keep `sandbox` in the sessionStorage key `hmrcAccount=sandbox` (vendor contract) or align with the rename? (Recommendation: keep — it's HMRC's word.)
- ~~Q12.2: UI copy~~ — **answered 2026-04-22: "Developer mode" wins** for the public-facing label (user-familiar). Code normalises to `synthetic` everywhere internally. Result: UI strings stay as "Developer mode" / "Developer options"; every code identifier, env var (except the HMRC vendor `sandbox` terms), DynamoDB field, and test name uses `synthetic`.
- Q12.3: Migration window for `testPass` shim — 30 or 90 days?

## Good fit for Copilot?

Partial. Mechanical renames are perfect for Copilot (Phase 2). The migration Lambda + UI copy decisions need human review.
