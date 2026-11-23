// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { GATEWAY_CHARACTER_CLASS, gatewayTextProblem, gatewayFieldProblems } from "../public/lib/companies-house-gateway-text.js";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

// A string type's pattern as a base types file publishes it, with its character references read.
function schemaPattern(schemaFile, typeName) {
  const schema = readFileSync(join(process.cwd(), "fixtures/companies-house-xmlgw", schemaFile), "utf8");
  const value = new RegExp(`<xs:simpleType name="${typeName}">[\\s\\S]*?<xs:pattern value="([^"]*)"`).exec(schema)[1];
  const text = value
    .replace(/&#x([0-9A-Fa-f]+);/g, (whole, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (whole, name) => ENTITIES[name]);
  return new RegExp(`^${text}$`, "u");
}

describe("companies-house-gateway-text", () => {
  for (const schemaFile of ["baseTypes-v2-10.xsd", "baseTypes-v3-6.xsd", "baseTypes-v3-7.xsd"]) {
    for (const typeName of ["nameAddressString", "otherDataString"]) {
      test(`takes exactly the characters ${typeName} of ${schemaFile} takes`, () => {
        const schema = schemaPattern(schemaFile, typeName);
        const ours = new RegExp(`^[${GATEWAY_CHARACTER_CLASS}]$`, "u");
        const differ = [];
        for (let code = 0x20; code <= 0x2100; code += 1) {
          const character = String.fromCodePoint(code);
          if (schema.test(character) !== ours.test(character)) differ.push(character);
        }
        expect(differ).toEqual([]);
      });
    }
  }

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

  test("names each field a path reaches, with an array entry's index, and never the value", () => {
    const form = {
      surname: "Glyndŵr",
      forename: "Owain",
      address: { premise: "1", street: "Ffordd Glyndŵr", postTown: "Machynlleth", country: "GB-WLS" },
      shareholders: [{ surname: "Jones" }, { surname: "Llŷr" }],
      naturesOfControl: ["OWNERSHIPOFSHARES_25TO50PERCENT"],
    };
    const problems = gatewayFieldProblems(form, {
      "surname": 160,
      "forename": 50,
      "address.premise": 50,
      "address.street": 50,
      "address.postTown": 50,
      "shareholders[].surname": 160,
      "missing.street": 50,
    });
    expect(problems).toEqual([
      "surname has characters Companies House does not accept: ŵ",
      "address.street has characters Companies House does not accept: ŵ",
      "shareholders[1].surname has characters Companies House does not accept: ŷ",
    ]);
    expect(problems.join(" ")).not.toMatch(/Glynd|Ffordd|Llŷr/);
  });

  test("names a field longer than its limit, with the limit, never the value", () => {
    const problems = gatewayFieldProblems({ surname: "A".repeat(161), forename: "B".repeat(50) }, { surname: 160, forename: 50 });
    expect(problems).toEqual(["surname must be at most 160 characters"]);
    expect(gatewayFieldProblems({ surname: "Ŵ".repeat(160) }, { surname: 160 })).toEqual([]);
  });
});
