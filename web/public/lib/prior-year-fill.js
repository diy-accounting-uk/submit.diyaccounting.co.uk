// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-25 Fill the accounts forms' prior year from the last filed accounts
// - **Use when:** an accounts form has looked up a company and its prior-year column is to start from the accounts the register already holds.
// - **Does:** the last-accounts route finds the register's newest set of accounts, fetches its iXBRL document through the Document API and maps it with diya-gl's mapIxbrlAccounts for either regime. prior-year-fill.js puts each figure into the open form's prior-year field for that line where the field is empty, says how many it placed and which lines it left empty, names the other accounts form when the last accounts were of the other type, and says why nothing was filled for accounts filed on paper, with no iXBRL document, over the size limit, unreadable, or for a company with none. A prior year whose capital and reserves differ from share capital plus the profit and loss account is named with the line to correct. It never runs on a revision and never overwrites a figure already entered.
// - **Run:** look up a company on `companies-house/fileMicroEntityAccounts.html` or `companies-house/fileSmallCompanyAccounts.html`; `GET /api/v1/companies-house/company/{companyNumber}/last-accounts`
// - **Entry:** `web/public/lib/prior-year-fill.js:fillPriorYear`; `app/services/companiesHouseLastAccounts.js:readLastAccounts`; `app/functions/companies-house/companiesHouseLastAccountsGet.js:ingestHandler`
// - **Files:** web/public/lib/prior-year-fill.js, app/services/companiesHouseLastAccounts.js, app/functions/companies-house/companiesHouseLastAccountsGet.js, web/unit-tests/prior-year-fill.test.js, app/unit-tests/services/companiesHouseLastAccounts.test.js, app/unit-tests/fixtures/filed-accounts/, web/browser-tests/accountsPriorYearFill.browser.test.js
// - **Keywords:** prior year, comparatives, last filed accounts, last year's figures, Document API, iXBRL, mapIxbrlAccounts, prefill accounts
// - **Related:** CH-07, CH-08, CH-24
// @end-capability

// web/public/lib/prior-year-fill.js
// The accounts forms' prior year, filled from the company's last filed accounts once the form knows
// the company. Each form loads this module and calls window.priorYearFill.fill when its company
// lookup has shown the form.

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

const FORM_PAGES = { micro: "fileMicroEntityAccounts.html", small: "fileSmallCompanyAccounts.html" };

const figureText = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(2));

/** Whether the page is a revision of accounts already filed, which fills from its receipt instead. */
export function isRevision(search) {
  return new URLSearchParams(search).has("amend");
}

