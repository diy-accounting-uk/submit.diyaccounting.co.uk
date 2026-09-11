// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/ga4KeyEventsSync.test.js

import { describe, test, expect } from "vitest";

import { parseArgs, readGa4Config, groupByEventName, buildPlan } from "../../../scripts/ga4-key-events-sync.js";

describe("parseArgs", () => {
  test("defaults to a dry run", () => {
    expect(parseArgs([])).toEqual({ apply: false });
  });

  test("reads --apply", () => {
    expect(parseArgs(["--apply"])).toEqual({ apply: true });
  });

  test("rejects an unknown argument", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/Unknown argument/);
  });
});

describe("readGa4Config", () => {
  test("reads the property id and key events from google/analytics.toml", () => {
    const { propertyId, keyEvents } = readGa4Config();

    expect(propertyId).toBe("523400333");
    expect(keyEvents).toEqual({
      subscribe: "purchase",
      submit: "submit_vat_return",
      donate: "purchase",
      download: "runner_download",
    });
  });
});

describe("groupByEventName", () => {
  test("groups labels that share one GA4 event name", () => {
    const grouped = groupByEventName({ subscribe: "purchase", donate: "purchase", submit: "submit_vat_return" });

    expect(grouped.get("purchase")).toEqual(["subscribe", "donate"]);
    expect(grouped.get("submit_vat_return")).toEqual(["submit"]);
  });
});

describe("buildPlan", () => {
  const keyEvents = { subscribe: "purchase", donate: "purchase", submit: "submit_vat_return", download: "runner_download" };

  test("proposes creating every event name when none is marked yet", () => {
    const plan = buildPlan({ keyEvents, existingKeyEvents: [] });

    expect(plan).toHaveLength(3);
    expect(plan.every((item) => item.action === "create")).toBe(true);
    const purchaseItem = plan.find((item) => item.eventName === "purchase");
    expect(purchaseItem.labels).toEqual(["subscribe", "donate"]);
  });

  test("does not propose a duplicate for an event name already marked", () => {
    const plan = buildPlan({
      keyEvents,
      existingKeyEvents: [{ name: "properties/523400333/keyEvents/1", eventName: "purchase" }],
    });

    const purchaseItem = plan.find((item) => item.eventName === "purchase");
    expect(purchaseItem).toMatchObject({ action: "noop", existingName: "properties/523400333/keyEvents/1" });

    const submitItem = plan.find((item) => item.eventName === "submit_vat_return");
    expect(submitItem.action).toBe("create");
  });

  test("reports every name in sync once the property has marked them all", () => {
    const plan = buildPlan({
      keyEvents,
      existingKeyEvents: [
        { name: "properties/523400333/keyEvents/1", eventName: "purchase" },
        { name: "properties/523400333/keyEvents/2", eventName: "submit_vat_return" },
        { name: "properties/523400333/keyEvents/3", eventName: "runner_download" },
      ],
    });

    expect(plan.every((item) => item.action === "noop")).toBe(true);
  });
});
