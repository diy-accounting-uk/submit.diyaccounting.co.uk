<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Inline XBRL document set fixtures

Built by `ixdsTwoFileSets()` in `app/test-helpers/accountsDocumentCases.js` from the small company case, for MILLENNIUM STADIUM PLC. `web/unit-tests/ixdsFixtures.test.js` fails when a committed file differs from what the helper builds; `npm run fixtures:ixds` writes them again from the helper. The helper states a fixed software version (`IXDS_FIXTURE_SOFTWARE_VERSION`), so a release of the package leaves them as they are.

- `ixds-two-file/`: `accounts-1.xhtml` holds the header, contexts, units and every page but the profit and loss account; `accounts-2.xhtml` holds the profit and loss facts and defines no context. Together they read as the one document the builder makes.
- `ixds-two-file-disagree/`: the same split; `accounts-2.xhtml` also states `TurnoverRevenue` for the current context with another value.
