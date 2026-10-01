// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/form-errors.test.js
// @vitest-environment happy-dom

import { describe, it, expect, beforeAll, beforeEach } from "vitest";

describe("form-errors", () => {
  beforeAll(async () => {
    await import("../public/lib/money-input.js");
    await import("../public/lib/form-errors.js");
  });

  beforeEach(() => {
    document.body.innerHTML = `
      <form id="f">
        <div class="form-group">
          <label for="nino">National Insurance number</label>
          <p id="nino-hint">hint</p>
          <input id="nino" aria-describedby="nino-hint" value="" />
        </div>
        <div class="form-group">
          <label for="taxYear">Tax year</label>
          <input id="taxYear" value=" " />
        </div>
        <div class="form-group">
          <label for="turnover">Turnover</label>
          <div class="input-prefix"><input id="turnover" data-money="pounds-and-pence" data-money-min="0" value="abc" /></div>
        </div>
        <div class="form-group">
          <label for="costs">Costs</label>
          <input id="costs" data-money="pounds-and-pence" data-money-min="0" value="-5" />
        </div>
      </form>`;
  });

  it("requireFields returns true and shows nothing when every field has a value", () => {
    document.getElementById("nino").value = "QQ123456C";
    document.getElementById("taxYear").value = "2026-27";
    expect(window.formErrors.requireFields(["nino", "taxYear"])).toBe(true);
    expect(document.getElementById("form-error-summary")).toBeNull();
  });

  it("requireFields builds a summary with one link per blank field and trims whitespace", () => {
    expect(window.formErrors.requireFields(["nino", "taxYear"])).toBe(false);
    const summary = document.getElementById("form-error-summary");
    expect(summary.getAttribute("role")).toBe("alert");
    expect(summary.querySelector("h2").textContent).toBe("There is a problem");
    const links = Array.from(summary.querySelectorAll("a"));
    expect(links.map((a) => a.getAttribute("href"))).toEqual(["#nino", "#taxYear"]);
    expect(links.map((a) => a.textContent)).toEqual(["Enter your National Insurance number", "Enter the tax year"]);
    expect(summary.parentElement.id).toBe("f");
  });

  it("puts an inline message and aria-invalid on each field and keeps the hint described", () => {
    window.formErrors.requireFields(["nino"]);
    const nino = document.getElementById("nino");
    expect(nino.getAttribute("aria-invalid")).toBe("true");
    expect(nino.getAttribute("aria-describedby")).toBe("nino-hint nino-error");
    expect(document.getElementById("nino-error").textContent).toContain("Enter your National Insurance number");
    expect(document.getElementById("taxYear").hasAttribute("aria-invalid")).toBe(false);
  });

  it("focuses the summary, and a summary link focuses its field", () => {
    window.formErrors.requireFields(["nino", "taxYear"]);
    const summary = document.getElementById("form-error-summary");
    expect(document.activeElement).toBe(summary);
    summary.querySelectorAll("a")[1].click();
    expect(document.activeElement).toBe(document.getElementById("taxYear"));
  });

  it("clears the earlier errors when the next check passes", () => {
    window.formErrors.requireFields(["nino"]);
    document.getElementById("nino").value = "QQ123456C";
    expect(window.formErrors.requireFields(["nino"])).toBe(true);
    expect(document.getElementById("form-error-summary")).toBeNull();
    expect(document.getElementById("nino-error")).toBeNull();
    expect(document.getElementById("nino").hasAttribute("aria-invalid")).toBe(false);
    expect(document.getElementById("nino").getAttribute("aria-describedby")).toBe("nino-hint");
  });

  it("does not stack a second summary on a repeat submit", () => {
    window.formErrors.requireFields(["nino"]);
    window.formErrors.requireFields(["nino"]);
    expect(document.querySelectorAll("#form-error-summary").length).toBe(1);
    expect(document.querySelectorAll("#nino-error").length).toBe(1);
  });

  it("typing in a field clears its inline error", () => {
    window.formErrors.requireFields(["nino"]);
    const nino = document.getElementById("nino");
    nino.value = "Q";
    nino.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.getElementById("nino-error")).toBeNull();
    expect(nino.hasAttribute("aria-invalid")).toBe(false);
  });

  it("reportMoneyProblems reuses what the money parser marks and words each field", () => {
    expect(window.formErrors.reportMoneyProblems()).toBe(true);
    const messages = Array.from(document.querySelectorAll("#form-error-summary a")).map((a) => a.textContent);
    expect(messages).toEqual([
      "Enter an amount in pounds and pence, like £600 or £193.54. Check Turnover.",
      "The amount cannot be negative. Check Costs.",
    ]);
    expect(document.getElementById("turnover").getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById("costs-error")).not.toBeNull();
  });

  it("reportMoneyProblems returns false and clears the summary when amounts are fine", () => {
    window.formErrors.requireFields(["nino"]);
    document.getElementById("turnover").value = "£600";
    document.getElementById("costs").value = "";
    expect(window.formErrors.reportMoneyProblems()).toBe(false);
    expect(document.getElementById("form-error-summary")).toBeNull();
  });
});
