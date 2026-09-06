# PLAN: Issue #646 — battery-pack

> Source issue: https://github.com/antonycc/submit.diyaccounting.co.uk/issues/646
> Original body: "first just have a test that reads a text file but it fails when not encrypted"
> Existing plans:
> - `_developers/backlog/battery-pack/` — entire prototype package:
>   - `README.md` (213 lines)
>   - `CLAUDE.md` (134 lines)
>   - `KEY_GATED_OPEN_SOURCE.md` (162 lines)
>   - `app/`, `scripts/`, `package.json`, `LICENSE`

## Elaboration

`battery-pack` is a productised key-gated-open-source project (see `KEY_GATED_OPEN_SOURCE.md`). The conceit: the source is MIT-licensed and public, but the runtime (or canonical test corpus, or fixtures) is encrypted with a key bundled under a commercial licence. People can build it themselves from source if they know what they're doing; the key buys a supported, working bundle.

The issue body is the first acceptance criterion for the *first* feature: a test reads a text file, and fails if the file is not encrypted. That's the smallest slice of the scheme — proves the encryption plumbing works end-to-end before any bigger feature is wired.

Relation to this repo: battery-pack lives under `_developers/backlog/battery-pack/` but is ultimately meant to be its own repo / npm package. This repo's role is to host the design during incubation. The DIY Accounting product doesn't directly depend on it today.

## Likely source files to change

- Promote `_developers/backlog/battery-pack/` to a live location:
  - Option A — a new repo `antonycc/battery-pack` (clean for open-source).
  - Option B — `packages/battery-pack/` inside this repo (faster to iterate).
- New `packages/battery-pack/tests/read-encrypted.test.js` — the test specified in the issue. Asserts reading an encrypted fixture returns plaintext when the key is present; reading an unencrypted fixture throws.
- Scripts in `battery-pack/scripts/` — ensure `encrypt.sh` / `decrypt.sh` work on CI macOS and Linux.
- CI workflow `.github/workflows/battery-pack.yml` — lints + tests + packages the module.

## Likely tests to change/add

- **New** Vitest test covering the core behaviour:
  - Given an encrypted text fixture + the decryption key env var, reading returns the plaintext.
  - Given an unencrypted text fixture (no cipher header) + the decryption key, the read throws a clear error.
  - Given an encrypted fixture but no key, the read throws a different, clear error.
- Integration test: run the `encrypt.sh` → `decrypt.sh` round trip on a fixture.

## Likely docs to change

- `_developers/backlog/battery-pack/README.md` → promote to the package root.
- `_developers/backlog/battery-pack/KEY_GATED_OPEN_SOURCE.md` → promote.
- `_developers/backlog/battery-pack/CLAUDE.md` → promote (agent guidance for contributors).
- New top-level `CONTRIBUTING.md` in the battery-pack package.

## Acceptance criteria

1. `npm test` inside `packages/battery-pack/` (or the new repo) runs and includes the "read text file; fail if not encrypted" test.
2. A CI run passes.
3. The test fails deterministically if someone removes the encryption wrapper from a fixture (proving the test catches the regression).
4. The decryption key is loaded from an env var (not hard-coded), and the test can run in CI with that env var set via GitHub Actions Secret.
5. Licence notice in `README.md` makes it clear what's MIT vs what's commercial.

## Implementation approach

**Recommended — promote the prototype; ship the smallest acceptance test; grow from there.**

1. Move `_developers/backlog/battery-pack/` → `packages/battery-pack/` (keep the existing structure).
2. Add one Vitest spec implementing the issue's stated test.
3. Wire a GitHub Actions workflow to run the test.
4. Write up the encryption scheme decision: which cipher (recommend AES-256-GCM), which KDF, which serialisation header.
5. Once proven, extract to its own repo under `antonycc/battery-pack` and adjust this repo's reference.

### Alternative A — stay in `_developers/backlog/`
Keep the prototype dormant. Rejected: issue is explicit about wanting a live test.

### Alternative B — spawn `antonycc/battery-pack` immediately
Cleaner for open-source but slower to iterate while the design is unstable.

## Questions (for QUESTIONS.md)

- Q646.1: Which cipher/KDF scheme? (Recommendation: AES-256-GCM + PBKDF2-SHA256 or scrypt.)
- Q646.2: Promote to `packages/` (Alt A direction) or spawn own repo now (Alt B)?
- Q646.3: Key distribution for customers — what mechanism? (Out of scope for this issue, but relevant for the acceptance test's "with key / without key" paths.)
- Q646.4: Does this feed into the MCP Server issue (#648) or metric-son (#645) as a distribution/packaging model?

## Good fit for Copilot?

Yes for the promotion + test scaffolding. The cryptography choice should be human-signed.
