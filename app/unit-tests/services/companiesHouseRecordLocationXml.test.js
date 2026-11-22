// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { readFileSync } from "node:fs";
import { buildRecordChangeOfLocationBody, RECORD_TYPES } from "@app/services/companiesHouseRecordLocationXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "RecordChangeofLocation-v3-0.xsd";

describe("companiesHouseRecordLocationXml", () => {
  test("the record types are the schema's RecordType values, in its order", () => {
    const baseTypes = readFileSync("fixtures/companies-house-xmlgw/baseTypes-v3-7.xsd", "utf8");
    const recordType = /<xs:element name="RecordType">([\s\S]*?)<\/xs:element>/.exec(baseTypes)[1];
    expect([...recordType.matchAll(/<xs:enumeration value="([^"]+)"\/>/g)].map((match) => match[1])).toEqual(RECORD_TYPES);
  });

  test("records moved to the SAIL address are valid against RecordChangeofLocation-v3-0.xsd", async () => {
    const xml = buildRecordChangeOfLocationBody({ destination: "sail", records: ["MEMBER", "OWNSHRCAP", "DIRCONTRACT"] });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<MoveToSAILAddress>true</MoveToSAILAddress><RegisterList><RecordType>MEMBER</RecordType></RegisterList>" +
        "<RegisterList><RecordType>DIRCONTRACT</RecordType></RegisterList><RegisterList><RecordType>OWNSHRCAP</RecordType></RegisterList>",
    );
  });

  test("every record moved to the SAIL address at once is valid", async () => {
    const xml = buildRecordChangeOfLocationBody({ destination: "sail", records: RECORD_TYPES });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("one record moved back to the registered office is valid", async () => {
    const xml = buildRecordChangeOfLocationBody({ destination: "registered-office", records: ["MEMBER"] });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<MoveToRegisteredOffice>true</MoveToRegisteredOffice><RegisterList><RecordType>MEMBER</RecordType></RegisterList>",
    );
    expect(xml).not.toContain("RemoveSAILAddressInd");
  });

  test("every record moved back with the SAIL address removed names no record and is valid", async () => {
    const xml = buildRecordChangeOfLocationBody({ destination: "registered-office", removeSailAddress: true });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<MoveToRegisteredOffice>true</MoveToRegisteredOffice><RemoveSAILAddressInd>true</RemoveSAILAddressInd>");
    expect(xml).not.toContain("RegisterList");
  });

  test("refuses a move that names no record, an unknown record, a record twice or an unknown destination", () => {
    expect(() => buildRecordChangeOfLocationBody({ destination: "sail", records: [] })).toThrow("at least one record");
    expect(() => buildRecordChangeOfLocationBody({ destination: "registered-office" })).toThrow("at least one record");
    expect(() => buildRecordChangeOfLocationBody({ destination: "sail", records: ["DIRECTORS"] })).toThrow("unknown record type DIRECTORS");
    expect(() => buildRecordChangeOfLocationBody({ destination: "sail", records: ["MEMBER", "MEMBER"] })).toThrow("named twice");
    expect(() => buildRecordChangeOfLocationBody({ destination: "elsewhere", records: ["MEMBER"] })).toThrow("unknown destination");
  });

  test("refuses to remove the SAIL address on a move to it, or with records named", () => {
    expect(() => buildRecordChangeOfLocationBody({ destination: "sail", records: ["MEMBER"], removeSailAddress: true })).toThrow(
      "only by a move to the registered office",
    );
    expect(() =>
      buildRecordChangeOfLocationBody({ destination: "registered-office", records: ["MEMBER"], removeSailAddress: true }),
    ).toThrow("none is named");
  });

  test("the schema check refuses a move to the SAIL address that names no record", async () => {
    const xml = buildRecordChangeOfLocationBody({ destination: "sail", records: ["MEMBER"] }).replace(
      "<RegisterList><RecordType>MEMBER</RecordType></RegisterList>",
      "",
    );
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).not.toEqual([]);
  });
});
