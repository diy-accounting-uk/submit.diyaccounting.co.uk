// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// A Companies House form opened with ?companyNumber= in its address starts with that company number
// in its company number field, as the company lookup's "File this" buttons open it. A value that is
// not a company number is left out. The same buttons carry the company's current values for the
// fields a form has: the registered office's address fields and the accounting period's dates. Each
// fills its field when the form has one and it is empty; a value of the wrong shape is left out.

(function () {
  "use strict";

  const params = new URLSearchParams(window.location.search);

  const value = params.get("companyNumber");
  if (value) {
    let companyNumber = value.trim().toUpperCase();
    if (/^\d+$/.test(companyNumber)) companyNumber = companyNumber.padStart(8, "0");
    const input = document.getElementById("companyNumber");
    if (/^[A-Z0-9]{8}$/.test(companyNumber) && input && !input.value) input.value = companyNumber;
  }

  const ADDRESS_PART = /^[^<>]{1,200}$/;
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const FIELD_SHAPES = {
    premises: ADDRESS_PART,
    addressLine1: ADDRESS_PART,
    addressLine2: ADDRESS_PART,
    locality: ADDRESS_PART,
    region: ADDRESS_PART,
    postalCode: /^[A-Za-z0-9 ]{1,10}$/,
    country: ADDRESS_PART,
    periodStart: DATE,
    periodEnd: DATE,
  };
  Object.entries(FIELD_SHAPES).forEach(([id, shape]) => {
    const fieldValue = params.get(id);
    const field = document.getElementById(id);
    if (!fieldValue || !shape.test(fieldValue) || !field) return;
    if (field.tagName === "SELECT") {
      if (Array.from(field.options).some((option) => option.value === fieldValue)) field.value = fieldValue;
    } else if (!field.value) {
      field.value = fieldValue;
    }
  });
})();
