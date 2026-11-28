// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/entitlement-status-visitor-kind.test.js
// Confirms the entitlement widget flags a browser that holds the operator bundle, and sets the
// GA4 visitor_kind user property on the same page so that page's later events carry it. Also
// renders the header's "requires" status on a Welsh and an English page from the real catalogue.

import { describe, it, expect, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import TOML from "@iarna/toml";

const widgetSource = fs.readFileSync(path.join(process.cwd(), "web/public/widgets/entitlement-status.js"), "utf-8");

function loadWidget({ bundles = [], withGtag = true, language = "en" } = {}) {
  const stored = new Map([["cognitoIdToken", "token"]]);
  const localStorage = {
    getItem: (key) => (stored.has(key) ? stored.get(key) : null),
    setItem: (key, value) => stored.set(key, value),
  };
  const gtag = vi.fn();
  const window = {
    requestCache: { getJSON: vi.fn(async () => ({ bundles })) },
    ...(withGtag ? { gtag } : {}),
    ...(language === "cy" ? welshChrome() : {}),
  };
  const document = { readyState: "loading", addEventListener: vi.fn(), querySelector: () => null };
  const context = vm.createContext({ window, document, localStorage, console: { warn: vi.fn(), log: vi.fn() } });
  vm.runInContext(widgetSource, context);
  return { window, gtag, stored };
}

// What page-chrome.js gives a Welsh page: the language choice and siteText over welsh-text.js.
function welshChrome() {
  const holder = { window: {} };
  vm.runInContext(fs.readFileSync(path.join(process.cwd(), "web/public/lib/welsh-text.js"), "utf-8"), vm.createContext(holder));
  const welsh = holder.window.WELSH_TEXT;
  return {
    siteLanguage: { chrome: () => "cy" },
    siteText: (id, english, values) =>
      (welsh[id] ?? english).replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)),
  };
}

const catalogue = TOML.parse(fs.readFileSync(path.join(process.cwd(), "web/public/submit.catalogue.toml"), "utf-8"));
const submitVatBundles = catalogue.activities.find((activity) => activity.id === "submit-vat").bundles;

describe("entitlement widget requires status", () => {
  it("names the bundles a Welsh page needs in Welsh, with no English bundle name that has a Welsh entry", () => {
    const { window } = loadWidget({ language: "cy" });

    const status = window.__entitlementStatus.requiresStatus(catalogue, submitVatBundles);

    expect(status.style).toBe("requires");
    expect(status.text).toBe("Gweithgaredd: angen Tocyn diwrnod, Tocyn wythnos, Gwestai drwy wahoddiad, Resident VAT, Gwestai Resident");
    for (const englishName of ["Day pass", "Week pass", "Invited Guest", "Resident Guest", "Activity"]) {
      expect(status.text).not.toContain(englishName);
    }
  });

  it("gives every catalogue bundle a Welsh name, and keeps the Resident product names as the Welsh bundles page does", () => {
    const { window } = loadWidget({ language: "cy" });

    const welshNames = window.__entitlementStatus.getBundleNames(
      catalogue,
      catalogue.bundles.map((bundle) => bundle.id),
    );

    catalogue.bundles.forEach((bundle, index) => {
      if (/^Resident (VAT|Ltd|Pro|Tax Agent)$/.test(bundle.name)) expect(welshNames[index], bundle.id).toBe(bundle.name);
      else expect(welshNames[index], bundle.id).not.toBe(bundle.name);
    });
  });

  it("names the bundles an English page needs with the catalogue's names, as before", () => {
    const { window } = loadWidget();

    const status = window.__entitlementStatus.requiresStatus(catalogue, submitVatBundles);

    expect(status.text).toBe("Activity: requires Day pass, Week pass, Invited Guest, Resident VAT, Resident Guest");
  });
});

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

describe("entitlement widget pass refusal", () => {
  it("names a refusal by our own entitlement check, and nothing else, as wanting a pass", () => {
    const { window } = loadWidget();
    const { isBundleRefusal } = window.EntitlementStatus;

    expect(isBundleRefusal({ code: "BUNDLE_ENTITLEMENT_REQUIRED" })).toBe(true);
    expect(isBundleRefusal({ status: 403, reason: "BUNDLE_FORBIDDEN" })).toBe(true);
    expect(isBundleRefusal(Object.assign(new Error("Forbidden - missing or insufficient bundle entitlement"), { status: 403 }))).toBe(true);
    expect(isBundleRefusal({ status: 403, reason: "tokens_exhausted", message: "No tokens left" })).toBe(false);
    expect(isBundleRefusal(Object.assign(new Error("HMRC did not allow access"), { status: 403 }))).toBe(false);
    expect(isBundleRefusal(undefined)).toBe(false);
  });

  it("shows in Welsh that nothing reached Companies House, with a link to a day pass", () => {
    const { window } = loadWidget({ language: "cy" });
    window.showFailure = vi.fn();

    window.EntitlementStatus.showPassNeeded("companiesHouse");

    const [error, title] = window.showFailure.mock.calls[0];
    expect(title).toBe("Mae angen tocyn arnoch ar gyfer hyn");
    expect(error.failure.cause).toMatch(/^Nid oes dim wedi’i anfon at Dŷ’r Cwmnïau\./);
    expect(error.failure.next).toEqual({ label: "Cael tocyn diwrnod", href: "/cy/bundles.html" });
  });
});
