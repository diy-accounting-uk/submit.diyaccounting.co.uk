// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { buildOfficerChangeBody, OFFICER_CHANGE_ROLES } from "@app/services/companiesHouseOfficerChangeXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "OfficerChangeDetails-v2-10.xsd";
const SWANSEA = { premise: "22", street: "Ffordd y Brenin", postTown: "Swansea", country: "GB-WLS", postcode: "SA1 8PP" };
const BRISTOL = { premise: "Unit 3", street: "Temple Way", postTown: "Bristol", country: "GB-ENG", postcode: "BS2 0BY" };

function directorPerson(overrides = {}) {
  return {
    role: "director",
    corporate: false,
    dateOfChange: "2026-11-09",
    title: "Mrs",
    surname: "Rees",
    forename: "Carys",
    otherForenames: "Mair",
    dateOfBirth: "1981-06-23",
    ...overrides,
  };
}

function corporate(role, overrides = {}) {
  return { role, corporate: true, dateOfChange: "2026-11-09", corporateName: "DIRECTORCO LIMITED", ...overrides };
}

describe("companiesHouseOfficerChangeXml", () => {
  test("a director's name change finds the director by name and date of birth and carries the new name, and is valid", async () => {
    const xml = buildOfficerChangeBody(
      directorPerson({ newName: { title: "Mrs", surname: "Llewelyn", forename: "Carys", otherForenames: "Mair" } }),
    );
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<DateOfChange>2026-11-09</DateOfChange><Director><Person><Title>Mrs</Title><Surname>Rees</Surname><Forename>Carys</Forename>" +
        "<OtherForenames>Mair</OtherForenames><DOB>1981-06-23</DOB><Change><Name><Title>Mrs</Title><Surname>Llewelyn</Surname>" +
        "<Forename>Carys</Forename><OtherForenames>Mair</OtherForenames></Name></Change></Person></Director>",
    );
  });

  test("a director's service address change, with the residential address unchanged, is valid", async () => {
    const xml = buildOfficerChangeBody(directorPerson({ serviceAddress: { address: BRISTOL }, residentialAddressUnchanged: true }));
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Change><ServiceAddress><Address><Premise>Unit 3</Premise><Street>Temple Way</Street><PostTown>Bristol</PostTown>" +
        "<Country>GB-ENG</Country><Postcode>BS2 0BY</Postcode></Address>" +
        "<ResidentialAddressUnchangedInd>true</ResidentialAddressUnchangedInd></ServiceAddress></Change>",
    );
  });

  test("a director's residential address change alone is valid", async () => {
    const xml = buildOfficerChangeBody(directorPerson({ residentialAddress: { address: SWANSEA } }));
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<DOB>1981-06-23</DOB><Change><ResidentialAddress><Address><Premise>22</Premise><Street>Ffordd y Brenin</Street>" +
        "<PostTown>Swansea</PostTown><Country>GB-WLS</Country><Postcode>SA1 8PP</Postcode></Address></ResidentialAddress></Change>",
    );
  });

  test("a director's service address moved to the registered office with a new residential address, nationality and country of residence is valid", async () => {
    const xml = buildOfficerChangeBody(
      directorPerson({
        serviceAddress: { sameAsRegisteredOffice: true },
        residentialAddress: { address: { premise: "4", street: "Rue de la Paix", postTown: "Paris", country: "FRA", postcode: "75002" } },
        nationality: "French",
        countryOfResidence: "France",
      }),
    );
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Change><ServiceAddress><SameAsRegisteredOffice>true</SameAsRegisteredOffice></ServiceAddress><ResidentialAddress><Address>" +
        "<Premise>4</Premise><Street>Rue de la Paix</Street><PostTown>Paris</PostTown><Country>FRA</Country><Postcode>75002</Postcode>" +
        "</Address></ResidentialAddress><Nationality>French</Nationality><CountryOfResidence>France</CountryOfResidence></Change>",
    );
  });

  test("a director's residential address the same as a new service address is valid", async () => {
    const xml = buildOfficerChangeBody(
      directorPerson({ serviceAddress: { address: SWANSEA }, residentialAddress: { sameAsServiceAddress: true } }),
    );
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "</ServiceAddress><ResidentialAddress><SameAsServiceAddress>true</SameAsServiceAddress></ResidentialAddress></Change>",
    );
  });

  test("a secretary's name and service address change carries no date of birth, and is valid", async () => {
    const xml = buildOfficerChangeBody({
      role: "secretary",
      corporate: false,
      dateOfChange: "2026-10-30",
      forename: "Eleanor",
      surname: "Hart",
      newName: { forename: "Eleanor", surname: "Bramwell" },
      serviceAddress: { address: { premise: "The Old Rectory", postTown: "York", country: "GB-ENG", postcode: "YO1 7HH" } },
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Secretary><Person><Surname>Hart</Surname><Forename>Eleanor</Forename><Change><Name><Surname>Bramwell</Surname><Forename>Eleanor</Forename>" +
        "</Name><ServiceAddress><Address><Premise>The Old Rectory</Premise><PostTown>York</PostTown><Country>GB-ENG</Country>" +
        "<Postcode>YO1 7HH</Postcode></Address></ServiceAddress></Change></Person></Secretary>",
    );
    expect(xml).not.toContain("<DOB>");
  });

  test("a corporate director's new name and principal office address are valid", async () => {
    const xml = buildOfficerChangeBody(corporate("director", { newCorporateName: "DIRECTORCO HOLDINGS LIMITED", address: BRISTOL }));
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Director><Corporate><CorporateName>DIRECTORCO LIMITED</CorporateName><Change><CorporateName>DIRECTORCO HOLDINGS LIMITED</CorporateName>" +
        "<Address><Premise>Unit 3</Premise><Street>Temple Way</Street><PostTown>Bristol</PostTown><Country>GB-ENG</Country>" +
        "<Postcode>BS2 0BY</Postcode></Address></Change></Corporate></Director>",
    );
  });

  test("a corporate secretary's new legal details outside the UK are valid", async () => {
    const xml = buildOfficerChangeBody(
      corporate("secretary", {
        corporateName: "SECRETARIAT B.V.",
        companyIdentification: {
          nonUk: {
            placeRegistered: "Netherlands Chamber of Commerce",
            registrationNumber: "12345678",
            lawGoverned: "Netherlands",
            legalForm: "Besloten vennootschap",
          },
        },
      }),
    );
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Secretary><Corporate><CorporateName>SECRETARIAT B.V.</CorporateName><Change><CompanyIdentification><NonUK>" +
        "<PlaceRegistered>Netherlands Chamber of Commerce</PlaceRegistered><RegistrationNumber>12345678</RegistrationNumber>" +
        "<LawGoverned>Netherlands</LawGoverned><LegalForm>Besloten vennootschap</LegalForm></NonUK></CompanyIdentification></Change></Corporate></Secretary>",
    );
  });

  test("the schema check refuses a director who is a person without the date of birth", async () => {
    const xml = buildOfficerChangeBody(directorPerson({ residentialAddress: { address: SWANSEA } }));
    expect((await gatewayFormSchemaErrors(xml.replace("<DOB>1981-06-23</DOB>", ""), SCHEMA)).length).toBeGreaterThan(0);
  });

  test("the schema check refuses the forename before the surname", async () => {
    const xml = buildOfficerChangeBody(directorPerson({ residentialAddress: { address: SWANSEA } }));
    const reordered = xml.replace("<Surname>Rees</Surname><Forename>Carys</Forename>", "<Forename>Carys</Forename><Surname>Rees</Surname>");
    expect((await gatewayFormSchemaErrors(reordered, SCHEMA)).length).toBeGreaterThan(0);
  });

  test("each role offered maps to a choice of OfficerChangeDetailsType, and an LLP member is not offered", () => {
    expect(OFFICER_CHANGE_ROLES).toEqual({ director: "Director", secretary: "Secretary" });
  });

  test("an unknown role, a bad date, a missing identity, no change or contradictory addresses are refused", () => {
    const residential = { residentialAddress: { address: SWANSEA } };
    expect(() => buildOfficerChangeBody(directorPerson({ ...residential, role: "member" }))).toThrow(/unknown officer role/);
    expect(() => buildOfficerChangeBody(directorPerson({ ...residential, dateOfChange: "9/11/2026" }))).toThrow(/dateOfChange/);
    expect(() => buildOfficerChangeBody(directorPerson({ ...residential, surname: "" }))).toThrow(/surname/);
    expect(() => buildOfficerChangeBody(directorPerson({ ...residential, dateOfBirth: undefined }))).toThrow(/dateOfBirth/);
    expect(() => buildOfficerChangeBody(directorPerson())).toThrow(/at least one new detail/);
    expect(() => buildOfficerChangeBody(directorPerson({ newName: { forename: "Carys" } }))).toThrow(/new name needs a surname/);
    expect(() => buildOfficerChangeBody(directorPerson({ serviceAddress: { address: BRISTOL } }))).toThrow(
      /residentialAddressUnchanged or a new residential address/,
    );
    expect(() =>
      buildOfficerChangeBody(directorPerson({ serviceAddress: { address: BRISTOL }, residentialAddressUnchanged: true, ...residential })),
    ).toThrow(/cannot both be given/);
    expect(() => buildOfficerChangeBody(directorPerson({ ...residential, residentialAddressUnchanged: true }))).toThrow(
      /goes with a new service address/,
    );
    expect(() =>
      buildOfficerChangeBody(
        directorPerson({ serviceAddress: { sameAsRegisteredOffice: true }, residentialAddress: { sameAsServiceAddress: true } }),
      ),
    ).toThrow(/registered office/);
    expect(() =>
      buildOfficerChangeBody({ role: "secretary", corporate: false, dateOfChange: "2026-11-09", surname: "Hart", nationality: "British" }),
    ).toThrow(/secretary's change/);
    expect(() => buildOfficerChangeBody(corporate("director"))).toThrow(/at least one new detail/);
    expect(() => buildOfficerChangeBody(corporate("director", { corporateName: "", address: BRISTOL }))).toThrow(
      /as the register holds it/,
    );
    expect(() => buildOfficerChangeBody(corporate("director", { address: { ...BRISTOL, country: "XXX" } }))).toThrow(
      /unknown country code/,
    );
  });
});
