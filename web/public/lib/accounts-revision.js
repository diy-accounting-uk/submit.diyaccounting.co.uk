// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-24 File revised accounts to Companies House
// - **Use when:** a page offers to revise accounts already filed at Companies House, from the receipt of the accepted filing.
// - **Does:** accounts-revision.js reads an accounts receipt, refuses one that is not accounts, not accepted or part of a joint filing, and maps the filed document with the books bundle's mapIxbrlAccounts for either regime. It answers the regime, the original approval date, the period, the figures, the signer, the dormant facts, the balance sheet lines and the notes the mapping does not read (the accounting policies, the controlling party, the debtors, the advances to directors and the intangible assets note), and keeps the filed document and the mapped accounts; the form opens with each note filled as filed and names any note it cannot carry. It shows the page's revision section and checks it: both revision texts, and a new approval date on or after the original. fileMicroEntityAccounts.html and fileSmallCompanyAccounts.html file the revision with the accounts request's revision field; a filleted copy holds no profit and loss account, so the small company form asks for those lines.
// - **Run:** `companies-house/fileMicroEntityAccounts.html?amend=<receipt name>` or `companies-house/fileSmallCompanyAccounts.html?amend=<receipt name>`, opened from "Amend" on companies-house/filings.html
// - **Entry:** `web/public/lib/accounts-revision.js:readRevisionSource`; `web/public/lib/accounts-revision.js:checkRevision`
// - **Files:** web/public/lib/accounts-revision.js, web/public/companies-house/fileMicroEntityAccounts.page.js, web/public/companies-house/fileSmallCompanyAccounts.page.js, web/public/companies-house/filings.page.js, web/public/lib/filing-record.js, web/browser-tests/fileMicroEntityAccounts.amend.browser.test.js
// - **Keywords:** revised accounts, amend accounts, revision, section 454, 28 days, original approval date, revision texts, file-revised-accounts
// - **Related:** CH-07, CH-08
// @end-capability

// web/public/lib/accounts-revision.js
// Revised accounts start from the receipt of the accounts they revise. The module reads that receipt,
// maps the document filed with it, and checks the revision the customer describes. It holds no page
// state: a page passes in its fetch, its bundle loader and its elements.

export const ACCOUNTS_RECEIPT_KIND = "companies-house-accounts";

// The law asks the directors to deliver revised accounts within this many days of approving them.
export const DELIVERY_DAYS = 28;

const DAY_MS = 24 * 60 * 60 * 1000;

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

/**
 * Whether this person may file revised accounts in this environment: the catalogue shows them the
 * revised accounts activity. A catalogue or environment that cannot be read offers no revision.
 * @returns {Promise<boolean>}
 */
export async function isRevisionOfferedHere() {
  try {
    const service = await import("/lib/services/catalog-service.js");
    const viewerSettings = await import("/lib/services/viewer-settings.js");
    const [text, environmentName, viewer] = await Promise.all([
      service.fetchCatalogText(),
      service.fetchCurrentEnvironmentName(),
      viewerSettings.fetchViewer(),
    ]);
    return service.isRevisedAccountsOffered(service.parseCatalogueText(text), environmentName, viewer);
  } catch (error) {
    console.warn("Revised accounts are off because the catalogue could not be read:", error);
    return false;
  }
}

/**
 * The period a filed document is for: the duration context its company name is stated in.
 * @param {string} document - the filed iXBRL
 * @returns {{periodStart: string, periodEnd: string}|null}
 */
export function filedPeriodOf(document) {
  const contextRef = /<ix:nonNumeric name="bus:EntityCurrentLegalOrRegisteredName" contextRef="([^"]+)"/.exec(document)?.[1];
  const context = contextRef ? new RegExp(`<xbrli:context id="${contextRef}">([\\s\\S]*?)</xbrli:context>`).exec(document)?.[1] : null;
  const periodStart = /<xbrli:startDate>([^<]+)</.exec(context ?? "")?.[1];
  const periodEnd = /<xbrli:endDate>([^<]+)</.exec(context ?? "")?.[1];
  return periodStart && periodEnd ? { periodStart, periodEnd } : null;
}

/**
 * Why a receipt cannot be revised here, or null when it can. The page and the accounts route both
 * apply it; the route also names the company and the period the revised accounts are for.
 * @param {object|null} receipt - the stored receipt, or null when none was found
 * @param {string} [companyNumber] - the company of the revised accounts
 * @param {{periodStart: string, periodEnd: string}} [period] - the period of the revised accounts
 * @returns {string|null}
 */
export function refusalOf(receipt, companyNumber, period) {
  if (!receipt) return siteText("ch.revision.refuse-not-found", "The receipt these revised accounts name is not in your account.");
  if (receipt.kind !== ACCOUNTS_RECEIPT_KIND) {
    return siteText("ch.revision.refuse-kind", "That receipt is not an accounts filing, so there are no accounts to revise.");
  }
  if (receipt.statusCode !== "ACCEPT") {
    return siteText("ch.revision.refuse-not-accepted", "Companies House did not accept those accounts, so there is nothing to revise.");
  }
  if (receipt.amended) {
    return siteText(
      "ch.revision.refuse-already-revised",
      "These accounts are already revised accounts, and this site does not yet file a second revision.",
    );
  }
  if (receipt.jointFilingId) {
    return siteText(
      "ch.revision.refuse-joint",
      "Those accounts were filed with a Company Tax Return, so revise them on the Company Tax Return page.",
    );
  }
  if (!receipt.filedDocument) {
    return siteText("ch.revision.refuse-no-document", "The document filed with that receipt was not kept, so it cannot be revised here.");
  }
  if (companyNumber && String(receipt.companyNumber).toUpperCase() !== String(companyNumber).toUpperCase()) {
    return siteText("ch.revision.refuse-other-company", "The receipt these revised accounts name is for another company.");
  }
  const filed = filedPeriodOf(receipt.filedDocument);
  if (!filed) {
    return siteText(
      "ch.revision.refuse-no-period",
      "The accounts on that receipt do not state their period, so this site cannot revise them here.",
    );
  }
  if (period && (filed.periodStart !== period.periodStart || filed.periodEnd !== period.periodEnd)) {
    return siteText(
      "ch.revision.refuse-other-period",
      "The accounts the receipt names are for the period {from} to {to}, so revised accounts for {start} to {end} cannot replace them.",
      { from: filed.periodStart, to: filed.periodEnd, start: period.periodStart, end: period.periodEnd },
    );
  }
  return null;
}

