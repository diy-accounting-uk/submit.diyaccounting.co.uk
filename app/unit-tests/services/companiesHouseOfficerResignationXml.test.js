// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { buildOfficerResignationBody, OFFICER_RESIGNATION_ROLES } from "@app/services/companiesHouseOfficerResignationXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "OfficerResignation-v2-6.xsd";
const ENDED = { resignationDate: "2026-11-01" };

describe("companiesHouseOfficerResignationXml", () => {
  test("a director who is a person, with every name part and the full date of birth, is valid against OfficerResignation-v2-6.xsd", async () => {
    const xml = buildOfficerResignationBody({
      role: "director",
      corporate: false,
      title: "Mr",
      surname: "Tennant",
      forename: "Marcus",
      otherForenames: "John Paul",
      dateOfBirth: "1975-02-14",
      ...ENDED,
    });

    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<ResignationDate>2026-11-01</ResignationDate><Director><Person><Title>Mr</Title><Surname>Tennant</Surname>" +
        "<Forename>Marcus</Forename><OtherForenames>John Paul</OtherForenames><DOB>1975-02-14</DOB></Person></Director>",
    );
  });

  test("a director who is a person with only a surname and date of birth is valid", async () => {
    const xml = buildOfficerResignationBody({
      role: "director",
      corporate: false,
      surname: "Tennant",
      dateOfBirth: "1975-02-14",
      ...ENDED,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("a corporate director names it in CorporateName and is valid", async () => {
    const xml = buildOfficerResignationBody({ role: "director", corporate: true, corporateName: "DIRECTORCO LIMITED", ...ENDED });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<Director><CorporateName>DIRECTORCO LIMITED</CorporateName></Director>");
  });

  test("a secretary who is a person carries no date of birth and is valid", async () => {
    const xml = buildOfficerResignationBody({
      role: "secretary",
      corporate: false,
      surname: "Bramwell",
      forename: "Eleanor",
      dateOfBirth: "1970-01-05",
      ...ENDED,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<Secretary><Person><Surname>Bramwell</Surname><Forename>Eleanor</Forename></Person></Secretary>");
  });

  test("a corporate secretary names it in CorporateName and is valid", async () => {
    const xml = buildOfficerResignationBody({ role: "secretary", corporate: true, corporateName: "SECRETARIES LIMITED", ...ENDED });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<Secretary><CorporateName>SECRETARIES LIMITED</CorporateName></Secretary>");
  });

  test("a name with markup characters is escaped and stays valid", async () => {
    const xml = buildOfficerResignationBody({ role: "secretary", corporate: true, corporateName: "SMITH & JONES <SECRETARIES>", ...ENDED });
    expect(xml).toContain("SMITH &amp; JONES &lt;SECRETARIES&gt;");
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("the schema check refuses a director who is a person without a date of birth", async () => {
    const xml = buildOfficerResignationBody({
      role: "director",
      corporate: false,
      surname: "Tennant",
      dateOfBirth: "1975-02-14",
      ...ENDED,
    });
    expect((await gatewayFormSchemaErrors(xml.replace("<DOB>1975-02-14</DOB>", ""), SCHEMA)).length).toBeGreaterThan(0);
  });

  test("the schema check refuses a body whose elements are out of order", async () => {
    const xml = buildOfficerResignationBody({ role: "secretary", corporate: false, surname: "Bramwell", forename: "Eleanor", ...ENDED });
    const reordered = xml.replace(
      "<Surname>Bramwell</Surname><Forename>Eleanor</Forename>",
      "<Forename>Eleanor</Forename><Surname>Bramwell</Surname>",
    );
    expect((await gatewayFormSchemaErrors(reordered, SCHEMA)).length).toBeGreaterThan(0);
  });

  test("each role offered maps to a choice of OfficerResignationType, and an LLP member is not offered", () => {
    expect(OFFICER_RESIGNATION_ROLES).toEqual({ director: "Director", secretary: "Secretary" });
  });

  test("an unknown role, a missing name, a missing surname, a director's missing date of birth or a malformed date is refused", () => {
    expect(() => buildOfficerResignationBody({ role: "member", corporate: true, corporateName: "X", ...ENDED })).toThrow(
      /unknown officer role/,
    );
    expect(() => buildOfficerResignationBody({ role: "director", corporate: true, ...ENDED })).toThrow(/needs its name/);
    expect(() => buildOfficerResignationBody({ role: "secretary", corporate: false, ...ENDED })).toThrow(/surname/);
    expect(() => buildOfficerResignationBody({ role: "director", corporate: false, surname: "Tennant", ...ENDED })).toThrow(/dateOfBirth/);
    expect(() =>
      buildOfficerResignationBody({ role: "secretary", corporate: true, corporateName: "X", resignationDate: "1/11/2026" }),
    ).toThrow(/resignationDate/);
  });
});
