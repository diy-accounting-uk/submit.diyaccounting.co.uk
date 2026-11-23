// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/welshProof.test.js

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import toml from "@iarna/toml";
import {
  parseArguments,
  isLocalSimulator,
  pagesToRead,
  sentencesOf,
  isEnglishSentence,
  englishSentences,
  findingsOf,
  paceWaitMs,
  REQUEST_BUDGET,
} from "../../../scripts/welsh-proof.mjs";

describe("welsh-proof arguments", () => {
  test("reads the base and the journeys, and reads both journeys when --only is not given", () => {
    expect(parseArguments(["--base", "https://submit.diyaccounting.co.uk", "--only", "vat"])).toMatchObject({
      base: "https://submit.diyaccounting.co.uk",
      only: "vat",
    });
    expect(parseArguments(["--base", "http://localhost:3000/"]).only).toBe("both");
  });

  test("refuses a missing base, an unknown journey and an unknown argument", () => {
    expect(() => parseArguments([])).toThrow("--base <site> is required");
    expect(() => parseArguments(["--base", "http://localhost:3000/", "--only", "itsa"])).toThrow("--only must be one of");
    expect(() => parseArguments(["--base", "http://localhost:3000/", "--verbose"])).toThrow("Unknown argument --verbose");
    expect(() => parseArguments(["--base"])).toThrow("--base needs a value");
  });

  test("paces requests unless --no-pace is given", () => {
    expect(parseArguments(["--base", "https://submit.diyaccounting.co.uk"]).pace).toBe(true);
    expect(parseArguments(["--base", "http://localhost:3000/", "--no-pace", "--only", "ch"])).toMatchObject({ pace: false, only: "ch" });
  });

  test("treats http on localhost or 127.0.0.1 as a local simulator, and any other site as deployed", () => {
    expect(isLocalSimulator("http://localhost:3000/")).toBe(true);
    expect(isLocalSimulator("http://127.0.0.1:41234/")).toBe(true);
    expect(isLocalSimulator("https://local.submit.diyaccounting.co.uk:3443/")).toBe(false);
    expect(isLocalSimulator("https://submit.diyaccounting.co.uk")).toBe(false);
  });
});

describe("welsh-proof pacing", () => {
  const FIVE_MINUTES_MS = 5 * 60 * 1000;
  const NOW_MS = 10 * FIVE_MINUTES_MS;

  test("the budget leaves room for a page's requests under the firewall's 2,000 in 5 minutes", () => {
    expect(REQUEST_BUDGET).toBeLessThanOrEqual(1500);
  });

  test("does not wait while fewer requests than the budget went out in the last five minutes", () => {
    const requestTimes = Array.from({ length: REQUEST_BUDGET - 1 }, (unused, index) => NOW_MS - 1000 - index);
    expect(paceWaitMs(requestTimes.reverse(), NOW_MS)).toBe(0);
  });

  test("does not count requests older than five minutes", () => {
    const old = Array.from({ length: REQUEST_BUDGET }, () => NOW_MS - FIVE_MINUTES_MS - 1);
    expect(paceWaitMs([...old, NOW_MS - 10], NOW_MS)).toBe(0);
  });

  test("at the budget, waits until the oldest request that keeps it there is five minutes old", () => {
    const oldest = NOW_MS - 60 * 1000;
    const requestTimes = [oldest, ...Array.from({ length: REQUEST_BUDGET - 1 }, () => NOW_MS - 1000)];
    expect(paceWaitMs(requestTimes, NOW_MS)).toBe(FIVE_MINUTES_MS - 60 * 1000);
  });

  test("over the budget, waits until enough requests leave the window to bring it back under", () => {
    const requestTimes = [
      NOW_MS - 120 * 1000,
      NOW_MS - 90 * 1000,
      NOW_MS - 60 * 1000,
      ...Array.from({ length: REQUEST_BUDGET - 1 }, () => NOW_MS - 1000),
    ];
    expect(paceWaitMs(requestTimes, NOW_MS)).toBe(FIVE_MINUTES_MS - 60 * 1000);
  });
});

