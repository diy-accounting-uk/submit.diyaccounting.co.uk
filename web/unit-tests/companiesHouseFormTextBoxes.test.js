// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/companiesHouseFormTextBoxes.test.js
// Every text box on a Companies House gateway form page is either sent under a field its form's row
// sends under its textFields, which the page's character check and the route's both cover, or marked
// data-gateway-text="off" because the gateway reads it under another pattern or it is not sent as
// form text.

import { describe, test, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { COMPANIES_HOUSE_FORMS } from "../public/lib/companies-house-forms.js";

const PAGES_DIR = path.join(process.cwd(), "web/public/companies-house");

const address = (prefix, field, suffixes = ["Premise", "Street", "PostTown", "County", "OtherCountry", "Postcode"]) =>
  Object.fromEntries(suffixes.map((suffix) => [`${prefix}${suffix}`, field]));
const pscAddress = (prefix, field) =>
  address(prefix, field, ["Premise", "Street", "Thoroughfare", "PostTown", "County", "Postcode", "OtherForeignCountry"]);

// Each page, the kinds it files, and the field each text box is sent under.
const PAGES = {
  appointOfficer: {
    kinds: ["officer-appointment"],
    fields: {
      officerTitle: "title",
      officerForename: "forename",
      officerOtherForenames: "otherForenames",
      officerSurname: "surname",
      formerForename: "previousNames[].forename",
      formerSurname: "previousNames[].surname",
      ...address("service", "serviceAddress.address.*"),
      nationality: "nationality",
      countryOfResidence: "countryOfResidence",
      ...address("residential", "residentialAddress.address.*"),
      corporateName: "corporateName",
      ...address("corporate", "address.*"),
      ukRegistrationNumber: "companyIdentification.uk.*",
      legalForm: "companyIdentification.nonUk.*",
      lawGoverned: "companyIdentification.nonUk.*",
      placeRegistered: "companyIdentification.nonUk.*",
      nonUkRegistrationNumber: "companyIdentification.nonUk.*",
    },
  },
  allotShares: { kinds: ["allotment-of-shares"], fields: {} },
  ceasePsc: { kinds: ["psc-cessation"], fields: {} },
  changeAccountingRefDate: { kinds: ["accounting-reference-date"], fields: {} },
  changeCompanyName: { kinds: ["change-of-name"], fields: {} },
  changeOfficer: {
    kinds: ["officer-change"],
    fields: {
      officerTitle: "title",
      officerForename: "forename",
      officerOtherForenames: "otherForenames",
      officerSurname: "surname",
      corporateName: "corporateName",
      newTitle: "newName.*",
      newForename: "newName.*",
      newOtherForenames: "newName.*",
      newSurname: "newName.*",
      ...address("service", "serviceAddress.address.*"),
      ...address("residential", "residentialAddress.address.*"),
      nationality: "nationality",
      newCorporateName: "newCorporateName",
      ...address("corporate", "address.*"),
      ukRegistrationNumber: "companyIdentification.uk.*",
      legalForm: "companyIdentification.nonUk.*",
      lawGoverned: "companyIdentification.nonUk.*",
      placeRegistered: "companyIdentification.nonUk.*",
      nonUkRegistrationNumber: "companyIdentification.nonUk.*",
    },
  },
  changePscDetails: {
    kinds: ["psc-change-details"],
    fields: {
      ...Object.fromEntries(
        ["premise", "street", "thoroughfare", "postTown", "county", "postcode", "otherForeignCountry"].map((id) => [id, "address.*"]),
      ),
      newTitle: "newName.*",
      newForename: "newName.*",
      newOtherForenames: "newName.*",
      newSurname: "newName.*",
      newEntityName: "newName",
      ...pscAddress("res", "residentialAddress.*"),
      newNationality: "nationality",
      newCountryOfResidence: "countryOfResidence",
      legalForm: "identification.*",
      lawGoverned: "identification.*",
      placeRegistered: "identification.*",
      countryOrState: "identification.*",
      registrationNumber: "identification.*",
    },
  },
  fileConfirmationStatement: { kinds: ["confirmation-statement", "psc-verification-statement"], fields: {} },
  notifyPsc: {
    kinds: ["psc-notification"],
    fields: {
      title: "title",
      forename: "forename",
      otherForenames: "otherForenames",
      surname: "surname",
      nationality: "nationality",
      countryOfResidence: "countryOfResidence",
      ...pscAddress("service", "serviceAddress.address.*"),
      ...pscAddress("home", "residentialAddress.address.*"),
      entityName: "name",
      ...pscAddress("office", "address.*"),
      legalForm: "legalForm",
      lawGoverned: "lawGoverned",
      placeRegistered: "placeRegistered",
      countryOrState: "countryOrState",
      registrationNumber: "registrationNumber",
    },
  },
  pscStatements: { kinds: ["psc-statement-notification", "psc-statement-withdrawal"], fields: {} },
  recordsLocation: {
    kinds: ["sail-address", "record-location"],
    fields: Object.fromEntries(
      ["sailPremise", "sailStreet", "sailThoroughfare", "sailPostTown", "sailCounty", "sailPostcode", "sailCareOf", "sailPoBox"].map(
        (id) => [id, "address.*"],
      ),
    ),
  },
  removeOfficer: {
    kinds: ["officer-resignation"],
    fields: {
      officerTitle: "title",
      officerForename: "forename",
      officerOtherForenames: "otherForenames",
      officerSurname: "surname",
      corporateName: "corporateName",
    },
  },
};

// Whether a row's textFields send a field: the field's path, or, for "<parent>.*", any path under it.
function sends(textFields, field) {
  return Object.keys(textFields).some((sent) => sent === field || (field.endsWith(".*") && sent.startsWith(field.slice(0, -1))));
}

// Every text box inside the page's main element: its id and whether it is marked off.
function textBoxes(html) {
  const main = html.slice(html.indexOf("<main"), html.indexOf("</main>"));
  return [...main.matchAll(/<(input|textarea)\b([^>]*)>/g)]
    .filter(([, tag, attributes]) => tag === "textarea" || !/\stype="/.test(attributes) || /\stype="text"/.test(attributes))
    .map(([, , attributes]) => ({ id: attributes.match(/\sid="([^"]+)"/)?.[1], off: /\sdata-gateway-text="off"/.test(attributes) }))
    .filter((box) => box.id !== "govTestScenario");
}

describe("the text boxes of each Companies House gateway form page", () => {
  test("the table names a page for every kind on the shared route and the confirmation statement", () => {
    const covered = Object.values(PAGES).flatMap((page) => page.kinds);
    const textChecked = Object.entries(COMPANIES_HOUSE_FORMS)
      .filter(([, row]) => row.textFields)
      .map(([kind]) => kind);
    expect([...new Set(covered)].sort()).toEqual(textChecked.sort());
  });

  describe.each(Object.entries(PAGES))("%s", (name, { kinds, fields }) => {
    for (const language of ["", "cy/"]) {
      test(`${language || "English "}page: each text box is sent under one of its rows' textFields, or marked off`, () => {
        const html = fs.readFileSync(path.join(PAGES_DIR, "..", language, "companies-house", `${name}.html`), "utf-8");
        const unaccounted = textBoxes(html)
          .filter((box) => !box.off)
          .filter((box) => !fields[box.id] || !kinds.some((kind) => sends(COMPANIES_HOUSE_FORMS[kind].textFields, fields[box.id])))
          .map((box) => box.id);
        expect(unaccounted).toEqual([]);
        for (const box of textBoxes(html).filter((candidate) => candidate.off)) expect(fields[box.id], box.id).toBeUndefined();
      });
    }
  });

  test("the company search page's search box is marked off, as it is sent to no gateway form", () => {
    const html = fs.readFileSync(path.join(PAGES_DIR, "companySearch.html"), "utf-8");
    expect(textBoxes(html)).toEqual([{ id: "companyQuery", off: true }]);
  });

  test("the confirmation statement page marks off the boxes it builds that the gateway reads under another pattern", () => {
    const source = fs.readFileSync(path.join(PAGES_DIR, "fileConfirmationStatement.page.js"), "utf-8");
    const built = (prefix) => source.match(new RegExp(`textInput\\(\`${prefix}-\\$\\{index\\}\`[\\s\\S]*?\\)\\s*,?\\n`))?.[0] ?? "";
    for (const prefix of ["prescribedParticulars", "aggregateNominalValue", "directorPersonalCode", "directorNameMismatchReason"]) {
      expect(built(prefix), prefix).toContain('"data-gateway-text": "off"');
    }
    for (const prefix of ["shareClass", "holdingShareClass", "directorOtherForenames"]) {
      expect(built(prefix), prefix).not.toContain("data-gateway-text");
    }
    expect(source).toMatch(/input\.id = `pscPersonalCode-\$\{index\}`;\s*input\.dataset\.gatewayText = "off";/);
  });
});
