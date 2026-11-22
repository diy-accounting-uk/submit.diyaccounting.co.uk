// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { buildPscNotificationBody, entityProblems, individualProblems } from "@app/services/companiesHousePscNotificationXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "PSCNotification-v1-2.xsd";
const DATES = { notificationDate: "2026-10-28", confirmationDate: "2026-11-04" };
const HOME = {
  premise: "14",
  street: "Heol y Bont",
  postTown: "Aberystwyth",
  county: "Ceredigion",
  country: "GB-WLS",
  postcode: "SY23 1PZ",
};
const SERVICE = { premise: "Unit 3", street: "Parc Gwyddoniaeth", postTown: "Aberystwyth", country: "GB-WLS", postcode: "SY23 3AH" };

const GWEN = {
  kind: "individual-person-with-significant-control",
  title: "Dr",
  forename: "Gwenllian",
  otherForenames: "Mair",
  surname: "Pryce",
  dateOfBirth: "1978-03-14",
  nationality: "British",
  countryOfResidence: "Wales",
  serviceAddress: { address: SERVICE },
  residentialAddress: { address: HOME },
  naturesOfControl: ["OWNERSHIPOFSHARES_50TO75PERCENT", "VOTINGRIGHTS_50TO75PERCENT"],
  ...DATES,
};

const HOLDING = {
  kind: "corporate-entity-person-with-significant-control",
  name: "TEIFI VALLEY HOLDINGS LIMITED",
  address: { premise: "Ty Teifi", street: "Stryd Fawr", postTown: "Cardigan", country: "GB-WLS", postcode: "SA43 1HJ" },
  legalForm: "Private company limited by shares",
  lawGoverned: "Companies Act 2006",
  placeRegistered: "Companies House",
  registrationNumber: "09876543",
  countryOrState: "Wales",
  naturesOfControl: ["OWNERSHIPOFSHARES_75TO100PERCENT", "VOTINGRIGHTS_75TO100PERCENT", "RIGHTTOAPPOINTANDREMOVEDIRECTORS"],
  ...DATES,
};

const COUNCIL = {
  kind: "legal-person-person-with-significant-control",
  name: "Ceredigion County Council",
  address: { premise: "Canolfan Rheidol", street: "Rhodfa Padarn", postTown: "Aberystwyth", country: "GB-WLS", postcode: "SY23 3UE" },
  legalForm: "Local authority",
  lawGoverned: "Local Government (Wales) Act 1994",
  naturesOfControl: ["SIGINFLUENCECONTROL"],
  ...DATES,
};

