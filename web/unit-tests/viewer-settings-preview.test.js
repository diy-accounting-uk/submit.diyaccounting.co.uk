// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/viewer-settings-preview.test.js

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function makeStorage(entries = {}) {
  const store = new Map(Object.entries(entries));
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  };
}

function throwingStorage() {
  const fail = () => {
    throw new Error("storage unavailable");
  };
  return { getItem: fail, setItem: fail, removeItem: fail };
}

// A fresh copy of the module, so the account setting one test reads does not reach the next.
async function loadViewerSettings({ storage, accountPreviewFeatures }) {
  vi.resetModules();
  vi.stubGlobal("localStorage", storage);
  const settings = accountPreviewFeatures === undefined ? {} : { previewFeatures: accountPreviewFeatures };
  vi.stubGlobal("window", { requestCache: { getJSON: async () => ({ bundles: [], settings }) } });
  return import("../public/lib/services/viewer-settings.js");
}

describe("whether preview features are on", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", makeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("is off before any choice and before the account's setting is read", async () => {
    const viewerSettings = await loadViewerSettings({ storage: makeStorage({ cognitoIdToken: "id-token" }), accountPreviewFeatures: true });
    expect(viewerSettings.isPreviewOn()).toBe(false);
  });

  it.each([true, false])("with no choice in this browser, follows the account's stored setting (%s)", async (stored) => {
    const viewerSettings = await loadViewerSettings({
      storage: makeStorage({ cognitoIdToken: "id-token" }),
      accountPreviewFeatures: stored,
    });
    const viewer = await viewerSettings.fetchViewer();
    expect(viewerSettings.isPreviewOn()).toBe(stored);
    expect(viewer.preview).toBe(stored);
  });

  it.each([
    ["on", false, true],
    ["off", true, false],
  ])("a choice of %s in this browser wins over the account's setting (%s)", async (choice, stored, expected) => {
    const storage = makeStorage({ cognitoIdToken: "id-token", previewFeatures: choice });
    const viewerSettings = await loadViewerSettings({ storage, accountPreviewFeatures: stored });
    const viewer = await viewerSettings.fetchViewer();
    expect(viewerSettings.isPreviewOn()).toBe(expected);
    expect(viewer.preview).toBe(expected);
  });

  it("keeps a choice in localStorage, on and off, where every tab of the browser reads it", async () => {
    const storage = makeStorage({ cognitoIdToken: "id-token" });
    const viewerSettings = await loadViewerSettings({ storage, accountPreviewFeatures: true });
    await viewerSettings.fetchViewer();
    viewerSettings.setPreviewOn(false);
    expect(storage.getItem("previewFeatures")).toBe("off");
    expect(viewerSettings.isPreviewOn()).toBe(false);
    viewerSettings.setPreviewOn(true);
    expect(storage.getItem("previewFeatures")).toBe("on");
    expect(viewerSettings.isPreviewOn()).toBe(true);
  });

  it("does not read a value left in sessionStorage", async () => {
    vi.stubGlobal("sessionStorage", makeStorage({ previewFeatures: "on" }));
    const viewerSettings = await loadViewerSettings({
      storage: makeStorage({ cognitoIdToken: "id-token" }),
      accountPreviewFeatures: false,
    });
    await viewerSettings.fetchViewer();
    expect(viewerSettings.isPreviewOn()).toBe(false);
  });

  it("follows the account's setting once a save answers it", async () => {
    const viewerSettings = await loadViewerSettings({ storage: makeStorage(), accountPreviewFeatures: undefined });
    window.fetchWithIdToken = async () => ({ ok: true, json: async () => ({ settings: { previewFeatures: true } }) });
    await viewerSettings.updateAccountSetting("previewFeatures", true);
    expect(viewerSettings.isPreviewOn()).toBe(true);
  });

  it("is off when storage throws and the account's setting has not been read", async () => {
    const viewerSettings = await loadViewerSettings({ storage: throwingStorage(), accountPreviewFeatures: true });
    expect(() => viewerSettings.setPreviewOn(true)).not.toThrow();
    expect(viewerSettings.isPreviewOn()).toBe(false);
  });

  it("follows the account's setting when storage throws", async () => {
    const viewerSettings = await loadViewerSettings({ storage: makeStorage(), accountPreviewFeatures: undefined });
    window.fetchWithIdToken = async () => ({ ok: true, json: async () => ({ settings: { previewFeatures: true } }) });
    await viewerSettings.updateAccountSetting("previewFeatures", true);
    vi.stubGlobal("localStorage", throwingStorage());
    expect(viewerSettings.isPreviewOn()).toBe(true);
  });
});

describe("the preview header the fetch wrapper sends", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["on", "on"],
    ["off", undefined],
  ])("follows the choice in this browser (%s)", async (choice, header) => {
    vi.resetModules();
    const originalFetch = vi.fn().mockResolvedValue({ headers: { get: () => null } });
    vi.stubGlobal("localStorage", makeStorage({ previewFeatures: choice }));
    vi.stubGlobal("sessionStorage", makeStorage());
    vi.stubGlobal("document", { body: { dataset: {} } });
    vi.stubGlobal("window", {
      sessionStorage: makeStorage(),
      location: { origin: "https://submit.example" },
      crypto: { getRandomValues: (bytes) => globalThis.crypto.getRandomValues(bytes), randomUUID: () => globalThis.crypto.randomUUID() },
      fetch: originalFetch,
      dispatchEvent: () => true,
    });
    const { installCorrelationInterceptor } = await import("../public/lib/utils/correlation-utils.js");
    installCorrelationInterceptor();
    await window.fetch("/api/v1/practice/clients");
    expect(originalFetch.mock.calls[0][1].headers["x-preview-features"]).toBe(header);
  });
});
