// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/carried-identifiers.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const source = fs.readFileSync(path.join(process.cwd(), "web/public/lib/carried-identifiers.js"), "utf-8");

function fakeField(value = "", tagName = "INPUT", options = []) {
  const listeners = {};
  return {
    value,
    tagName,
    options: options.map((v) => ({ value: v })),
    form: null,
    addEventListener: (name, fn) => (listeners[name] ||= []).push(fn),
    fire: (name) => (listeners[name] || []).forEach((fn) => fn()),
  };
}

describe("carried identifiers", () => {
  let store;
  let api;

  beforeEach(() => {
    store = {};
    vi.stubGlobal("sessionStorage", {
      getItem: (key) => (key in store ? store[key] : null),
      setItem: (key, value) => {
        store[key] = String(value);
      },
      removeItem: (key) => {
        delete store[key];
      },
    });
    // eslint-disable-next-line no-new-func
    new Function(source)();
    api = globalThis.CarriedIdentifiers;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete globalThis.CarriedIdentifiers;
  });

  it("remembers a valid VAT number and recalls it", () => {
    expect(api.remember("vrn", " 123456789 ")).toBe(true);
    expect(api.recall("vrn")).toBe("123456789");
    expect(store.carriedVrn).toBe("123456789");
  });

  it("ignores a value that is not yet a valid identifier", () => {
    expect(api.remember("vrn", "1234")).toBe(false);
    expect(api.recall("vrn")).toBe("");
  });

  it("normalises a National Insurance number to upper case without spaces", () => {
    api.remember("nino", "qq 12 34 56 c");
    expect(api.recall("nino")).toBe("QQ123456C");
  });

  it("keeps each identifier under its own key", () => {
    api.remember("vrn", "123456789");
    api.remember("taxYear", "2025-26");
    api.remember("businessId", "XAIS12345678910");
    expect(api.recall("taxYear")).toBe("2025-26");
    expect(api.recall("businessId")).toBe("XAIS12345678910");
    expect(api.recall("nino")).toBe("");
  });

  it("rejects an unknown identifier name", () => {
    expect(() => api.recall("passport")).toThrow(/Unknown carried identifier/);
  });

  it("prefills an empty field", () => {
    api.remember("vrn", "123456789");
    const field = fakeField();
    expect(api.prefill("vrn", field)).toBe(true);
    expect(field.value).toBe("123456789");
  });

  it("never overwrites what the user typed", () => {
    api.remember("vrn", "123456789");
    const field = fakeField("987654321");
    expect(api.prefill("vrn", field)).toBe(false);
    expect(field.value).toBe("987654321");
  });

  it("fills a select only when it has the remembered option", () => {
    api.remember("taxYear", "2025-26");
    const without = fakeField("", "SELECT", ["2024-25"]);
    expect(api.prefill("taxYear", without)).toBe(false);
    expect(without.value).toBe("");
    const withOption = fakeField("", "SELECT", ["2025-26", "2024-25"]);
    expect(api.prefill("taxYear", withOption)).toBe(true);
    expect(withOption.value).toBe("2025-26");
  });

  it("bind prefills, then remembers input and form submission", () => {
    api.remember("vrn", "111111111");
    const field = fakeField();
    const formListeners = [];
    field.form = { addEventListener: (name, fn) => formListeners.push([name, fn]) };
    api.bind("vrn", field);
    expect(field.value).toBe("111111111");
    field.value = "222222222";
    field.fire("input");
    expect(api.recall("vrn")).toBe("222222222");
    field.value = "333333333";
    expect(formListeners[0][0]).toBe("submit");
    formListeners[0][1]();
    expect(api.recall("vrn")).toBe("333333333");
  });

  it("clearAll forgets every identifier", () => {
    api.remember("vrn", "123456789");
    api.remember("taxYear", "2025-26");
    api.clearAll();
    expect(store).toEqual({});
  });

  it("starts the tax year on 6 April", () => {
    expect(api.currentTaxYear(new Date(2026, 3, 5))).toBe("2025-26");
    expect(api.currentTaxYear(new Date(2026, 3, 6))).toBe("2026-27");
    expect(api.currentTaxYear(new Date(2026, 9, 5))).toBe("2026-27");
    expect(api.currentTaxYear(new Date(2027, 0, 1))).toBe("2026-27");
  });

  it("lists the current and recent tax years newest first", () => {
    expect(api.taxYearOptions(new Date(2026, 9, 5), 3)).toEqual(["2026-27", "2025-26", "2024-25"]);
    expect(api.taxYearOptions(new Date(2099, 5, 1), 2)).toEqual(["2099-00", "2098-99"]);
  });
  describe("buildTaxYearSelect", () => {
    class FakeSelect {
      constructor() {
        this.options = [];
        this.selected = "";
      }
      appendChild(option) {
        this.options.push(option);
      }
      replaceChildren() {
        this.options = [];
      }
    }
    Object.defineProperty(FakeSelect.prototype, "value", {
      configurable: true,
      get() {
        return this.selected;
      },
      set(next) {
        this.selected = this.options.some((option) => option.value === next) ? next : "";
      },
    });

    beforeEach(() => {
      vi.stubGlobal("HTMLSelectElement", FakeSelect);
      vi.stubGlobal("document", { createElement: () => ({ value: "", textContent: "" }) });
    });

    it("offers a blank choice then the current and five earlier tax years", () => {
      const select = new FakeSelect();
      api.buildTaxYearSelect(select, new Date(2026, 9, 5));
      expect(select.options.map((option) => option.value)).toEqual(["", "2026-27", "2025-26", "2024-25", "2023-24", "2022-23", "2021-22"]);
    });

    it("adds a year outside the list when it is assigned", () => {
      const select = new FakeSelect();
      api.buildTaxYearSelect(select, new Date(2026, 9, 5));
      select.value = "2018-19";
      expect(select.value).toBe("2018-19");
      expect(select.options.map((option) => option.value)).toContain("2018-19");
    });

    it("lets a remembered year fill the select", () => {
      const select = new FakeSelect();
      api.buildTaxYearSelect(select, new Date(2026, 9, 5));
      api.remember("taxYear", "2024-25");
      select.tagName = "SELECT";
      expect(api.prefill("taxYear", select)).toBe(true);
      expect(select.value).toBe("2024-25");
    });
  });
});
