// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { NAME_ADDRESS_CHARACTERS } from "@app/services/companiesHouseForms.js";

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

function schemaPattern(schemaFile) {
  const schema = readFileSync(`fixtures/companies-house-xmlgw/${schemaFile}`, "utf8");
  const value = /<xs:simpleType name="nameAddressString">[\s\S]*?<xs:pattern value="([^"]*)"/.exec(schema)[1];
  const text = value
    .replace(/&#x([0-9A-Fa-f]+);/g, (whole, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&(amp|lt|gt|quot|apos);/g, (whole, name) => ENTITIES[name]);
  return new RegExp(`^${text}$`, "u");
}

describe("the name and address characters the form routes accept", () => {
  test.each(["baseTypes-v2-10.xsd", "baseTypes-v3-7.xsd"])("are the characters nameAddressString of %s takes", (schemaFile) => {
    const pattern = schemaPattern(schemaFile);
    const differing = [];
    for (let codePoint = 0; codePoint <= 0x2100; codePoint++) {
      const character = String.fromCodePoint(codePoint);
      if (NAME_ADDRESS_CHARACTERS.test(character) !== pattern.test(character)) differing.push(codePoint.toString(16));
    }
    expect(differing).toEqual([]);
  });
});