/**
 * The accounts a receipt filed, mapped for a revision.
 * @param {object} receipt - an accounts receipt that refusalOf accepts
 * @param {{mapIxbrlAccounts: Function}} bundle - the books bundle
 */
export function revisionSourceOf(receipt, bundle) {
  const mapped = bundle.mapIxbrlAccounts(receipt.filedDocument, { regime: "any" });
  return {
    receipt,
    regime: mapped.regime,
    companyNumber: mapped.company?.number || receipt.companyNumber,
    approvalDate: mapped.approvalDate,
    period: mapped.period,
    figures: mapped.balanceSheet,
    averageEmployees: mapped.averageEmployees,
    signer: mapped.signer || mapped.directors?.[0] || "",
    dormant: { dormant: mapped.dormant, tradingStatus: mapped.tradingStatus, shareNote: mapped.shareNote },
    language: documentLanguageOf(receipt.filedDocument),
    accountantsReport: accountantsReportOf(receipt.filedDocument),
    notes: notesOf(receipt.filedDocument),
    balanceSheetLines: balanceSheetLinesOf(receipt.filedDocument),
    registeredOffice: registeredOfficeOf(receipt.filedDocument),
    filedDocument: receipt.filedDocument,
    mapped,
  };
}

const OFFICE_FACTS = {
  addressLine1: "bus:AddressLine1",
  addressLine2: "bus:AddressLine2",
  addressLine3: "bus:AddressLine3",
  cityOrTown: "bus:PrincipalLocation-CityOrTown",
  countyRegion: "bus:CountyRegion",
  postalCode: "bus:PostalCodeZip",
};

/**
 * The registered office a filed document states, as at the date of the accounts: each tagged part,
 * and the country the builder writes untagged before the postcode. null when it states no office.
 * @param {string} document - the filed iXBRL
 */
export function registeredOfficeOf(document) {
  const office = {};
  for (const [field, name] of Object.entries(OFFICE_FACTS)) {
    const text = new RegExp(`<ix:nonNumeric name="${name}" contextRef="[^"]*-registered-office">([^<]*)</ix:nonNumeric>`).exec(
      document,
    )?.[1];
    if (text) office[field] = unescapeXmlText(text);
  }
  const country =
    /-registered-office">[^<]*<\/ix:nonNumeric>, ([^<]+?)(?:, <ix:nonNumeric name="bus:PostalCodeZip" contextRef="[^"]*-registered-office">|\.<\/p>)/.exec(
      document,
    )?.[1];
  if (country) office.country = unescapeXmlText(country);
  return office.addressLine1 ? office : null;
}

/**
 * The language a filed document is written in: "cy" when its root carries xml:lang="cy", else "en".
 * @param {string} document - the filed iXBRL
 */
export function documentLanguageOf(document) {
  return /<html\b[^>]*\sxml:lang="cy"/.test(document) ? "cy" : "en";
}

function textFactOf(document, name) {
  const match = new RegExp(`<ix:nonNumeric name="${name}"[^>]*>([^<]*)</ix:nonNumeric>`).exec(document);
  return match ? unescapeXmlText(match[1]) : null;
}

/**
 * The accountants' report a filed document carries: the firm and the statement of scope; null when it
 * has none; { unreadable: true } when the document says it has one that these facts do not give.
 * @param {string} document - the filed iXBRL
 */
export function accountantsReportOf(document) {
  const accountantsName = textFactOf(document, "bus:NameEntityAccountants");
  const statement = textFactOf(document, "accrep:StatementOnScopeAccountantsReport");
  if (accountantsName && statement) return { accountantsName, statement };
  return document.includes("AuditExemptWithAccountantsReport") ? { unreadable: true } : null;
}

// The notes the builders write that the books mapping does not read, by the facts each is tagged with.
export const NOTE_POLICY_FACTS = {
  accountingPolicies: "core:GeneralDescriptionBasisMeasurementUsedInPreparingFinancialStatements",
  goingConcernStatement: "core:DescriptionGoing-concernStatus",
  revenueRecognitionPolicy: "core:RevenueRecognitionPolicy",
  tangibleFixedAssetsPolicy: "core:DescriptionMeasurementBasisForPropertyPlantEquipment",
  propertyPlantEquipmentPolicy: "core:PropertyPlantEquipmentPolicy",
  depreciationMethodPolicy: "core:DescriptionDepreciationMethodForPropertyPlantEquipment",
  intangibleAssetsPolicy: "core:IntangibleAssetsPolicy",
  impairmentPolicy: "core:ImpairmentNon-financialAssetsPolicy",
  inventoriesPolicy: "core:InventoriesPolicy",
  cashCashEquivalentsPolicy: "core:CashCashEquivalentsPolicy",
  financialInstrumentsPolicy: "core:FinancialInstrumentsRecognitionMeasurementPolicy",
  financialInstrumentsClassificationPolicy: "core:FinancialInstrumentsClassificationPolicy",
  employeeBenefitsPolicy: "core:EmployeeBenefitsPolicy",
  definedContributionPensionsPolicy: "core:DefinedContributionPensionsPolicy",
  foreignCurrencyTranslationPolicy: "core:ForeignCurrencyTranslationOperationsPolicy",
  functionalPresentationCurrencyPolicy: "core:FunctionalPresentationCurrencyPolicy",
  leasesPolicy: "core:LeasesPolicy",
  taxPolicy: "core:TaxPolicy",
  currentIncomeTaxPolicy: "core:CurrentIncomeTaxPolicy",
  deferredTaxPolicy: "core:DeferredTaxPolicy",
  dividendPolicy: "core:DividendPolicy",
};

