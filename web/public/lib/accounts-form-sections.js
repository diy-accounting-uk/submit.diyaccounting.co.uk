// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/accounts-form-sections.js
// The sections the micro-entity and small company accounts pages share: the registered office
// parts, the accountants' report and the controlling party. Each reads its boxes into the part of
// the request body it owns, and sends nothing when the customer left the section empty.

(function () {
  "use strict";

  const OFFICE_BOXES = {
    addressLine1: "officeAddressLine1",
    addressLine2: "officeAddressLine2",
    addressLine3: "officeAddressLine3",
    cityOrTown: "officeCityOrTown",
    countyRegion: "officeCountyRegion",
    postalCode: "officePostalCode",
    country: "officeCountry",
  };

  // page-chrome.js gives the text in the chosen language; without it the English stands, with its values.
  function siteText(id, english, values) {
    if (window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  function boxValue(id) {
    return document.getElementById(id).value.trim();
  }

  function fillRegisteredOffice(office) {
    Object.entries(OFFICE_BOXES).forEach(([part, id]) => {
      document.getElementById(id).value = office?.[part] ?? "";
    });
  }

  // The parts two offices are compared on: the register and a filed document write the country in
  // different words, so it is left out, and a postcode is compared without its spaces.
  function officeKey(office) {
    return ["addressLine1", "addressLine2", "addressLine3", "cityOrTown", "countyRegion", "postalCode"]
      .map((part) => {
        const text = String(office?.[part] ?? "")
          .trim()
          .replace(/\s+/g, " ")
          .toLowerCase();
        return part === "postalCode" ? text.replace(/ /g, "") : text;
      })
      .join("|");
  }

  function officeLine(office) {
    return Object.keys(OFFICE_BOXES)
      .map((part) => String(office?.[part] ?? "").trim())
      .filter(Boolean)
      .join(", ");
  }

  // On a revision: fill the office the filed accounts state, and say under the office fields when the
  // register's office today differs from it. Without a filed office the register's office fills them.
  function fillFiledRegisteredOffice(filedOffice, registerOffice) {
    const differs = document.getElementById("officeDiffersHint");
    if (!filedOffice) {
      fillRegisteredOffice(registerOffice);
      differs.hidden = true;
      return;
    }
    fillRegisteredOffice(filedOffice);
    document.getElementById("officeHint").textContent = siteText(
      "ch.office.filled-from-filed",
      "Filled in from the accounts you filed. Change a part to correct it.",
    );
    differs.hidden = !registerOffice?.addressLine1 || officeKey(filedOffice) === officeKey(registerOffice);
    differs.textContent = differs.hidden
      ? ""
      : siteText(
          "ch.office.differs-from-register",
          "The Companies House register gives the registered office today as {office}. The revised accounts keep the office the filed accounts state unless you change it.",
          { office: officeLine(registerOffice) },
        );
  }

  function readRegisteredOffice() {
    const office = {};
    Object.entries(OFFICE_BOXES).forEach(([part, id]) => {
      const value = boxValue(id);
      if (value) office[part] = value;
    });
    return Object.keys(office).length > 0 ? office : undefined;
  }

  function accountantsReportIncluded() {
    return document.getElementById("includeAccountantsReport").checked;
  }

  function showAccountantsReportFields() {
    document.getElementById("accountantsReportFields").style.display = accountantsReportIncluded() ? "block" : "none";
  }

  function readAccountantsReport() {
    if (!accountantsReportIncluded()) return undefined;
    return { accountantsName: boxValue("accountantsName"), statement: boxValue("accountantsStatement") };
  }

  function controllingPartyChoice() {
    return document.querySelector('input[name="controllingParty"]:checked').value;
  }

  function showControllingPartyFields() {
    document.getElementById("controllingPartyFields").style.display = controllingPartyChoice() === "named" ? "block" : "none";
  }

  function readControllingParty() {
    const choice = controllingPartyChoice();
    if (choice === "noUltimate") return { ultimate: false };
    if (choice === "named") {
      return { name: boxValue("controllingPartyName"), ultimate: document.getElementById("controllingPartyUltimate").checked };
    }
    return undefined;
  }

  // The document's own style lays a statement out for paper: wide page margins and a fixed width for
  // each figure column. In a frame on a phone that pushes the last column past the frame's edge, so
  // the framed copy alone takes narrower margins and columns as wide as their figures.
  const NARROW_FRAME_STYLE = `<style>@media (max-width: 40rem) {
.page { padding: 1rem 0.5rem; }
table.statement th, table.statement td { padding: 1mm 0.75mm; }
table.statement th.figure, table.statement td.figure { width: auto; }
table.statement td.positive { padding-right: 1.5mm; }
}</style>`;

  function documentForFrame(xhtml) {
    return xhtml.includes("</head>") ? xhtml.replace("</head>", `${NARROW_FRAME_STYLE}</head>`) : xhtml;
  }

  window.accountsFormSections = {
    documentForFrame,
    fillRegisteredOffice,
    fillFiledRegisteredOffice,
    readRegisteredOffice,
    showAccountantsReportFields,
    readAccountantsReport,
    showControllingPartyFields,
    readControllingParty,
  };
})();
