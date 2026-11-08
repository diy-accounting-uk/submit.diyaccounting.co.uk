// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/recordRetention.test.js

import { describe, test, expect } from "vitest";

import {
  isTestActor,
  passRetention,
  lastUseRetention,
  subscriptionRetention,
  endedSubscriptionRetention,
  receiptRetention,
  figuresRetention,
} from "@app/lib/recordRetention.js";

const NOW = new Date("2026-11-06T12:00:00.000Z");
const NOW_SECONDS = Math.floor(NOW.getTime() / 1000);
const DAY = 86400;

describe("isTestActor", () => {
  test.each(["test-user", "probe"])("%s proves a test actor", (actor) => {
    expect(isTestActor(actor)).toBe(true);
  });

  test.each([undefined, null, "", "customer", "operator", "system", "other"])("%s does not prove a test actor", (actor) => {
    expect(isTestActor(actor)).toBe(false);
  });
});

describe("passRetention", () => {
  test("a test pass lives 2 days from creation", () => {
    expect(passRetention({ testPass: true, validUntil: "2027-01-01T00:00:00.000Z" }, NOW).ttl).toBe(NOW_SECONDS + 2 * DAY);
  });

  test("a pass of a test actor lives 2 days from creation", () => {
    expect(passRetention({ actor: "probe" }, NOW).ttl).toBe(NOW_SECONDS + 2 * DAY);
  });

  test("a real pass with an end date lives 30 days past it", () => {
    const validUntil = "2027-01-01T00:00:00.000Z";
    expect(passRetention({ actor: "customer", validUntil }, NOW).ttl).toBe(Math.floor(new Date(validUntil).getTime() / 1000) + 30 * DAY);
  });

  test("a real pass with no end date has no ttl", () => {
    expect(passRetention({ actor: "operator" }, NOW)).toBeNull();
    expect(passRetention({}, NOW)).toBeNull();
  });

  test("testPass set to a value other than true is not proof", () => {
    expect(passRetention({ testPass: "true" }, NOW)).toBeNull();
    expect(passRetention({ testPass: false }, NOW)).toBeNull();
  });

  test("the datestamp matches the ttl", () => {
    const { ttl, ttl_datestamp } = passRetention({ testPass: true }, NOW);
    expect(ttl_datestamp).toBe(new Date(ttl * 1000).toISOString());
  });
});

describe("lastUseRetention", () => {
  const spent = { pk: "pass#a", maxUses: 1, useCount: 1 };

  test("a pass with no end date and no ttl that used its last use lives 30 days", () => {
    expect(lastUseRetention(spent, NOW).ttl).toBe(NOW_SECONDS + 30 * DAY);
  });

  test("a pass with uses left gets no ttl", () => {
    expect(lastUseRetention({ ...spent, maxUses: 3, useCount: 2 }, NOW)).toBeNull();
  });

  test("a pass with no use cap gets no ttl", () => {
    expect(lastUseRetention({ pk: "pass#a", useCount: 50 }, NOW)).toBeNull();
  });

  test("a pass with an end date gets no new ttl", () => {
    expect(lastUseRetention({ ...spent, validUntil: "2027-01-01T00:00:00.000Z" }, NOW)).toBeNull();
  });

  test("a pass that has a ttl keeps it", () => {
    expect(lastUseRetention({ ...spent, ttl: 123 }, NOW)).toBeNull();
  });

  test("a missing pass gets no ttl", () => {
    expect(lastUseRetention(undefined, NOW)).toBeNull();
  });
});

describe("subscriptionRetention", () => {
  test("a test-mode subscription lives 2 days from creation", () => {
    expect(subscriptionRetention({ test: true }, NOW).ttl).toBe(NOW_SECONDS + 2 * DAY);
  });

  test.each([false, undefined, null])("a subscription with test %s has no ttl", (test_) => {
    expect(subscriptionRetention({ test: test_ }, NOW)).toBeNull();
  });
});

describe("endedSubscriptionRetention", () => {
  const endedAt = new Date("2026-10-01T00:00:00.000Z");

  test("an ended live subscription lives 180 days from the end date", () => {
    expect(endedSubscriptionRetention({ test: false }, endedAt, NOW).ttl).toBe(Math.floor(endedAt.getTime() / 1000) + 180 * DAY);
  });

  test("an ended subscription of unknown mode is treated as live", () => {
    expect(endedSubscriptionRetention({}, endedAt, NOW).ttl).toBe(Math.floor(endedAt.getTime() / 1000) + 180 * DAY);
  });

  test("an ended test-mode subscription lives 2 days from now", () => {
    expect(endedSubscriptionRetention({ test: true }, endedAt, NOW).ttl).toBe(NOW_SECONDS + 2 * DAY);
  });
});

describe("receiptRetention", () => {
  test("a synthetic filing of a test actor lives 2 days", () => {
    expect(receiptRetention({ actor: "test-user", synthetic: true }, NOW).ttl).toBe(NOW_SECONDS + 2 * DAY);
  });

  test("a real filer keeps the 7-year tax record ttl", () => {
    expect(receiptRetention({ actor: "customer", synthetic: false }, NOW).ttl).toBe(NOW_SECONDS + 2555 * DAY);
  });

  test("a customer in a sandbox flow keeps the 7-year ttl", () => {
    expect(receiptRetention({ actor: "customer", synthetic: true }, NOW).ttl).toBe(NOW_SECONDS + 2555 * DAY);
  });

  test("an unknown actor keeps the 7-year ttl", () => {
    expect(receiptRetention({ synthetic: true }, NOW).ttl).toBe(NOW_SECONDS + 2555 * DAY);
  });

  test("a test actor with no synthetic flag keeps the 7-year ttl", () => {
    expect(receiptRetention({ actor: "probe" }, NOW).ttl).toBe(NOW_SECONDS + 2555 * DAY);
  });
});

describe("figuresRetention", () => {
  test("figures live 13 months from the computed time", () => {
    expect(figuresRetention(NOW).ttl_datestamp.slice(0, 10)).toBe("2027-12-06");
  });
});
