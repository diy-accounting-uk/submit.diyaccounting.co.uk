// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  buildOfficerAppointmentBody,
  OFFICER_APPOINTMENT_ROLES,
  OFFICER_ADDRESS_COUNTRY_CODES,
} from "@app/services/companiesHouseOfficerAppointmentXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "OfficerAppointment-v2-9.xsd";
const APPOINTED = { appointmentDate: "2026-11-02", consentToAct: true };
const CARDIFF = { premise: "16", street: "Heol y Bont", postTown: "Cardiff", country: "GB-WLS", postcode: "CF10 1AA" };

function directorPerson(overrides = {}) {
  return {
    role: "director",
    corporate: false,
    title: "Mrs",
    forename: "Carys",
    otherForenames: "Mair",
    surname: "Llewelyn",
    serviceAddress: { sameAsRegisteredOffice: true },
    dateOfBirth: "1981-06-23",
    nationality: "Welsh",
    countryOfResidence: "Wales",
    previousNames: [{ forename: "Carys", surname: "Rees" }],
    residentialAddress: { address: CARDIFF },
    personalCode: "CWMPS832223",
    identityVerified: true,
    ...APPOINTED,
    ...overrides,
  };
}

function corporate(role, overrides = {}) {
  return {
    role,
    corporate: true,
    corporateName: "DIRECTORCO LIMITED",
    address: { premise: "1", street: "Station Road", postTown: "Leeds", county: "West Yorkshire", country: "GB-ENG", postcode: "LS1 4AP" },
    companyIdentification: { uk: { registrationNumber: "01234567" } },
    ...APPOINTED,
    ...overrides,
  };
}

