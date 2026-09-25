// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/auth-logout-sign-out.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const widgetSource = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/auth-status.js"), "utf-8");

describe("logout revoke and sign-out", () => {
  let store;
  let fetchMock;
  let gtagMock;

  function loadWidget() {
    // eslint-disable-next-line no-new-func
    new Function(widgetSource)();
  }

  beforeEach(() => {
    store = {};
    fetchMock = vi.fn().mockResolvedValue({ ok: true });
    gtagMock = vi.fn();

    const localStorageStub = {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = String(value);
      },
      removeItem: (key) => {
        delete store[key];
      },
    };
    const sessionStorageStub = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {},
    };

    vi.stubGlobal("localStorage", localStorageStub);
    vi.stubGlobal("sessionStorage", sessionStorageStub);
    vi.stubGlobal("fetch", fetchMock);
    vi.stubGlobal("gtag", gtagMock);
    vi.stubGlobal("document", {
      readyState: "complete",
      documentElement: { dataset: { simulator: "true" } },
      querySelector: () => null,
      addEventListener: () => {},
    });
    vi.stubGlobal("window", {
      location: { origin: "https://submit.test", pathname: "/", href: "", reload: vi.fn() },
      addEventListener: () => {},
      localStorage: localStorageStub,
      sessionStorage: sessionStorageStub,
      envReady: Promise.resolve({ COGNITO_BASE_URI: "https://auth.example.com/", COGNITO_CLIENT_ID: "client123" }),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("revokes the refresh token at Cognito before the stored session is cleared", async () => {
    store.userInfo = JSON.stringify({ sub: "abc", email: "someone@example.com" });
    store.cognitoRefreshToken = "the-refresh-token";
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    const revokeCall = fetchMock.mock.calls.find(([url]) => url === "https://auth.example.com/oauth2/revoke");
    expect(revokeCall).toBeDefined();
    expect(revokeCall[1].method).toBe("POST");
    expect(revokeCall[1].keepalive).toBe(true);
    expect(revokeCall[1].body).toBe("token=the-refresh-token&client_id=client123");
  });

  it("posts to the sign-out route with the access token, keepalive", async () => {
    store.userInfo = JSON.stringify({ sub: "abc", email: "someone@example.com" });
    store.cognitoAccessToken = "the-access-token";
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    const signOutCall = fetchMock.mock.calls.find(([url]) => url === "/api/v1/session/sign-out");
    expect(signOutCall).toBeDefined();
    expect(signOutCall[1].method).toBe("POST");
    expect(signOutCall[1].keepalive).toBe(true);
    expect(signOutCall[1].headers.Authorization).toBe("Bearer the-access-token");
  });

  it("skips the revoke call when there is no refresh token to revoke", async () => {
    store.cognitoAccessToken = "the-access-token";
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    expect(fetchMock.mock.calls.some(([url]) => url === "https://auth.example.com/oauth2/revoke")).toBe(false);
  });

  it("skips the sign-out call when there is no access token", async () => {
    store.cognitoRefreshToken = "the-refresh-token";
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    expect(fetchMock.mock.calls.some(([url]) => url === "/api/v1/session/sign-out")).toBe(false);
  });

  it("pushes a GA4 logout event", async () => {
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    expect(gtagMock).toHaveBeenCalledWith("event", "logout");
  });

  it("reads the tokens before the stored session is cleared", async () => {
    store.cognitoAccessToken = "the-access-token";
    store.cognitoRefreshToken = "the-refresh-token";
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    expect(fetchMock.mock.calls.some(([url]) => url === "/api/v1/session/sign-out")).toBe(true);
    expect(globalThis.localStorage.getItem("cognitoAccessToken")).toBeNull();
    expect(globalThis.localStorage.getItem("cognitoRefreshToken")).toBeNull();
  });

  it("still clears the stored session when the revoke and sign-out calls fail", async () => {
    store.cognitoAccessToken = "the-access-token";
    store.cognitoRefreshToken = "the-refresh-token";
    fetchMock.mockRejectedValue(new Error("offline"));
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    expect(globalThis.localStorage.getItem("cognitoAccessToken")).toBeNull();
  });

  describe("outside the simulator, without env-loader.js on the page", () => {
    beforeEach(() => {
      // Not every page that carries auth-status.js also loads env-loader.js, so
      // window.envReady can be undefined here — logout() must not depend on it.
      globalThis.document.documentElement.dataset.simulator = "false";
      delete globalThis.window.envReady;
    });

    it("still clears the stored session and reloads when window.envReady was never set", async () => {
      store.userInfo = JSON.stringify({ sub: "abc", email: "someone@example.com" });
      loadWidget();

      await globalThis.window.AuthStatus.logout();

      expect(globalThis.localStorage.getItem("userInfo")).toBeNull();
      expect(globalThis.window.location.reload).toHaveBeenCalled();
    });

    it("still clears the stored session and reloads when window.envReady rejects", async () => {
      store.userInfo = JSON.stringify({ sub: "abc", email: "someone@example.com" });
      globalThis.window.envReady = Promise.reject(new Error("Failed to load /submit.env"));
      loadWidget();

      await globalThis.window.AuthStatus.logout();

      expect(globalThis.localStorage.getItem("userInfo")).toBeNull();
      expect(globalThis.window.location.reload).toHaveBeenCalled();
    });

    it("redirects to the Cognito logout endpoint when window.envReady resolves with the values", async () => {
      store.userInfo = JSON.stringify({ sub: "abc", email: "someone@example.com" });
      globalThis.window.envReady = Promise.resolve({
        COGNITO_BASE_URI: "https://auth.example.com/",
        COGNITO_CLIENT_ID: "client123",
      });
      loadWidget();

      await globalThis.window.AuthStatus.logout();

      expect(globalThis.window.location.href).toContain("https://auth.example.com/logout?");
      expect(globalThis.window.location.href).toContain("client_id=client123");
    });
  });
});
