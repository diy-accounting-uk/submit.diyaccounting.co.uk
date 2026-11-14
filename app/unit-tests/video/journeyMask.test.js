// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @vitest-environment happy-dom
// app/unit-tests/video/journeyMask.test.js

import { describe, test, expect, afterEach, vi } from "vitest";
import { ONE_TIME_CODE_FIELDS, credentialFieldMaskInitScript } from "../../../scripts/lib/video/journey.js";

// The attributes below are the ones web/public/hmrc/vat/submitVat.html gives its whole-number
// boxes, and the ones the behaviour tests' TOTP step waits on for the hosted page's code input.
const VAT_BOX =
  '<input type="text" id="totalValueSalesExVAT" name="totalValueSalesExVAT" required value="" inputmode="numeric" autocomplete="off" />';
const CODE_INPUT = '<input type="text" name="totpCode" inputmode="numeric" autocomplete="off" />';

function useOrigin(origin) {
  Object.defineProperty(globalThis, "location", { value: { origin }, configurable: true, writable: true });
}

// Runs the init script and returns the DOMContentLoaded handler it registered, so a test applies
// the mask once and no listener or observer outlives it.
function runInitScript(origin) {
  useOrigin(origin);
  vi.stubGlobal(
    "MutationObserver",
    class {
      observe() {}
    },
  );
  const listen = vi.spyOn(document, "addEventListener");
  credentialFieldMaskInitScript({ selectors: ONE_TIME_CODE_FIELDS, appOrigin: "https://app.example.test" });
  const handler = listen.mock.calls.find(([type]) => type === "DOMContentLoaded")?.[1];
  listen.mockRestore();
  return handler;
}

describe("one-time code mask", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.unstubAllGlobals();
  });

  test("the selector matches the code input and a numeric text input alike", () => {
    document.body.innerHTML = CODE_INPUT + VAT_BOX;
    expect(document.querySelectorAll(ONE_TIME_CODE_FIELDS)).toHaveLength(2);
  });

  test("masks the code input on the identity provider's origin", () => {
    document.body.innerHTML = CODE_INPUT;
    runInitScript("https://auth.example.test")();
    expect(document.querySelector("input").style.getPropertyValue("color")).toBe("transparent");
  });

  test("leaves the VAT form's numeric boxes clear on the app's origin", () => {
    document.body.innerHTML = VAT_BOX;
    expect(runInitScript("https://app.example.test")).toBeUndefined();
    expect(document.querySelector("input").style.getPropertyValue("color")).toBe("");
  });
});
