// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/mockIdentity.js

/** The email claim the mock and simulator identity providers sign a test username in with. */
export function mockIdentityEmail(testAuthUsername) {
  return `synthetic-${testAuthUsername}@test.diyaccounting.co.uk`;
}
