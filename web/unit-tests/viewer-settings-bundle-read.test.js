// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  BUNDLE_READ_TIMEOUT_MS,
  fetchAccountSettings,
  fetchBundleResponse,
  fetchViewer,
  readBundleResponse,
} from "../public/lib/services/viewer-settings.js";

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

  it("rejects a failed read for a caller that must tell it from an account that holds nothing", async () => {
    const failed = Object.assign(new Error("The bundles could not be read"), { status: 500 });
    vi.stubGlobal("window", { requestCache: { getJSON: async () => Promise.reject(failed) } });
    await expect(readBundleResponse()).rejects.toMatchObject({ status: 500 });
    await expect(fetchAccountSettings()).rejects.toMatchObject({ status: 500 });
    await expect(fetchBundleResponse()).resolves.toBeNull();
  });

  it("gives the catalogue's display rules the default settings when the read fails", async () => {
    vi.stubGlobal("window", { requestCache: { getJSON: async () => Promise.reject(new Error("failed")) } });
    await expect(fetchViewer()).resolves.toMatchObject({ account: { passGeneration: expect.any(Boolean), watchedCompanies: [] } });
  });
});
