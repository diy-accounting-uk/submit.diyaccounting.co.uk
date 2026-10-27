<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Inline XBRL document set fixtures

Copied from `app/test/fixtures/ixbrl/` in `diy-accounting-uk/spreadsheets.diyaccounting.co.uk` (main).

- `ixds-two-file/`: `accounts-1.xhtml` holds the header, contexts, units and balance sheet; `accounts-2.xhtml` holds the profit and loss facts and defines no context. Together they read as the `builder-small.xhtml` document.
- `ixds-two-file-disagree/`: the same split; `accounts-2.xhtml` also states `TurnoverRevenue` for the current context with another value.
