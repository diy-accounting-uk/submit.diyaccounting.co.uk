// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BUNDLE_READ_TIMEOUT_MS, fetchBundleResponse } from "../public/lib/services/viewer-settings.js";

describe("the bundle read the viewer settings make", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("localStorage", { getItem: () => "test-id-token" });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("answers null once the bundle read has given no answer in the time limit", async () => {
    vi.stubGlobal("window", { fetchWithIdToken: () => new Promise(() => {}) });
    const read = fetchBundleResponse();
    await vi.advanceTimersByTimeAsync(BUNDLE_READ_TIMEOUT_MS);
    await expect(read).resolves.toBeNull();
  });

  it("answers null once the cached bundle read has given no answer in the time limit", async () => {
    vi.stubGlobal("window", { requestCache: { getJSON: () => new Promise(() => {}) } });
    const read = fetchBundleResponse();
    await vi.advanceTimersByTimeAsync(BUNDLE_READ_TIMEOUT_MS);
    await expect(read).resolves.toBeNull();
  });

  it("answers the bundle response a read gives within the time limit", async () => {
    const response = { bundles: [], settings: { passGeneration: false } };
    vi.stubGlobal("window", { requestCache: { getJSON: async () => response } });
    await expect(fetchBundleResponse()).resolves.toEqual(response);
  });
});