export const NOTE_CONTROLLING_PARTY_FACTS = {
  ultimate: "core:ControllingPartyUltimateControllingPartyTruefalse",
  name: "core:NameControllingParty",
};

export const NOTE_ADVANCE_FACTS = {
  terms: "direp:DescriptionSpecificAdvanceOrCreditItsConditionsIndicativeInterestRateDirectors",
  balance: "direp:AdvancesCreditsDirectors",
  advanced: "direp:AdvancesCreditsMadeInPeriodDirectors",
  repaid: "direp:AdvancesCreditsRepaidInPeriodDirectors",
};

export const NOTE_INTANGIBLE_FACTS = {
  cost: "core:IntangibleAssetsGrossCost",
  additions: "core:AdditionsOtherThanThroughBusinessCombinationsIntangibleAssets",
  disposals: "core:DisposalsIntangibleAssets",
  amortisation: "core:AccumulatedAmortisationImpairmentIntangibleAssets",
  amortisationCharge: "core:IncreaseFromAmortisationChargeForYearIntangibleAssets",
  amortisationOnDisposals: "core:DisposalsDecreaseInAmortisationImpairmentIntangibleAssets",
};

export const NOTE_DEBTOR_FACTS = {
  tradeDebtors: "core:TradeDebtorsTradeReceivables",
  otherDebtors: "core:OtherDebtors",
  amountsOwedByDirectors: "core:AmountsOwedByDirectors",
  prepayments: "core:PrepaymentsAccruedIncome",
};

export const NOTE_SHARE_CAPITAL_FACTS = {
  shares: "core:NumberSharesIssuedFullyPaid",
  parValue: "core:ParValueShare",
  nominalValue: "core:NominalValueAllottedShareCapital",
};

const SHARE_CLASS_MEMBERS = {
  "bus:OrdinaryShareClass1": "ordinaryShares",
  "bus:PreferenceShareClass1": "preferenceShares",
  "bus:DeferredShareClass1": "deferredShares",
  "bus:OtherShareClass1": "otherShares",
};

export const NOTE_TAX_FACT = "core:CurrentTaxForPeriod";

