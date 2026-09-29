// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/syntheticTestUser.js

const SYNTHETIC_TEST_USER_EMAIL = /^synthetic-[^@\s]+@test\.diyaccounting\.co\.uk$/;

/**
 * True for the durable synthetic test users the automated lanes sign in as
 * (synthetic-<lane>@test.diyaccounting.co.uk). The email comes from a verified token.
 */
export function isSyntheticTestUserEmail(email) {
  return typeof email === "string" && SYNTHETIC_TEST_USER_EMAIL.test(email.trim().toLowerCase());
}
