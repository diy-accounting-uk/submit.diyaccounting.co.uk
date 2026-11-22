// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { buildSailAddressBody, SAIL_ADDRESS_COUNTRIES, SAIL_ADDRESS_PARTS } from "@app/services/companiesHouseSailAddressXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "SailAddress-v2-6.xsd";
const SHORT = { premise: "1a", postTown: "Cardiff", country: "GB-WLS" };
const FULL = {
  premise: "Unit 4, Harbour House",
  street: "12 Quay Street",
  thoroughfare: "Harbourside",
  postTown: "Bristol",
  county: "Somerset",
  country: "GB-ENG",
  postcode: "BS1 4DJ",
  careOfName: "Bramwell & Co Accountants",
  poBox: "PO Box 12",
};

describe("companiesHouseSailAddressXml", () => {
  test("an address with every part is valid against SailAddress-v2-6.xsd, in the schema's order", async () => {
    const xml = buildSailAddressBody(FULL);
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Address><Premise>Unit 4, Harbour House</Premise><Street>12 Quay Street</Street><Thoroughfare>Harbourside</Thoroughfare>" +
        "<PostTown>Bristol</PostTown><County>Somerset</County><Country>GB-ENG</Country><Postcode>BS1 4DJ</Postcode>" +
        "<CareofName>Bramwell &amp; Co Accountants</CareofName><PoBox>PO Box 12</PoBox></Address>",
    );
  });

  test("an address with only the required parts is valid", async () => {
    const xml = buildSailAddressBody(SHORT);
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<Address><Premise>1a</Premise><PostTown>Cardiff</PostTown><Country>GB-WLS</Country></Address>");
  });

  test.each(Object.keys(SAIL_ADDRESS_COUNTRIES))("an address in %s is valid", async (country) => {
    expect(await gatewayFormSchemaErrors(buildSailAddressBody({ ...SHORT, country }), SCHEMA)).toEqual([]);
  });

  test("each part at the most characters the builder's table allows is valid, and one more is not", async () => {
    for (const [field, { maxLength }] of Object.entries(SAIL_ADDRESS_PARTS)) {
      const atLimit = buildSailAddressBody({ ...SHORT, [field]: "a".repeat(maxLength) });
      expect(await gatewayFormSchemaErrors(atLimit, SCHEMA), field).toEqual([]);
      const over = buildSailAddressBody({ ...SHORT, [field]: "a".repeat(maxLength + 1) });
      expect(await gatewayFormSchemaErrors(over, SCHEMA), field).not.toEqual([]);
    }
  });

  test("refuses an address without a building, a post town or a known country", () => {
    expect(() => buildSailAddressBody({ ...SHORT, premise: "" })).toThrow("building name or number");
    expect(() => buildSailAddressBody({ ...SHORT, postTown: undefined })).toThrow("post town");
    expect(() => buildSailAddressBody({ ...SHORT, country: "FR" })).toThrow("unknown SAIL address country FR");
  });

  test("the schema check refuses a body whose elements are out of order", async () => {
    const xml = buildSailAddressBody(SHORT).replace(
      "<Premise>1a</Premise><PostTown>Cardiff</PostTown>",
      "<PostTown>Cardiff</PostTown><Premise>1a</Premise>",
    );
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).not.toEqual([]);
  });
});
