// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/presenter-poll-schedule.js
// When Submit asks Companies House for its decisions on its own: the scheduled presenter poll runs
// every 15 minutes from 07:00 to 18:45 UTC, Monday to Friday (CompaniesHouseStack's schedule), the
// hours Companies House checks filings by hand.

export const SLOT_MINUTES = 15;
export const FIRST_HOUR_UTC = 7;
export const LAST_HOUR_UTC = 18;

const SLOT_MS = SLOT_MINUTES * 60 * 1000;
const WEEK_SLOTS = (7 * 24 * 60) / SLOT_MINUTES;

function isScheduled(slot) {
  const day = slot.getUTCDay();
  const hour = slot.getUTCHours();
  return day >= 1 && day <= 5 && hour >= FIRST_HOUR_UTC && hour <= LAST_HOUR_UTC;
}

/**
 * The scheduled checks either side of a moment: the last at or before it and the next after it.
 * @param {Date} now
 * @returns {{last: Date, next: Date}}
 */
export function scheduledChecks(now = new Date()) {
  const floor = Math.floor(now.getTime() / SLOT_MS) * SLOT_MS;
  let last = null;
  for (let index = 0; index <= WEEK_SLOTS && !last; index++) {
    const slot = new Date(floor - index * SLOT_MS);
    if (isScheduled(slot)) last = slot;
  }
  let next = null;
  for (let index = 1; index <= WEEK_SLOTS && !next; index++) {
    const slot = new Date(floor + index * SLOT_MS);
    if (isScheduled(slot)) next = slot;
  }
  return { last, next };
}
