// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// web/unit-tests/auth-logout-beacon.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const widgetSource = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/auth-status.js"), "utf-8");

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

function idTokenWith(payload) {
  return `${b64url({ alg: "none" })}.${b64url(payload)}.`;
}

describe("logout beacon", () => {
  let beacons;
  let store;

  function loadWidget() {
    // eslint-disable-next-line no-new-func
    new Function(widgetSource)();
  }

  function beaconBodies() {
    return beacons.map(({ body }) => JSON.parse(body));
  }

  beforeEach(() => {
    beacons = [];
    store = {};

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
    vi.stubGlobal(
      "Blob",
      class {
        constructor(parts, options) {
          this.parts = parts;
          this.type = options?.type;
        }
      },
    );
    vi.stubGlobal("navigator", {
      sendBeacon: (url, blob) => {
        beacons.push({ url, type: blob.type, body: blob.parts.join("") });
        return true;
      },
    });
    vi.stubGlobal("atob", (value) => Buffer.from(value, "base64").toString("binary"));
    vi.stubGlobal("document", {
      readyState: "complete",
      documentElement: { dataset: { simulator: "true" } },
      querySelector: () => null,
      addEventListener: () => {},
    });
    vi.stubGlobal("window", {
      location: { origin: "https://submit.test", pathname: "/", href: "" },
      addEventListener: () => {},
      localStorage: localStorageStub,
      sessionStorage: sessionStorageStub,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reports the account that is leaving, with the provider it signed in through", async () => {
    store.userInfo = JSON.stringify({ sub: "abc", email: "someone@example.com" });
    store.cognitoIdToken = idTokenWith({ identities: [{ providerName: "Google" }] });
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    expect(beacons).toHaveLength(1);
    expect(beacons[0].url).toBe("/api/session/beacon");
    expect(beacons[0].type).toBe("application/json");
    expect(beaconBodies()[0]).toEqual({ event: "logout", email: "someone@example.com", provider: "Google" });
  });

  it("reads the provider when Cognito sends the identities claim as a JSON string", async () => {
    store.userInfo = JSON.stringify({ sub: "abc", email: "someone@gmail.com" });
    store.cognitoIdToken = idTokenWith({ identities: JSON.stringify([{ providerName: "Google", userId: "123" }]) });
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    expect(beaconBodies()[0].provider).toBe("Google");
  });

  it("still reports a logout when the ID token names no provider", async () => {
    store.userInfo = JSON.stringify({ sub: "abc", email: "someone@example.com" });
    store.cognitoIdToken = idTokenWith({ sub: "abc" });
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    expect(beaconBodies()[0]).toEqual({ event: "logout", email: "someone@example.com", provider: "" });
  });

  it("sends nothing when no one is signed in", async () => {
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    expect(beacons).toHaveLength(0);
  });

  it("sends the beacon before the stored session is cleared", async () => {
    store.userInfo = JSON.stringify({ sub: "abc", email: "someone@example.com" });
    loadWidget();

    await globalThis.window.AuthStatus.logout();

    expect(beaconBodies()[0].email).toBe("someone@example.com");
    expect(globalThis.localStorage.getItem("userInfo")).toBeNull();
  });
});
