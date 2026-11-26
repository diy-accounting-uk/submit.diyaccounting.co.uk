// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/company-books.js
// A company's books from what Companies House holds, on the company drill-down's accounts section:
// the last filed accounts opened as a book in the DIYA-GL app, the next year's book started from
// them, and the next year as a spreadsheet package the DIYA-GL app writes. The books bundle builds
// every book in this browser; the DIYA-GL addresses carry it in their fragment, which no server
// receives, and nothing is stored. The book takes the register's names, offices, officers and
// holdings only: no date of birth, nationality or shareholder's address reaches it.

import { bookTexts, diyaGlBookAddress } from "./diya-gl-link.js";

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

const pick = (object, names) =>
  Object.fromEntries(names.filter((name) => object?.[name] !== undefined && object[name] !== null).map((name) => [name, object[name]]));

/** The profile fields the book builder reads, from the profile route's answer. */
export function registerProfile(profile) {
  return {
    ...pick(profile, [
      "companyNumber",
      "companyName",
      "dateOfCreation",
      "accountsNextPeriodStart",
      "accountsNextPeriodEnd",
      "accountsLastPeriodEnd",
    ]),
    registeredOffice: pick(profile?.registeredOffice, ["addressLine1", "addressLine2", "addressLine3", "cityOrTown", "postalCode"]),
  };
}

/** The officer fields the book builder reads, from the officers route's answer. */
export function registerOfficers(officers) {
  return (officers || []).map((officer) => pick(officer, ["name", "officerRole", "appointedOn", "resignedOn"]));
}

/**
 * The statement of capital, the holdings and the date they are stated as at, from the filing-data
 * route's answer, with the holders' names only.
 * @param {object} filingData - the answer of POST .../filing-data
 */
export function registerCapital(filingData) {
  const statement = filingData?.statementOfCapital;
  if (!statement) return {};
  return {
    capital: {
      ...pick(statement, ["shareCurrency", "totalAggregateNominalValue"]),
      shares: (statement.shares || []).map((share) => pick(share, ["shareClass", "numShares", "aggregateNominalValue"])),
    },
    shareholdings: (filingData.shareholdings || []).map((holding) => ({
      ...pick(holding, ["shareClass", "numberHeld"]),
      shareholders: (holding.shareholders || []).map((holder) => pick(holder, ["forename", "surname", "amalgamatedName"])),
    })),
    ...(filingData.madeUpDate ? { capitalDate: filingData.madeUpDate } : {}),
  };
}

/**
 * The company's books: the last filed accounts' own book when their document reads, and the next
 * year's book from the register.
 * @param {object} bundle - the books bundle
 * @param {{profile: object, officers?: object[], filedDocument?: string, filingData?: object}} register
 * @returns {Promise<{filed: {texts: object}|null, next: {texts: object, start: string, end: string, differences: object[]}, unread: string|null}>}
 */
export async function companyBooks(bundle, { profile, officers, filedDocument, filingData }) {
  const input = { profile: registerProfile(profile), officers: registerOfficers(officers), ...registerCapital(filingData) };
  let filed = null;
  let unread = null;
  if (filedDocument) {
    try {
      const read = await bundle.readBookSource(new TextEncoder().encode(filedDocument), "accounts.xhtml");
      filed = { texts: bookTexts(bundle, read.book, read.lines) };
      input.lastAccounts = read.accounts;
    } catch (error) {
      unread = error.message;
    }
  }
  const next = await bundle.buildBookFromRegister(input);
  return {
    filed,
    unread,
    next: {
      texts: bookTexts(bundle, next.book, next.lines),
      start: next.book.documentInfo.periodCoveredStart,
      end: next.book.documentInfo.periodCoveredEnd,
      differences: next.differences,
    },
  };
}

function element(tag, attributes = {}, text = "") {
  const node = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  if (text) node.textContent = text;
  return node;
}

function appLink(id, href, text) {
  return element("a", { id, class: "btn-small", href, target: "_blank", rel: "noopener" }, text);
}

// The newest set of accounts on the register whose iXBRL document the page can fetch, or null.
async function newestFiledDocument(companyNumber, { getFiledAccounts, getFiledAccountsDocument }) {
  const sets = (await getFiledAccounts(companyNumber)).filedAccounts || [];
  const newest = sets.find((set) => set.ixbrl);
  if (!newest) return null;
  return (await getFiledAccountsDocument(companyNumber, newest.transactionId)).document;
}

