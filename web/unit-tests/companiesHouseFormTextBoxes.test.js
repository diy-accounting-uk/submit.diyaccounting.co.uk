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
  fileConfirmationStatement: {
    kinds: ["confirmation-statement", "psc-verification-statement"],
    fields: {},
    scriptFields: {
      shareClass: "statementOfCapital.shares[].shareClass",
      holdingShareClass: "shareholdings[].shareClass",
      holderSurname: "shareholdings[].shareholders[].surname",
      holderForename: "shareholdings[].shareholders[].forename",
      holderAmalgamatedName: "shareholdings[].shareholders[].amalgamatedName",
      ...Object.fromEntries(
        ["Premise", "Street", "Thoroughfare", "PostTown", "County", "Postcode", "Country"].map((part) => [
          `holder${part}`,
          "shareholdings[].shareholders[].address.*",
        ]),
      ),
      directorOtherForenames: "directors[].otherForenames",
    },
  },
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

// The source of one call: from the opening bracket after its name to the bracket that closes it.
function callText(source, start) {
  let depth = 0;
  for (let index = source.indexOf("(", start); index < source.length; index += 1) {
    if (source[index] === "(") depth += 1;
    if (source[index] === ")" && --depth === 0) return source.slice(start, index + 1);
  }
  return source.slice(start);
}

// Every text box a page's script builds, by the part of its id before the first hyphen, and whether
// it is marked off: a textInput call, an element("input") of type text, and a createElement("input")
// left as text. An id built from a list (`${idPrefix}-...`) stands for each id the list names.
function scriptTextBoxes(source) {
  const boxes = [];
  const listedIds = [...source.matchAll(/\[\s*"([a-zA-Z]+)",\s*window\.siteText/g)].map(([, id]) => id);
  for (const match of source.matchAll(/\btextInput\(|\belement\("(input|textarea)",/g)) {
    if (source.slice(Math.max(0, match.index - 9), match.index) === "function ") continue;
    const call = callText(source, match.index);
    if (match[1] === "input" && !/type:\s*"text"/.test(call)) continue;
    // The helper's own body passes its id through as a variable; its callers are read instead.
    if (match[1] && /\bid,/.test(call)) continue;
    const off = /"data-gateway-text":\s*"off"/.test(call);
    const id = call.match(/^[^(]*\(\s*(?:"input",\s*\{[^}]*?\bid:\s*)?[`"]([^`"$-]*)/)?.[1] ?? "";
    const ids = id === "" && /\$\{idPrefix\}/.test(call) ? listedIds : [id];
    for (const each of ids) boxes.push({ id: each, off });
  }
  for (const match of source.matchAll(/document\.createElement\("(input|textarea)"\)/g)) {
    // The statements after it, up to the next box the script builds.
    const rest = source.slice(match.index + match[0].length, match.index + 600);
    const nextBox = rest.search(/createElement\(/);
    const following = (nextBox === -1 ? rest : rest.slice(0, nextBox)).split(";").slice(0, 8).join(";");
    const type = following.match(/\.type = "([a-z]+)"/)?.[1] ?? "text";
    if (match[1] === "input" && type !== "text") continue;
    boxes.push({
      id: following.match(/\.id = [`"]([^`"$-]*)/)?.[1] ?? "",
      off: /dataset\.gatewayText = "off"/.test(following),
    });
  }
  return boxes;
}

describe("the text boxes of each Companies House gateway form page", () => {
  test("every form on the shared route lists its textFields, so its page's boxes are checked", () => {
    const without = Object.entries(COMPANIES_HOUSE_FORMS)
      .filter(([, row]) => row.sharedPoll && !(row.textFields && typeof row.textFields === "object"))
      .map(([kind]) => kind);
    expect(without).toEqual([]);
  });

  describe.each(Object.entries(PAGES))("%s script", (name, { kinds, scriptFields = {} }) => {
    test("each text box the page's script builds is sent under one of its rows' textFields, or marked off", () => {
      const source = fs.readFileSync(path.join(PAGES_DIR, `${name}.page.js`), "utf-8");
      const unaccounted = scriptTextBoxes(source)
        .filter((box) => !box.off)
        .filter(
          (box) => !scriptFields[box.id] || !kinds.some((kind) => sends(COMPANIES_HOUSE_FORMS[kind].textFields, scriptFields[box.id])),
        )
        .map((box) => box.id || "(an id the test cannot read)");
      expect(unaccounted).toEqual([]);
    });
  });

  test("reads the boxes a script builds in each of its ways", () => {
    const source = [
      "textInput(`shareClass-${index}`, value),",
      'textInput(`prescribedParticulars-${index}`, value, { "data-gateway-text": "off" }),',
      'element("input", { type: "text", id: `plainBox-${index}` }),',
      'element("input", { type: "number", id: `numberBox-${index}` }),',
      '["holderSurname", window.siteText("a", "b"), x], ["holderPostcode", window.siteText("c", "d"), y]',
      "textInput(`${idPrefix}-${suffix}`, value),",
      'const input = document.createElement("input"); input.id = `pscPersonalCode-${index}`; input.dataset.gatewayText = "off";',
      'const radio = document.createElement("input"); radio.type = "radio"; radio.id = "choice";',
      'const box = document.createElement("input"); box.id = `freeText-${index}`;',
    ].join("\n");
    expect(scriptTextBoxes(source)).toEqual([
      { id: "shareClass", off: false },
      { id: "prescribedParticulars", off: true },
      { id: "plainBox", off: false },
      { id: "holderSurname", off: false },
      { id: "holderPostcode", off: false },
      { id: "pscPersonalCode", off: true },
      { id: "freeText", off: false },
    ]);
  });

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
    for (const prefix of ["aggregateNominalValue", "directorPersonalCode", "directorNameMismatchReason"]) {
      expect(built(prefix), prefix).toContain('"data-gateway-text": "off"');
    }
    const prescribedParticulars = source.match(/element\(\s*"textarea",\s*\{[^}]*`prescribedParticulars-\$\{index\}`[^}]*\}/)?.[0] ?? "";
    expect(prescribedParticulars).toContain('"data-gateway-text": "off"');
    for (const prefix of ["shareClass", "holdingShareClass", "directorOtherForenames"]) {
      expect(built(prefix), prefix).not.toContain("data-gateway-text");
    }
    expect(source).toMatch(/input\.id = `pscPersonalCode-\$\{index\}`;\s*input\.dataset\.gatewayText = "off";/);
  });
});
