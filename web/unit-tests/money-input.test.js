// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/money-input.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("money-input", () => {
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/money-input.js");
  });

  it.each([
    ["£1,200.50", 1200.5],
    ["1200.5", 1200.5],
    [" 1,200 ", 1200],
    ["£600", 600],
    ["£193.54", 193.54],
    ["0", 0],
    ["0.00", 0],
    ["£1,234,567.89", 1234567.89],
    ["-£500", -500],
    ["£-500", -500],
    ["-1,250.25", -1250.25],
    [1000, 1000],
    ["1000", 1000],
  ])("accepts %s", (text, expected) => {
    expect(window.parseMoneyInput(text)).toBe(expected);
  });

  it.each([
    "",
    "   ",
    "abc",
    "12abc",
    "£",
    "1.234",
    "1,20,0",
    "12,34",
    "1,2345",
    "--5",
    "-£-5",
    "£ 5",
    "$5",
    "5%",
    "1e3",
    "1.2.3",
    ".5",
    "5.",
    "NaN",
    "Infinity",
    null,
    undefined,
  ])("rejects %j", (text) => {
    expect(window.parseMoneyInput(text)).toBeNull();
  });

  it("rejects pence when whole pounds are asked for", () => {
    expect(window.parseMoneyInput("£1,200", { wholePounds: true })).toBe(1200);
    expect(window.parseMoneyInput("1200.50", { wholePounds: true })).toBeNull();
  });
});

describe("money-input moneyInputProblem", () => {
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/money-input.js");
  });

  function fakeInput({ id, value, label, money = "pounds-and-pence", disabled = false, min }) {
    const attributes = new Map();
    return {
      id,
      value,
      disabled,
      dataset: min === undefined ? { money } : { money, moneyMin: min },
      labels: [{ textContent: ` ${label} ` }],
      setAttribute: (name, text) => attributes.set(name, text),
      removeAttribute: (name) => attributes.delete(name),
      getAttribute: (name) => attributes.get(name),
    };
  }

  function fakeRoot(inputs) {
    return { querySelectorAll: () => inputs };
  }

  it("returns null when every enabled box is blank or parses", () => {
    const inputs = [
      fakeInput({ id: "a", value: "£1,200.50", label: "A" }),
      fakeInput({ id: "b", value: "  ", label: "B" }),
      fakeInput({ id: "c", value: "oops", label: "C", disabled: true }),
    ];
    expect(window.moneyInputProblem(fakeRoot(inputs))).toBeNull();
  });

  it("names each box that does not parse and marks it invalid", () => {
    const bad = fakeInput({ id: "b", value: "12abc", label: "Turnover" });
    const good = fakeInput({ id: "a", value: "5", label: "Other income" });
    const message = window.moneyInputProblem(fakeRoot([good, bad]));
    expect(message).toContain("Turnover");
    expect(message).not.toContain("Other income");
    expect(message).toContain("£193.54");
    expect(bad.getAttribute("aria-invalid")).toBe("true");
    expect(good.getAttribute("aria-invalid")).toBeUndefined();
  });

  it("asks for whole pounds when a whole-pounds box has pence", () => {
    const input = fakeInput({ id: "a", value: "10.50", label: "Fixed assets", money: "whole-pounds" });
    expect(window.moneyInputProblem(fakeRoot([input]))).toContain("whole number of pounds");
  });

  it("clears aria-invalid once the value is corrected", () => {
    const input = fakeInput({ id: "a", value: "x", label: "A" });
    window.moneyInputProblem(fakeRoot([input]));
    input.value = "5";
    expect(window.moneyInputProblem(fakeRoot([input]))).toBeNull();
    expect(input.getAttribute("aria-invalid")).toBeUndefined();
  });

  it("flags a negative value in a box with a minimum of 0 and names the field", () => {
    const turnover = fakeInput({ id: "t", value: "-£5", label: "Turnover", min: "0" });
    const adjustment = fakeInput({ id: "a", value: "-5", label: "Basis adjustment" });
    const message = window.moneyInputProblem(fakeRoot([turnover, adjustment]));
    expect(message).toContain("cannot be negative");
    expect(message).toContain("Turnover");
    expect(message).not.toContain("Basis adjustment");
    expect(turnover.getAttribute("aria-invalid")).toBe("true");
    expect(adjustment.getAttribute("aria-invalid")).toBeUndefined();
  });

  it("accepts zero and positive values in a box with a minimum of 0", () => {
    const zero = fakeInput({ id: "z", value: "0", label: "Zero", min: "0" });
    const positive = fakeInput({ id: "p", value: "£1,000", label: "Positive", min: "0" });
    expect(window.moneyInputProblem(fakeRoot([zero, positive]))).toBeNull();
  });
});
