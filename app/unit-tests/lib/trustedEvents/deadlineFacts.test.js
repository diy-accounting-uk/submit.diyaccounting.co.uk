// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { domainFacts, companiesHouseFacts, daysUntil } from "@app/lib/trustedEvents/deadlineFacts.js";

const NOW = new Date("2026-11-05T07:00:00Z");
const inDays = (days) => new Date(Date.UTC(2026, 10, 5 + days));

describe("daysUntil", () => {
  test("counts UTC calendar days", () => {
    expect(daysUntil(inDays(60), NOW)).toBe(60);
    expect(daysUntil(inDays(-3), NOW)).toBe(-3);
  });
});

describe("domainFacts", () => {
  const domain = (days, overrides = {}) => ({
    DomainName: "example.com",
    AutoRenew: true,
    TransferLock: true,
    Expiry: inDays(days),
    ...overrides,
  });

  test("61 days gives no fact", () => {
    expect(domainFacts([domain(61)], NOW)).toEqual([]);
  });

  test("60 days gives one fact in the 60 bucket", () => {
    const [fact] = domainFacts([domain(60)], NOW);
    expect(fact.version).toBe("days:60");
    expect(fact.key).toBe("domain:example.com:2027-01-04");
    expect(fact.days).toBe(60);
    expect(fact.subject).toBe("example.com expires 2027-01-04");
    expect(fact.lines.map(([name]) => name)).toEqual(["Domain", "Expiry", "Days to expiry", "Auto renew", "Transfer lock"]);
  });

  test.each([
    [31, "days:60"],
    [30, "days:30"],
    [8, "days:14"],
    [0, "days:0"],
    [-4, "days:0"],
  ])("%s days gives %s", (days, version) => {
    expect(domainFacts([domain(days)], NOW)[0].version).toBe(version);
  });

  test("auto renew off gives a fact however far the expiry is, and takes the place of the bucket", () => {
    const [fact] = domainFacts([domain(300, { AutoRenew: false })], NOW);
    expect(fact.version).toBe("autorenew-off");
    expect(fact.subject.endsWith("(auto renew off)")).toBe(true);
  });
});

describe("companiesHouseFacts", () => {
  const profile = (accountsDays, statementDays, overrides = {}) => ({
    company_name: "EXAMPLE LIMITED",
    accounts: {
      next_accounts: { due_on: inDays(accountsDays).toISOString().slice(0, 10), period_end_on: "2026-03-31" },
      overdue: false,
    },
    confirmation_statement: {
      next_due: inDays(statementDays).toISOString().slice(0, 10),
      next_made_up_to: "2026-12-01",
      overdue: false,
    },
    ...overrides,
  });

  test("61 days gives no fact", () => {
    expect(companiesHouseFacts(profile(61, 61), NOW)).toEqual([]);
  });

  test("60 days gives one fact for the deadline that is within reach", () => {
    const facts = companiesHouseFacts(profile(60, 200), NOW);
    expect(facts).toHaveLength(1);
    expect(facts[0].key).toBe("ch:06846849:accounts:2027-01-04");
    expect(facts[0].version).toBe("days:60");
    expect(facts[0].subject).toBe("DIY Accounting Limited annual accounts due 2027-01-04");
    expect(facts[0].lines.map(([name]) => name)).toEqual(["Company", "Deadline", "Due", "Made up to", "Days to due", "Overdue"]);
  });

  test("the confirmation statement has its own key", () => {
    const facts = companiesHouseFacts(profile(200, 10), NOW);
    expect(facts[0].key).toBe("ch:06846849:confirmation-statement:2026-11-15");
    expect(facts[0].version).toBe("days:14");
  });

  test("an overdue deadline gives a fact at any distance, with version overdue", () => {
    const base = profile(300, 300);
    base.accounts.overdue = true;
    const [fact] = companiesHouseFacts(base, NOW);
    expect(fact.version).toBe("overdue");
  });

  test("a missing due date throws", () => {
    const base = profile(10, 10);
    delete base.accounts.next_accounts.due_on;
    expect(() => companiesHouseFacts(base, NOW)).toThrow("no due date");
  });
});
