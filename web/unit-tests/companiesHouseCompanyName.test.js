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

  it.each([
    ["0", "ZERO", "O"],
    ["1", "ONE"],
    ["2", "TWO", "TO", "TOO"],
    ["3", "THREE"],
    ["4", "FOUR", "FOR"],
    ["5", "FIVE"],
    ["6", "SIX"],
    ["7", "SEVEN"],
    ["8", "EIGHT"],
    ["9", "NINE"],
    ["&", "AND"],
    ["+", "PLUS"],
    ["£", "POUND"],
    ["€", "EURO"],
    ["$", "DOLLAR"],
    ["¥", "YEN"],
    ["%", "PER CENT", "PERCENT", "PER CENTUM", "PERCENTUM"],
    ["@", "AT"],
  ])("reads %s and the rest of section 6.5's row as the same", (...row) => {
    for (const other of row.slice(1)) same(`OAK ${row[0]} TREES LIMITED`, `OAK ${other} TREES LIMITED`);
  });

  it.each([
    ["ÀÁÂÃÄÅĀĂĄǺ", "A"],
    ["ÆǼ", "AE"],
    ["ÇĆĈĊČ", "C"],
    ["ÞĎĐ", "D"],
    ["ÈÉÊËĒĔĖĘĚ", "E"],
    ["ĜĞĠĢ", "G"],
    ["ĤĦ", "H"],
    ["ÌÍÎÏĨĪĬĮİ", "I"],
    ["Ĵ", "J"],
    ["Ķ", "K"],
    ["ĹĻĽĿŁ", "L"],
    ["ÑŃŅŇŊ", "N"],
    ["ÒÓÔÕÖØŌŎŐǾ", "O"],
    ["Œ", "OE"],
    ["ŔŖŘ", "R"],
    ["ŚŜŞŠ", "S"],
    ["ŢŤŦ", "T"],
    ["ÙÚÛÜŨŪŬŮŰŲ", "U"],
    ["ŴẀẂẄ", "W"],
    ["ỲÝŶŸ", "Y"],
    ["ŹŻŽ", "Z"],
  ])("reads each of %s as %s", (letters, plain) => {
    for (const letter of letters) same(`B${letter}X TRADING LIMITED`, `B${plain}X TRADING LIMITED`);
  });

  it("reads a name written with a digit as the same as one written with its word", () => {
    same("TWO TREES LIMITED", "2 TREES LIMITED");
    same("4 SEASONS LTD", "FOUR SEASONS LIMITED");
    same("ZERO WASTE LIMITED", "0 WASTE LIMITED");
    same("365 DAYS LIMITED", "THREESIXFIVE DAYS LIMITED");
  });

  it("leaves a word alone that only contains a number word", () => {
    expect(sameAsKey("TOOTH LIMITED")).toBe("TOOTH");
    expect(sameAsKey("ONEROUS LIMITED")).toBe("ONEROU");
    expect(sameAsKey("FORTRESS LIMITED")).toBe("FORTRES");
    different("TOOTH LIMITED", "TOO TH LIMITED X");
  });

  it("disregards the endings that hold TO or an apostrophe though section 6.5 reads TO as TOO", () => {
    same("ACME RIGHT TO MANAGE COMPANY LIMITED", "ACME LIMITED");
    same("ACME RIGHT TO ENFRANCHISEMENT LIMITED", "ACME LIMITED");
    same("CWMNI ACME A’R CWMNI", "CWMNI ACME");
  });

  it("disregards *, =, #, % and + among a name's first three characters, and reads them after", () => {
    same("%AGE LIMITED", "AGE LIMITED");
    same("*STAR LIMITED", "STAR LIMITED");
    same("A#B TRADING LIMITED", "AB TRADING LIMITED");
    same("ABC+ LIMITED", "ABC PLUS LIMITED");
    different("ABC% LIMITED", "ABC LIMITED");
  });

  it("keeps names apart that differ in a word that counts", () => {
    different("BRAMWELL TENNANT TRADING LIMITED", "BRAMWELL TENNANT TRADING HOLDINGS LIMITED");
    different("SMITH AND JONES LIMITED", "SMITH AND JONES BUILDERS LIMITED");
  });
});
