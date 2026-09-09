<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

Instructions for Junie to follow:

**Last Updated:** 2026-01-05

## About This File

This file contains guidelines for **Junie** (custom agent). The repository also has guidelines for other AI coding assistants:
- `CLAUDE.md` + `.claude/rules/` - Guidelines for Claude Code (emphasis on autonomous task execution & implementation)
- `.github/copilot-instructions.md` - Guidelines for GitHub Copilot (emphasis on code review & analysis)

Each assistant has complementary strengths - Junie is optimized for continuous testing, iteration, and rapid development cycles.

## Primary References

Orientate yourself with the repository using <repository root>/`REPORT_REPOSITORY_CONTENTS.md`

Use the script section of <repository root>/`package.json` to find the test commands.
Run the following test commands in sequence to check that the code works:
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

The behaviour tests generate too much output for you to read, pipe it to a file.

When considering running tests, first trace the code yourself in both the test
execution path and the same path when the code is deployed to AWS and detect
and resolve bugs found through tracing before running tests.

Avoid unnecessary formatting changes when editing code and do not reformat the lines if code that you are not changing.
Do not re-order imports (I consider this unnecessary formatting formatting).
Only run linting and formatting fix commands `npm run linting-fix && npm run formatting-fix` if specifically asked to fix formatting and linting errors:.

When fixing a bug do not add "fallback" paths that allow a silent failure.

When refactoring the code, change a name everywhere, rather than "compatibility" adaptors.