function unescapeXmlText(text) {
  return text
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function carriesFact(document, name) {
  return document.includes(`name="${name}"`);
}

// Each monetary fact of a concept, with its context and its value in whole pounds.
function figuresOf(document, name) {
  const pattern = new RegExp(`<ix:nonFraction name="${name}" contextRef="([^"]+)"([^>]*)>([^<]*)</ix:nonFraction>`, "g");
  return Array.from(document.matchAll(pattern), ([, contextRef, attributes, text]) => {
    const digits = text.replace(/[,\s]/g, "");
    let value = NaN;
    if (/^\d+$/.test(digits)) value = Number(digits);
    else if (/^-?$/.test(digits)) value = 0;
    return { contextRef, value: /\ssign="-"/.test(attributes) ? -value : value };
  });
}

function instantOf(document, contextRef) {
  const context = new RegExp(`<xbrli:context id="${contextRef}">([\\s\\S]*?)</xbrli:context>`).exec(document)?.[1];
  return /<xbrli:instant>([^<]+)</.exec(context ?? "")?.[1] ?? null;
}

function policiesOf(document) {
  const policies = {};
  let unreadable = false;
  for (const [field, name] of Object.entries(NOTE_POLICY_FACTS)) {
    const text = textFactOf(document, name);
    if (text !== null) policies[field] = text;
    else if (carriesFact(document, name)) unreadable = true;
  }
  return { policies, unreadable };
}

function controllingPartyOf(document) {
  const ultimate = textFactOf(document, NOTE_CONTROLLING_PARTY_FACTS.ultimate);
  if (ultimate === null) return { controllingParty: null, unreadable: carriesFact(document, NOTE_CONTROLLING_PARTY_FACTS.ultimate) };
  const name = textFactOf(document, NOTE_CONTROLLING_PARTY_FACTS.name);
  if (name === null) {
    return {
      controllingParty: { ultimate: false },
      unreadable: ultimate !== "false" || carriesFact(document, NOTE_CONTROLLING_PARTY_FACTS.name),
    };
  }
  return { controllingParty: { name, ultimate: ultimate === "true" }, unreadable: false };
}

// One row per director the note names: the name the terms are written after, and the four figures
// on the contexts of that director's officer position.
function directorsAdvancesOf(document, periodEnd) {
  if (!carriesFact(document, NOTE_ADVANCE_FACTS.balance)) return { directorsAdvances: [], unreadable: false };
  const termsPattern = new RegExp(
    `<p>([^<]*): <ix:nonNumeric name="${NOTE_ADVANCE_FACTS.terms}" contextRef="[^"]*-director-(\\d+)-advance-1">([^<]*)</ix:nonNumeric></p>`,
    "g",
  );
  const balances = figuresOf(document, NOTE_ADVANCE_FACTS.balance);
  const made = figuresOf(document, NOTE_ADVANCE_FACTS.advanced);
  const repaid = figuresOf(document, NOTE_ADVANCE_FACTS.repaid);
  const ofDirector = (figures, position) => figures.filter(({ contextRef }) => contextRef.endsWith(`-director-${position}`));
  const directorsAdvances = Array.from(document.matchAll(termsPattern), ([, name, position, terms]) => {
    const balance = ofDirector(balances, position);
    return {
      name: unescapeXmlText(name),
      terms: unescapeXmlText(terms),
      balanceAtStart: balance.find(({ contextRef }) => instantOf(document, contextRef) !== periodEnd)?.value,
      advanced: ofDirector(made, position)[0]?.value,
      repaid: ofDirector(repaid, position)[0]?.value,
      balanceAtEnd: balance.find(({ contextRef }) => instantOf(document, contextRef) === periodEnd)?.value,
    };
  });
  const complete = directorsAdvances.every((row) => Object.values(row).every((value) => value !== undefined && !Number.isNaN(value)));
  return complete && directorsAdvances.length > 0 ? { directorsAdvances, unreadable: false } : { directorsAdvances: [], unreadable: true };
}

// The figures of the intangible assets note: the opening cost and amortisation are the facts at the
// instant before the period, the movements the facts of the period.
function intangibleAssetNoteOf(document, periodEnd) {
  if (!Object.values(NOTE_INTANGIBLE_FACTS).some((name) => carriesFact(document, name)))
    return { intangibleAssetNote: null, unreadable: false };
  const atStart = (name) =>
    figuresOf(document, name).find(({ contextRef }) => {
      const instant = instantOf(document, contextRef);
      return instant !== null && instant !== periodEnd;
    })?.value;
  const inPeriod = (name) => figuresOf(document, name).find(({ contextRef }) => instantOf(document, contextRef) === null)?.value;
  const note = {
    costAtStart: atStart(NOTE_INTANGIBLE_FACTS.cost),
    additions: inPeriod(NOTE_INTANGIBLE_FACTS.additions),
    disposals: inPeriod(NOTE_INTANGIBLE_FACTS.disposals),
    amortisationAtStart: atStart(NOTE_INTANGIBLE_FACTS.amortisation),
    amortisationCharge: inPeriod(NOTE_INTANGIBLE_FACTS.amortisationCharge),
    amortisationOnDisposals: inPeriod(NOTE_INTANGIBLE_FACTS.amortisationOnDisposals),
  };
  const complete = Object.values(note).every((value) => value !== undefined && !Number.isNaN(value));
  return complete ? { intangibleAssetNote: note, unreadable: false } : { intangibleAssetNote: null, unreadable: true };
}

// The balance sheet lines the books mapping does not give as the forms file them, by the concept and
// the dimension members of the context each is tagged on: the creditor splits, the provisions, the
// creditors after one year without the provisions, and the micro-entity headings outside the totals.
const WITHIN_ONE_YEAR = ["core:MaturitiesOrExpirationPeriodsDimension=core:WithinOneYear"];
const AFTER_ONE_YEAR = ["core:MaturitiesOrExpirationPeriodsDimension=core:AfterOneYear"];
export const BALANCE_SHEET_LINE_FACTS = {
  bankLoansOverdrafts: { name: "core:BankBorrowingsOverdrafts", members: WITHIN_ONE_YEAR },
  taxationSocialSecurity: { name: "core:TaxationSocialSecurityPayable", members: WITHIN_ONE_YEAR },
  accruals: {
    name: "core:AccruedLiabilities",
    members: ["core:FinancialInstrumentCurrentNon-currentDimension=core:CurrentFinancialInstruments", ...WITHIN_ONE_YEAR],
  },
  creditorsAfterOneYear: { name: "core:Creditors", members: AFTER_ONE_YEAR },
  bankLoansAfterOneYear: { name: "core:BankBorrowingsOverdrafts", members: AFTER_ONE_YEAR },
  amountsOwedToDirectors: { name: "core:AmountsOwedToDirectors", members: AFTER_ONE_YEAR },
  amountsOwedToGroupUndertakings: { name: "core:AmountsOwedToGroupUndertakings", members: AFTER_ONE_YEAR },
  provisionsForLiabilities: { name: "core:ProvisionsForLiabilitiesBalanceSheetSubtotal", members: [] },
  calledUpShareCapitalNotPaid: { name: "core:CalledUpShareCapitalNotPaidNotExpressedAsCurrentAsset", members: [] },
  prepaymentsAccruedIncome: { name: "core:PrepaymentsAccruedIncomeNotExpressedWithinCurrentAssetSubtotal", members: [] },
  accrualsDeferredIncome: { name: "core:AccruedLiabilitiesNotExpressedWithinCreditorsSubtotal", members: [] },
};

function membersOf(document, contextRef) {
  const context = new RegExp(`<xbrli:context id="${contextRef}">([\\s\\S]*?)</xbrli:context>`).exec(document)?.[1] ?? "";
  return Array.from(
    context.matchAll(/<xbrldi:explicitMember dimension="([^"]+)">([^<]+)<\/xbrldi:explicitMember>/g),
    ([, dimension, member]) => `${dimension}=${member}`,
  ).sort();
}

/**
 * The balance sheet lines of BALANCE_SHEET_LINE_FACTS a filed document states, per year: the facts at
 * the balance sheet date and at the date before the period. unreadable is true when one is stated
 * with a value that is not a whole number of pounds.
 * @param {string} document - the filed iXBRL
 * @returns {{current: Record<string, number>, prior: Record<string, number>, unreadable: boolean}}
 */
export function balanceSheetLinesOf(document) {
  const periodEnd = filedPeriodOf(document)?.periodEnd;
  const lines = { current: {}, prior: {}, unreadable: false };
  for (const [line, { name, members }] of Object.entries(BALANCE_SHEET_LINE_FACTS)) {
    const wanted = [...members].sort().join("|");
    for (const { contextRef, value } of figuresOf(document, name)) {
      const instant = instantOf(document, contextRef);
      if (instant === null || membersOf(document, contextRef).join("|") !== wanted) continue;
      if (Number.isNaN(value)) lines.unreadable = true;
      else lines[instant === periodEnd ? "current" : "prior"][line] = value;
    }
  }
  return lines;
}

