// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/services/microEntityAccountsIxbrl.js
// Placeholder pending the FRS 105 micro-entity iXBRL generator. Every Lambda that calls
// buildMicroEntityAccounts mocks this module in its unit tests, so this stub only needs to exist
// so those imports resolve; it must be replaced by the real generator before this filing works.

export function buildMicroEntityAccounts() {
  throw new Error("buildMicroEntityAccounts is not implemented yet");
}