function formatDate(isoDate, welsh) {
  if (!isoDate) return "";
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(welsh ? "cy-GB" : "en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
}

// The name of the line a prior-year field belongs to: its row's heading, without the "(optional)" after
// it or the "Of which," before a part of a line.
function lineName(input) {
  const optional = siteText("ch.prior.optional-qualifier", "(optional)");
  const ofWhich = siteText("ch.prior.of-which-qualifier", "Of which,");
  let name = input.closest("tr").querySelector("th").textContent.trim().replace(/\s+/g, " ");
  if (name.endsWith(optional)) name = name.slice(0, -optional.length).trim();
  if (name.startsWith(ofWhich)) name = name.slice(ofWhich.length).trim();
  return name.charAt(0).toUpperCase() + name.slice(1);
}

// Whether a field is part of the form as it stands: enabled, and in no hidden row or section.
function isShown(input) {
  if (input.disabled) return false;
  for (let element = input; element; element = element.parentElement) {
    if (element.hidden || element.style.display === "none") return false;
  }
  return true;
}

// The prior-year fields the form shows now: the comparatives and the profit and loss format chosen.
function shownPriorFields(doc) {
  return Array.from(doc.querySelectorAll('input[id^="prior"]')).filter(isShown);
}

// A field no one has filled: empty, or still holding the value the page starts it with.
const isUntouched = (input) => input.value.trim() === "" || input.value === input.defaultValue;

/**
 * Put each mapped figure into the form's prior-year field for its line, where the form has the line
 * and no one has filled the field. A figure with no field, or a field already filled, is left alone.
 * @param {{balanceSheet: object, profitAndLoss: {figures: object}|null}} accounts - the route's mapped accounts
 * @param {Document} doc
 * @returns {string[]} the ids of the fields filled
 */
export function placeFigures(accounts, doc) {
  const figures = { ...(accounts.profitAndLoss?.figures || {}), ...accounts.balanceSheet };
  const placed = [];
  shownPriorFields(doc).forEach((input) => {
    const value = figures[input.id.charAt(5).toLowerCase() + input.id.slice(6)];
    if (typeof value !== "number" || !isUntouched(input)) return;
    input.value = figureText(value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    placed.push(input.id);
  });
  return placed;
}

/** The lines whose prior-year field the form shows and that neither the fill nor anyone else filled, by their names. */
export function emptyLines(doc, placed) {
  return shownPriorFields(doc)
    .filter((input) => !placed.includes(input.id) && isUntouched(input))
    .map(lineName);
}

// The small company form shows the prior year only with its comparatives, and its profit and loss
// lines in the format chosen; both follow last small company accounts while the prior year is still
// empty. Micro-entity accounts hold too few lines to balance a small company prior year, so the
// comparatives stay as they are for them.
function showSmallCompanyPriorYear(accounts, doc) {
  const comparatives = doc.getElementById("includeComparatives");
  if (Array.from(doc.querySelectorAll('input[id^="prior"]')).some((input) => !isUntouched(input))) return;
  if (!comparatives.checked) {
    comparatives.checked = true;
    comparatives.dispatchEvent(new Event("change", { bubbles: true }));
  }
  const format = accounts.profitAndLoss?.format === 2 ? 2 : 1;
  const radio = doc.getElementById(`profitAndLossFormat${format}`);
  if (!radio.checked) {
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
  }
}

function otherFormNote(regime, companyNumber, welsh, doc) {
  const fragment = doc.createDocumentFragment();
  const link = doc.createElement("a");
  link.href = `${welsh ? "/cy" : ""}/companies-house/${FORM_PAGES[regime]}?companyNumber=${encodeURIComponent(companyNumber)}`;
  if (regime === "small") {
    link.textContent = siteText("ch.prior.small-form", "the small company accounts form");
    fragment.append(
      siteText("ch.prior.last-were-small", "The company's last accounts were small company accounts: file this year's on"),
      " ",
      link,
      ".",
    );
  } else {
    link.textContent = siteText("ch.prior.micro-form", "the micro-entity accounts form");
    fragment.append(
      siteText("ch.prior.last-were-micro", "The company's last accounts were micro-entity accounts: file this year's on"),
      " ",
      link,
      ".",
    );
  }
  return fragment;
}

// Why the prior year is left empty, for an answer with no figures.
function emptyReason(answer, welsh) {
  const date = formatDate(answer.set?.madeUpDate, welsh);
  switch (answer.outcome) {
    case "none":
      return siteText("ch.prior.none", "Companies House holds no accounts for this company, so the prior year is left empty.");
    case "paper":
      return siteText(
        "ch.prior.paper",
        "The company's last accounts, made up to {date}, were filed on paper. Companies House holds them as a scanned document only, so the prior year is left empty: type it from those accounts.",
        { date },
      );
    case "no-ixbrl":
      return siteText(
        "ch.prior.no-ixbrl",
        "Companies House holds the company's last accounts, made up to {date}, without an iXBRL document, so the prior year is left empty: type it from those accounts.",
        { date },
      );
    case "too-large":
      return siteText(
        "ch.prior.too-large",
        "The company's last accounts, made up to {date}, are too large to read here, so the prior year is left empty: type it from those accounts.",
        { date },
      );
    default:
      return siteText(
        "ch.prior.unreadable",
        "The company's last accounts, made up to {date}, do not read as accounts here, so the prior year is left empty: type it from those accounts.",
        { date },
      );
  }
}

/** The ISO date of the day after an ISO date. */
export function dayAfter(isoDate) {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

// Why the prior year is left empty when the last accounts filed do not end the day before this
// period starts: the register holds no accounts for the year between.
function yearGapNote(madeUpDate, nextPeriodStart, companyNumber, welsh, doc) {
  const fragment = doc.createDocumentFragment();
  const link = doc.createElement("a");
  link.href = `${welsh ? "/cy" : ""}/companies-house/company/${encodeURIComponent(companyNumber)}/filing-history`;
  link.textContent = siteText("ch.prior.filing-history", "the company's filing history");
  fragment.append(
    siteText(
      "ch.prior.year-gap",
      "The last accounts filed were made up to {made}, and this period starts on {start}, so the year between is not on the register and the prior year is left empty. See",
      { made: formatDate(madeUpDate, welsh), start: formatDate(nextPeriodStart, welsh) },
    ),
    " ",
    link,
    ".",
  );
  return fragment;
}

// The balance sheet rule the micro-entity form applies: capital and reserves equal called up share
// capital plus the profit and loss account. Another software's reserve lines can break it here.
async function capitalAndReservesNote(doc) {
  const capital = doc.getElementById("priorCapitalAndReserves");
  const share = doc.getElementById("priorCalledUpShareCapital");
  const profitAndLoss = doc.getElementById("priorProfitAndLossAccount");
  if (!capital || !share || !profitAndLoss) return null;
  const check = await import("./balance-sheet-check.js");
  const mismatch = check.capitalAndReservesMismatch({
    calledUpShareCapital: Number(share.value),
    profitAndLossAccount: Number(profitAndLoss.value),
    capitalAndReserves: Number(capital.value),
  });
  if (!mismatch) return null;
  const pounds = (amount) => `${amount < 0 ? "-" : ""}£${Math.abs(amount).toLocaleString("en-GB")}`;
  return siteText(
    "ch.prior.reserves",
    "Those accounts hold capital and reserves of {capital}, but called up share capital and the profit and loss account add up to {sum}: the difference sits in reserves this form has no line for. Correct the prior year's profit and loss account so the two agree before you preview.",
    { capital: pounds(mismatch.capital), sum: pounds(mismatch.sum) },
  );
}

/**
 * Fill the open form's prior year from the company's last filed accounts and say what was done. The
 * figures are placed only when those accounts were made up to the day before the company's next
 * accounting period starts, as Companies House states it, so that they are this form's prior year.
 * @param {{companyNumber: string, form: "micro"|"small", note: HTMLElement, doc: Document, search: string, welsh: boolean,
 *   fetchLastAccounts: (companyNumber: string) => Promise<Response>,
 *   readProfile: (companyNumber: string) => Promise<{accountsNextPeriodStart?: string}>}} options
 */
export async function fillPriorYear({ companyNumber, form, note, doc, search, welsh, fetchLastAccounts, readProfile }) {
  note.hidden = true;
  note.replaceChildren();
  if (isRevision(search)) return;
  const response = await fetchLastAccounts(companyNumber);
  if (response.status === 403) return;
  const paragraphs = [];
  if (!response.ok) {
    paragraphs.push(
      siteText(
        "ch.prior.read-failed",
        "The company's last accounts could not be read from Companies House, so the prior year is left empty.",
      ),
    );
  } else {
    const answer = await response.json();
    if (answer.outcome !== "mapped") {
      paragraphs.push(emptyReason(answer, welsh));
    } else {
      const { accounts, set } = answer;
      if (accounts.regime !== form) paragraphs.push(otherFormNote(accounts.regime, companyNumber, welsh, doc));
      const nextPeriodStart = await readProfile(companyNumber).then(
        (profile) => profile.accountsNextPeriodStart ?? null,
        () => undefined,
      );
      if (nextPeriodStart === undefined) {
        paragraphs.push(
          siteText(
            "ch.prior.read-failed",
            "The company's last accounts could not be read from Companies House, so the prior year is left empty.",
          ),
        );
      } else if (!nextPeriodStart) {
        paragraphs.push(
          siteText(
            "ch.prior.no-next-period",
            "Companies House states no next accounting period for this company, so this form's year cannot be matched to the last accounts and the prior year is left empty.",
          ),
        );
      } else if (dayAfter(set.madeUpDate) !== nextPeriodStart) {
        paragraphs.push(yearGapNote(set.madeUpDate, nextPeriodStart, companyNumber, welsh, doc));
      } else {
        paragraphs.push(...(await placedNotes(accounts, set, form, welsh, doc)));
      }
    }
  }
  paragraphs.forEach((content) => {
    const paragraph = doc.createElement("p");
    paragraph.append(content);
    note.appendChild(paragraph);
  });
  note.hidden = false;
}

// Places the figures and answers the paragraphs that say what was placed and what was left empty.
async function placedNotes(accounts, set, form, welsh, doc) {
  if (form === "small" && accounts.regime === "small") showSmallCompanyPriorYear(accounts, doc);
  const placed = placeFigures(accounts, doc);
  const empty = emptyLines(doc, placed);
  const values = {
    count: placed.length,
    date: formatDate(set.madeUpDate, welsh),
    approved: formatDate(accounts.approvalDate, welsh),
  };
  const paragraphs = [
    accounts.approvalDate
      ? siteText(
          "ch.prior.placed-approved",
          "{count} prior-year figures are filled in from the company's last accounts, made up to {date} and approved on {approved}. Check them against those accounts.",
          values,
        )
      : siteText(
          "ch.prior.placed",
          "{count} prior-year figures are filled in from the company's last accounts, made up to {date}. Check them against those accounts.",
          values,
        ),
  ];
  if (empty.length > 0) {
    paragraphs.push(siteText("ch.prior.left-empty", "Left empty, with no figure in those accounts: {lines}.", { lines: empty.join(", ") }));
  }
  if (form === "micro") {
    const reserves = await capitalAndReservesNote(doc);
    if (reserves) paragraphs.push(reserves);
  }
  return paragraphs;
}

if (typeof window !== "undefined") {
  window.priorYearFill = {
    // The page passes the profile it has just read, so the fill reads none; it reads the profile
    // itself only when the page passes none.
    fill: (companyNumber, form, profile) =>
      fillPriorYear({
        companyNumber,
        form,
        note: document.getElementById("priorYearNote"),
        doc: document,
        search: window.location.search,
        welsh: document.documentElement.lang === "cy",
        fetchLastAccounts: (number) =>
          window.fetchWithIdToken(`/api/v1/companies-house/company/${encodeURIComponent(number)}/last-accounts`, {}),
        readProfile: profile ? () => Promise.resolve(profile) : (number) => window.getCompanyProfile(number),
      }).catch((error) => console.error("Failed to fill the prior year from the last accounts:", error)),
  };
}