async function renderBooks(holder, { profile, diyaGlBaseUrl, formatDate }, books) {
  const { filed, next, unread } = books;
  const review = element("div", { id: "companyBooksReview" });
  review.appendChild(
    element(
      "p",
      {},
      siteText("ch.books.next-period", "The next year's book runs from {start} to {end}.", {
        start: formatDate(next.start),
        end: formatDate(next.end),
      }),
    ),
  );
  if (unread || !filed) {
    review.appendChild(
      element(
        "p",
        { class: "hint" },
        profile.accountsLastPeriodEnd
          ? siteText(
              "ch.books.no-filed-book",
              "The last accounts on the register have no iXBRL document this page can read, so the next year's book has no opening balances.",
            )
          : siteText("ch.books.first-period", "The company has filed no accounts yet, so the book starts with no opening balances."),
      ),
    );
  }
  if (next.differences.length > 0) {
    review.appendChild(element("p", { class: "hint" }, siteText("ch.books.differences", "What to check in the book:")));
    const list = element("ul", { id: "companyBooksDifferences" });
    for (const difference of next.differences) list.appendChild(element("li", {}, difference.text));
    review.appendChild(list);
  }
  const actions = element("p", { class: "revision-downloads-actions", id: "companyBooksActions" });
  if (filed) {
    actions.appendChild(
      appLink(
        "companyBooksOpenFiled",
        await diyaGlBookAddress(diyaGlBaseUrl, filed.texts),
        siteText("ch.books.open-filed", "Open the last accounts in DIYA-GL"),
      ),
    );
  }
  actions.appendChild(
    appLink(
      "companyBooksStartNextYear",
      await diyaGlBookAddress(diyaGlBaseUrl, next.texts),
      siteText("ch.books.start-next-year", "Start the next year in DIYA-GL"),
    ),
  );
  actions.appendChild(
    appLink(
      "companyBooksDownloadPackage",
      await diyaGlBookAddress(diyaGlBaseUrl, next.texts, { download: "package" }),
      siteText("ch.books.download-package", "Download the next year as a spreadsheet package"),
    ),
  );
  review.appendChild(actions);
  holder.querySelector("#companyBooksReview")?.remove();
  holder.appendChild(review);
}

function capitalForm(onCode) {
  const form = element("form", { id: "companyBooksCapitalForm" });
  const label = element("label", { for: "companyBooksAuthCode" }, siteText("ch.books.auth-code", "Company authentication code (optional)"));
  const hint = element(
    "p",
    { class: "hint", id: "companyBooksAuthCode-hint" },
    siteText(
      "ch.books.auth-code-hint",
      "Companies House gives the shareholders and the share capital for the company authentication code. The code is sent for this one request and not kept.",
    ),
  );
  const input = element("input", {
    "id": "companyBooksAuthCode",
    "name": "companyBooksAuthCode",
    "type": "password",
    "autocomplete": "off",
    "maxlength": "6",
    "aria-describedby": "companyBooksAuthCode-hint",
  });
  const button = element(
    "button",
    { type: "submit", class: "btn-small" },
    siteText("ch.books.add-capital", "Add the shareholders and capital"),
  );
  const status = element("p", { class: "hint", id: "companyBooksCapitalStatus", role: "status" });
  form.append(label, hint, input, " ", button, status);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const code = input.value.trim();
    if (!code) {
      status.textContent = siteText(
        "ch.books.auth-code-needed",
        "Enter the company authentication code to add the shareholders and capital.",
      );
      return;
    }
    button.disabled = true;
    status.textContent = "";
    try {
      await onCode(code);
      input.value = "";
      status.textContent = siteText("ch.books.capital-added", "The shareholders and the share capital are in the book.");
    } catch (error) {
      console.error("Could not add the shareholders and capital to the book:", error);
      status.textContent =
        error.body?.reason === "made-up-date-after-today"
          ? siteText(
              "ch.cs.made-up-date-after-today",
              "This date is after today. Companies House reads the register only up to today, so file this statement on or after the date it is made up to.",
            )
          : error.message;
    } finally {
      button.disabled = false;
    }
  });
  return form;
}

/**
 * Fill the drill-down's company books: the review of the next year's book and the three DIYA-GL
 * actions, with the optional step that adds the shareholders and capital.
 * @param {HTMLElement} holder
 * @param {{profile: object, diyaGlBaseUrl: string, formatDate: (iso: string) => string,
 *   deps: {loadBundle: Function, getFiledAccounts: Function, getFiledAccountsDocument: Function, getOfficers: Function,
 *   getFilingData: Function}}} options
 */
export async function renderCompanyBooks(holder, { profile, diyaGlBaseUrl, formatDate, deps }) {
  holder.replaceChildren(
    element("h3", {}, siteText("ch.books.heading", "Company books")),
    element(
      "p",
      { class: "hint" },
      siteText(
        "ch.books.intro",
        "Start the company's books in the DIYA-GL app from what Companies House holds: the last filed accounts give the next year's opening balances. The books are made in this browser, and nothing is stored.",
      ),
    ),
  );
  const status = element(
    "p",
    { class: "hint", id: "companyBooksStatus", role: "status" },
    siteText("ch.books.building", "Making the books…"),
  );
  holder.appendChild(status);
  const [bundle, officers, filedDocument] = await Promise.all([
    deps.loadBundle(),
    deps.getOfficers(profile.companyNumber).then(
      (answer) => answer.officers || [],
      () => [],
    ),
    profile.accountsLastPeriodEnd
      ? newestFiledDocument(profile.companyNumber, deps).catch((error) => {
          console.warn("Could not read the last filed accounts for the books:", error);
          return null;
        })
      : null,
  ]);
  const register = { profile, officers, filedDocument };
  try {
    await renderBooks(holder, { profile, diyaGlBaseUrl, formatDate }, await companyBooks(bundle, register));
    status.textContent = "";
  } catch (error) {
    console.error("Could not make the company's books:", error);
    status.textContent = siteText("ch.books.failed", "The books could not be made: {reason}", { reason: error.message });
    return;
  }
  holder.appendChild(
    capitalForm(async (companyAuthCode) => {
      const filingData = await deps.getFilingData(profile.companyNumber, {
        companyAuthCode,
        madeUpDate: window.companiesHouseLabels.confirmationStatementDateToFile(profile.confirmationStatementNextMadeUpTo),
      });
      await renderBooks(holder, { profile, diyaGlBaseUrl, formatDate }, await companyBooks(bundle, { ...register, filingData }));
    }),
  );
}
