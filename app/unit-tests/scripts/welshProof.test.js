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

  test("treats http on localhost or 127.0.0.1 as a local simulator, and any other site as deployed", () => {
    expect(isLocalSimulator("http://localhost:3000/")).toBe(true);
    expect(isLocalSimulator("http://127.0.0.1:41234/")).toBe(true);
    expect(isLocalSimulator("https://local.submit.diyaccounting.co.uk:3443/")).toBe(false);
    expect(isLocalSimulator("https://submit.diyaccounting.co.uk")).toBe(false);
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
      // The text outside the markup tags, with the {name} placeholders a page fills in left out.
      .map((text) =>
        text
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
