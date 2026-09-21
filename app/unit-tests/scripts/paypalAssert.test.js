// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/paypalAssert.test.js

import { describe, test, expect } from "vitest";

import { parseConfig, findHostedButtonIds, assertTemplateMatches } from "../../../infra/paypal/paypal-assert.js";

const SAMPLE_TOML = `
[button]
hosted_button_id = "XTEQ73HM52QQW"
form_action = "https://www.paypal.com/donate"
donate_url = "https://www.paypal.com/donate/?hosted_button_id=XTEQ73HM52QQW"
page = "https://spreadsheets.diyaccounting.co.uk/donate.html"

[source]
repository = "diy-accounting-uk/spreadsheets.diyaccounting.co.uk"
template = "web/spreadsheets.diyaccounting.co.uk/donate.template.html"
meta = "app/templates/meta.toml"
`;

const MATCHING_HTML = `
<form action="https://www.paypal.com/donate" method="post" target="_top" id="paypal-donate-form">
  <input type="hidden" name="hosted_button_id" value="XTEQ73HM52QQW" />
</form>
`;

describe("parseConfig", () => {
  test("reads the button table", () => {
    expect(parseConfig(SAMPLE_TOML)).toEqual({
      hostedButtonId: "XTEQ73HM52QQW",
      formAction: "https://www.paypal.com/donate",
      donateUrl: "https://www.paypal.com/donate/?hosted_button_id=XTEQ73HM52QQW",
      page: "https://spreadsheets.diyaccounting.co.uk/donate.html",
    });
  });

  test("throws when a required field is missing", () => {
    expect(() => parseConfig('[button]\nhosted_button_id = "x"\n')).toThrow(/form_action|donate_url|page/);
  });
});

describe("findHostedButtonIds", () => {
  test("finds the one field a correct page carries", () => {
    expect(findHostedButtonIds(MATCHING_HTML)).toEqual(["XTEQ73HM52QQW"]);
  });

  test("finds none when the page has no such field", () => {
    expect(findHostedButtonIds("<form></form>")).toEqual([]);
  });

  test("finds every occurrence when there is more than one", () => {
    const html = `${MATCHING_HTML}\n<input name="hosted_button_id" value="OTHERID12345" />`;
    expect(findHostedButtonIds(html)).toEqual(["XTEQ73HM52QQW", "OTHERID12345"]);
  });
});

describe("assertTemplateMatches", () => {
  const config = parseConfig(SAMPLE_TOML);

  test("no mismatches when the page matches exactly", () => {
    expect(assertTemplateMatches(config, MATCHING_HTML)).toEqual([]);
  });

  test("reports a mismatch when the form action differs", () => {
    const html = MATCHING_HTML.replace("https://www.paypal.com/donate", "https://www.paypal.com/donate-old");
    const mismatches = assertTemplateMatches(config, html);
    expect(mismatches.some((m) => m.includes("form posts to"))).toBe(true);
  });

  test("reports a mismatch when the button id differs", () => {
    const html = MATCHING_HTML.replace("XTEQ73HM52QQW", "DRIFTEDID1234");
    const mismatches = assertTemplateMatches(config, html);
    expect(mismatches.some((m) => m.includes("does not match"))).toBe(true);
  });

  test("reports a mismatch when the field is missing entirely", () => {
    const mismatches = assertTemplateMatches(config, "<form></form>");
    expect(mismatches.some((m) => m.includes("exactly one hosted_button_id"))).toBe(true);
  });

  test("reports a mismatch when the field appears twice", () => {
    const html = `${MATCHING_HTML}\n<input name="hosted_button_id" value="XTEQ73HM52QQW" />`;
    const mismatches = assertTemplateMatches(config, html);
    expect(mismatches.some((m) => m.includes("exactly one hosted_button_id"))).toBe(true);
  });
});