// The lines of the debtors note per year: the facts at the balance sheet date and at the date before
// the period.
function debtorsOf(document, periodEnd) {
  const debtors = { current: {}, prior: {} };
  let unreadable = false;
  for (const [line, name] of Object.entries(NOTE_DEBTOR_FACTS)) {
    for (const { contextRef, value } of figuresOf(document, name)) {
      const instant = instantOf(document, contextRef);
      if (instant === null) continue;
      if (Number.isNaN(value)) unreadable = true;
      else debtors[instant === periodEnd ? "current" : "prior"][line] = value;
    }
  }
  const carried = Object.keys(debtors.current).length + Object.keys(debtors.prior).length > 0;
  return { debtors: carried && !unreadable ? debtors : null, unreadable };
}

// The share capital note: the class is the share class member of the context the number of shares is
// stated in, and the nominal value is the par value of a small company's note or the nominal value of
// a dormant micro-entity's.
function shareCapitalOf(document) {
  const [shares] = figuresOf(document, NOTE_SHARE_CAPITAL_FACTS.shares);
  if (!shares) return { shareCapital: null, unreadable: false };
  const member = membersOf(document, shares.contextRef)
    .find((pair) => pair.startsWith("bus:EntityShareClassesDimension="))
    ?.split("=")[1];
  const nominalText = [NOTE_SHARE_CAPITAL_FACTS.parValue, NOTE_SHARE_CAPITAL_FACTS.nominalValue]
    .map((name) => new RegExp(`<ix:nonFraction name="${name}"[^>]*>([^<]*)</ix:nonFraction>`).exec(document)?.[1])
    .find((text) => text !== undefined);
  const nominalValue = Number(String(nominalText ?? "").replace(/,/g, ""));
  const shareClass = SHARE_CLASS_MEMBERS[member];
  return shareClass && nominalValue > 0
    ? { shareCapital: { shareClass, nominalValue }, unreadable: false }
    : { shareCapital: null, unreadable: true };
}

// The tax on profit note of a filleted copy, which holds no profit and loss account: the current tax
// of each year, by the end date of the year's context.
function taxNoteOf(document, periodEnd) {
  const taxNote = {};
  for (const { contextRef, value } of figuresOf(document, NOTE_TAX_FACT)) {
    const context = new RegExp(`<xbrli:context id="${contextRef}">([\\s\\S]*?)</xbrli:context>`).exec(document)?.[1];
    const end = /<xbrli:endDate>([^<]+)</.exec(context ?? "")?.[1];
    if (end && !Number.isNaN(value)) taxNote[end === periodEnd ? "current" : "prior"] = value;
  }
  return Object.keys(taxNote).length ? taxNote : null;
}

/**
 * The notes a filed document carries that the books mapping does not read: the accounting policies,
 * the controlling party, the debtors, the advances to directors, the intangible assets note, the
 * share capital note and a filleted copy's tax note. unreadable names each note the document carries
 * that its facts do not give.
 * @param {string} document - the filed iXBRL
 * @returns {{policies: Record<string,string>, controllingParty: object|null, debtors: object|null, directorsAdvances: object[], intangibleAssetNote: object|null, shareCapital: object|null, taxNote: {current?: number, prior?: number}|null, unreadable: string[]}}
 */
export function notesOf(document) {
  const periodEnd = filedPeriodOf(document)?.periodEnd;
  const policies = policiesOf(document);
  const controllingParty = controllingPartyOf(document);
  const debtors = debtorsOf(document, periodEnd);
  const advances = directorsAdvancesOf(document, periodEnd);
  const intangible = intangibleAssetNoteOf(document, periodEnd);
  const shareCapital = shareCapitalOf(document);
  const unreadable = [
    ["policies", policies.unreadable],
    ["controllingParty", controllingParty.unreadable],
    ["debtors", debtors.unreadable],
    ["directorsAdvances", advances.unreadable],
    ["intangibleAssetNote", intangible.unreadable],
    ["shareCapital", shareCapital.unreadable],
  ]
    .filter(([, isUnreadable]) => isUnreadable)
    .map(([note]) => note);
  return {
    policies: policies.policies,
    controllingParty: controllingParty.controllingParty,
    debtors: debtors.debtors,
    directorsAdvances: advances.directorsAdvances,
    intangibleAssetNote: intangible.intangibleAssetNote,
    shareCapital: shareCapital.shareCapital,
    taxNote: taxNoteOf(document, periodEnd),
    unreadable,
  };
}

/**
 * The next step of a refusal, as the link its sentence names: back to the receipts, to the filing's
 * record, or to the other accounts form with the receipt carried.
 * @param {"receipts"|"record"|"small"|"micro"} step
 * @param {string} receiptName - the receipt the amend address names
 * @returns {{label: string, href: string}}
 */
export function refusalNextStep(step, receiptName) {
  const receipt = encodeURIComponent(receiptName);
  return {
    receipts: { label: siteText("ch.revision.next-receipts", "Back to your receipts"), href: "../hmrc/receipt/receipts.html" },
    record: { label: siteText("ch.revision.next-record", "See the filing"), href: `filings.html?receipt=${receipt}` },
    small: {
      label: siteText("ch.revision.next-small", "Revise them on the small company accounts page"),
      href: `fileSmallCompanyAccounts.html?amend=${receipt}`,
    },
    micro: {
      label: siteText("ch.revision.next-micro", "Revise them on the micro-entity accounts page"),
      href: `fileMicroEntityAccounts.html?amend=${receipt}`,
    },
  }[step];
}

