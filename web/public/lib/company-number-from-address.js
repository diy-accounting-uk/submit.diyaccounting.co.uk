// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// A Companies House form opened with ?companyNumber= in its address starts with that company number
// in its company number field, as the company lookup's "File this" buttons open it. A value that is
// not a company number is left out.

(function () {
  "use strict";

  const value = new URLSearchParams(window.location.search).get("companyNumber");
  if (!value) return;
  let companyNumber = value.trim().toUpperCase();
  if (/^\d+$/.test(companyNumber)) companyNumber = companyNumber.padStart(8, "0");
  if (!/^[A-Z0-9]{8}$/.test(companyNumber)) return;
  const input = document.getElementById("companyNumber");
  if (input && !input.value) input.value = companyNumber;
})();
