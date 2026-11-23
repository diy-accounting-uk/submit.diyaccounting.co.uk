// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-23 Keep a watch list of companies
// - **Use when:** a signed-in user wants the companies they look after in one list, with each one's next accounts and confirmation statement dates.
// - **Does:** watchList.page.js lists the company numbers of the account's watchedCompanies setting (app/lib/accountSettings.js, at most 50, written by PUT /api/v1/account/settings). It reads each company's profile once per visit, one at a time, and shows its name, status, next accounts and confirmation statement due dates and the time it was read. A 429 shows the lookup's rate-limit message and stops the reads. Each company links to its drill-down address and can be removed. The page searches Companies House and adds a result with watch-list-button.js, which also puts "Add to watch list" on the company lookup's results and profile.
// - **Run:** open `/companies-house/watchList.html` (activity `company-watch-list`, default bundle)
// - **Entry:** `web/public/companies-house/watchList.page.js`; `web/public/lib/watch-list-button.js:button`
// - **Files:** web/public/companies-house/watchList.html, web/public/companies-house/watchList.page.js, web/public/lib/watch-list-button.js, web/public/lib/services/watch-list-service.js, app/lib/accountSettings.js, web/browser-tests/watchList.browser.test.js
// - **Keywords:** watch list, watched companies, company watch list, next accounts due, confirmation statement due, account setting
// - **Related:** CH-03, SITE-24
// @end-capability

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

const pagePrefix = () => (window.location.pathname.startsWith("/cy/") ? "/cy" : "");

// Each watched company's profile, read once on this visit: { profile, readAt } or { problem }.
const reads = new Map();
// Set once Companies House answers 429; no more profiles are read on this visit.
let rateLimited = false;

function rateLimitMessage(error) {
  return error.retryAfterSeconds
    ? window.siteText("ch.search.rate-limited-seconds", "Companies House is rate limiting our lookups. Try again in {seconds} seconds.", {
        seconds: error.retryAfterSeconds,
      })
    : window.siteText("ch.search.rate-limited", "Companies House is rate limiting our lookups. Try again in a few minutes.");
}

const readTime = (date) =>
  date.toLocaleTimeString(window.location.pathname.startsWith("/cy/") ? "cy-GB" : "en-GB", { hour: "2-digit", minute: "2-digit" });

// The profiles of the companies not read yet on this visit, one at a time, so the page never sends
// Companies House more than one request at once. A company added while the reads run joins them.
let reading = null;
let latestList = [];

function readProfiles(list) {
  latestList = list;
  if (reading) return reading;
  reading = (async () => {
    let companyNumber;
    while (!rateLimited && (companyNumber = latestList.find((candidate) => !reads.has(candidate)))) {
      try {
        reads.set(companyNumber, { profile: await window.getCompanyProfile(companyNumber), readAt: new Date() });
      } catch (error) {
        if (error && error.status === 429) {
          rateLimited = true;
          window.showStatus(rateLimitMessage(error), "error");
        } else {
          reads.set(companyNumber, {
            problem:
              error && error.status === 404
                ? window.siteText("ch.watch.not-on-register", "Not on the register")
                : window.siteText("ch.watch.not-read", "Not read from Companies House"),
          });
        }
      }
      await renderWatchList(latestList);
    }
  })().finally(() => {
    reading = null;
  });
  return reading;
}

function cell(content) {
  const td = document.createElement("td");
  if (content instanceof Node) td.appendChild(content);
  else td.textContent = content || "";
  return td;
}

function companyLink(companyNumber, text) {
  const link = document.createElement("a");
  link.href = `${pagePrefix()}/companies-house/company/${encodeURIComponent(companyNumber)}`;
  link.textContent = text;
  return link;
}

function removeButton(companyNumber) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "secondary-button watch-list-remove";
  button.textContent = window.siteText("ch.watch.remove", "Remove");
  button.setAttribute(
    "aria-label",
    window.siteText("ch.watch.remove-company", "Remove {number} from the watch list", { number: companyNumber }),
  );
  button.addEventListener("click", async () => {
    button.disabled = true;
    try {
      await window.watchList.remove(companyNumber);
    } catch (error) {
      console.warn("The watch list was not saved:", error);
      window.showStatus(window.siteText("ch.watch.not-saved", "The watch list was not saved. Try again."), "error");
      button.disabled = false;
    }
  });
  return button;
}

