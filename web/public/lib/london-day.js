// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/london-day.js
// The first and last instant of a UK calendar day, as ISO strings: midnight in Europe/London, which
// is 23:00 the day before in UTC while British Summer Time runs and 00:00 in UTC otherwise.

(function () {
  "use strict";

  const LONDON_PARTS = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  // How far London's clock is ahead of UTC at an instant, in milliseconds.
  function londonOffset(instant) {
    const part = Object.fromEntries(LONDON_PARTS.formatToParts(new Date(instant)).map(({ type, value }) => [type, Number(value)]));
    const londonAsUtc = Date.UTC(part.year, part.month - 1, part.day, part.hour, part.minute, part.second);
    return londonAsUtc - Math.floor(instant / 1000) * 1000;
  }

  // Midnight in London at the start of a YYYY-MM-DD day, in milliseconds since the epoch.
  function londonMidnight(isoDay) {
    const [year, month, day] = isoDay.split("-").map(Number);
    const midnightAsUtc = Date.UTC(year, month - 1, day);
    const guess = midnightAsUtc - londonOffset(midnightAsUtc);
    return midnightAsUtc - londonOffset(guess);
  }

  /** The first instant of a YYYY-MM-DD day in the UK, as an ISO string. */
  function startOfLondonDay(isoDay) {
    return new Date(londonMidnight(isoDay)).toISOString();
  }

  /** The last instant of a YYYY-MM-DD day in the UK, as an ISO string. */
  function endOfLondonDay(isoDay) {
    const [year, month, day] = isoDay.split("-").map(Number);
    const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
    return new Date(londonMidnight(next) - 1).toISOString();
  }

  window.londonDay = { startOfLondonDay, endOfLondonDay };
})();
