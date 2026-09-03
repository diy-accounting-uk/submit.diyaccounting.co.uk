// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// test-data-generator.js
// Generates test data for VAT forms in sandbox mode

/**
 * Generate a standard test VAT registration number
 * Always returns the placeholder value used throughout the application
 * @returns {string} 9-digit VAT registration number
 */
function generateTestVrn() {
  return "983238295";
}

/**
 * Generate a random period key in YYXZ format
 * Format: 2-digit year + letter + alphanumeric (e.g., 24A1, 25B3, 17NB)
 * The last character can be either a digit or a letter per HMRC specification.
 * @returns {string} Period key in YYXZ format
 */
function generateTestPeriodKey() {
  // eslint-disable-next-line sonarjs/pseudo-random
  const year = String(24 + Math.floor(Math.random() * 2)).padStart(2, "0"); // 24 or 25
  // eslint-disable-next-line sonarjs/pseudo-random
  const letter = String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
  // Last character can be digit (0-9) or letter (A-Z)

  /* eslint-disable sonarjs/pseudo-random */
  const lastChar =
    Math.random() < 0.5
      ? String(Math.floor(Math.random() * 10)) // 0-9
      : String.fromCharCode(65 + Math.floor(Math.random() * 26)); // A-Z
  /* eslint-enable sonarjs/pseudo-random */
  return `${year}${letter}${lastChar}`;
}

/**
 * Generate a random VAT amount suitable for testing
 * Returns a decimal number with 2 decimal places
 * @returns {string} VAT amount as string (e.g., "1000.00")
 */
function generateTestVatAmount() {
  // Generate a random amount between 100 and 10000
  // eslint-disable-next-line sonarjs/pseudo-random
  const amount = Math.floor(Math.random() * 9900) + 100;
  // eslint-disable-next-line sonarjs/pseudo-random
  const cents = Math.floor(Math.random() * 100);
  return `${amount}.${String(cents).padStart(2, "0")}`;
}

/**
 * Generate a complete 9-box VAT return test data
 * Box 3 = Box 1 + Box 2 (calculated)
 * Box 5 = |Box 3 - Box 4| (calculated, always positive)
 * @returns {object} Object with all 9 VAT box values
 */
function generateTest9BoxData() {
  // Generate realistic values for a small business
  // eslint-disable-next-line sonarjs/pseudo-random
  const vatDueSales = Math.floor(Math.random() * 5000) + 500; // £500 - £5500
  // eslint-disable-next-line sonarjs/pseudo-random
  const vatDueAcquisitions = Math.random() < 0.3 ? Math.floor(Math.random() * 200) : 0; // 30% chance of EU acquisitions
  const totalVatDue = vatDueSales + vatDueAcquisitions;
  // eslint-disable-next-line sonarjs/pseudo-random
  const vatReclaimedCurrPeriod = Math.floor(Math.random() * Math.min(totalVatDue * 0.8, 3000)); // Up to 80% of total or £3000
  const netVatDue = Math.abs(totalVatDue - vatReclaimedCurrPeriod);

  // eslint-disable-next-line sonarjs/pseudo-random
  const totalValueSalesExVAT = Math.floor((vatDueSales / 0.2) * (1 + Math.random() * 0.2)); // Approximate sales value
  // eslint-disable-next-line sonarjs/pseudo-random
  const totalValuePurchasesExVAT = Math.floor((vatReclaimedCurrPeriod / 0.2) * (1 + Math.random() * 0.2)); // Approximate purchase value
  // eslint-disable-next-line sonarjs/pseudo-random
  const totalValueGoodsSuppliedExVAT = Math.random() < 0.2 ? Math.floor(Math.random() * 1000) : 0; // 20% chance

  const totalAcquisitionsExVAT = vatDueAcquisitions > 0 ? Math.floor(vatDueAcquisitions / 0.2) : 0;

  return {
    vatDueSales: vatDueSales.toFixed(2),
    vatDueAcquisitions: vatDueAcquisitions.toFixed(2),
    totalVatDue: totalVatDue.toFixed(2),
    vatReclaimedCurrPeriod: vatReclaimedCurrPeriod.toFixed(2),
    netVatDue: netVatDue.toFixed(2),
    totalValueSalesExVAT: String(totalValueSalesExVAT),
    totalValuePurchasesExVAT: String(totalValuePurchasesExVAT),
    totalValueGoodsSuppliedExVAT: String(totalValueGoodsSuppliedExVAT),
    totalAcquisitionsExVAT: String(totalAcquisitionsExVAT),
  };
}