/**
 * Read a receipt and the accounts it filed.
 * @param {string} receiptName - the receipt's stored name
 * @param {{fetchReceipt: (name: string) => Promise<Response>, loadBundle: () => Promise<object>}} io
 * @returns {Promise<{refusal: string, next: "receipts"|"record"}|{source: object}>}
 */
export async function readRevisionSource(receiptName, { fetchReceipt, loadBundle }) {
  const response = await fetchReceipt(receiptName);
  if (!response.ok) {
    return {
      refusal: siteText("ch.revision.refuse-load", "We could not load that receipt. Open the filing again from your receipts."),
      next: "receipts",
    };
  }
  const receipt = await response.json();
  const refusal = refusalOf(receipt);
  // A receipt that is missing or not accounts has no accounts record to go back to.
  if (refusal) return { refusal, next: receipt?.kind === ACCOUNTS_RECEIPT_KIND ? "record" : "receipts" };
  const bundle = await loadBundle();
  try {
    return { source: { ...revisionSourceOf(receipt, bundle), receiptName } };
  } catch (error) {
    const headings = unreadHeadingsOf(receipt.filedDocument);
    if (error?.name !== "IxbrlError" || headings.length === 0) throw error;
    return {
      refusal: siteText(
        "ch.revision.refuse-unread-heading",
        "These accounts carry {headings}, which this site cannot yet read back, so they cannot be revised here yet.",
        { headings: headings.join(", ") },
      ),
      next: "record",
    };
  }
}

// The books mapping does not yet read back the micro-entity headings outside the balance sheet
// totals, and refuses accounts that state one; these are the ones a document states.
const HEADINGS_THE_MAPPING_CANNOT_READ = ["calledUpShareCapitalNotPaid", "prepaymentsAccruedIncome", "accrualsDeferredIncome"];

function unreadHeadingsOf(document) {
  const { current, prior } = balanceSheetLinesOf(document);
  return HEADINGS_THE_MAPPING_CANNOT_READ.filter((line) => current[line] || prior[line]).map((line) => BALANCE_SHEET_LINE_TITLE[line]());
}

const originalDateNeeded = () =>
  siteText("ch.revision.need-original-date", "Enter the date the original accounts were approved, as the filed accounts show it");
const nonComplianceNeeded = () => siteText("ch.revision.need-non-compliance", "Say what was wrong with the original accounts");
const amendmentsNeeded = () => siteText("ch.revision.need-amendments", "Say what the revised accounts change");

/**
 * The problems with a revision: each revision text is required, and the revised accounts are
 * approved on or after the date the original accounts were approved.
 * @param {{originalDateOfApproval: string, nonCompliance: string, amendments: string, dateApproved: string}} revision
 * @returns {{field: "originalDateOfApproval"|"nonCompliance"|"amendments"|"dateApproved", message: string}[]}
 */
export function checkRevision({ originalDateOfApproval, nonCompliance, amendments, dateApproved }) {
  const problems = [];
  if (!String(originalDateOfApproval ?? "").trim()) problems.push({ field: "originalDateOfApproval", message: originalDateNeeded() });
  if (!String(nonCompliance ?? "").trim()) problems.push({ field: "nonCompliance", message: nonComplianceNeeded() });
  if (!String(amendments ?? "").trim()) problems.push({ field: "amendments", message: amendmentsNeeded() });
  if (dateApproved && originalDateOfApproval && dateApproved < originalDateOfApproval) {
    problems.push({
      field: "dateApproved",
      message: siteText(
        "ch.revision.date-before-original",
        "The revised accounts must be approved on or after {date}, when the original accounts were approved",
        {
          date: originalDateOfApproval,
        },
      ),
    });
  }
  return problems;
}

/**
 * Whether the revised accounts were approved more than the delivery days before today.
 * @param {string} dateApproved - YYYY-MM-DD
 * @param {Date} today
 */
export function isPastDeliveryDays(dateApproved, today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateApproved ?? ""))) return false;
  const approved = Date.parse(`${dateApproved}T00:00:00Z`);
  const startOfToday = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return startOfToday - approved > DELIVERY_DAYS * DAY_MS;
}

/**
 * Show the revision section for a source and leave the texts to the customer.
 * @param {{section: HTMLElement, originalDate: HTMLInputElement, nonCompliance: HTMLTextAreaElement, amendments: HTMLTextAreaElement}} elements
 * @param {{approvalDate: string}} source
 */
export function showRevisionSection({ section, originalDate, nonCompliance, amendments }, source) {
  for (const id of ["periodStart", "periodEnd"]) document.getElementById(id).readOnly = true;
  originalDate.value = source.approvalDate || "";
  originalDate.readOnly = Boolean(source.approvalDate);
  originalDate.required = !source.approvalDate;
  originalDate.dataset.requiredMessage = originalDateNeeded();
  nonCompliance.required = true;
  nonCompliance.dataset.requiredMessage = nonComplianceNeeded();
  amendments.required = true;
  amendments.dataset.requiredMessage = amendmentsNeeded();
  section.hidden = false;
}

const NOTE_TITLE = {
  policies: () => siteText("ch.revision.note-policies", "accounting policies"),
  controllingParty: () => siteText("ch.revision.note-controlling-party", "controlling party"),
  debtors: () => siteText("ch.revision.note-debtors", "debtors"),
  directorsAdvances: () => siteText("ch.revision.note-directors-advances", "advances and credits to directors"),
  intangibleAssetNote: () => siteText("ch.revision.note-intangible-assets", "intangible assets"),
  shareCapital: () => siteText("ch.revision.note-share-capital", "called up share capital"),
};

const box = (id) => document.getElementById(id);

