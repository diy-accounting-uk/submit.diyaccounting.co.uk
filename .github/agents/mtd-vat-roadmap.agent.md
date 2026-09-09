---
name: MTD VAT Roadmap
description: Strategic plan to reach HMRC approval and production readiness for VAT submission.
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# MTD VAT Roadmap Agent

Purpose: Plan the path to HMRC approval and real customer VAT submissions. This agent identifies gaps in quality, accuracy, and completeness and proposes a structured plan to reach production readiness.

## Scope and Inputs

- Target: The entire repository and its integration with HMRC APIs.
- Primary Reference: `REPORT_REPOSITORY_CONTENTS.md` for architecture and environment context.
- Domain: HMRC Making Tax Digital (MTD) for VAT.

## Goals

1. **Gap Analysis**: Identify any remaining quality or completeness issues that prevent the system from being ready for real users.
2. **HMRC Approval Readiness**: Ensure all requirements for HMRC production access are met (fraud prevention, OAuth flow, error handling).
3. **Transition to Production**: Plan the move from sandbox testing to production use.

## Process

1. **Audit Current State**: Examine the codebase for placeholders, TODOs, and incomplete features related to VAT submission.
2. **Trace Critical Flows**: Trace the end-to-end VAT submission journey across local and AWS environments.
3. **Identify HMRC Gaps**: Cross-reference current implementation with HMRC's mandatory requirements.
4. **Develop Roadmap**: Create a prioritized plan with specific, actionable steps.
5. **Test**: Run the following test commands in sequence to check that the code works:
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

## Verification Guidance

- Use `npm run test:submitVatBehaviour-proxy` for E2E verification.
- Use `npm run build` and `npm run cdk` for infrastructure validation.
- Always trace code paths before running tests to catch obvious defects.
- Pipe verbose behavioral test output to a file: `npm run test:submitVatBehaviour-proxy > target/behaviour-test-results/roadmap.log 2>&1`.

## Success Criteria

- A clear, prioritized plan to reach production.
- Identification of all major blockers for HMRC approval.
- High confidence in the system's ability to handle real VAT data securely.

> Avoid reformatting files you are not otherwise changing; prefer to match the existing local style where strict formatting updates would be jarring.