describe("companiesHouseOfficerAppointmentXml", () => {
  test("a director who is a person, with the personal code and the identity statement, is valid against OfficerAppointment-v2-9.xsd", async () => {
    const xml = buildOfficerAppointmentBody(directorPerson());

    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<AppointmentDate>2026-11-02</AppointmentDate><ConsentToAct>true</ConsentToAct><Director><Person><Title>Mrs</Title>" +
        "<Forename>Carys</Forename><OtherForenames>Mair</OtherForenames><Surname>Llewelyn</Surname>" +
        "<ServiceAddress><SameAsRegisteredOffice>true</SameAsRegisteredOffice></ServiceAddress><DOB>1981-06-23</DOB>" +
        "<Nationality>Welsh</Nationality><CountryOfResidence>Wales</CountryOfResidence>" +
        "<PreviousNames><Forename>Carys</Forename><Surname>Rees</Surname></PreviousNames>" +
        "<ResidentialAddress><Address><Premise>16</Premise><Street>Heol y Bont</Street><PostTown>Cardiff</PostTown>" +
        "<Country>GB-WLS</Country><Postcode>CF10 1AA</Postcode></Address></ResidentialAddress>" +
        "<VerificationDetails><CompaniesHousePersonalCode>CWMPS832223</CompaniesHousePersonalCode>" +
        "<VerificationStatements><VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual>" +
        "</VerificationStatements></VerificationDetails></Person></Director>",
    );
  });

  test("a director's personal code is sent without the hyphens and in capitals, and a name mismatch reason is valid", async () => {
    const xml = buildOfficerAppointmentBody(directorPerson({ personalCode: "cwmps-832223", nameMismatchReason: "LEGALLY_CHANGED" }));
    expect(xml).toContain("<CompaniesHousePersonalCode>CWMPS832223</CompaniesHousePersonalCode>");
    expect(xml).toContain("<NameMismatchReason>LEGALLY_CHANGED</NameMismatchReason></VerificationDetails>");
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("a director with only a surname, a service address abroad and the residential address the same as it is valid", async () => {
    const xml = buildOfficerAppointmentBody(
      directorPerson({
        title: undefined,
        forename: undefined,
        otherForenames: undefined,
        countryOfResidence: undefined,
        previousNames: [],
        serviceAddress: { address: { premise: "4", street: "Rue de la Paix", postTown: "Paris", country: "FRA", postcode: "75002" } },
        residentialAddress: { sameAsServiceAddress: true },
      }),
    );
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<ResidentialAddress><SameAsServiceAddress>true</SameAsServiceAddress></ResidentialAddress>");
  });

  test("a country outside the schema's list is sent as OtherForeignCountry and is valid", async () => {
    const xml = buildOfficerAppointmentBody(
      directorPerson({ residentialAddress: { address: { premise: "8", postTown: "Valletta", otherForeignCountry: "Malta" } } }),
    );
    expect(xml).toContain("<OtherForeignCountry>Malta</OtherForeignCountry>");
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("a corporate director registered in the UK is named, addressed and identified by its registration number, and is valid", async () => {
    const xml = buildOfficerAppointmentBody(corporate("director"));
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Director><Corporate><CorporateName>DIRECTORCO LIMITED</CorporateName><Address><Premise>1</Premise><Street>Station Road</Street>" +
        "<PostTown>Leeds</PostTown><County>West Yorkshire</County><Country>GB-ENG</Country><Postcode>LS1 4AP</Postcode></Address>" +
        "<CompanyIdentification><UK><RegistrationNumber>01234567</RegistrationNumber></UK></CompanyIdentification></Corporate></Director>",
    );
    expect(xml).not.toContain("CompaniesHousePersonalCode");
  });

  test("a secretary who is a person carries a service address and former names, no date of birth and no personal code, and is valid", async () => {
    const xml = buildOfficerAppointmentBody({
      role: "secretary",
      corporate: false,
      forename: "Eleanor",
      surname: "Bramwell",
      serviceAddress: { address: { premise: "The Old Rectory", postTown: "York", country: "GB-ENG", postcode: "YO1 7HH" } },
      previousNames: [{ surname: "Hart" }],
      dateOfBirth: "1970-01-05",
      personalCode: "CWMPS832223",
      ...APPOINTED,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Secretary><Person><Forename>Eleanor</Forename><Surname>Bramwell</Surname><ServiceAddress><Address><Premise>The Old Rectory</Premise>" +
        "<PostTown>York</PostTown><Country>GB-ENG</Country><Postcode>YO1 7HH</Postcode></Address></ServiceAddress>" +
        "<PreviousNames><Surname>Hart</Surname></PreviousNames></Person></Secretary>",
    );
    expect(xml).not.toContain("<DOB>");
    expect(xml).not.toContain("CompaniesHousePersonalCode");
  });

  test("a corporate secretary registered outside the UK gives its legal form, governing law and register, and is valid", async () => {
    const xml = buildOfficerAppointmentBody(
      corporate("secretary", {
        corporateName: "SECRETARIAT B.V.",
        address: { premise: "12", street: "Keizersgracht", postTown: "Amsterdam", country: "NLD", postcode: "1015 CJ" },
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
      "<CompanyIdentification><NonUK><PlaceRegistered>Netherlands Chamber of Commerce</PlaceRegistered><RegistrationNumber>12345678</RegistrationNumber>" +
        "<LawGoverned>Netherlands</LawGoverned><LegalForm>Besloten vennootschap</LegalForm></NonUK></CompanyIdentification></Corporate></Secretary>",
    );
  });

  test("a corporate officer outside the UK with no register is valid with its legal form and governing law alone", async () => {
    const xml = buildOfficerAppointmentBody(
      corporate("director", {
        companyIdentification: { nonUk: { lawGoverned: "State of Delaware", legalForm: "Limited liability company" } },
      }),
    );
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("a corporate secretary registered in the UK is valid", async () => {
    const xml = buildOfficerAppointmentBody(corporate("secretary", { corporateName: "SMITH & JONES SECRETARIES LIMITED" }));
    expect(xml).toContain("<Secretary><Corporate><CorporateName>SMITH &amp; JONES SECRETARIES LIMITED</CorporateName>");
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("the schema check refuses a director who is a person without VerificationDetails", async () => {
    const xml = buildOfficerAppointmentBody(directorPerson());
    const withoutVerification = xml.replace(/<VerificationDetails>.*<\/VerificationDetails>/, "");
    expect((await gatewayFormSchemaErrors(withoutVerification, SCHEMA)).length).toBeGreaterThan(0);
  });

  test("the schema check refuses a personal code that is not 11 characters", async () => {
    const xml = buildOfficerAppointmentBody(directorPerson());
    expect((await gatewayFormSchemaErrors(xml.replace("CWMPS832223", "CWMPS83222"), SCHEMA)).length).toBeGreaterThan(0);
  });

  test("the schema check refuses a body whose elements are out of order", async () => {
    const xml = buildOfficerAppointmentBody(directorPerson());
    const reordered = xml.replace(
      "<Forename>Carys</Forename><OtherForenames>Mair</OtherForenames><Surname>Llewelyn</Surname>",
      "<Surname>Llewelyn</Surname><Forename>Carys</Forename>",
    );
    expect((await gatewayFormSchemaErrors(reordered, SCHEMA)).length).toBeGreaterThan(0);
  });

  test("each role offered maps to a choice of OfficerApptType, and an LLP member is not offered", () => {
    expect(OFFICER_APPOINTMENT_ROLES).toEqual({ director: "Director", secretary: "Secretary" });
  });

  test("the country codes are AddressBaseType's", () => {
    expect(OFFICER_ADDRESS_COUNTRY_CODES).toHaveLength(30);
    expect(OFFICER_ADDRESS_COUNTRY_CODES.slice(0, 5)).toEqual(["GB-ENG", "GB-WLS", "GB-SCT", "GB-NIR", "GBR"]);
  });

  test("an unknown role, no consent, a bad date, a missing name or a director's missing particulars are refused", () => {
    expect(() => buildOfficerAppointmentBody(directorPerson({ role: "member" }))).toThrow(/unknown officer role/);
    expect(() => buildOfficerAppointmentBody(directorPerson({ consentToAct: false }))).toThrow(/consent to act/);
    expect(() => buildOfficerAppointmentBody(directorPerson({ appointmentDate: "2/11/2026" }))).toThrow(/appointmentDate/);
    expect(() => buildOfficerAppointmentBody(directorPerson({ surname: "" }))).toThrow(/surname/);
    expect(() => buildOfficerAppointmentBody(directorPerson({ dateOfBirth: undefined }))).toThrow(/dateOfBirth/);
    expect(() => buildOfficerAppointmentBody(directorPerson({ nationality: "" }))).toThrow(/nationality/);
    expect(() => buildOfficerAppointmentBody(directorPerson({ personalCode: "C1W2M3P4S5X" }))).toThrow(/personal code/);
    expect(() => buildOfficerAppointmentBody(directorPerson({ identityVerified: false }))).toThrow(/verified their identity/);
    expect(() => buildOfficerAppointmentBody(directorPerson({ nameMismatchReason: "OTHER" }))).toThrow(/nameMismatchReason/);
    expect(() => buildOfficerAppointmentBody(directorPerson({ residentialAddress: undefined }))).toThrow(/residential address/);
    expect(() => buildOfficerAppointmentBody(directorPerson({ residentialAddress: { address: { ...CARDIFF, country: "XXX" } } }))).toThrow(
      /unknown country code/,
    );
    expect(() => buildOfficerAppointmentBody(corporate("director", { corporateName: "" }))).toThrow(/needs its name/);
    expect(() => buildOfficerAppointmentBody(corporate("director", { companyIdentification: undefined }))).toThrow(/companyIdentification/);
    expect(() => buildOfficerAppointmentBody(corporate("director", { companyIdentification: { nonUk: { legalForm: "LLC" } } }))).toThrow(
      /lawGoverned/,
    );
  });
});