/**
 * Generate a valid ISO date string for a date within the current calendar year
 * @returns {string} Date in YYYY-MM-DD format
 */
function generateTestDate() {
  const year = new Date().getFullYear();
  // eslint-disable-next-line sonarjs/pseudo-random
  const month = Math.floor(Math.random() * 12) + 1; // 1-12
  // eslint-disable-next-line sonarjs/pseudo-random
  const day = Math.floor(Math.random() * 28) + 1; // 1-28 (safe for all months)
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Generate a date range for VAT obligations
 * Returns from date at start of current year, to date at current date
 * @returns {{from: string, to: string}} Object with from and to dates in YYYY-MM-DD format
 */
function generateTestDateRange() {
  const now = new Date();
  const year = now.getFullYear();
  const from = `${year}-01-01`;
  const to = now.toISOString().split("T")[0]; // Current date in YYYY-MM-DD
  return { from, to };
}

/**
 * Populate the VAT submission form with test data
 * Used in submitVat.html - now supports 9-box VAT return
 */
function populateSubmitVatForm() {
  const vrnInput = document.getElementById("vatNumber");
  const periodKeyInput = document.getElementById("periodKey");
  const obligationSelect = document.getElementById("obligationSelect");
  const periodStartInput = document.getElementById("periodStart");
  const periodEndInput = document.getElementById("periodEnd");

  const testVrn = generateTestVrn();
  const testPeriodKey = generateTestPeriodKey();

  if (vrnInput) vrnInput.value = testVrn;
  if (periodKeyInput) periodKeyInput.value = testPeriodKey;

  // Set default period dates based on the simulator's default open obligation
  // Both the simulator and HMRC sandbox use Q1 2017 (2017-01-01 to 2017-03-31) as the default open period
  // Note: allowSandboxObligations is also enabled so the backend will use whatever
  // open obligation is available if these dates don't match exactly
  if (periodStartInput) periodStartInput.value = "2017-01-01";
  if (periodEndInput) periodEndInput.value = "2017-03-31";

  // Also populate the obligation dropdown with a test option if it exists
  if (obligationSelect) {
    // Add a test option to the dropdown
    const testOption = document.createElement("option");
    testOption.value = testPeriodKey;
    testOption.textContent = "Test Period (Sandbox)";
    testOption.selected = true;
    obligationSelect.innerHTML = ""; // Clear existing options
    obligationSelect.appendChild(testOption);
  }

  // Check if we're using the new 9-box form or legacy single-field form
  const vatDueSalesInput = document.getElementById("vatDueSales");

  if (vatDueSalesInput) {
    // New 9-box form
    const boxData = generateTest9BoxData();

    document.getElementById("vatDueSales").value = boxData.vatDueSales;
    document.getElementById("vatDueAcquisitions").value = boxData.vatDueAcquisitions;
    document.getElementById("totalVatDue").value = boxData.totalVatDue;
    document.getElementById("vatReclaimedCurrPeriod").value = boxData.vatReclaimedCurrPeriod;
    document.getElementById("netVatDue").value = boxData.netVatDue;
    document.getElementById("totalValueSalesExVAT").value = boxData.totalValueSalesExVAT;
    document.getElementById("totalValuePurchasesExVAT").value = boxData.totalValuePurchasesExVAT;
    document.getElementById("totalValueGoodsSuppliedExVAT").value = boxData.totalValueGoodsSuppliedExVAT;
    document.getElementById("totalAcquisitionsExVAT").value = boxData.totalAcquisitionsExVAT;

    // Check the declaration checkbox
    const declarationCheckbox = document.getElementById("declaration");
    if (declarationCheckbox) declarationCheckbox.checked = true;

    console.log("[Test Data] Populated 9-box VAT submission form with test data:", boxData);
  } else {
    // Legacy single-field form (backward compatibility)
    const vatDueInput = document.getElementById("vatDue");
    if (vatDueInput) vatDueInput.value = generateTestVatAmount();
    console.log("[Test Data] Populated legacy VAT submission form with test data");
  }

  // Auto-check allowSandboxObligations in sandbox mode - this allows the backend
  // to use any available open obligation if the test dates don't match HMRC's actual obligations
  const allowSandboxObligationsCheckbox = document.getElementById("allowSandboxObligations");
  if (allowSandboxObligationsCheckbox) {
    allowSandboxObligationsCheckbox.checked = true;
    console.log("[Test Data] Auto-checked allowSandboxObligations for sandbox testing");
  }

  // Show the sandbox obligations option and developer section for test data
  const sandboxObligationsOption = document.getElementById("sandboxObligationsOption");
  const developerSection = document.getElementById("developerSection");
  if (sandboxObligationsOption) {
    sandboxObligationsOption.style.display = "block";
  }
  if (developerSection) {
    developerSection.style.display = "block";
    // Update the toggle button text
    const toggleBtn = document.getElementById("toggleDeveloperMode");
    if (toggleBtn) toggleBtn.textContent = "Hide Developer Options";
  }
}

/**
 * Populate the view VAT return form with test data
 * Used in viewVatReturn.html
 * Now uses date inputs instead of dropdown (matches submitVat.html pattern)
 */
function populateViewVatReturnForm() {
  const vrnInput = document.getElementById("vrn");
  const periodStartInput = document.getElementById("periodStart");
  const periodEndInput = document.getElementById("periodEnd");

  const testVrn = generateTestVrn();
  // Use the standard Q1 2017 test obligation dates (matches simulator and HMRC sandbox)
  const testDateRange = { from: "2017-01-01", to: "2017-03-31" };

  if (vrnInput) vrnInput.value = testVrn;
  if (periodStartInput) periodStartInput.value = testDateRange.from;
  if (periodEndInput) periodEndInput.value = testDateRange.to;

  console.log("[Test Data] Populated view VAT return form with test data");
}

/**
 * Populate the VAT obligations form with test data
 * Used in vatObligations.html
 */
function populateVatObligationsForm() {
  const vrnInput = document.getElementById("vrn");
  const fromDateInput = document.getElementById("fromDate");
  const toDateInput = document.getElementById("toDate");

  const dateRange = generateTestDateRange();

  if (vrnInput) vrnInput.value = generateTestVrn();
  if (fromDateInput) fromDateInput.value = dateRange.from;
  if (toDateInput) toDateInput.value = dateRange.to;

  console.log("[Test Data] Populated VAT obligations form with test data");
}

/**
 * Populate the VAT liabilities form with test data
 * Used in vatLiabilities.html
 */
function populateVatLiabilitiesForm() {
  const vrnInput = document.getElementById("vrn");
  const fromDateInput = document.getElementById("fromDate");
  const toDateInput = document.getElementById("toDate");

  const dateRange = generateTestDateRange();

  if (vrnInput) vrnInput.value = generateTestVrn();
  if (fromDateInput) fromDateInput.value = dateRange.from;
  if (toDateInput) toDateInput.value = dateRange.to;

  console.log("[Test Data] Populated VAT liabilities form with test data");
}

/**
 * Populate the VAT payments form with test data
 * Used in vatPayments.html
 */
function populateVatPaymentsForm() {
  const vrnInput = document.getElementById("vrn");
  const fromDateInput = document.getElementById("fromDate");
  const toDateInput = document.getElementById("toDate");

  const dateRange = generateTestDateRange();

  if (vrnInput) vrnInput.value = generateTestVrn();
  if (fromDateInput) fromDateInput.value = dateRange.from;
  if (toDateInput) toDateInput.value = dateRange.to;

  console.log("[Test Data] Populated VAT payments form with test data");
}

/**
 * Populate the VAT penalties form with test data
 * Used in vatPenalties.html - VRN only, this endpoint has no date range
 */
function populateVatPenaltiesForm() {
  const vrnInput = document.getElementById("vrn");

  if (vrnInput) vrnInput.value = generateTestVrn();

  console.log("[Test Data] Populated VAT penalties form with test data");
}

// Make functions available globally for inline script usage
if (typeof window !== "undefined") {
  window.testDataGenerator = {
    generateTestVrn,
    generateTestPeriodKey,
    generateTestVatAmount,
    generateTest9BoxData,
    generateTestDate,
    generateTestDateRange,
    populateSubmitVatForm,
    populateViewVatReturnForm,
    populateVatObligationsForm,
    populateVatLiabilitiesForm,
    populateVatPaymentsForm,
    populateVatPenaltiesForm,
  };
}