const BALANCE_SHEET_LINE_TITLE = {
  bankLoansOverdrafts: () => siteText("ch.revision.line-bank-loans-overdrafts", "bank loans and overdrafts"),
  taxationSocialSecurity: () => siteText("ch.revision.line-taxation-social-security", "taxation and social security"),
  accruals: () => siteText("ch.revision.line-accruals", "accruals"),
  creditorsAfterOneYear: () => siteText("ch.revision.line-creditors-after-one-year", "creditors after more than one year"),
  bankLoansAfterOneYear: () => siteText("ch.revision.line-bank-loans-after-one-year", "bank loans after more than one year"),
  amountsOwedToDirectors: () => siteText("ch.revision.line-amounts-owed-to-directors", "amounts owed to directors"),
  amountsOwedToGroupUndertakings: () =>
    siteText("ch.revision.line-amounts-owed-to-group-undertakings", "amounts owed to group undertakings"),
  provisionsForLiabilities: () => siteText("ch.revision.line-provisions", "provisions for liabilities"),
  calledUpShareCapitalNotPaid: () => siteText("ch.revision.line-share-capital-not-paid", "called up share capital not paid"),
  prepaymentsAccruedIncome: () => siteText("ch.revision.line-prepayments", "prepayments and accrued income"),
  accrualsDeferredIncome: () => siteText("ch.revision.line-accruals-deferred-income", "accruals and deferred income"),
};

// Fill each balance sheet line into the form's box for its year, over what the books mapping gave,
// and answer the titles of the lines the document states and this form has no box for.
function fillBalanceSheetLines({ current, prior, unreadable }) {
  const toEnter = new Set();
  for (const [year, lines] of [
    ["current", current],
    ["prior", prior],
  ]) {
    for (const [line, value] of Object.entries(lines)) {
      const lineBox = box(`${year}${line[0].toUpperCase()}${line.slice(1)}`);
      if (lineBox) lineBox.value = String(value);
      else if (value !== 0) toEnter.add(line);
    }
  }
  const titles = Object.keys(BALANCE_SHEET_LINE_TITLE)
    .filter((line) => toEnter.has(line))
    .map((line) => BALANCE_SHEET_LINE_TITLE[line]());
  return unreadable ? [...titles, siteText("ch.revision.line-unreadable", "balance sheet lines")] : titles;
}

// A single-line box drops a line break and joins the words either side; the filed document shows it as a space.
const oneLine = (text) =>
  text
    .split(/\n+/)
    .map((part) => part.trim())
    .join(" ");

// Fill each note into the form's boxes as filed, and answer the titles of the notes whose facts the
// document carries and does not give. Each form has the boxes for every note its builder writes.
function fillNotes(notes) {
  const policyFields = Object.keys(notes.policies);
  for (const field of policyFields) box(field).value = notes.policies[field];
  if (policyFields.some((field) => field !== "accountingPolicies") && box("morePolicies")) box("morePolicies").open = true;

  if (notes.controllingParty?.name) {
    box("controllingPartyNamed").checked = true;
    box("controllingPartyName").value = oneLine(notes.controllingParty.name);
    box("controllingPartyUltimate").checked = notes.controllingParty.ultimate;
  } else if (notes.controllingParty) box("controllingPartyNoUltimate").checked = true;

  // The micro-entity balance sheet has no debtors line to split, and its builder writes no debtors note.
  if (notes.debtors && box("currentDebtors")) {
    for (const [year, lines] of Object.entries(notes.debtors)) {
      for (const [line, value] of Object.entries(lines)) box(`${year}${line[0].toUpperCase()}${line.slice(1)}`).value = String(value);
    }
  }

  // One advance row per advance: the form adds rows when it can, and a micro-entity row names no
  // director because its note is for the director approving the accounts.
  const advanceRows = () => document.querySelectorAll(".directors-advance-row");
  while (advanceRows().length < notes.directorsAdvances.length) box("addDirectorsAdvance").click();
  notes.directorsAdvances.forEach((advance, index) => {
    for (const [field, value] of Object.entries(advance)) {
      const advanceBox = advanceRows()[index].querySelector(`[data-advance-field="${field}"]`);
      if (advanceBox) advanceBox.value = typeof value === "string" ? oneLine(value) : String(value);
    }
  });
  // A filleted copy has no directors' report, so a director an advance names may be missing from the list.
  if (box("directors") && notes.directorsAdvances.length) {
    const directors = box("directors")
      .value.split("\n")
      .map((line) => line.trim())
      .filter(Boolean);
    const missing = notes.directorsAdvances.map((advance) => advance.name).filter((name) => !directors.includes(name));
    if (missing.length) box("directors").value = [...directors, ...new Set(missing)].join("\n");
  }

  if (notes.intangibleAssetNote) {
    box("includeIntangibleAssetNote").checked = true;
    for (const [field, value] of Object.entries(notes.intangibleAssetNote)) {
      box(`intangibleNote${field[0].toUpperCase()}${field.slice(1)}`).value = String(value);
    }
  }

  if (notes.taxNote && box("currentTax")) {
    for (const [year, value] of Object.entries(notes.taxNote)) box(`${year}Tax`).value = String(value);
  }

  // A dormant micro-entity's share capital note comes back through the books mapping, into its own boxes.
  if (notes.shareCapital && box("includeShareCapitalNote")) {
    box("includeShareCapitalNote").checked = true;
    box("shareCapitalClass").value = notes.shareCapital.shareClass;
    box("shareCapitalNominalValue").value = String(notes.shareCapital.nominalValue);
  }
  return Object.keys(NOTE_TITLE)
    .filter((note) => notes.unreadable.includes(note))
    .map((note) => NOTE_TITLE[note]());
}

/**
 * Fill the parts of the filed accounts the books mapping does not give: the notes, the accountants'
 * report and the language the accounts were filed in. The accounts forms share the boxes this fills,
 * and the revision section's notes that name what the customer must enter again.
 * @param {{accountantsReport: object|null, language: string, notes: object}} source
 */
