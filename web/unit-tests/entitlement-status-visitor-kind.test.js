// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/entitlement-status-visitor-kind.test.js
// Confirms the entitlement widget flags a browser that holds the operator bundle, and sets the
// GA4 visitor_kind user property on the same page so that page's later events carry it.

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const widgetSource = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/entitlement-status.js"), "utf-8");

function loadWidget({ bundles, withGtag = true }) {
  const stored = new Map([["cognitoIdToken", "token"]]);
  const localStorage = {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, value),
  };
  const gtag = vi.fn();
  const window = {
    requestCache: { getJSON: vi.fn(async () => ({ bundles })) },
    ...(withGtag ? { gtag } : {}),
  };
  const document = { readyState: "loading", addEventListener: vi.fn(), querySelector: () => null };
  const context = vm.createContext({ window, document, localStorage, console: { warn: vi.fn(), log: vi.fn() } });
  vm.runInContext(widgetSource, context);
  return { window, gtag, stored };
}

describe("entitlement widget operator flag", () => {
  it("sets the operator flag and the GA4 visitor_kind user property when the operator bundle is allocated", async () => {
    const { window, gtag, stored } = loadWidget({ bundles: [{ bundleId: "operator", allocated: true }] });

    await window.__entitlementStatus.fetchUserBundles();

    expect(stored.get("visitorKind.operator")).toBe("1");
    expect(gtag).toHaveBeenCalledWith("set", "user_properties", { visitor_kind: "operator" });
  });

  it("leaves the user property alone for a browser without the operator bundle", async () => {
    const { window, gtag, stored } = loadWidget({ bundles: [{ bundleId: "day-guest", allocated: true }] });

    await window.__entitlementStatus.fetchUserBundles();

    expect(stored.has("visitorKind.operator")).toBe(false);
    expect(gtag).not.toHaveBeenCalled();
  });

  it("still sets the operator flag on a page that has not loaded the GA4 client", async () => {
    const { window, stored } = loadWidget({ bundles: [{ bundleId: "operator", allocated: true }], withGtag: false });

    await window.__entitlementStatus.fetchUserBundles();

    expect(stored.get("visitorKind.operator")).toBe("1");
  });
});
