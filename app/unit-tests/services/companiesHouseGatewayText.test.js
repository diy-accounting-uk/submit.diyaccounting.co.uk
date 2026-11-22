// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GATEWAY_CHARACTER_CLASS, gatewayTextProblem } from "@app/services/companiesHouseGatewayText.js";

// nameAddressString's pattern as baseTypes-v3-7.xsd publishes it, with its character references read.
function schemaCharacterClass() {
  const schema = readFileSync(join(process.cwd(), "fixtures/companies-house-xmlgw/baseTypes-v3-7.xsd"), "utf8");
  const pattern = schema.match(/name="nameAddressString">[\s\S]*?pattern value="\[([\s\S]*?)\]\*"/)[1];
  return pattern
    .replace(/&#x([0-9A-F]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"');
}

describe("companiesHouseGatewayText", () => {
  test("takes exactly the characters the gateway's name and address pattern takes", () => {
    const schema = new RegExp(`^[${schemaCharacterClass()}]$`, "u");
    const ours = new RegExp(`^[${GATEWAY_CHARACTER_CLASS}]$`, "u");
    const differ = [];
    for (const [from, to] of [
      [0x20, 0x24f],
      [0x1e00, 0x1eff],
      [0x2000, 0x20cf],
    ]) {
      for (let code = from; code <= to; code += 1) {
        const character = String.fromCodePoint(code);
        if (schema.test(character) !== ours.test(character)) differ.push(character);
      }
    }
    expect(differ).toEqual([]);
  });

  test("names each character the gateway refuses, once", () => {
    expect(gatewayTextProblem("street", "Sráid an Mhuilinn")).toBe("street has characters Companies House does not accept: á");
    expect(gatewayTextProblem("surname", "Bŵl-Bŵl ^")).toBe("surname has characters Companies House does not accept: ŵ ^");
  });

  test("passes Welsh in capitals, punctuation and an empty value", () => {
    expect(gatewayTextProblem("street", "HEOL Y BŴL")).toBeNull();
    expect(gatewayTextProblem("name", "Jones & Daughters (Holdings) Ltd, £5 'A' “B” [C] {D} <E> 50% #1 a/b\\c")).toBeNull();
    expect(gatewayTextProblem("county", "")).toBeNull();
    expect(gatewayTextProblem("county", undefined)).toBeNull();
  });
});
