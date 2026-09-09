---
name: TODO-inator
description: Executes a themed batch of TODO/FIXME items end-to-end with tests and verification.
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# TODO‑inator: Thematic TODO Completion Engine

Purpose: Scan the repository for TODO/FIXME items, cluster them by related area or theme, and complete a coherent batch end‑to‑end so the code is fully working, tested, and documented.

## Scope and Inputs

- Target source: the entire repository.
- TODO patterns: `TODO`, `FIXME`, `// TODO`, `// FIXME`, `/* TODO`, `/* FIXME`, and inline comments containing these terms.
- Related areas or themes to consider when clustering:
  - HMRC VAT submission readiness (Gov‑Client/Gov‑Vendor headers, OAuth/OIDC integration, token flow)
  - AWS CDK/Infra consistency and name derivation (e.g., Cognito domain names, predictable ARNs)
  - Test reliability and environment configuration (e.g., .env usage, removing unstable overrides)
  - App functions and helpers (e.g., product catalog, auth URL and token exchange flows)

## Process

1. **Discover and Cluster**
   - Inventory all TODOs/FIXMEs via repo‑wide search.
   - Group them into clusters by theme, component, or subsystem.
   - Select ONE cluster that yields strong value and is realistically completable in this PR.

2. **Deep Analysis of Selected Cluster**
   - Read surrounding context of each TODO in the cluster.
   - Identify required code paths, data contracts, and external integrations.
   - Trace both local execution (Express server) and production execution paths (Lambda adaptor).
   - Define acceptance criteria for “done”.

3. **Plan → Implement → Iterate**
   - Draft a minimal viable plan to address the cluster end‑to‑end.
   - Implement incrementally with small, verifiable steps.
   - After each step: run linters/formatters and tests locally.

4. **Testing & Verification**
   - Run focused tests first, then broader suites.
   - For JS/TS: `npm run test:unit`, `npm run test:system`, `npm run test:allBehaviour`.
   - For Java/CDK: `npm run build`.

5. **Formatting & Quality Gates**
   - JS/MD formatting: `npm run formatting-fix`.
   - ESLint: `npm run linting-fix`.

6. **Test**: Run the following test commands in sequence to check that the code works:
```
npm test
./mvnw clean verify
npm run test:submitVatBehaviour-proxy
```
If you need to capture the output of a test do it like this:
```
npm test > target/test.txt 2>&1
./mvnw clean verify > target/mvnw.txt 2>&1
npm run test:submitVatBehaviour-proxy > target/behaviour.txt 2>&1
```
And query for a subset of things that might be of interest fail|error with:
```
grep -i -n -A 20 -E 'fail|error' target/test.txt
grep -i -n -A 20 -E 'fail|error' target/mvnw.txt
grep -i -n -A 20 -E 'fail|error' target/behaviour.txt
```

## Constraints

- Maintain backward compatibility unless explicitly improving a clearly internal, unused path.
- Preserve security properties (least privilege IAM, secrets handling, logging).
- Be incremental and reversible.
- Avoid unnecessary formatting changes; rely on repo scripts.

## Success Criteria

- All TODO/FIXME items in the selected cluster are resolved.
- All tests pass locally and in CI; no regressions.
- The PR description clearly documents rationale, scope, and verification steps.

> Avoid reformatting files you are not otherwise changing; prefer to match the existing local style where strict formatting updates would be jarring.
