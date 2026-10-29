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

  function boxValue(id) {
    return document.getElementById(id).value.trim();
  }

  function fillRegisteredOffice(office) {
    Object.entries(OFFICE_BOXES).forEach(([part, id]) => {
      document.getElementById(id).value = office?.[part] ?? "";
    });
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

  window.accountsFormSections = {
    fillRegisteredOffice,
    readRegisteredOffice,
    showAccountantsReportFields,
    readAccountantsReport,
    showControllingPartyFields,
    readControllingParty,
  };
})();