function watchRow(companyNumber) {
  const labels = window.companiesHouseLabels;
  const read = reads.get(companyNumber);
  const profile = read?.profile;
  const waiting = rateLimited
    ? window.siteText("ch.watch.not-read", "Not read from Companies House")
    : window.siteText("ch.watch.reading", "Reading…");
  const row = document.createElement("tr");
  row.dataset.companyNumber = companyNumber;
  row.append(
    cell(companyLink(companyNumber, profile?.companyName || companyNumber)),
    cell(companyNumber),
    cell(profile ? labels.companyStatusLabel(profile.companyStatus) : read?.problem || waiting),
    cell(profile ? labels.formatCompanyDate(profile.accountsNextDue) : ""),
    cell(profile ? labels.formatCompanyDate(profile.confirmationStatementNextDue) : ""),
    cell(read?.readAt ? window.siteText("ch.watch.read-at", "Read at {time}", { time: readTime(read.readAt) }) : ""),
    cell(removeButton(companyNumber)),
  );
  return row;
}

async function renderWatchList(list) {
  const holder = document.getElementById("watchListTable");
  holder.innerHTML = "";
  const limit = await window.watchList.cap();
  document.getElementById("watchListEmpty").style.display = list.length === 0 ? "block" : "none";
  document.getElementById("watchListFull").style.display = list.length >= limit ? "block" : "none";
  document.getElementById("watchListCount").textContent = window.siteText("ch.watch.count", "{count} of {cap} companies", {
    count: list.length,
    cap: limit,
  });
  if (list.length === 0) return;
  const table = document.createElement("table");
  table.className = "data-table data-table--compact";
  const head = table.createTHead().insertRow();
  [
    window.siteText("ch.watch.column-company", "Company"),
    window.siteText("ch.watch.column-number", "Number"),
    window.siteText("ch.watch.column-status", "Status"),
    window.siteText("ch.watch.column-accounts-due", "Next accounts due"),
    window.siteText("ch.watch.column-confirmation-due", "Next confirmation statement due"),
    window.siteText("ch.watch.column-read", "Read"),
    window.siteText("ch.watch.column-action", "Action"),
  ].forEach((heading) => {
    const th = document.createElement("th");
    th.textContent = heading;
    head.appendChild(th);
  });
  const body = document.createElement("tbody");
  list.forEach((companyNumber) => body.appendChild(watchRow(companyNumber)));
  table.appendChild(body);
  holder.appendChild(table);
}

function renderSearchResults(results) {
  const container = document.getElementById("searchResults");
  container.innerHTML = "";
  if (!results.items || results.items.length === 0) {
    container.textContent = window.siteText("ch.search.no-match", "No companies matched that search.");
    return;
  }
  const table = document.createElement("table");
  table.className = "data-table";
  const head = table.createTHead().insertRow();
  [
    window.siteText("ch.watch.column-company", "Company"),
    window.siteText("ch.watch.column-number", "Number"),
    window.siteText("ch.watch.column-status", "Status"),
    window.siteText("ch.watch.column-action", "Action"),
  ].forEach((heading) => {
    const th = document.createElement("th");
    th.textContent = heading;
    head.appendChild(th);
  });
  const body = document.createElement("tbody");
  results.items.forEach((item) => {
    const row = document.createElement("tr");
    row.append(
      cell(item.title),
      cell(item.companyNumber),
      cell(window.companiesHouseLabels.companyStatusLabel(item.companyStatus)),
      cell(window.watchList.button(item.companyNumber)),
    );
    body.appendChild(row);
  });
  table.appendChild(body);
  container.appendChild(table);
}

async function submitSearch(event) {
  event.preventDefault();
  if (!window.formErrors.requireFields(["companyQuery"])) return;
  window.hideStatus();
  window.showLoading();
  try {
    renderSearchResults(await window.searchCompanies(document.getElementById("companyQuery").value.trim()));
    document.getElementById("searchResultsContainer").style.display = "block";
  } catch (error) {
    window.showStatus(
      error && error.status === 429
        ? rateLimitMessage(error)
        : (error && error.message) || window.siteText("ch.search.failed", "Failed to search Companies House."),
      "error",
    );
  } finally {
    window.hideLoading();
  }
}

async function openWatchList() {
  if (!localStorage.getItem("cognitoIdToken")) return;
  try {
    const list = await window.watchList.current();
    await renderWatchList(list);
    await readProfiles(list);
  } catch (error) {
    console.warn("Could not read the watch list:", error);
    window.showStatus(window.siteText("ch.watch.not-loaded", "Your watch list could not be read. Try again."), "error");
  }
}

document.getElementById("watchSearchForm").addEventListener("submit", submitSearch);
// A page the browser restores from its back-forward cache shows the register as it was when the
// reader left it, before any filing made since: read it again.
window.addEventListener("pageshow", (event) => {
  if (event.persisted) window.location.reload();
});
document.addEventListener("watchlistchange", (event) => {
  renderWatchList(event.detail);
  readProfiles(event.detail);
});

// The services load as a module, which runs after this script and before DOMContentLoaded.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", openWatchList);
} else {
  openWatchList();
}
