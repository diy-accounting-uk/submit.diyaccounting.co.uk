// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/trustedEvents/deadlineFacts.js
//
// Facts from the two scheduled reads: Route 53 Domains expiry and the Companies House profile.
// A fact exists for a deadline 60 days away or less, and for a domain with auto renew off.

import { bucketFor } from "./acmFact.js";

export const COMPANY_NUMBER = "06846849";
const DAY_MS = 24 * 60 * 60 * 1000;
const DEADLINE_BUCKETS = [60, 30, 14, 7, 1, 0];
const WINDOW_DAYS = 60;

const utcDay = (value) => {
  const date = new Date(value);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
};

/** Whole UTC calendar days from `now` to `target`; negative once the date has passed. */
export function daysUntil(target, now) {
  return Math.round((utcDay(target) - utcDay(now)) / DAY_MS);
}

const isoDay = (value) => new Date(value).toISOString().slice(0, 10);

export function domainFacts(domains, now) {
  const facts = [];
  for (const domain of domains) {
    const days = daysUntil(domain.Expiry, now);
    const autoRenewOff = domain.AutoRenew === false;
    if (days > WINDOW_DAYS && !autoRenewOff) continue;
    const expiry = isoDay(domain.Expiry);
    facts.push({
      source: "route53domains",
      sourceLabel: "domain",
      key: `domain:${domain.DomainName}:${expiry}`,
      version: autoRenewOff ? "autorenew-off" : `days:${bucketFor(days, DEADLINE_BUCKETS)}`,
      subject: `${domain.DomainName} expires ${expiry}${autoRenewOff ? " (auto renew off)" : ""}`,
      region: "us-east-1",
      days,
      lines: [
        ["Domain", domain.DomainName],
        ["Expiry", expiry],
        ["Days to expiry", days],
        ["Auto renew", domain.AutoRenew],
        ["Transfer lock", domain.TransferLock],
      ],
    });
  }
  return facts;
}

function deadlineFact({ profile, slug, label, dueOn, madeUpTo, overdue, now }) {
  if (!dueOn) throw new Error(`Companies House profile has no due date for ${label}`);
  const days = daysUntil(dueOn, now);
  if (days > WINDOW_DAYS && overdue !== true) return null;
  return {
    source: "companies-house",
    sourceLabel: "companies-house",
    key: `ch:${COMPANY_NUMBER}:${slug}:${dueOn}`,
    version: overdue === true ? "overdue" : `days:${bucketFor(days, DEADLINE_BUCKETS)}`,
    subject: `DIY Accounting Limited ${label} due ${dueOn}`,
    region: "eu-west-2",
    days,
    lines: [
      ["Company", `${COMPANY_NUMBER} ${profile.company_name}`],
      ["Deadline", label],
      ["Due", dueOn],
      ["Made up to", madeUpTo],
      ["Days to due", days],
      ["Overdue", overdue === true],
    ],
  };
}

export function companiesHouseFacts(profile, now) {
  const accounts = deadlineFact({
    profile,
    slug: "accounts",
    label: "annual accounts",
    dueOn: profile.accounts?.next_accounts?.due_on,
    madeUpTo: profile.accounts?.next_accounts?.period_end_on,
    overdue: profile.accounts?.overdue,
    now,
  });
  const statement = deadlineFact({
    profile,
    slug: "confirmation-statement",
    label: "confirmation statement",
    dueOn: profile.confirmation_statement?.next_due,
    madeUpTo: profile.confirmation_statement?.next_made_up_to,
    overdue: profile.confirmation_statement?.overdue,
    now,
  });
  return [accounts, statement].filter(Boolean);
}
