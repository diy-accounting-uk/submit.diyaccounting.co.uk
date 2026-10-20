// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

const FORM_VALIDATORS = [
  ["form-vat", window.validateVAT],
  ["form-utr", window.validateUTR],
  ["form-nino", window.validateNINO],
  ["form-paye", window.validatePAYE],
  ["form-accounts-ref", window.validateAccountsRef],
  ["form-eori", window.validateEORI],
  ["form-currency", window.validateCurrency],
  ["form-date", window.validateDate],
];

const ERROR_DEMOS = [
  ["show-error-vat", "vat"],
  ["show-error-utr", "utr"],
  ["show-error-nino", "nino"],
];

FORM_VALIDATORS.forEach(([formId, validate]) => {
  document.getElementById(formId).addEventListener("submit", validate);
});

ERROR_DEMOS.forEach(([buttonId, fieldType]) => {
  document.getElementById(buttonId).addEventListener("click", () => window.showError(fieldType));
});
