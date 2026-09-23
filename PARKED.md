<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Parked during cool-down

- `mcp/lib/finance/mail-invoices.js` resolves `WORKSPACE_ROOT` four directories up from its own file, which lands inside `.claude/worktrees/` when run from a worktree, so the corpus lookup fails there (found by F2d, 2026-09-23; worked around with the `runCorpus` override). Resolve the workspace root from `git rev-parse --git-common-dir` or an explicit argument.
