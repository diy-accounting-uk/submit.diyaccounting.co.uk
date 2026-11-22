// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  addressProblems,
  buildPscChangeDetailsBody,
  changeDetailsProblems,
  NATURE_OF_CONTROL_CODES,
  natureOfControlProblems,
} from "@app/services/companiesHousePscChangeDetailsXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "PSCChangeDetails-v1-2.xsd";
const DATES = { dateOfChange: "2026-11-01", confirmationDate: "2026-11-03" };
const ELEANOR = {
  kind: "individual-person-with-significant-control",
  title: "Mrs",
  surname: "Bramwell",
  forename: "Eleanor",
  dobMonth: 1,
  dobYear: 1970,
};
const ADDRESS = {
  premise: "2",
  street: "Mill Lane",
  postTown: "Cardiff",
  county: "South Glamorgan",
  country: "GB-WLS",
  postcode: "CF10 1AA",
};

describe("companiesHousePscChangeDetailsXml", () => {
  test("an individual's change of nature of control is valid against PSCChangeDetails-v1-2.xsd", async () => {
    const xml = buildPscChangeDetailsBody({
      ...ELEANOR,
      naturesOfControl: ["OWNERSHIPOFSHARES_75TO100PERCENT", "VOTINGRIGHTS_75TO100PERCENT", "RIGHTTOAPPOINTANDREMOVEDIRECTORS"],
      ...DATES,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Individual><Title>Mrs</Title><Surname>Bramwell</Surname><Forename>Eleanor</Forename>" +
        "<PartialDOB><Month>1</Month><Year>1970</Year></PartialDOB><Change><NatureOfControls>" +
        "<NatureOfControl>OWNERSHIPOFSHARES_75TO100PERCENT</NatureOfControl><NatureOfControl>VOTINGRIGHTS_75TO100PERCENT</NatureOfControl>" +
        "<NatureOfControl>RIGHTTOAPPOINTANDREMOVEDIRECTORS</NatureOfControl></NatureOfControls></Change></Individual>",
    );
    expect(xml).toContain("<DateOfChange>2026-11-01</DateOfChange><ConfirmationDate>2026-11-03</ConfirmationDate>");
  });

  test("an individual's change of service address is valid and names it in ServiceAddress", async () => {
    const xml = buildPscChangeDetailsBody({ ...ELEANOR, address: ADDRESS, ...DATES });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Change><ServiceAddress><Address><Premise>2</Premise><Street>Mill Lane</Street><PostTown>Cardiff</PostTown>" +
        "<County>South Glamorgan</County><Country>GB-WLS</Country><Postcode>CF10 1AA</Postcode></Address></ServiceAddress></Change>",
    );
  });

  test("a corporate entity's change of address and nature of control together is valid", async () => {
    const xml = buildPscChangeDetailsBody({
      kind: "corporate-entity-person-with-significant-control",
      name: "SIMULATOR HOLDINGS LIMITED",
      address: { premise: "Unit 4", thoroughfare: "Harbour Estate", postTown: "Belfast", country: "GB-NIR", postcode: "BT1 1AA" },
      naturesOfControl: ["OWNERSHIPOFSHARES_50TO75PERCENT"],
      ...DATES,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<Corporate><CorporateName>SIMULATOR HOLDINGS LIMITED</CorporateName><Change><Address><Premise>Unit 4</Premise>");
  });

  test("a legal person's change of address abroad names its country in OtherForeignCountry and is valid", async () => {
    const xml = buildPscChangeDetailsBody({
      kind: "legal-person-person-with-significant-control",
      name: "The Example Foundation",
      address: { premise: "10", street: "Rue de la Paix", postTown: "Geneva", otherForeignCountry: "Switzerland" },
      ...DATES,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<OtherForeignCountry>Switzerland</OtherForeignCountry>");
  });

  test("controls held through a trust and a firm are valid beside direct ones", async () => {
    const xml = buildPscChangeDetailsBody({
      ...ELEANOR,
      naturesOfControl: ["OWNERSHIPOFSHARES_25TO50PERCENT", "OWNERSHIPOFSHARES_25TO50PERCENT_AS_TRUST", "SIGINFLUENCECONTROL_AS_FIRM"],
      ...DATES,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("every nature of control value is one the schema allows", async () => {
    expect(NATURE_OF_CONTROL_CODES).toHaveLength(24);
    for (const code of NATURE_OF_CONTROL_CODES) {
      const xml = buildPscChangeDetailsBody({ ...ELEANOR, naturesOfControl: [code], ...DATES });
      expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    }
  });

  test("an address with markup characters is escaped and stays valid", async () => {
    const xml = buildPscChangeDetailsBody({ ...ELEANOR, address: { ...ADDRESS, premise: "Smith & Jones House" }, ...DATES });
    expect(xml).toContain("<Premise>Smith &amp; Jones House</Premise>");
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("two bands of shares, or significant influence beside another control, are refused", () => {
    expect(natureOfControlProblems(["OWNERSHIPOFSHARES_25TO50PERCENT", "OWNERSHIPOFSHARES_50TO75PERCENT"])).toEqual([
      "more than one band of OWNERSHIPOFSHARES",
    ]);
    expect(natureOfControlProblems(["SIGINFLUENCECONTROL", "VOTINGRIGHTS_25TO50PERCENT"])).toEqual([
      "SIGINFLUENCECONTROL only when no other nature of control applies",
    ]);
    expect(natureOfControlProblems(["SIGINFLUENCECONTROL", "VOTINGRIGHTS_25TO50PERCENT_AS_TRUST"])).toEqual([]);
  });

  test("a trust's or a firm's significant influence stands beside its other controls, as PSC04 sections 8 and 9 allow", () => {
    expect(natureOfControlProblems(["OWNERSHIPOFSHARES_25TO50PERCENT_AS_TRUST", "SIGINFLUENCECONTROL_AS_TRUST"])).toEqual([]);
    expect(natureOfControlProblems(["RIGHTTOAPPOINTANDREMOVEDIRECTORS_AS_FIRM", "SIGINFLUENCECONTROL_AS_FIRM"])).toEqual([]);
    expect(natureOfControlProblems([])).toEqual(["at least one nature of control is needed"]);
    expect(natureOfControlProblems(["OWNERSHIPOFSHARES"])).toEqual(["unknown nature of control OWNERSHIPOFSHARES"]);
  });

  test("an address without a premise, a post town or one country is refused", () => {
    expect(addressProblems({ postTown: "Cardiff", country: "GB-WLS" })).toEqual(["an address needs its premise"]);
    expect(addressProblems({ premise: "2", country: "GB-WLS" })).toEqual(["an address needs its post town"]);
    expect(addressProblems({ premise: "2", postTown: "Cardiff" })).toEqual(["an address needs one country"]);
    expect(addressProblems({ premise: "2", postTown: "Cardiff", country: "GB-WLS", otherForeignCountry: "Wales" })).toEqual([
      "an address needs one country",
    ]);
    expect(addressProblems({ premise: "2", postTown: "Cardiff", country: "Wales" })).toEqual([
      "an address names a country this form does not have",
    ]);
  });

  test("no change, an unknown kind or a malformed date is refused", () => {
    expect(() => buildPscChangeDetailsBody({ ...ELEANOR, ...DATES })).toThrow(/needs a change/);
    expect(() => buildPscChangeDetailsBody({ kind: "super-secure-person-with-significant-control", address: ADDRESS, ...DATES })).toThrow(
      /unknown PSC kind/,
    );
    expect(() =>
      buildPscChangeDetailsBody({ ...ELEANOR, address: ADDRESS, dateOfChange: "1/11/2026", confirmationDate: "2026-11-03" }),
    ).toThrow(/dateOfChange/);
  });

  test("the schema check refuses a change whose elements are out of order", async () => {
    const xml = buildPscChangeDetailsBody({ ...ELEANOR, address: ADDRESS, naturesOfControl: ["SIGINFLUENCECONTROL"], ...DATES });
    const swapped = xml.replace(/(<ServiceAddress>.*<\/ServiceAddress>)(<NatureOfControls>.*<\/NatureOfControls>)/, "$2$1");
    expect(swapped).not.toEqual(xml);
    expect((await gatewayFormSchemaErrors(swapped, SCHEMA)).length).toBeGreaterThan(0);
  });
});

describe("companiesHousePscChangeDetailsXml, the other changes PSC04, PSC05 and PSC06 offer", () => {
  const HOLDCO = { kind: "corporate-entity-person-with-significant-control", name: "SIMULATOR HOLDINGS LIMITED" };
  const FOUNDATION = { kind: "legal-person-person-with-significant-control", name: "The Example Foundation" };
  const HOME = { premise: "7", street: "Orchard Close", postTown: "Bristol", country: "GB-ENG", postcode: "BS1 4AA" };

  test("an individual's change of name is valid and names the new name in Change/Name", async () => {
    const xml = buildPscChangeDetailsBody({
      ...ELEANOR,
      newName: { title: "Dr", forename: "Eleanor", otherForenames: "Ruth", surname: "Hale" },
      ...DATES,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Change><Name><Title>Dr</Title><Surname>Hale</Surname><Forename>Eleanor</Forename><OtherForenames>Ruth</OtherForenames></Name></Change>",
    );
  });

  test("an individual's change of usual residential address is valid, as an address and as the same as the service address", async () => {
    const own = buildPscChangeDetailsBody({ ...ELEANOR, residentialAddress: HOME, ...DATES });
    expect(await gatewayFormSchemaErrors(own, SCHEMA)).toEqual([]);
    expect(own).toContain("<Change><ResidentialAddress><Address><Premise>7</Premise><Street>Orchard Close</Street>");
    const same = buildPscChangeDetailsBody({ ...ELEANOR, residentialAddress: { sameAsServiceAddress: true }, ...DATES });
    expect(await gatewayFormSchemaErrors(same, SCHEMA)).toEqual([]);
    expect(same).toContain("<Change><ResidentialAddress><SameAsServiceAddress>true</SameAsServiceAddress></ResidentialAddress></Change>");
  });

  test("an individual's change of nationality and of country of residence is valid", async () => {
    const xml = buildPscChangeDetailsBody({ ...ELEANOR, nationality: "Irish", countryOfResidence: "Ireland", ...DATES });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<Change><Nationality>Irish</Nationality><CountryOfResidence>Ireland</CountryOfResidence></Change>");
  });

  test("every change of an individual together keeps the schema's order and is valid", async () => {
    const xml = buildPscChangeDetailsBody({
      ...ELEANOR,
      newName: { surname: "Hale" },
      address: ADDRESS,
      residentialAddress: HOME,
      nationality: "Irish",
      countryOfResidence: "Ireland",
      naturesOfControl: ["SIGINFLUENCECONTROL"],
      ...DATES,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("a corporate entity's change of name, and of legal form, governing law and register, is valid", async () => {
    const xml = buildPscChangeDetailsBody({
      ...HOLDCO,
      newName: "SIMULATOR GROUP LIMITED",
      identification: {
        legalForm: "Private limited company",
        lawGoverned: "Companies Act 2006",
        placeRegistered: "Companies House",
        registrationNumber: "12345678",
        countryOrState: "England and Wales",
      },
      ...DATES,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Change><CorporateName>SIMULATOR GROUP LIMITED</CorporateName><PSCCompanyIdentification><PSCPlaceRegistered>Companies House</PSCPlaceRegistered>" +
        "<PSCRegistrationNumber>12345678</PSCRegistrationNumber><LawGoverned>Companies Act 2006</LawGoverned>" +
        "<LegalForm>Private limited company</LegalForm><CountryOrState>England and Wales</CountryOrState></PSCCompanyIdentification></Change>",
    );
  });

  test("a legal person's change of name and of legal form and governing law is valid", async () => {
    const xml = buildPscChangeDetailsBody({
      ...FOUNDATION,
      newName: "The Example Trust",
      identification: { legalForm: "Charitable foundation", lawGoverned: "Swiss Civil Code" },
      ...DATES,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Change><LegalPersonName>The Example Trust</LegalPersonName><LegalPersonIdentification><LawGoverned>Swiss Civil Code</LawGoverned>" +
        "<LegalForm>Charitable foundation</LegalForm></LegalPersonIdentification></Change>",
    );
  });

  test("a change a kind of PSC does not have, or a part the form needs, is refused, and no reason repeats a value", () => {
    expect(changeDetailsProblems({ ...HOLDCO, nationality: "Irish" })).toEqual([
      "nationality is not a change this form makes for this kind of PSC",
    ]);
    expect(changeDetailsProblems({ ...ELEANOR, identification: { legalForm: "x", lawGoverned: "y" } })).toEqual([
      "identification is not a change this form makes for this kind of PSC",
    ]);
    expect(changeDetailsProblems({ ...ELEANOR, newName: { forename: "Eleanor" } })).toEqual(["a new name needs its surname"]);
    expect(changeDetailsProblems({ ...HOLDCO, identification: { legalForm: "Ltd" } })).toEqual([
      "a change of legal form or governing law needs the governing law",
    ]);
    expect(
      changeDetailsProblems({ ...HOLDCO, identification: { legalForm: "Ltd", lawGoverned: "UK", placeRegistered: "Companies House" } }),
    ).toEqual(["a register named needs the registration number in it"]);
    expect(changeDetailsProblems({ ...FOUNDATION, identification: { legalForm: "x", lawGoverned: "y", registrationNumber: "1" } })).toEqual(
      ["a legal person is entered in no register on this form"],
    );
    const residential = changeDetailsProblems({ ...ELEANOR, residentialAddress: { premise: "7 Secret Lane", country: "Narnia" } });
    expect(residential).toEqual([
      "residential: an address needs its post town",
      "residential: an address names a country this form does not have",
    ]);
    expect(residential.join(" ")).not.toMatch(/Secret|Narnia/);
  });
});