export function fillCarriedOver({ accountantsReport, language, notes, balanceSheetLines }) {
  const notesToEnter = [...fillBalanceSheetLines(balanceSheetLines), ...fillNotes(notes)];
  const notesNote = document.getElementById("revisionNotesNote");
  notesNote.textContent = notesToEnter.length
    ? siteText("ch.revision.notes-to-enter", "The filed accounts carry these notes, which you must enter again: {notes}.", {
        notes: notesToEnter.join(", "),
      })
    : "";
  notesNote.hidden = notesToEnter.length === 0;
  if (accountantsReport?.accountantsName) {
    document.getElementById("includeAccountantsReport").checked = true;
    document.getElementById("accountantsName").value = accountantsReport.accountantsName;
    document.getElementById("accountantsStatement").value = accountantsReport.statement;
    window.accountsFormSections.showAccountantsReportFields();
  }
  document.getElementById("revisionAccountantsNote").hidden = !accountantsReport?.unreadable;
  if (!document.getElementById("documentLanguageSection").hidden) {
    document.getElementById(language === "cy" ? "documentLanguageCy" : "documentLanguageEn").checked = true;
  }
}

/**
 * Show each problem with the revision beside its field, through the page's form errors; answers true
 * when there is one.
 * @param {{originalDate: HTMLInputElement, nonCompliance: HTMLTextAreaElement, amendments: HTMLTextAreaElement}} elements
 * @param {HTMLInputElement} dateApproved - the approval date of the revised accounts
 */
export function showRevisionProblems(elements, dateApproved) {
  const problems = checkRevision({ ...revisionPayload(elements), dateApproved: dateApproved.value });
  if (problems.length === 0) return false;
  const inputs = {
    originalDateOfApproval: elements.originalDate,
    nonCompliance: elements.nonCompliance,
    amendments: elements.amendments,
    dateApproved,
  };
  // Each line goes once its field meets the rule it names.
  const passes = (field) => () =>
    !checkRevision({ ...revisionPayload(elements), dateApproved: dateApproved.value }).some((problem) => problem.field === field);
  window.formErrors.showFormErrors(problems.map(({ field, message }) => ({ input: inputs[field], message, passes: passes(field) })));
  return true;
}

/**
 * Hide the revision section and leave its fields as an original filing needs them.
 * @param {{section: HTMLElement, originalDate: HTMLInputElement, nonCompliance: HTMLTextAreaElement, amendments: HTMLTextAreaElement}} elements
 */
export function hideRevisionSection({ section, originalDate, nonCompliance, amendments }) {
  for (const id of ["periodStart", "periodEnd"]) document.getElementById(id).readOnly = false;
  section.hidden = true;
  nonCompliance.required = false;
  amendments.required = false;
  originalDate.required = false;
  originalDate.readOnly = true;
}

/**
 * The revision field of the accounts request a form sends: what the customer typed, and the name of
 * the receipt of the accounts it revises.
 * @param {{originalDate: HTMLInputElement, nonCompliance: HTMLTextAreaElement, amendments: HTMLTextAreaElement}} elements
 * @param {{receiptName: string}} source
 */
export function revisionRequest(elements, source) {
  return { ...revisionPayload(elements), revisesReceipt: source.receiptName };
}

// A form's status line names its own filing; while revising, it states the status the catalogue gives
// revised accounts instead.
const REVISION_STATUS_TEXT = {
  "production": () => [
    siteText("ch.revision.status-production-label", "Status: production."),
    siteText("ch.revision.status-production", "Revised accounts you file here reach the live Companies House register."),
  ],
  "sandbox": () => [
    siteText("ch.revision.status-sandbox-label", "Status: sandbox."),
    siteText("ch.revision.status-sandbox", "Revised accounts you file here go to the Companies House test service and file nothing real."),
  ],
  "preview": () => [
    siteText("ch.revision.status-preview-label", "Status: preview."),
    siteText(
      "ch.revision.status-preview",
      "Revised accounts are a preview here: nothing you file reaches the live Companies House register.",
    ),
  ],
  // activityStatus answers null for an activity that is not listed on prod and whose name carries no
  // sandbox or preview word.
  "not-production": () => [
    siteText("ch.revision.status-not-production-label", "Status: not yet in production."),
    siteText(
      "ch.revision.status-not-production",
      "Revised accounts are not filed for real from here yet. The availability table says what each filing does.",
    ),
  ],
};

/**
 * State the revised accounts activity's status in a form's status line. Answers a function that puts
 * the form's own line back.
 * @param {HTMLElement} statusLine - the form's [data-feature-status] line
 * @returns {Promise<() => void>}
 */
export async function showRevisionStatus(statusLine) {
  const pageLine = statusLine.cloneNode(true);
  const service = await import("/lib/services/catalog-service.js");
  const catalog = service.parseCatalogueText(await service.fetchCatalogText());
  const status =
    service.activityStatus(catalog.activities?.find((activity) => activity.id === "file-revised-accounts")) ?? "not-production";
  const [label, sentence] = REVISION_STATUS_TEXT[status]();
  const strong = document.createElement("strong");
  strong.textContent = label;
  statusLine.dataset.featureStatus = status;
  statusLine.replaceChildren(strong, ` ${sentence}`);
  return () => {
    statusLine.dataset.featureStatus = pageLine.dataset.featureStatus;
    statusLine.replaceChildren(...pageLine.childNodes);
  };
}

/** The revision field of the accounts request. */
export function revisionPayload({ originalDate, nonCompliance, amendments }) {
  return {
    originalDateOfApproval: originalDate.value,
    nonCompliance: nonCompliance.value.trim(),
    amendments: amendments.value.trim(),
  };
}
