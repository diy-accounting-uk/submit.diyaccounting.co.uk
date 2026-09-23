<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Parked during cool-down

- `mcp/lib/finance/mail-invoices.js` resolves `WORKSPACE_ROOT` four directories up from its own file, which lands inside `.claude/worktrees/` when run from a worktree, so the corpus lookup fails there (found by F2d, 2026-09-23; worked around with the `runCorpus` override). Resolve the workspace root from `git rev-parse --git-common-dir` or an explicit argument.
- `mcp/lib/finance/mail-invoices.js` finds invoice totals only in mail bodies through the corpus index; the Hiscox payment schedule (a PDF attachment in `mail/antony@diyaccounting.co.uk/2026/6/12/`) carries the monthly direct-debit amounts it could confirm. Reading the mail mirror's attachments directly, or confirming a direct debit against a payment schedule, would let F2d cite them (found 2026-09-23).