describe("welsh-proof pages", () => {
  const files = ["index.html", "auth/login.html", "hmrc/vat/submitVat.html", "hmrc/itsa/obligations.html", "companies-house/filings.html"];

  test("always reads the public pages, and adds the HMRC or Companies House pages the journey selects", () => {
    expect(pagesToRead(files, "vat")).toEqual([
      "cy/auth/login.html",
      "cy/hmrc/itsa/obligations.html",
      "cy/hmrc/vat/submitVat.html",
      "cy/index.html",
    ]);
    expect(pagesToRead(files, "ch")).toEqual(["cy/auth/login.html", "cy/companies-house/filings.html", "cy/index.html"]);
    expect(pagesToRead(files, "both")).toHaveLength(files.length);
  });
});

describe("welsh-proof English-sentence rule", () => {
  test("cuts text into sentences at sentence ends and line ends", () => {
    expect(sentencesOf("Mae hyn yn iawn. Ydy e? Ydy!\nLlinell newydd")).toEqual(["Mae hyn yn iawn.", "Ydy e?", "Ydy!", "Llinell newydd"]);
  });

  test.each([
    "Request additional bundles to access more features.",
    "When HMRC accepts a return, it sends back a receipt with a Form Bundle Number.",
    "You can file your VAT return here.",
    "This page is in English.",
  ])("finds an English sentence: %s", (sentence) => {
    expect(isEnglishSentence(sentence)).toBe(true);
  });

  test.each([
    "Cyflwyno eich Ffurflen TAW i CThEF.",
    "Mae’r cyfrifon a’r Ffurflenni yn costio un tocyn.",
    "Troi Treth yn Ddigidol ar gyfer TAW",
    "Mae DIY Accounting Submit wedi’i restru ar declyn chwilio CThEF.",
    "Os yw’r ffurflen yn cael ei gwrthod, gallwch ei chyflwyno eto.",
  ])("reads a Welsh sentence as Welsh: %s", (sentence) => {
    expect(isEnglishSentence(sentence)).toBe(false);
  });

  test.each([
    "DIY Accounting Submit",
    "Making Tax Digital for VAT",
    "Companies House and HMRC",
    "Form Bundle Number 123456789012",
    "npm run test:submitVatBehaviour-simulator",
    "GB123456789",
    "Sign out",
  ])("does not fire on a proper name, a term with no Welsh form, a reference, code or a two-word label: %s", (text) => {
    expect(isEnglishSentence(text)).toBe(false);
  });

  test("finds no English sentence in any Welsh entry of the site's Welsh text", () => {
    const entries = toml.parse(fs.readFileSync(new URL("../../../i18n/cy.toml", import.meta.url), "utf8"));
    const welsh = Object.values(entries)
      .flatMap((section) => Object.values(section))
      .map((entry) => entry.cy)
      // The text outside the markup tags, with the {name} placeholders a page fills in left out, and,
      // as the proof reads a page, no text an element marks as English.
      .map((text) =>
        text
          .replace(/<([a-z]+)\b[^>]*\slang="en[^"]*"[^>]*>[\s\S]*?<\/\1\s*>/g, " ")
          .split(/[<>]/)
          .filter((_part, index) => index % 2 === 0)
          .join(" ")
          .replace(/\{[a-z]+\}/g, " "),
      );
    expect(welsh.length).toBeGreaterThan(1000);
    expect(englishSentences(welsh)).toEqual([]);
  });
});

describe("welsh-proof findings", () => {
  test("reports a page whose html lang is not cy, and each English sentence once", () => {
    const findings = findingsOf({
      path: "cy/hmrc/vat/submitVat.html",
      lang: "en-GB",
      blocks: ["Cyflwyno eich Ffurflen TAW.", "Choose the period you want to file for.", "Choose the period you want to file for."],
    });
    expect(findings).toEqual([
      'cy/hmrc/vat/submitVat.html: html lang is "en-GB", not "cy"',
      'cy/hmrc/vat/submitVat.html: English sentence "Choose the period you want to file for."',
    ]);
  });

  test("reports nothing for a Welsh page in Welsh", () => {
    expect(findingsOf({ path: "cy/index.html", lang: "cy", blocks: ["Croeso i DIY Accounting Submit.", "Mewngofnodi"] })).toEqual([]);
  });
});
