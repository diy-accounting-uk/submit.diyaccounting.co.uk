// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/unit-tests/catalog-service.test.js

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

import { isActivityListedInEnvironment, fetchCurrentEnvironmentName } from "../public/lib/services/catalog-service.js";

describe("isActivityListedInEnvironment", () => {
  it("lists an activity in a named environment", () => {
    const activity = { id: "vat-liabilities", environments: ["local", "ci"] };
    expect(isActivityListedInEnvironment(activity, "ci")).toBe(true);
  });

  it("hides an activity from an environment not in its list", () => {
    const activity = { id: "vat-liabilities", environments: ["local", "ci"] };
    expect(isActivityListedInEnvironment(activity, "prod")).toBe(false);
  });

  it("lists an activity with no environments field everywhere", () => {
    const activity = { id: "submit-vat" };
    expect(isActivityListedInEnvironment(activity, "prod")).toBe(true);
    expect(isActivityListedInEnvironment(activity, "ci")).toBe(true);
  });

  it("hides a restricted activity when the current environment is unknown", () => {
    const activity = { id: "vat-liabilities", environments: ["local", "ci"] };
    expect(isActivityListedInEnvironment(activity, null)).toBe(false);
  });
});

describe("fetchCurrentEnvironmentName", () => {
  beforeEach(() => {
    global.fetch = vi.fn();
    vi.stubGlobal("fetch", global.fetch);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("returns the trimmed body of submit.environment-name.txt", async () => {
    global.fetch.mockResolvedValue({ ok: true, text: () => Promise.resolve("ci\n") });

    const name = await fetchCurrentEnvironmentName();

    expect(global.fetch).toHaveBeenCalledWith("/submit.environment-name.txt", { cache: "no-store" });
    expect(name).toBe("ci");
  });

  it("returns null when the file cannot be fetched", async () => {
    global.fetch.mockResolvedValue({ ok: false });

    expect(await fetchCurrentEnvironmentName()).toBeNull();
  });

  it("returns null when fetch throws", async () => {
    global.fetch.mockRejectedValue(new Error("network error"));

    expect(await fetchCurrentEnvironmentName()).toBeNull();
  });
});
