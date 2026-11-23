// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/dueListCount.js
// The due list's count item: how many businesses and rows an account holds, with reservations for
// items a write is still writing. The repository and the salt rotation both read these.

/** The sort key of an account's count item. */
export const COUNT_SK = "count";

/**
 * How long after a count last moved it may still hold a reservation for items being written. Longer
 * than any write takes. A count moved more recently is neither replaced by a count of the items nor
 * deleted by a salt rotation.
 */
export const COUNT_SETTLE_MS = 60_000;