describe("companiesHousePscNotificationXml", () => {
  test("an individual's notice is valid against PSCNotification-v1-2.xsd, in the schema's order", async () => {
    const xml = buildPscNotificationBody(GWEN);
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Individual><Title>Dr</Title><Forename>Gwenllian</Forename><OtherForenames>Mair</OtherForenames><Surname>Pryce</Surname>" +
        "<ServiceAddress><Address><Premise>Unit 3</Premise><Street>Parc Gwyddoniaeth</Street><PostTown>Aberystwyth</PostTown>" +
        "<Country>GB-WLS</Country><Postcode>SY23 3AH</Postcode></Address></ServiceAddress><DOB>1978-03-14</DOB>" +
        "<Nationality>British</Nationality><CountryOfResidence>Wales</CountryOfResidence><ResidentialAddress><Address>",
    );
    expect(xml).toContain(
      "</Individual><NatureOfControls><NatureOfControl>OWNERSHIPOFSHARES_50TO75PERCENT</NatureOfControl>" +
        "<NatureOfControl>VOTINGRIGHTS_50TO75PERCENT</NatureOfControl></NatureOfControls>" +
        "<NotificationDate>2026-10-28</NotificationDate><ConfirmationDate>2026-11-04</ConfirmationDate></PSCNotification>",
    );
  });

  test("an individual whose service address is the registered office, with a verified identity, is valid", async () => {
    const xml = buildPscNotificationBody({
      ...GWEN,
      serviceAddress: { sameAsRegisteredOffice: true },
      verification: { personalCode: "ABCDE123456", nameMismatchReason: "PREFERRED_NAME" },
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<ServiceAddress><SameAsRegisteredOffice>true</SameAsRegisteredOffice></ServiceAddress>");
    expect(xml).toContain(
      "<VerificationDetails><CompaniesHousePersonalCode>ABCDE123456</CompaniesHousePersonalCode><VerificationStatements>" +
        "<VerificationStatementForIndividual>INDIVIDUAL_VERIFIED</VerificationStatementForIndividual></VerificationStatements>" +
        "<NameMismatchReason>PREFERRED_NAME</NameMismatchReason></VerificationDetails></Individual>",
    );
  });

  test("an individual who lives at the service address, and one with a home abroad, are valid", async () => {
    const same = buildPscNotificationBody({ ...GWEN, residentialAddress: { sameAsServiceAddress: true } });
    expect(await gatewayFormSchemaErrors(same, SCHEMA)).toEqual([]);
    expect(same).toContain("<ResidentialAddress><SameAsServiceAddress>true</SameAsServiceAddress></ResidentialAddress>");
    const abroad = buildPscNotificationBody({
      ...GWEN,
      countryOfResidence: "Ireland",
      residentialAddress: { address: { premise: "7", street: "Sraid an Mhuilinn", postTown: "Galway", otherForeignCountry: "Ireland" } },
    });
    expect(await gatewayFormSchemaErrors(abroad, SCHEMA)).toEqual([]);
    expect(abroad).toContain("<OtherForeignCountry>Ireland</OtherForeignCountry>");
  });

  test("a relevant legal entity's notice is valid, with its register and number", async () => {
    const xml = buildPscNotificationBody(HOLDING);
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Corporate><CorporateName>TEIFI VALLEY HOLDINGS LIMITED</CorporateName><Address><Premise>Ty Teifi</Premise>" +
        "<Street>Stryd Fawr</Street><PostTown>Cardigan</PostTown><Country>GB-WLS</Country><Postcode>SA43 1HJ</Postcode></Address>" +
        "<PSCCompanyIdentification><PSCPlaceRegistered>Companies House</PSCPlaceRegistered><PSCRegistrationNumber>09876543</PSCRegistrationNumber>" +
        "<LawGoverned>Companies Act 2006</LawGoverned><LegalForm>Private company limited by shares</LegalForm>" +
        "<CountryOrState>Wales</CountryOrState></PSCCompanyIdentification></Corporate>",
    );
  });

  test("a relevant legal entity entered in no register is valid without the register's details", async () => {
    const xml = buildPscNotificationBody({
      ...HOLDING,
      placeRegistered: undefined,
      registrationNumber: undefined,
      countryOrState: undefined,
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<PSCCompanyIdentification><LawGoverned>");
  });

  test("an other registrable person's notice is valid", async () => {
    const xml = buildPscNotificationBody(COUNCIL);
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<LegalPerson><LegalPersonName>Ceredigion County Council</LegalPersonName><Address>" +
        "<Premise>Canolfan Rheidol</Premise><Street>Rhodfa Padarn</Street><PostTown>Aberystwyth</PostTown><Country>GB-WLS</Country>" +
        "<Postcode>SY23 3UE</Postcode></Address><LegalPersonIdentification><LawGoverned>Local Government (Wales) Act 1994</LawGoverned>" +
        "<LegalForm>Local authority</LegalForm></LegalPersonIdentification></LegalPerson>",
    );
  });

  test("controls held through a trust and a firm are valid", async () => {
    const xml = buildPscNotificationBody({
      ...GWEN,
      naturesOfControl: ["OWNERSHIPOFSHARES_25TO50PERCENT", "OWNERSHIPOFSHARES_25TO50PERCENT_AS_TRUST", "SIGINFLUENCECONTROL_AS_FIRM"],
    });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("escapes text that XML would read as markup", async () => {
    const xml = buildPscNotificationBody({ ...HOLDING, name: "JONES & DAUGHTERS <HOLDINGS> LIMITED" });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<CorporateName>JONES &amp; DAUGHTERS &lt;HOLDINGS&gt; LIMITED</CorporateName>");
  });

  test("refuses a date before the register began, a confirmation before the notification, and a missing control", () => {
    expect(() => buildPscNotificationBody({ ...GWEN, notificationDate: "2016-04-05", confirmationDate: "2016-04-05" })).toThrow(
      "notificationDate cannot be before 2016-04-06",
    );
    expect(() => buildPscNotificationBody({ ...GWEN, confirmationDate: "2026-10-27" })).toThrow(
      "confirmationDate cannot be before notificationDate",
    );
    expect(() => buildPscNotificationBody({ ...GWEN, naturesOfControl: [] })).toThrow("at least one nature of control is needed");
    expect(() => buildPscNotificationBody({ ...GWEN, notificationDate: "28/10/2026" })).toThrow("notificationDate must be YYYY-MM-DD");
  });

  test("refuses an individual's particulars PSC01 asks for and an address it cannot hold", () => {
    expect(individualProblems({ ...GWEN, surname: "", nationality: "", countryOfResidence: "", dateOfBirth: "1978-03" })).toEqual([
      "an individual PSC needs a surname",
      "dateOfBirth must be YYYY-MM-DD",
      "an individual PSC needs a nationality",
      "an individual PSC needs a country of residence",
    ]);
    expect(
      individualProblems({ ...GWEN, serviceAddress: { sameAsRegisteredOffice: true }, residentialAddress: { sameAsServiceAddress: true } }),
    ).toEqual(["the usual residential address cannot be the service address when that is the registered office"]);
    expect(individualProblems({ ...GWEN, serviceAddress: {}, residentialAddress: undefined })).toEqual([
      "an individual PSC needs a service address or the registered office",
      "an individual PSC needs a usual residential address or the service address",
    ]);
    expect(individualProblems({ ...GWEN, residentialAddress: { address: { premise: "14", postTown: "Aberystwyth" } } })).toEqual([
      "usual residential address: an address needs one country",
    ]);
    expect(individualProblems({ ...GWEN, verification: { personalCode: "short", nameMismatchReason: "NICKNAME" } })).toEqual([
      "a personal code is the 11-character Companies House personal code, letters then digits",
      "nameMismatchReason is not one of the reasons Companies House lists",
    ]);
  });

  test("refuses a character the gateway does not accept, naming the field and the character", () => {
    expect(
      individualProblems({ ...GWEN, surname: "Prŷs", residentialAddress: { address: { ...HOME, street: "Ffordd Glyndŵr" } } }),
    ).toEqual([
      "surname has characters Companies House does not accept: ŷ",
      "usual residential address street has characters Companies House does not accept: ŵ",
    ]);
    expect(entityProblems({ ...COUNCIL, name: "Cyngor Sir Ceredigion – Gwasanaethau" }, false)).toEqual([
      "name has characters Companies House does not accept: –",
    ]);
    expect(() => buildPscNotificationBody({ ...GWEN, surname: "PRŶS" })).not.toThrow();
  });

  test("refuses an entity without its legal form, its governing law, or a number in the register it names", () => {
    expect(entityProblems({ ...HOLDING, legalForm: "", lawGoverned: "", registrationNumber: "" }, true)).toEqual([
      "legalForm is needed",
      "lawGoverned is needed",
      "an entity entered in a register needs its registration number there",
    ]);
    expect(entityProblems({ ...COUNCIL, name: "" }, false)).toEqual(["an other registrable person needs its name"]);
  });
});
