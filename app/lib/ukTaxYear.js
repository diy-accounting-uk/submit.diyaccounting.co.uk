// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/ukTaxYear.js

/** The UK tax year a UTC instant falls in, as "2026-27"; the year starts on 6 April. */
export function taxYearOf(date) {
  const year = date.getUTCFullYear();
  const startsThisYear = date.getUTCMonth() > 3 || (date.getUTCMonth() === 3 && date.getUTCDate() >= 6);
  const startYear = startsThisYear ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}
