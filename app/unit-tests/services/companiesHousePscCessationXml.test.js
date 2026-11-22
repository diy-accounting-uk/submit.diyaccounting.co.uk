// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { buildPscCessationBody, PSC_CESSATION_KINDS } from "@app/services/companiesHousePscCessationXml.js";
import { gatewayFormSchemaErrors } from "../helpers/gatewayFormSchema.js";

const SCHEMA = "PSCCessation-v1-2.xsd";
const DATES = { cessationDate: "2026-11-01", confirmationDate: "2026-11-03" };

describe("companiesHousePscCessationXml", () => {
  test("an individual ceasing, with every particular the register shows, is valid against PSCCessation-v1-2.xsd", async () => {
    const xml = buildPscCessationBody({
      kind: "individual-person-with-significant-control",
      title: "Mrs",
      surname: "Bramwell",
      forename: "Eleanor",
      otherForenames: "Mary Ann",
      dobMonth: 1,
      dobYear: 1970,
      ...DATES,
    });

    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain(
      "<Individual><Title>Mrs</Title><Surname>Bramwell</Surname><Forename>Eleanor</Forename><OtherForenames>Mary Ann</OtherForenames>" +
        "<PartialDOB><Month>1</Month><Year>1970</Year></PartialDOB></Individual>",
    );
    expect(xml).toContain("<CessationDate>2026-11-01</CessationDate><ConfirmationDate>2026-11-03</ConfirmationDate>");
  });

  test("an individual with only a surname is valid", async () => {
    const xml = buildPscCessationBody({ kind: "individual-person-with-significant-control", surname: "Bramwell", ...DATES });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("a corporate entity ceasing names it in CorporateName and is valid", async () => {
    const xml = buildPscCessationBody({ kind: "corporate-entity-person-with-significant-control", name: "HOLDCO LIMITED", ...DATES });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<Corporate><CorporateName>HOLDCO LIMITED</CorporateName></Corporate>");
  });

  test("a legal person ceasing names it in LegalPersonName and is valid", async () => {
    const xml = buildPscCessationBody({ kind: "legal-person-person-with-significant-control", name: "The Example Trust", ...DATES });
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
    expect(xml).toContain("<LegalPerson><LegalPersonName>The Example Trust</LegalPersonName></LegalPerson>");
  });

  test("a name with markup characters is escaped and stays valid", async () => {
    const xml = buildPscCessationBody({
      kind: "corporate-entity-person-with-significant-control",
      name: "SMITH & JONES <HOLDINGS>",
      ...DATES,
    });
    expect(xml).toContain("SMITH &amp; JONES &lt;HOLDINGS&gt;");
    expect(await gatewayFormSchemaErrors(xml, SCHEMA)).toEqual([]);
  });

  test("the schema check refuses a body whose elements are out of order", async () => {
    const xml = buildPscCessationBody({
      kind: "individual-person-with-significant-control",
      surname: "Bramwell",
      forename: "Eleanor",
      ...DATES,
    });
    const reordered = xml.replace(
      "<Surname>Bramwell</Surname><Forename>Eleanor</Forename>",
      "<Forename>Eleanor</Forename><Surname>Bramwell</Surname>",
    );
    expect((await gatewayFormSchemaErrors(reordered, SCHEMA)).length).toBeGreaterThan(0);
  });

  test("each kind the register shows maps to a choice of PSCCessationType", () => {
    expect(Object.values(PSC_CESSATION_KINDS)).toEqual(["Individual", "Corporate", "LegalPerson"]);
  });

  test("an unknown kind, a missing name, a missing surname or a malformed date is refused", () => {
    expect(() => buildPscCessationBody({ kind: "super-secure-person-with-significant-control", ...DATES })).toThrow(/unknown PSC kind/);
    expect(() => buildPscCessationBody({ kind: "corporate-entity-person-with-significant-control", ...DATES })).toThrow(/needs its name/);
    expect(() => buildPscCessationBody({ kind: "individual-person-with-significant-control", ...DATES })).toThrow(/surname/);
    expect(() =>
      buildPscCessationBody({
        kind: "individual-person-with-significant-control",
        surname: "B",
        cessationDate: "1/11/2026",
        confirmationDate: "2026-11-03",
      }),
    ).toThrow(/cessationDate/);
  });
});
