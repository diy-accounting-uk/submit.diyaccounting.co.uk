// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  addressProblems,
  buildPscChangeDetailsBody,
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
    expect(addressProblems({ premise: "2", postTown: "Cardiff", country: "Wales" })).toEqual(["unknown country Wales"]);
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
