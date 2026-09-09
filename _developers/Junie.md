<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

Instructions for Junie to follow:

Orientate yourself with the repository using <repository root>/`REPORT_REPOSITORY_CONTENTS.md`

Use the script section of <repository root>/`package.json` to find the test commands.
The behaviour tests generate too much output for you to read, pipe it to a file.

When considering running tests, first trace the code yourself in both the test
execution path and the same path when the code is deployed to AWS and detect
and resolve bugs found through tracing before running tests.

Avoid unnecessary formatting changes when editing code and do not reformat the lines if code that you are not changing.
Do not re-order imports (I consider this unnecessary formatting formatting).
Only run linting and formatting fix commands `npm run linting-fix && npm run formatting-fix` if specifically asked to fix formatting and linting errors:.

When fixing a bug do not add "fallback" paths that allow a silent failure.

When refactoring the code, change a name everywhere, rather than "compatibility" adaptors.
