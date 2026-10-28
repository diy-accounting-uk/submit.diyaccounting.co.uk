// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

function renderSearchResults(results) {
  const container = document.getElementById("searchResults");
  container.innerHTML = "";

  if (!results.items || results.items.length === 0) {
    container.textContent = "No companies matched that search.";
    return;
  }

  const table = document.createElement("table");
  table.className = "data-table";
  table.innerHTML = "<thead><tr><th>Company</th><th>Number</th><th>Status</th><th>Incorporated</th><th>Address</th></tr></thead>";
  const tbody = document.createElement("tbody");

  results.items.forEach((item) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "link-button";
    nameButton.textContent = item.title;
    nameButton.addEventListener("click", () => openCompanyProfile(item.companyNumber));
    nameCell.appendChild(nameButton);

    const numberCell = document.createElement("td");
    numberCell.textContent = item.companyNumber;

    const statusCell = document.createElement("td");
    statusCell.textContent = window.companiesHouseLabels.companyStatusLabel(item.companyStatus);

    const incorporatedCell = document.createElement("td");
    incorporatedCell.textContent = window.companiesHouseLabels.formatCompanyDate(item.dateOfCreation);

    const addressCell = document.createElement("td");
    addressCell.textContent = item.addressSnippet || "";

    row.appendChild(nameCell);
    row.appendChild(numberCell);
    row.appendChild(statusCell);
    row.appendChild(incorporatedCell);
    row.appendChild(addressCell);
    tbody.appendChild(row);
  });

  table.appendChild(tbody);
  container.appendChild(table);
}

async function submitCompanySearch(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyQuery"])) return;
  const query = document.getElementById("companyQuery").value.trim();

  window.showLoading ? window.showLoading() : null;
  window.hideStatus ? window.hideStatus() : null;

  try {
    const results = await window.searchCompanies(query);
    renderSearchResults(results);
    document.getElementById("searchResultsContainer").style.display = "block";
  } catch (error) {
    showSearchError(error);
  } finally {
    window.hideLoading ? window.hideLoading() : null;
  }
}

function showSearchError(error) {
  if (error && error.status === 429) {
    const wait = error.retryAfterSeconds ? `in ${error.retryAfterSeconds} seconds` : "in a few minutes";
    window.showStatus(`Companies House is rate limiting our lookups. Try again ${wait}.`, "error");
  } else {
    window.showStatus((error && error.message) || "Failed to search Companies House.", "error");
  }
}

function renderCompanyProfile(profile) {
  const dl = document.getElementById("companyProfile");
  dl.innerHTML = "";

  const address = profile.registeredOfficeAddress || {};
  const addressParts = [address.address_line_1, address.locality, address.postal_code, address.country].filter(Boolean);

  const labels = window.companiesHouseLabels;
  const fields = [
    ["Name", profile.companyName],
    ["Number", profile.companyNumber],
    ["Status", labels.companyStatusLabel(profile.companyStatus)],
    ["Type", labels.companyTypeLabel(profile.companyType)],
    ["Incorporated", labels.formatCompanyDate(profile.dateOfCreation)],
    ["Jurisdiction", labels.jurisdictionLabel(profile.jurisdiction)],
    ["Registered office", addressParts.join(", ")],
    ["SIC codes", labels.formatSicCodes(profile.sicCodes)],
    ["Next accounts due", labels.formatCompanyDate(profile.accountsNextDue)],
    ["Next confirmation statement due", labels.formatCompanyDate(profile.confirmationStatementNextDue)],
  ];

  fields.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    dd.textContent = value || "";
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
}

async function openCompanyProfile(companyNumber) {
  window.showLoading ? window.showLoading() : null;
  window.hideStatus ? window.hideStatus() : null;

  try {
    const profile = await window.getCompanyProfile(companyNumber);
    renderCompanyProfile(profile);
    document.getElementById("searchView").style.display = "none";
    document.getElementById("searchResultsContainer").style.display = "none";
    document.getElementById("profileView").style.display = "block";

    const url = new URL(window.location.href);
    url.searchParams.set("companyNumber", profile.companyNumber);
    history.pushState({}, "", url);
  } catch (error) {
    showSearchError(error);
  } finally {
    window.hideLoading ? window.hideLoading() : null;
  }
}

function showNewSearch() {
  document.getElementById("searchView").style.display = "block";
  document.getElementById("profileView").style.display = "none";

  const url = new URL(window.location.href);
  url.searchParams.delete("companyNumber");
  history.pushState({}, "", url);
}

document.getElementById("companySearchForm").addEventListener("submit", submitCompanySearch);
document.getElementById("newSearchBtn").addEventListener("click", showNewSearch);

// Open the profile view directly when the URL carries a company number
(function initFromUrl() {
  const params = new URLSearchParams(window.location.search);
  const companyNumber = params.get("companyNumber");
  if (companyNumber) {
    openCompanyProfile(companyNumber);
  }
})();
