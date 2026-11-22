// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// page-chrome.js gives window.siteText, the text in the chosen language. Without it (a test that
// stubs the chrome) the English stands.
window.siteText =
  window.siteText ||
  ((id, english, values) => english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole)));

function renderSearchResults(results) {
  const container = document.getElementById("searchResults");
  container.innerHTML = "";

  if (!results.items || results.items.length === 0) {
    container.textContent = window.siteText("ch.search.no-match", "No companies matched that search.");
    return;
  }

  const table = document.createElement("table");
  table.className = "data-table";
  const headings = [
    window.siteText("ch.search.column-company", "Company"),
    window.siteText("ch.search.column-number", "Number"),
    window.siteText("ch.search.column-status", "Status"),
    window.siteText("ch.search.column-incorporated", "Incorporated"),
    window.siteText("ch.search.column-address", "Address"),
    window.siteText("ch.search.column-watch-list", "Watch list"),
  ];
  const thead = table.createTHead().insertRow();
  headings.forEach((heading) => {
    const th = document.createElement("th");
    th.textContent = heading;
    thead.appendChild(th);
  });
  const tbody = document.createElement("tbody");

  results.items.forEach((item) => {
    const row = document.createElement("tr");

    const nameCell = document.createElement("td");
    const nameButton = document.createElement("button");
    nameButton.type = "button";
    nameButton.className = "link-button";
    nameButton.textContent = item.title;
    nameButton.addEventListener("click", () => navigate({ companyNumber: item.companyNumber, view: "overview" }));
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
    const watchCell = document.createElement("td");
    watchCell.appendChild(window.watchList.button(item.companyNumber));
    row.appendChild(watchCell);
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
    const message = error.retryAfterSeconds
      ? window.siteText("ch.search.rate-limited-seconds", "Companies House is rate limiting our lookups. Try again in {seconds} seconds.", {
          seconds: error.retryAfterSeconds,
        })
      : window.siteText("ch.search.rate-limited", "Companies House is rate limiting our lookups. Try again in a few minutes.");
    window.showStatus(message, "error");
  } else {
    window.showStatus((error && error.message) || window.siteText("ch.search.failed", "Failed to search Companies House."), "error");
  }
}

function renderCompanyProfile(profile) {
  const dl = document.getElementById("companyProfile");
  dl.innerHTML = "";

  const address = profile.registeredOfficeAddress || {};
  const addressParts = [address.address_line_1, address.locality, address.postal_code, address.country].filter(Boolean);

  const labels = window.companiesHouseLabels;
  const fields = [
    [window.siteText("ch.profile.name", "Name"), profile.companyName],
    [window.siteText("ch.profile.number", "Number"), profile.companyNumber],
    [window.siteText("ch.profile.status", "Status"), labels.companyStatusLabel(profile.companyStatus)],
    [window.siteText("ch.profile.type", "Type"), labels.companyTypeLabel(profile.companyType)],
    [window.siteText("ch.profile.incorporated", "Incorporated"), labels.formatCompanyDate(profile.dateOfCreation)],
    [window.siteText("ch.profile.jurisdiction", "Jurisdiction"), labels.jurisdictionLabel(profile.jurisdiction)],
    [window.siteText("ch.profile.registered-office", "Registered office"), addressParts.join(", ")],
    [window.siteText("ch.profile.sic-codes", "SIC codes"), labels.formatSicCodes(profile.sicCodes)],
    [window.siteText("ch.profile.accounts-due", "Next accounts due"), labels.formatCompanyDate(profile.accountsNextDue)],
    [
      window.siteText("ch.profile.confirmation-due", "Next confirmation statement due"),
      labels.formatCompanyDate(profile.confirmationStatementNextDue),
    ],
  ];

  appendTerms(dl, fields);
}

// ---------------------------------------------------------------------------------------------
// The drill-down. Each view of a company has its own address (lib/company-drill-paths.js); the page
// pushes the address as the reader moves and reads it on load. A person's month and year of birth,
// nationality and country of residence, which the officers and PSC routes answer, are dropped as
// each answer arrives and are never shown, kept or put in the address.
// ---------------------------------------------------------------------------------------------

const paths = () => window.companyDrillPaths;
const labels = () => window.companiesHouseLabels;
const isWelshPage = () => window.location.pathname.startsWith("/cy/");
const pagePrefix = () => (isWelshPage() ? "/cy" : "");

// Each company's answers, read once per page; a failed read is forgotten so a later view retries.
const companyReads = new Map();

function readOnce(companyNumber, key, start) {
  const reads = companyReads.get(companyNumber) || new Map();
  companyReads.set(companyNumber, reads);
  if (!reads.has(key)) {
    reads.set(
      key,
      start().catch((error) => {
        reads.delete(key);
        throw error;
      }),
    );
  }
  return reads.get(key);
}

const officerOf = (officer) => ({
  name: officer.name,
  role: officer.officerRole,
  appointedOn: officer.appointedOn,
  resignedOn: officer.resignedOn,
});
const pscOf = (psc) => ({
  name: psc.name,
  kind: psc.kind,
  naturesOfControl: psc.naturesOfControl || [],
  notifiedOn: psc.notifiedOn,
  ceasedOn: psc.ceasedOn,
});

const readProfile = (companyNumber) => readOnce(companyNumber, "profile", () => window.getCompanyProfile(companyNumber));
const readOfficers = (companyNumber) =>
  readOnce(companyNumber, "officers", async () => ((await window.getOfficers(companyNumber)).officers || []).map(officerOf));
const readPscs = (companyNumber) =>
  readOnce(companyNumber, "pscs", async () => ((await window.getPscs(companyNumber)).pscs || []).map(pscOf));
// The filing history as the route answers it: the newest filings it read, and whether the company
// has more than those (truncated) of totalCount in all.
const readFilingHistoryAnswer = (companyNumber) =>
  readOnce(companyNumber, "filings", async () => {
    const answer = await window.getFilingHistory(companyNumber);
    return { filings: answer.filings || [], truncated: answer.truncated === true, totalCount: answer.totalCount };
  });
const readFilingHistory = async (companyNumber) => (await readFilingHistoryAnswer(companyNumber)).filings;

// The public deadlines answer says whether the accounts are overdue, which the profile does not.
const readDeadlines = (companyNumber) =>
  readOnce(companyNumber, "deadlines", async () => {
    const response = await fetch(`/api/v1/public/company-deadlines?number=${encodeURIComponent(companyNumber)}`);
    if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
    return response.json();
  });

const ACCOUNTS_TYPE_PREFIX = "accounts-with-accounts-type-";

function setFromFiling(filing) {
  const description = filing.description || "";
  return {
    transactionId: filing.transactionId,
    madeUpDate: filing.descriptionValues?.made_up_date,
    filedOn: filing.date,
    accountsType: description.startsWith(ACCOUNTS_TYPE_PREFIX) ? description.slice(ACCOUNTS_TYPE_PREFIX.length) : undefined,
    amended: filing.type === "AAMD",
    paperFiled: filing.paperFiled === true,
  };
}

const isAccountsFiling = (filing) => filing.type === "AA" || filing.type === "AAMD";
const isConfirmationStatement = (filing) => filing.category === "confirmation-statement";

// The sets of accounts: the filed-accounts route, which also says which of the newest sets hold an
// iXBRL document, where the account holds its activity; otherwise the accounts items of the filing
// history. truncated says the company has filings older than those read.
async function readAccountSetsAnswer(companyNumber) {
  const entitlement = await loadEntitlement();
  if (activityAccess(entitlement, "file-revised-accounts").held) {
    return readOnce(companyNumber, "filedAccounts", async () => {
      const answer = await window.getFiledAccounts(companyNumber);
      return { sets: answer.filedAccounts || [], truncated: answer.truncated === true };
    });
  }
  const history = await readFilingHistoryAnswer(companyNumber);
  return { sets: history.filings.filter(isAccountsFiling).map(setFromFiling), truncated: history.truncated };
}

const readAccountSets = async (companyNumber) => (await readAccountSetsAnswer(companyNumber)).sets;

const findAndUpdateUrl = (companyNumber, page) =>
  `https://find-and-update.company-information.service.gov.uk/company/${encodeURIComponent(companyNumber)}/${page}`;

// Says the list holds only the newest filings and names Companies House's own service for the rest.
function truncatedNote(container, text, companyNumber) {
  const note = document.createElement("p");
  note.className = "hint drill-truncated";
  note.textContent = text;
  const link = document.createElement("a");
  link.href = findAndUpdateUrl(companyNumber, "filing-history");
  link.textContent = window.siteText("ch.drill.find-and-update", "Find and update company information");
  note.append(" ", link);
  container.appendChild(note);
}

// What the account may do: the catalogue, the environment, the viewer's settings and the bundles it
// holds, with the automatic bundles and every bundle a held bundle includes.
let entitlementRead = null;

function loadEntitlement() {
  if (!entitlementRead) {
    entitlementRead = (async () => {
      const service = await import("/lib/services/catalog-service.js");
      const viewerSettings = await import("/lib/services/viewer-settings.js");
      const [catalogText, environmentName, viewer, allocated] = await Promise.all([
        service.fetchCatalogText(),
        service.fetchCurrentEnvironmentName(),
        viewerSettings.fetchViewer(),
        allocatedBundles(),
      ]);
      const catalog = window.TOML.parse(catalogText);
      const bundles = catalog.bundles || [];
      const held = new Set([...bundles.filter((bundle) => bundle.allocation === "automatic").map((bundle) => bundle.id), ...allocated]);
      let grew = true;
      while (grew) {
        grew = false;
        for (const bundle of bundles) {
          if (!held.has(bundle.id)) continue;
          for (const included of bundle.includes || []) {
            if (!held.has(included)) {
              held.add(included);
              grew = true;
            }
          }
        }
      }
      return { catalog, environmentName, viewer, held, isActivityShown: service.isActivityShown };
    })().catch((error) => {
      entitlementRead = null;
      throw error;
    });
  }
  return entitlementRead;
}

async function allocatedBundles() {
  const idToken = localStorage.getItem("cognitoIdToken");
  if (!idToken) return [];
  const data = await window.requestCache.getJSON("/api/v1/bundle", {
    ttlMs: 5000,
    init: { headers: { Authorization: `Bearer ${idToken}` } },
  });
  return (data?.bundles || []).filter((bundle) => bundle.allocated).map((bundle) => bundle.bundleId);
}

/**
 * Whether the account holds an activity: shown, held, and the bundles that would grant it.
 * @returns {{shown: boolean, held: boolean, bundles: object[]}}
 */
function activityAccess(entitlement, activityId) {
  const activity = (entitlement.catalog.activities || []).find((candidate) => candidate.id === activityId);
  if (!activity || !entitlement.isActivityShown(activity, entitlement.environmentName, entitlement.viewer)) {
    return { shown: false, held: false, bundles: [] };
  }
  const bundleIds = activity.bundles || [];
  return {
    shown: true,
    held: bundleIds.some((id) => entitlement.held.has(id)),
    bundles: (entitlement.catalog.bundles || []).filter((bundle) => bundleIds.includes(bundle.id)),
  };
}

const bundleName = (bundle) => (isWelshPage() && bundle.nameCy) || bundle.name;

// Where the notes below quote from: Companies House's and HMRC's own guidance on GOV.UK, and the
// Companies House paper confirmation statement. A source GOV.UK also publishes in Welsh has its Welsh
// page and title; on a Welsh page its notes quote GOV.UK's Welsh word for word. A source in English
// only is quoted in English on a Welsh page too, because a quotation is the source's words.
const AUTHORITY_SOURCES = {
  authCode: {
    url: "https://www.gov.uk/guidance/company-authentication-codes-for-online-filing",
    title: "Company authentication codes for online filing",
    welshUrl: "https://www.gov.uk/guidance/company-authentication-codes-for-online-filing.cy",
    welshTitle: () => window.siteText("ch.edit.source-auth-code", "Company authentication codes for online filing"),
  },
  office: {
    url: "https://www.gov.uk/government/publications/change-a-registered-office-address-ad01",
    title: "Change a company's registered office address (AD01)",
  },
  confirmationService: {
    url: "https://www.gov.uk/file-your-confirmation-statement-with-companies-house",
    title: "File your confirmation statement (annual return) with Companies House",
    welshUrl: "https://www.gov.uk/ffeilio-datganiad-cadarnhau-gyda-thyr-cwmniau",
    welshTitle: () =>
      window.siteText("ch.edit.source-confirmation-service", "File your confirmation statement (annual return) with Companies House"),
  },
  confirmationForm: {
    url: "https://assets.publishing.service.gov.uk/media/696f5ef05b6060ca6736a07e/CS01_v7.0-FINAL.pdf",
    title: "CS01 Confirmation statement",
  },
  accounts: {
    url: "https://www.gov.uk/file-your-company-annual-accounts",
    title: "File your company's annual accounts with Companies House",
  },
  companyTaxReturns: { url: "https://www.gov.uk/company-tax-returns", title: "Company Tax Returns" },
  pscCessationForm: {
    url: "https://assets.publishing.service.gov.uk/media/69f30d970bb62e692c5d6e87/PSC07_v4.0-Final.pdf",
    title: "PSC07 Notice of ceasing to be a person with significant control",
  },
  pscChangeForm: {
    url: "https://assets.publishing.service.gov.uk/media/6a98266bdf4246cf45e467ef/PSC04_v5.0-FINAL.pdf",
    title: "PSC04 Change of details of individual person with significant control (PSC)",
  },
  pscGuidance: {
    url: "https://www.gov.uk/guidance/people-with-significant-control-pscs",
    title: "People with significant control (PSCs)",
  },
  accountingReferenceDateForm: {
    url: "https://assets.publishing.service.gov.uk/media/69f9dd2e097169e6a7a76ff4/AA01_V7.0-final.pdf",
    title: "AA01 Change of accounting reference date",
  },
  officerTerminationDirectorForm: {
    url: "https://assets.publishing.service.gov.uk/media/6911ece9e9348ac8fb54f483/TM01_v7.0-FINAL.pdf",
    title: "TM01 Termination of appointment of director",
  },
  officerTerminationSecretaryForm: {
    url: "https://assets.publishing.service.gov.uk/media/6911eb9b663088df8f54f482/TM02_v6.0-FINAL.pdf",
    title: "TM02 Termination of appointment of secretary",
  },
  sailAddressForm: {
    url: "https://assets.publishing.service.gov.uk/media/691206b6e9348ac8fb54f4b8/AD02_v6.0-FINAL.pdf",
    title: "AD02 Notification of single alternative inspection location (SAIL)",
  },
  recordsToSailForm: {
    url: "https://assets.publishing.service.gov.uk/media/69130d692017198896ad7f3c/AD03_v8.0-FINAL.pdf",
    title: "AD03 Change of location of the company records to the single alternative inspection location (SAIL)",
  },
  recordsToOfficeForm: {
    url: "https://assets.publishing.service.gov.uk/media/69120af9ece74c08fbaa6456/AD04_v8.0-FINAL.pdf",
    title: "AD04 Change of location of the company records to the registered office",
  },
  changeOfNameForm: {
    url: "https://assets.publishing.service.gov.uk/media/6912090f663088df8f54f4b7/NM01_v7.0-FINAL.pdf",
    title: "NM01 Notice of change of name by resolution",
  },
  changeOfNameGuide: {
    url: "https://www.gov.uk/make-changes-to-your-limited-company/company-name",
    title: "Make changes to your private limited company: Company name",
  },
};

// A quotation GOV.UK publishes in Welsh as well: its Welsh is GOV.UK's own sentence.
const inWelshToo = (source, quote) => ({ source, quote, welsh: true });
// A quotation GOV.UK publishes in English only.
const inEnglishOnly = (source, quote) => ({ source, quote, welsh: false });

// The authority each filing needs, in the words of the body that receives it, with its source.
function authorityNotes(activityId) {
  const codeSignature = inWelshToo(
    "authCode",
    window.siteText(
      "ch.edit.code-signature",
      "The code is used to authorise information filed online and is the equivalent of a company officer’s signature.",
    ),
  );
  const codeOnline = inWelshToo(
    "authCode",
    window.siteText(
      "ch.edit.code-online",
      "You’ll need a company authentication code to file your information online or file using commercial software.",
    ),
  );
  const accounts = [
    inEnglishOnly("accounts", "You must get your accounts approved by your company directors before you file them."),
    codeOnline,
  ];
  const notes = {
    "change-registered-office": [inEnglishOnly("office", "You’ll need your company authentication code."), codeSignature],
    "change-registered-email": [codeOnline, codeSignature],
    "file-confirmation-statement": [
      inWelshToo(
        "confirmationService",
        window.siteText("ch.edit.confirmation-code", "You’ll need a Companies House password and authentication code."),
      ),
      inEnglishOnly(
        "confirmationForm",
        "This form may be authenticated by: Director, Secretary, Person authorised, Charity commission receiver and manager, CIC manager, Judicial factor.",
      ),
      inEnglishOnly(
        "confirmationService",
        "Before filing your confirmation statement, you may need to verify your identity using GOV.UK One Login.",
      ),
      inEnglishOnly("confirmationService", "If your company has more than one director, you must have each director’s personal code."),
    ],
    "cease-psc": [
      inEnglishOnly(
        "pscCessationForm",
        "This form may be authenticated by: Director, Secretary, Person authorised, Administrator, Administrative receiver, Receiver, Receiver manager, Charity commission receiver and manager, CIC manager, Judicial factor.",
      ),
      inEnglishOnly(
        "pscCessationForm",
        "You must have obtained confirmation from the individual person with significant control that their particulars are correct before sending this form to Companies House.",
      ),
      codeOnline,
    ],
    "change-psc-details": [
      inEnglishOnly(
        "pscGuidance",
        "You must tell Companies House about any changes to your PSC information, such as a change of personal details or nature of control. You must do this within 14 days of confirming the change.",
      ),
      inEnglishOnly(
        "pscChangeForm",
        "This form may be authenticated by: Director, Secretary, Person authorised, Administrator, Administrative receiver, Receiver, Receiver manager, Charity commission receiver and manager, CIC manager, Judicial factor.",
      ),
      inEnglishOnly(
        "pscChangeForm",
        "You must have obtained confirmation from the individual person with significant control that their particulars are correct before sending this form to Companies House.",
      ),
      codeOnline,
    ],
    "change-accounting-reference-date": [
      inEnglishOnly(
        "accountingReferenceDateForm",
        "This form may be signed by: Director, Secretary, Person authorised, Permanent representative on behalf of an overseas company, Administrator, Administrative receiver, Receiver, Receiver manager, Charity commission receiver and manager, CIC manager, Judicial factor.",
      ),
      inEnglishOnly("accountingReferenceDateForm", "You cannot change a period for which the accounts are overdue."),
      inEnglishOnly("accountingReferenceDateForm", "You cannot extend a period beyond 18 months unless the company is in administration."),
      codeOnline,
    ],
    "remove-officer": [
      inEnglishOnly(
        "officerTerminationDirectorForm",
        "This form may be authenticated by: Director, Secretary, Person authorised, Liquidator, Administrator, Administrative receiver, Receiver, Receiver manager, Charity Commission receiver and manager, CIC manager, Judicial factor.",
      ),
      inEnglishOnly("officerTerminationDirectorForm", "Only one director appointment can be terminated per form."),
      inEnglishOnly("officerTerminationSecretaryForm", "Only one secretary appointment can be terminated per form."),
      codeOnline,
    ],
    "change-records-location": [
      inEnglishOnly(
        "sailAddressForm",
        "You may use this form to tell us the address of an alternative inspection location where company records may be kept for inspection.",
      ),
      inEnglishOnly(
        "sailAddressForm",
        "You cannot use this form to tell us the address of a location outside of the part of the United Kingdom where the company is registered.",
      ),
      inEnglishOnly("recordsToSailForm", "You may use this form to tell us which of the company records are held at the SAIL."),
      inEnglishOnly(
        "recordsToOfficeForm",
        "You may use this form to tell us which company records are returning to the registered office.",
      ),
      codeOnline,
    ],
    "change-company-name": [
      inEnglishOnly(
        "changeOfNameForm",
        "Director, Secretary, Person authorised, Liquidator, Administrator, Administrative receiver, Receiver, Receiver manager, Charity commission receiver and manager, CIC manager.",
      ),
      inEnglishOnly("changeOfNameForm", "You may use this form to give notice of an unconditional change of name by the company members."),
      inEnglishOnly("changeOfNameGuide", "Your company name will not officially change until Companies House registers it."),
      codeOnline,
    ],
    "file-micro-entity-accounts": accounts,
    "file-small-company-accounts": accounts,
    "file-company-tax-return": [
      inEnglishOnly(
        "companyTaxReturns",
        "Your company or association must file a Company Tax Return if you get a ‘notice to deliver a Company Tax Return’ from HM Revenue and Customs (HMRC).",
      ),
      inEnglishOnly("companyTaxReturns", "You can either get an accountant to prepare and file your tax return or do it yourself."),
    ],
  };
  return notes[activityId] || [];
}

// A link to an English-only page from a Welsh page: the English title, marked English, then "(in English)".
function englishLink(url, title) {
  const link = document.createElement("a");
  link.href = url;
  link.lang = "en";
  link.textContent = title;
  const mark = document.createElement("span");
  mark.className = "lang-mark";
  mark.textContent = window.siteText("chrome.in-english", "(in English)");
  return [link, " ", mark];
}

function appendAuthority(holder, activityId) {
  const notes = authorityNotes(activityId);
  if (notes.length === 0) return;
  const welshPage = isWelshPage();
  const lead = document.createElement("p");
  lead.className = "hint file-this-authority-lead";
  lead.textContent =
    activityId === "file-company-tax-return"
      ? window.siteText("ch.edit.authority-hmrc", "What HMRC says this filing needs:")
      : window.siteText("ch.edit.authority-companies-house", "What Companies House says this filing needs:");
  const list = document.createElement("ul");
  list.className = "hint file-this-authority";
  notes.forEach(({ source: sourceId, quote, welsh }) => {
    const source = AUTHORITY_SOURCES[sourceId];
    const item = document.createElement("li");
    if (!welshPage) {
      const link = document.createElement("a");
      link.href = source.url;
      link.textContent = source.title;
      item.append(`“${quote}” `, link);
    } else if (welsh) {
      const link = document.createElement("a");
      link.href = source.welshUrl;
      link.textContent = source.welshTitle();
      item.append(`“${quote}” `, link);
    } else {
      const words = document.createElement("span");
      words.lang = "en";
      words.textContent = `“${quote}”`;
      const englishOnly = document.createElement("span");
      englishOnly.className = "file-this-english-only";
      englishOnly.textContent = window.siteText("ch.edit.english-only", "GOV.UK publishes this in English only.");
      item.append(words, " ", ...englishLink(source.url, source.title), " ", englishOnly);
    }
    list.appendChild(item);
  });
  holder.append(lead, list);
}

/**
 * A section's "File this" control: a link to the form with the company and the current values filled
 * in where the account holds the form's activity; a link to the form's page and the bundle that has
 * it where it does not; a sign-in prompt for a reader who is signed out; and nothing where this site
 * does not offer the form. Each carries the authority the filing needs.
 */
async function appendFileThis(container, { activityId, page, label, companyNumber, prefill = {} }) {
  const holder = document.createElement("div");
  holder.className = "file-this";
  holder.dataset.activity = activityId;
  container.appendChild(holder);
  let access;
  try {
    access = activityAccess(await loadEntitlement(), activityId);
  } catch (error) {
    console.warn("Could not read the catalogue for the file buttons:", error);
    holder.remove();
    return;
  }
  if (!access.shown) {
    holder.remove();
    return;
  }
  const query = new URLSearchParams({ companyNumber });
  Object.entries(prefill).forEach(([name, value]) => {
    if (value) query.set(name, value);
  });
  const formHref = `${pagePrefix()}/companies-house/${page}?${query}`;
  if (!localStorage.getItem("cognitoIdToken")) {
    const prompt = document.createElement("p");
    prompt.className = "hint file-this-sign-in";
    const signIn = document.createElement("a");
    signIn.href = window.signInHref("/auth/login.html");
    signIn.textContent = window.siteText("ch.edit.sign-in", "Sign in");
    prompt.append(
      signIn,
      " ",
      window.siteText("ch.edit.sign-in-to", "to {label}.", { label: label.charAt(0).toLowerCase() + label.slice(1) }),
    );
    holder.appendChild(prompt);
  } else if (access.held) {
    const link = document.createElement("a");
    link.className = "btn";
    link.href = formHref;
    link.textContent = label;
    holder.appendChild(link);
  } else {
    const note = document.createElement("p");
    note.className = "hint";
    const form = document.createElement("a");
    form.className = "file-this-form";
    form.href = formHref;
    form.textContent = label;
    note.append(
      form,
      " ",
      window.siteText("ch.edit.needs-bundle", "needs the {bundles} bundle.", { bundles: access.bundles.map(bundleName).join(", ") }),
      " ",
    );
    const more = document.createElement("a");
    more.href = `${pagePrefix()}/bundles.html`;
    more.textContent = window.siteText("ch.drill.see-bundles", "See the bundles");
    note.appendChild(more);
    holder.appendChild(note);
  }
  appendAuthority(holder, activityId);
}

// -- shared rendering ---------------------------------------------------------------------------

function appendTerms(dl, fields) {
  fields.forEach(([label, value]) => {
    const dt = document.createElement("dt");
    dt.textContent = label;
    const dd = document.createElement("dd");
    if (value instanceof Node) dd.appendChild(value);
    else dd.textContent = value || "";
    dl.appendChild(dt);
    dl.appendChild(dd);
  });
}

function sectionHeading(container, text) {
  const heading = document.createElement("h4");
  heading.textContent = text;
  container.appendChild(heading);
}

// A link to another view of the company that moves without reloading the page.
function viewLink(state, text) {
  const link = document.createElement("a");
  const target = { welsh: isWelshPage(), ...state };
  link.href = paths().drillPath(target);
  link.textContent = text;
  link.addEventListener("click", (event) => {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
    event.preventDefault();
    navigate(target);
  });
  return link;
}

function slugText(slug) {
  const words = String(slug || "").replace(/-/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function table(headings, rows) {
  const element = document.createElement("table");
  element.className = "data-table";
  const head = element.createTHead().insertRow();
  headings.forEach((heading) => {
    const th = document.createElement("th");
    th.textContent = heading;
    head.appendChild(th);
  });
  const body = document.createElement("tbody");
  rows.forEach((cells) => {
    const row = document.createElement("tr");
    cells.forEach((cell) => {
      const td = document.createElement("td");
      if (cell instanceof Node) td.appendChild(cell);
      else td.textContent = cell || "";
      row.appendChild(td);
    });
    body.appendChild(row);
  });
  element.appendChild(body);
  return element;
}

function emptyNote(container, text) {
  const note = document.createElement("p");
  note.className = "hint";
  note.textContent = text;
  container.appendChild(note);
}

const accountsTypeLabel = (type) => (type ? slugText(type) : window.siteText("ch.drill.type-not-stated", "Not stated"));

// -- the overview's sections ----------------------------------------------------------------------

// The company's status changes through no filing this site or Companies House's software interfaces
// make; the note names Companies House's own route for closing a company.
function renderStatusNote() {
  const note = document.getElementById("statusChangeNote");
  note.innerHTML = "";
  const url = "https://www.gov.uk/strike-off-your-company-from-companies-register";
  const title = "Strike off your limited company from the Companies Register";
  const link = document.createElement("a");
  link.href = url;
  link.textContent = title;
  note.append(
    window.siteText(
      "ch.edit.status-elsewhere",
      "This site does not change the company's status. To close the company, Companies House takes form DS01:",
    ),
    " ",
    ...(isWelshPage() ? englishLink(url, title) : [link]),
  );
}

function renderWatchSection(profile) {
  const section = document.getElementById("watchSection");
  section.innerHTML = "";
  section.appendChild(window.watchList.button(profile.companyNumber));
  const link = document.createElement("a");
  link.href = `${pagePrefix()}/companies-house/watchList.html`;
  link.textContent = window.siteText("ch.drill.open-watch-list", "Open your watch list");
  section.append(" ", link);
}

// The accounting period the next accounts cover, as the accounts forms' period fields take it.
const nextPeriodFields = (profile) => ({ periodStart: profile.accountsNextPeriodStart, periodEnd: profile.accountsNextPeriodEnd });

// The registered office as the change form's new address fields take it, so the reader edits what changed.
function officeFields(profile) {
  const address = profile.registeredOfficeAddress || {};
  return {
    premises: address.premises,
    addressLine1: address.address_line_1,
    addressLine2: address.address_line_2,
    locality: address.locality,
    region: address.region,
    postalCode: address.postal_code,
    country: address.country,
  };
}

async function renderAccountsSection(profile) {
  const section = document.getElementById("accountsSection");
  section.innerHTML = "";
  sectionHeading(section, window.siteText("ch.drill.accounts", "Accounts"));
  const dl = document.createElement("dl");
  const nextPeriod =
    profile.accountsNextPeriodStart && profile.accountsNextPeriodEnd
      ? window.siteText("ch.drill.period", "{start} to {end}", {
          start: labels().formatCompanyDate(profile.accountsNextPeriodStart),
          end: labels().formatCompanyDate(profile.accountsNextPeriodEnd),
        })
      : labels().formatCompanyDate(profile.accountsNextPeriodEnd);
  appendTerms(dl, [
    [
      window.siteText("ch.drill.last-accounts", "Last accounts made up to"),
      profile.accountsLastPeriodEnd
        ? labels().formatCompanyDate(profile.accountsLastPeriodEnd)
        : window.siteText("ch.drill.none-filed", "None filed"),
    ],
    [
      window.siteText("ch.drill.last-accounts-type", "Type of the last accounts"),
      profile.accountsLastPeriodEnd ? accountsTypeLabel(profile.accountsLastType) : "",
    ],
    [window.siteText("ch.drill.next-period", "Next accounting period"), nextPeriod],
    [window.siteText("ch.drill.next-accounts-due", "Next accounts due"), labels().formatCompanyDate(profile.accountsNextDue)],
  ]);
  section.appendChild(dl);
  const overdueNote = document.createElement("p");
  overdueNote.className = "hint";
  section.appendChild(overdueNote);
  readDeadlines(profile.companyNumber)
    .then((deadlines) => {
      if (deadlines.accountsOverdue === true)
        overdueNote.textContent = window.siteText("ch.drill.accounts-overdue", "The accounts are overdue.");
    })
    .catch((error) => console.warn("Could not read the company's deadlines:", error));
  const links = document.createElement("p");
  links.appendChild(
    viewLink(
      { companyNumber: profile.companyNumber, view: "accounts" },
      window.siteText("ch.drill.all-accounts", "All accounts on the register"),
    ),
  );
  section.appendChild(links);
  await appendFileThis(section, {
    activityId: "file-micro-entity-accounts",
    page: "fileMicroEntityAccounts.html",
    label: window.siteText("ch.drill.file-micro-entity", "File micro-entity accounts"),
    companyNumber: profile.companyNumber,
    prefill: nextPeriodFields(profile),
  });
  await appendFileThis(section, {
    activityId: "file-small-company-accounts",
    page: "fileSmallCompanyAccounts.html",
    label: window.siteText("ch.drill.file-small-company", "File small company accounts"),
    companyNumber: profile.companyNumber,
    prefill: nextPeriodFields(profile),
  });
  await appendFileThis(section, {
    activityId: "file-company-tax-return",
    page: "fileCompanyTaxReturn.html",
    label: window.siteText("ch.edit.file-company-tax-return", "File a Company Tax Return"),
    companyNumber: profile.companyNumber,
  });
  await appendFileThis(section, {
    activityId: "change-accounting-reference-date",
    page: "changeAccountingRefDate.html",
    label: window.siteText("ch.drill.change-ard", "Change the accounting reference date"),
    companyNumber: profile.companyNumber,
    prefill: { currentPeriodEnd: profile.accountsNextPeriodEnd },
  });
}

async function renderConfirmationSection(profile) {
  const section = document.getElementById("confirmationSection");
  section.innerHTML = "";
  sectionHeading(section, window.siteText("ch.drill.confirmation-statement", "Confirmation statement"));
  const dl = document.createElement("dl");
  const last = document.createElement("span");
  appendTerms(dl, [
    [window.siteText("ch.drill.last-made-up-to", "Last made up to"), last],
    [window.siteText("ch.drill.next-made-up-to", "Next made up to"), labels().formatCompanyDate(profile.confirmationStatementNextMadeUpTo)],
    [window.siteText("ch.drill.next-due", "Next due"), labels().formatCompanyDate(profile.confirmationStatementNextDue)],
  ]);
  section.appendChild(dl);
  readFilingHistory(profile.companyNumber)
    .then((filings) => {
      const latest = filings.find((filing) => isConfirmationStatement(filing) && filing.descriptionValues?.made_up_date);
      if (!latest) {
        last.textContent = window.siteText("ch.drill.none-filed", "None filed");
        return;
      }
      const madeUpDate = latest.descriptionValues.made_up_date;
      last.appendChild(
        viewLink(
          { companyNumber: profile.companyNumber, view: "confirmation-statement", madeUpDate },
          labels().formatCompanyDate(madeUpDate),
        ),
      );
    })
    .catch((error) => console.warn("Could not read the filing history:", error));
  await appendFileThis(section, {
    activityId: "file-confirmation-statement",
    page: "fileConfirmationStatement.html",
    label: window.siteText("ch.drill.file-confirmation-statement", "File a confirmation statement"),
    companyNumber: profile.companyNumber,
  });
}

async function renderNameSection(profile) {
  const section = document.getElementById("nameSection");
  section.innerHTML = "";
  sectionHeading(section, window.siteText("ch.drill.company-name", "Company name"));
  const name = document.createElement("p");
  name.textContent = profile.companyName;
  section.appendChild(name);
  await appendFileThis(section, {
    activityId: "change-company-name",
    page: "changeCompanyName.html",
    label: window.siteText("ch.drill.change-name", "Change the company name"),
    companyNumber: profile.companyNumber,
  });
}

async function renderOfficeSection(profile) {
  const section = document.getElementById("officeSection");
  section.innerHTML = "";
  sectionHeading(section, window.siteText("ch.drill.registered-office", "Registered office"));
  const office = profile.registeredOffice || {};
  const address = document.createElement("p");
  address.textContent = [
    office.addressLine1,
    office.addressLine2,
    office.addressLine3,
    office.cityOrTown,
    office.countyRegion,
    office.postalCode,
    office.country,
  ]
    .filter(Boolean)
    .join(", ");
  section.appendChild(address);
  await appendFileThis(section, {
    activityId: "change-registered-office",
    page: "changeRegisteredOffice.html",
    label: window.siteText("ch.drill.change-office", "Change the registered office"),
    companyNumber: profile.companyNumber,
    prefill: officeFields(profile),
  });
}

// The registered email address is not public; the section says only whether a change can be filed.
// Companies House answers that only to a reader signed in to it for this company's email address, and
// the site reads any other answer as a lapsed session, so the question is asked only with that grant.
async function renderEmailSection(profile) {
  const section = document.getElementById("emailSection");
  section.innerHTML = "";
  sectionHeading(section, window.siteText("ch.drill.registered-email", "Registered email address"));
  const status = document.createElement("p");
  status.textContent = window.siteText("ch.drill.email-not-public", "Companies House does not publish the registered email address.");
  section.appendChild(status);
  const eligibility = document.createElement("p");
  eligibility.className = "hint";
  eligibility.textContent = window.siteText(
    "ch.drill.email-checked-on-filing",
    "Companies House checks whether a change can be filed when you start it.",
  );
  section.appendChild(eligibility);
  const scope = window.companiesHouseScope(profile.companyNumber, "registered-email-address");
  if (window.hasUsableCompaniesHouseToken(scope)) {
    window
      .getRegisteredEmailEligibility(profile.companyNumber)
      .then((answer) => {
        eligibility.textContent =
          answer.eligibilityStatusCode === "COMPANY_VALID_FOR_SERVICE"
            ? window.siteText("ch.drill.email-can-change", "A change of registered email address can be filed for this company.")
            : window.siteText(
                "ch.drill.email-cannot-change",
                "Companies House says a change of registered email address cannot be filed for this company ({code}).",
                { code: slugText(String(answer.eligibilityStatusCode || "").toLowerCase()) },
              );
      })
      .catch((error) => console.warn("Could not check the registered email address change:", error));
  }
  await appendFileThis(section, {
    activityId: "change-registered-email",
    page: "changeRegisteredEmail.html",
    label: window.siteText("ch.drill.change-email", "Change the registered email address"),
    companyNumber: profile.companyNumber,
  });
}

// The notices of where the records are kept, as the filing history types them: the inspection
// location's address, records moved to it, and records moved back to the registered office.
const SAIL_ADDRESS_FILING = "AD02";
const RECORDS_TO_SAIL_FILING = "AD03";
const RECORDS_TO_OFFICE_FILING = "AD04";

// Where the company keeps its records, from the notices in its filing history, newest first. The
// register publishes the inspection location's address only in the notice that gave it.
async function renderRecordsSection(profile) {
  const section = document.getElementById("recordsSection");
  section.innerHTML = "";
  sectionHeading(section, window.siteText("ch.drill.records", "Where the company keeps its records"));
  try {
    const { filings, truncated } = await readFilingHistoryAnswer(profile.companyNumber);
    const newest = (type) => filings.find((filing) => filing.type === type);
    const address = newest(SAIL_ADDRESS_FILING);
    const toSail = newest(RECORDS_TO_SAIL_FILING);
    const toOffice = newest(RECORDS_TO_OFFICE_FILING);
    const filed = (filing) => labels().formatCompanyDate(filing.date);
    const terms = [];
    if (address) {
      terms.push([
        window.siteText("ch.drill.records-sail", "Inspection location (SAIL)"),
        address.descriptionValues?.new_address
          ? window.siteText("ch.drill.records-sail-address", "{address}, filed {date}", {
              address: address.descriptionValues.new_address,
              date: filed(address),
            })
          : window.siteText("ch.drill.records-sail-filed", "Filed {date}", { date: filed(address) }),
      ]);
    }
    if (toSail) terms.push([window.siteText("ch.drill.records-to-sail", "Records last moved to the inspection location"), filed(toSail)]);
    if (toOffice) {
      terms.push([window.siteText("ch.drill.records-to-office", "Records last moved to the registered office"), filed(toOffice)]);
    }
    if (terms.length > 0) {
      const dl = document.createElement("dl");
      appendTerms(dl, terms);
      section.appendChild(dl);
    } else {
      emptyNote(
        section,
        truncated
          ? window.siteText(
              "ch.drill.records-none-recent",
              "The company’s newest {count} filings hold no notice of an inspection location (SAIL).",
              { count: filings.length },
            )
          : window.siteText("ch.drill.records-none", "The register holds no notice of an inspection location (SAIL) for this company."),
      );
    }
  } catch (error) {
    console.warn("Could not read the filing history for the records' location:", error);
    emptyNote(section, window.siteText("ch.drill.records-unread", "Could not read the company’s filing history from Companies House."));
  }
  await appendFileThis(section, {
    activityId: "change-records-location",
    page: "recordsLocation.html",
    label: window.siteText("ch.drill.change-records", "Tell Companies House where the records are kept"),
    companyNumber: profile.companyNumber,
  });
}

// -- the views --------------------------------------------------------------------------------------

async function renderOfficers(container, companyNumber) {
  sectionHeading(container, window.siteText("ch.drill.officers", "Officers"));
  const officers = await readOfficers(companyNumber);
  if (officers.length === 0) return emptyNote(container, window.siteText("ch.drill.no-officers", "The register lists no officers."));
  container.appendChild(
    table(
      [
        window.siteText("ch.drill.column-name", "Name"),
        window.siteText("ch.drill.column-role", "Role"),
        window.siteText("ch.drill.column-appointed", "Appointed"),
      ],
      officers.map((officer) => [officer.name, slugText(officer.role), labels().formatCompanyDate(officer.appointedOn)]),
    ),
  );
  await appendRemoveOfficerLinks(container, companyNumber, officers);
  await appendFileThis(container, {
    activityId: "remove-officer",
    page: "removeOfficer.html",
    label: window.siteText("ch.drill.remove-officer", "Remove a director or secretary"),
    companyNumber,
  });
}

// The register's officer roles the officer resignation form ends: directors and secretaries, each
// a person or a company, nominee or not.
const REMOVABLE_OFFICER_ROLES = [
  "director",
  "nominee-director",
  "corporate-director",
  "corporate-nominee-director",
  "secretary",
  "nominee-secretary",
  "corporate-secretary",
  "corporate-nominee-secretary",
];

// For an account that holds the officer resignation form, a link for each current director or
// secretary, which opens the form with that officer chosen.
async function appendRemoveOfficerLinks(container, companyNumber, officers) {
  const current = officers.filter((officer) => !officer.resignedOn && REMOVABLE_OFFICER_ROLES.includes(officer.role));
  if (current.length === 0 || !localStorage.getItem("cognitoIdToken")) return;
  let access;
  try {
    access = activityAccess(await loadEntitlement(), "remove-officer");
  } catch (error) {
    console.warn("Could not read the catalogue for the officer links:", error);
    return;
  }
  if (!access.shown || !access.held) return;
  const list = document.createElement("ul");
  list.className = "remove-officer-links";
  current.forEach((officer) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `${pagePrefix()}/companies-house/removeOfficer.html?${new URLSearchParams({ companyNumber, officerName: officer.name })}`;
    link.textContent = window.siteText("ch.drill.remove-this-officer", "Remove {name} ({role})", {
      name: officer.name,
      role: slugText(officer.role),
    });
    item.appendChild(link);
    list.appendChild(item);
  });
  container.appendChild(list);
}

async function renderPscs(container, companyNumber) {
  sectionHeading(container, window.siteText("ch.drill.pscs", "Persons with significant control"));
  const pscs = await readPscs(companyNumber);
  if (pscs.length === 0)
    return emptyNote(container, window.siteText("ch.drill.no-pscs", "The register lists no persons with significant control."));
  container.appendChild(
    table(
      [
        window.siteText("ch.drill.column-name", "Name"),
        window.siteText("ch.drill.column-control", "Nature of control"),
        window.siteText("ch.drill.column-notified", "Notified"),
      ],
      pscs.map((psc) => [psc.name, psc.naturesOfControl.map(slugText).join("; "), labels().formatCompanyDate(psc.notifiedOn)]),
    ),
  );
  await appendPscLinks(container, companyNumber, pscs, {
    activityId: "cease-psc",
    page: "ceasePsc.html",
    className: "cease-psc-links",
    linkText: (name) => window.siteText("ch.drill.cease-this-psc", "Tell Companies House {name} has ceased to be a PSC", { name }),
  });
  await appendFileThis(container, {
    activityId: "cease-psc",
    page: "ceasePsc.html",
    label: window.siteText("ch.drill.cease-psc", "Tell Companies House a PSC has ceased"),
    companyNumber,
  });
  await appendPscLinks(container, companyNumber, pscs, {
    activityId: "change-psc-details",
    page: "changePscDetails.html",
    className: "change-psc-details-links",
    linkText: (name) => window.siteText("ch.drill.change-this-psc", "Tell Companies House {name}'s details have changed", { name }),
  });
  await appendFileThis(container, {
    activityId: "change-psc-details",
    page: "changePscDetails.html",
    label: window.siteText("ch.drill.change-psc", "Tell Companies House a PSC's details have changed"),
    companyNumber,
  });
}

// The register's kinds of PSC the PSC forms name.
const NAMEABLE_PSC_KINDS = [
  "individual-person-with-significant-control",
  "corporate-entity-person-with-significant-control",
  "legal-person-person-with-significant-control",
];

// For an account that holds a PSC form's activity, a link for each current PSC the form can name,
// which opens the form with that PSC chosen.
async function appendPscLinks(container, companyNumber, pscs, { activityId, page, className, linkText }) {
  const current = pscs.filter((psc) => !psc.ceasedOn && NAMEABLE_PSC_KINDS.includes(psc.kind));
  if (current.length === 0 || !localStorage.getItem("cognitoIdToken")) return;
  let access;
  try {
    access = activityAccess(await loadEntitlement(), activityId);
  } catch (error) {
    console.warn("Could not read the catalogue for the PSC links:", error);
    return;
  }
  if (!access.shown || !access.held) return;
  const list = document.createElement("ul");
  list.className = className;
  current.forEach((psc) => {
    const item = document.createElement("li");
    const link = document.createElement("a");
    link.href = `${pagePrefix()}/companies-house/${page}?${new URLSearchParams({ companyNumber, pscName: psc.name })}`;
    link.textContent = linkText(psc.name);
    item.appendChild(link);
    list.appendChild(item);
  });
  container.appendChild(list);
}

// The view a filing opens, where the drill-down has one: a set of accounts or a confirmation statement.
function filingLink(companyNumber, filing, text) {
  const madeUpDate = filing.descriptionValues?.made_up_date;
  if (isAccountsFiling(filing) && madeUpDate) {
    return viewLink({ companyNumber, view: "accounts-set", periodEnd: madeUpDate, filingId: filing.transactionId }, text);
  }
  if (isConfirmationStatement(filing) && madeUpDate) {
    return viewLink({ companyNumber, view: "confirmation-statement", madeUpDate }, text);
  }
  return text;
}

// A description the register's enumeration lacks, in the words of its description key.
function descriptionFromKey(filing) {
  const madeUpDate = filing.descriptionValues?.made_up_date;
  const text = slugText(filing.description);
  return madeUpDate
    ? window.siteText("ch.drill.made-up-to", "{description}, made up to {date}", {
        description: text,
        date: labels().formatCompanyDate(madeUpDate),
      })
    : text;
}

// Companies House's words are English only, so the Welsh page marks them as English.
function markEnglish(content) {
  if (!isWelshPage()) return content;
  if (content instanceof Node) {
    content.lang = "en";
    return content;
  }
  const span = document.createElement("span");
  span.lang = "en";
  span.textContent = content;
  return span;
}

// A filing's description, in Companies House's own words where its enumeration has them, as a link
// to the view the filing opens when a company number is given.
function filingDescription(filing, companyNumber) {
  const register = window.companiesHouseWords.registerDescription(filing, (isoDate) => labels().formatCompanyDate(isoDate));
  const text = register ?? descriptionFromKey(filing);
  const content = companyNumber ? filingLink(companyNumber, filing, text) : text;
  return register === null ? content : markEnglish(content);
}

async function renderFilingHistory(container, companyNumber) {
  sectionHeading(container, window.siteText("ch.drill.filing-history", "Filing history"));
  const { filings, truncated, totalCount } = await readFilingHistoryAnswer(companyNumber);
  if (filings.length === 0) return emptyNote(container, window.siteText("ch.drill.no-filings", "The register lists no filings."));
  if (truncated) {
    truncatedNote(
      container,
      window.siteText(
        "ch.drill.filing-history-truncated",
        "This shows the newest {shown} of the company's {total} filings. Companies House's own service shows the full history:",
        { shown: filings.length, total: totalCount },
      ),
      companyNumber,
    );
  }
  container.appendChild(
    table(
      [
        window.siteText("ch.drill.column-date", "Date"),
        window.siteText("ch.drill.column-form", "Form"),
        window.siteText("ch.drill.column-description", "Description"),
      ],
      filings.map((filing) => [labels().formatCompanyDate(filing.date), filing.type, filingDescription(filing, companyNumber)]),
    ),
  );
}

function setRows(companyNumber, sets, linkTo) {
  return sets.map((set) => [
    linkTo(set),
    accountsTypeLabel(set.accountsType),
    labels().formatCompanyDate(set.filedOn),
    set.amended
      ? window.siteText("ch.drill.amended", "Amended")
      : set.paperFiled
        ? window.siteText("ch.drill.paper", "Filed on paper")
        : "",
  ]);
}

const setHeadings = () => [
  window.siteText("ch.drill.column-made-up-to", "Made up to"),
  window.siteText("ch.drill.column-type", "Type"),
  window.siteText("ch.drill.column-filed", "Filed"),
  window.siteText("ch.drill.column-note", "Note"),
];

async function renderAccountsList(container, companyNumber) {
  sectionHeading(container, window.siteText("ch.drill.accounts-on-register", "Accounts on the register"));
  const answer = await readAccountSetsAnswer(companyNumber);
  const sets = answer.sets.filter((set) => set.madeUpDate);
  if (sets.length === 0)
    return emptyNote(container, window.siteText("ch.drill.no-accounts", "The register lists no accounts for this company."));
  if (answer.truncated) {
    truncatedNote(
      container,
      window.siteText(
        "ch.drill.accounts-truncated",
        "This shows the accounts among the company's newest filings. Companies House's own service shows every set:",
      ),
      companyNumber,
    );
  }
  container.appendChild(
    table(
      setHeadings(),
      setRows(companyNumber, sets, (set) =>
        viewLink({ companyNumber, view: "accounts-period", periodEnd: set.madeUpDate }, labels().formatCompanyDate(set.madeUpDate)),
      ),
    ),
  );
}

async function renderAccountsPeriod(container, companyNumber, periodEnd) {
  const sets = (await readAccountSets(companyNumber)).filter((set) => set.madeUpDate === periodEnd);
  if (sets.length === 0) return false;
  sectionHeading(
    container,
    window.siteText("ch.drill.accounts-made-up-to", "Accounts made up to {date}", { date: labels().formatCompanyDate(periodEnd) }),
  );
  container.appendChild(
    table(
      setHeadings(),
      setRows(companyNumber, sets, (set) =>
        viewLink(
          { companyNumber, view: "accounts-set", periodEnd, filingId: set.transactionId },
          labels().formatCompanyDate(set.madeUpDate),
        ),
      ),
    ),
  );
  return true;
}

async function renderAccountsSet(container, companyNumber, periodEnd, filingId) {
  const set = (await readAccountSets(companyNumber)).find(
    (candidate) => candidate.madeUpDate === periodEnd && candidate.transactionId === filingId,
  );
  if (!set) return false;
  sectionHeading(
    container,
    window.siteText("ch.drill.accounts-made-up-to", "Accounts made up to {date}", { date: labels().formatCompanyDate(periodEnd) }),
  );
  const dl = document.createElement("dl");
  const fields = [
    [window.siteText("ch.drill.column-type", "Type"), accountsTypeLabel(set.accountsType)],
    [window.siteText("ch.drill.column-filed", "Filed"), labels().formatCompanyDate(set.filedOn)],
    [
      window.siteText("ch.drill.how-filed", "How it was filed"),
      set.paperFiled ? window.siteText("ch.drill.paper", "Filed on paper") : window.siteText("ch.drill.electronic", "Filed electronically"),
    ],
    [window.siteText("ch.drill.filing-id", "Companies House filing"), set.transactionId],
  ];
  if (set.amended) fields.push([window.siteText("ch.drill.note", "Note"), window.siteText("ch.drill.amended", "Amended")]);
  if (set.ixbrl !== undefined) {
    fields.push([
      window.siteText("ch.drill.ixbrl", "iXBRL document"),
      set.ixbrl
        ? window.siteText("ch.drill.ixbrl-held", "Held by Companies House")
        : window.siteText("ch.drill.ixbrl-not-held", "Not held"),
    ]);
  }
  appendTerms(dl, fields);
  container.appendChild(dl);
  return true;
}

async function renderConfirmationStatementView(container, companyNumber, madeUpDate) {
  const filing = (await readFilingHistory(companyNumber)).find(
    (candidate) => isConfirmationStatement(candidate) && candidate.descriptionValues?.made_up_date === madeUpDate,
  );
  if (!filing) return false;
  sectionHeading(
    container,
    window.siteText("ch.drill.confirmation-made-up-to", "Confirmation statement made up to {date}", {
      date: labels().formatCompanyDate(madeUpDate),
    }),
  );
  const dl = document.createElement("dl");
  appendTerms(dl, [
    [window.siteText("ch.drill.column-description", "Description"), filingDescription(filing)],
    [window.siteText("ch.drill.column-filed", "Filed"), labels().formatCompanyDate(filing.date)],
    [window.siteText("ch.drill.filing-id", "Companies House filing"), filing.transactionId],
  ]);
  container.appendChild(dl);
  return true;
}

// -- moving between views ------------------------------------------------------------------------

const NAV_VIEWS = () => [
  ["overview", window.siteText("ch.drill.nav-overview", "Overview")],
  ["officers", window.siteText("ch.drill.officers", "Officers")],
  ["psc", window.siteText("ch.drill.pscs", "Persons with significant control")],
  ["filing-history", window.siteText("ch.drill.filing-history", "Filing history")],
  ["accounts", window.siteText("ch.drill.accounts", "Accounts")],
  ["reports", window.siteText("ch.drill.nav-reports", "Reports")],
];

function renderNav(state) {
  const nav = document.getElementById("drillNav");
  nav.innerHTML = "";
  const current = state.view.startsWith("accounts") ? "accounts" : state.view.startsWith("report") ? "reports" : state.view;
  NAV_VIEWS().forEach(([view, text]) => {
    const link = viewLink({ companyNumber: state.companyNumber, view }, text);
    if (view === current) link.setAttribute("aria-current", "page");
    nav.appendChild(link);
  });
}

function showOnly(id) {
  ["searchView", "searchResultsContainer", "profileView", "drillNotFound"].forEach((other) => {
    document.getElementById(other).style.display = other === id ? "block" : "none";
  });
}

function showNotFound(text) {
  document.getElementById("drillNotFoundTitle").textContent = window.siteText("ch.drill.not-found", "Not found");
  document.getElementById("drillNotFoundText").textContent = text;
  showOnly("drillNotFound");
}

const VIEW_RENDERERS = {
  "officers": (container, state) => renderOfficers(container, state.companyNumber).then(() => true),
  "psc": (container, state) => renderPscs(container, state.companyNumber).then(() => true),
  "filing-history": (container, state) => renderFilingHistory(container, state.companyNumber).then(() => true),
  "accounts": (container, state) => renderAccountsList(container, state.companyNumber).then(() => true),
  "accounts-period": (container, state) => renderAccountsPeriod(container, state.companyNumber, state.periodEnd),
  "accounts-set": (container, state) => renderAccountsSet(container, state.companyNumber, state.periodEnd, state.filingId),
  "confirmation-statement": (container, state) => renderConfirmationStatementView(container, state.companyNumber, state.madeUpDate),
  "reports": (container, state) =>
    window.companyReports.renderReportsIndex(container, { companyNumber: state.companyNumber, viewLink, access: reportsAccess() }),
  "report": (container, state) =>
    window.companyReports.renderReportView(container, {
      companyNumber: state.companyNumber,
      report: state.report,
      viewLink,
      access: reportsAccess(),
    }),
};

// Whether the account holds the reports activity, and the names of the bundles that have it; null
// when the entitlement cannot be read.
const reportsAccess = () =>
  loadEntitlement()
    .then((entitlement) => {
      const access = activityAccess(entitlement, "company-reports");
      return { held: access.held, bundleNames: access.bundles.map(bundleName) };
    })
    .catch(() => null);

async function showView(state) {
  window.showLoading ? window.showLoading() : null;
  window.hideStatus ? window.hideStatus() : null;
  try {
    if (state.view === "unknown") {
      showNotFound(window.siteText("ch.drill.no-such-view", "This page has no view at that address."));
      return;
    }
    let profile;
    try {
      profile = await readProfile(state.companyNumber);
    } catch (error) {
      if (error && error.status === 404) {
        showNotFound(
          window.siteText("ch.drill.no-such-company", "No company with the number {number} is on the register.", {
            number: state.companyNumber,
          }),
        );
        return;
      }
      throw error;
    }
    document.getElementById("drillHeading").textContent = `${profile.companyName} (${profile.companyNumber})`;
    renderNav(state);
    const overview = document.getElementById("drillOverview");
    const view = document.getElementById("drillView");
    if (state.view === "overview") {
      renderCompanyProfile(profile);
      overview.style.display = "block";
      view.style.display = "none";
      showOnly("profileView");
      renderWatchSection(profile);
      renderStatusNote();
      await Promise.all([
        renderAccountsSection(profile),
        renderConfirmationSection(profile),
        renderOfficeSection(profile),
        renderNameSection(profile),
        renderEmailSection(profile),
        renderRecordsSection(profile),
      ]);
      return;
    }
    view.innerHTML = "";
    const found = await VIEW_RENDERERS[state.view](view, state);
    if (!found) {
      showNotFound(
        state.view === "confirmation-statement"
          ? window.siteText(
              "ch.drill.no-confirmation",
              "No confirmation statement made up to {date} is on the register for this company.",
              {
                date: labels().formatCompanyDate(state.madeUpDate),
              },
            )
          : window.siteText("ch.drill.no-accounts-period", "No accounts made up to {date} are on the register for this company.", {
              date: labels().formatCompanyDate(state.periodEnd),
            }),
      );
      return;
    }
    overview.style.display = "none";
    view.style.display = "block";
    showOnly("profileView");
  } catch (error) {
    showSearchError(error);
  } finally {
    window.hideLoading ? window.hideLoading() : null;
  }
}

function navigate(state) {
  const target = { welsh: isWelshPage(), ...state, companyNumber: paths().normaliseCompanyNumber(state.companyNumber) };
  history.pushState({}, "", paths().drillPath(target));
  return showView(target);
}

function showNewSearch() {
  history.pushState({}, "", `${pagePrefix()}/companies-house/companySearch.html`);
  showOnly("searchView");
}

// Open the view the address names. The older ?companyNumber= address moves to the profile's path.
function openFromAddress() {
  const state = paths().parseDrillPath(window.location.pathname);
  if (state) return showView(state);
  const companyNumber = new URLSearchParams(window.location.search).get("companyNumber");
  if (companyNumber) {
    const target = { welsh: isWelshPage(), companyNumber: paths().normaliseCompanyNumber(companyNumber), view: "overview" };
    history.replaceState({}, "", paths().drillPath(target));
    return showView(paths().parseDrillPath(window.location.pathname));
  }
  return undefined;
}

document.getElementById("companySearchForm").addEventListener("submit", submitCompanySearch);
document.getElementById("newSearchBtn").addEventListener("click", showNewSearch);
document.getElementById("notFoundSearchBtn").addEventListener("click", showNewSearch);
window.addEventListener("popstate", openFromAddress);

// The services load as a module, which runs after this script and before DOMContentLoaded.
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", openFromAddress);
} else {
  openFromAddress();
}
