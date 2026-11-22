// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, expect, it } from "vitest";
import { sameAsKey } from "../public/lib/companies-house-company-name.js";

const same = (left, right) => expect(sameAsKey(left), `${left} / ${right}`).toBe(sameAsKey(right));
const different = (left, right) => expect(sameAsKey(left), `${left} / ${right}`).not.toBe(sameAsKey(right));

describe("a name the same as another, as Companies House counts it", () => {
  it("disregards the endings, in English and Welsh, long and short", () => {
    same("BRAMWELL TENNANT TRADING LIMITED", "BRAMWELL TENNANT TRADING LTD");
    same("BRAMWELL TENNANT TRADING LIMITED", "BRAMWELL TENNANT TRADING CYFYNGEDIG");
    same("BRAMWELL TENNANT TRADING LTD", "BRAMWELL TENNANT TRADING CYF");
    same("BRAMWELL TENNANT TRADING PLC", "BRAMWELL TENNANT TRADING PUBLIC LIMITED COMPANY");
  });

  it("disregards THE and WWW at the start, and the words after a blank space at the end", () => {
    same("THE BRAMWELL TENNANT LIMITED", "BRAMWELL TENNANT LTD");
    same("WWW BRAMWELL TENNANT LIMITED", "BRAMWELL TENNANT LIMITED");
    same("BRAMWELL TENNANT & CO LIMITED", "BRAMWELL TENNANT LIMITED");
    same("BRAMWELL TENNANT UK LIMITED", "BRAMWELL TENNANT LIMITED");
    same("BRAMWELL TENNANT CYMRU CYF", "BRAMWELL TENNANT LIMITED");
  });

  it("reads & as AND and + as PLUS, and disregards the listed punctuation, the spaces and a final S", () => {
    same("SMITH & JONES LIMITED", "SMITH AND JONES LIMITED");
    same("ONE + ONE LIMITED", "ONE PLUS ONE LIMITED");
    same("SMITH'S BAKERY (NORTH) LIMITED", "SMITHS BAKERY NORTH LTD");
    same("BRAMWELL TENNANT TRADINGS LIMITED", "BRAMWELL TENNANT TRADING LIMITED");
    same("BRAM WELL LIMITED", "BRAMWELL LIMITED");
  });

  it("reads accented letters as plain ones", () => {
    same("ŘEAL COFFEE CAFÉ LTD", "REAL COFFEE CAFE LTD");
  });

  it("keeps names apart that differ in a word that counts", () => {
    different("BRAMWELL TENNANT TRADING LIMITED", "BRAMWELL TENNANT TRADING HOLDINGS LIMITED");
    different("SMITH AND JONES LIMITED", "SMITH AND JONES BUILDERS LIMITED");
  });
});
