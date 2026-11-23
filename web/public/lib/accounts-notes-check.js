// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/accounts-notes-check.js
// The rules for the notes on advances to directors and on share capital, which the accounts forms
// check before a preview and the accounts route checks before it builds the accounts. Both take
// the rules from here, so a filing the page lets through is one the route accepts. Each rule answers
// findings, not sentences: the page writes its own sentence for each, and the route its own message.

// The FRC business taxonomy names a director's officer position Director1 to Director40, and the
// note states each advance on its director's position, so the note holds at most 40 rows.
export const MAX_DIRECTORS_ADVANCES = 40;

// Companies House's XML schemas give a person's name at most 160 characters (PSCBaseTypes Name).
export const MAX_ADVANCE_NAME_LENGTH = 160;

// Companies House's XML schemas give free text at most 4000 characters (baseTypes).
export const MAX_ADVANCE_TERMS_LENGTH = 4000;

export const DIRECTORS_ADVANCE_FIGURES = ["balanceAtStart", "advanced", "repaid", "balanceAtEnd"];

export const SHARE_CLASSES = ["ordinaryShares", "preferenceShares", "deferredShares", "otherShares"];

/**
 * The number of shares a called up share capital is at a nominal value per share, or null when the
 * value does not divide it into whole shares.
 * @param {number} calledUpShareCapital - pounds
 * @param {number} nominalValue - pounds per share
 * @returns {number|null}
 */
export function sharesIssuedFor(calledUpShareCapital, nominalValue) {
  if (!Number.isFinite(nominalValue) || nominalValue <= 0 || !Number.isFinite(calledUpShareCapital)) return null;
  const shares = Math.round((calledUpShareCapital / nominalValue) * 1e6) / 1e6;
  return Number.isInteger(shares) ? shares : null;
}

/**
 * What is wrong with the advances to directors rows.
 * @param {Array<{name: string, terms: string, balanceAtStart: number, advanced: number, repaid: number, balanceAtEnd: number}>} rows
 * @param {{directorNames?: string[], signerName?: string, amountsOwedByDirectors?: number}} [accounts] -
 *   the directors the accounts name, when each advance must be to one of them; the director who signs
 *   micro-entity accounts, when each advance must be to them; the amounts owed by directors on the
 *   balance sheet, when the rows' closing balances must add up to it
 * @returns {Array<{rule: string, index?: number, name?: string, signer?: string, field?: string, expected?: number, total?: number, owed?: number}>}
 *   rules: "too-many-rows", "name-missing", "name-too-long", "terms-missing", "terms-too-long",
 *   "figure", "arithmetic", "same-director", "not-a-director", "not-the-signer", "sum"
 */
export function directorsAdvancesFindings(rows, { directorNames, signerName, amountsOwedByDirectors } = {}) {
  const findings = [];
  if (rows.length > MAX_DIRECTORS_ADVANCES) findings.push({ rule: "too-many-rows", total: rows.length });
  rows.forEach((row, index) => {
    const name = typeof row?.name === "string" ? row.name : "";
    const terms = typeof row?.terms === "string" ? row.terms : "";
    if (name.trim() === "") findings.push({ rule: "name-missing", index });
    else if (name.length > MAX_ADVANCE_NAME_LENGTH) findings.push({ rule: "name-too-long", index, name });
    for (const field of DIRECTORS_ADVANCE_FIGURES) {
      if (!Number.isInteger(row?.[field]) || row[field] < 0) findings.push({ rule: "figure", index, name, field });
    }
    if (terms.trim() === "") findings.push({ rule: "terms-missing", index, name });
    else if (terms.length > MAX_ADVANCE_TERMS_LENGTH) findings.push({ rule: "terms-too-long", index, name });
    if (DIRECTORS_ADVANCE_FIGURES.every((field) => Number.isInteger(row?.[field]))) {
      const expected = row.balanceAtStart + row.advanced - row.repaid;
      if (expected !== row.balanceAtEnd) findings.push({ rule: "arithmetic", index, name, expected });
    }
    if (name && rows.slice(0, index).some((earlier) => earlier?.name === name)) findings.push({ rule: "same-director", index, name });
    if (directorNames && name && !directorNames.includes(name)) findings.push({ rule: "not-a-director", index, name });
    if (signerName !== undefined && name && name !== signerName) findings.push({ rule: "not-the-signer", index, name, signer: signerName });
  });
  if (Number.isInteger(amountsOwedByDirectors) && (rows.length > 0 || amountsOwedByDirectors > 0)) {
    const total = rows.reduce((sum, row) => sum + (Number.isInteger(row?.balanceAtEnd) ? row.balanceAtEnd : 0), 0);
    if (total !== amountsOwedByDirectors) findings.push({ rule: "sum", total, owed: amountsOwedByDirectors });
  }
  return findings;
}

/**
 * Whether a balance sheet shows amounts owed by directors while the note on advances gives no row.
 * @param {Array<object>|undefined} rows - the advances to directors rows
 * @param {number[]} amountsOwedByDirectors - the balance sheets' amounts owed by directors, one a year
 * @returns {boolean}
 */
export function directorsAdvancesMissing(rows, amountsOwedByDirectors) {
  return amountsOwedByDirectors.some((owed) => Number.isFinite(owed) && owed > 0) && !rows?.length;
}

/**
 * What is wrong with the share capital note.
 * @param {{shareClass: string, nominalValue: number}} shareCapital
 * @param {number} calledUpShareCapital - the balance sheet's called up share capital, in pounds
 * @returns {Array<{rule: "share-class"|"nominal-value"|"whole-shares"}>}
 */
export function shareCapitalFindings({ shareClass, nominalValue }, calledUpShareCapital) {
  const findings = [];
  if (!SHARE_CLASSES.includes(shareClass)) findings.push({ rule: "share-class" });
  if (!Number.isFinite(nominalValue) || nominalValue <= 0) findings.push({ rule: "nominal-value" });
  else if (Number.isFinite(calledUpShareCapital) && sharesIssuedFor(calledUpShareCapital, nominalValue) === null) {
    findings.push({ rule: "whole-shares" });
  }
  return findings;
}

// page-chrome.js gives the text in the chosen language; without it the English stands.
function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

/**
 * The sentence a page shows for a finding of these rules, in the reader's language.
 * @param {{rule: string, name?: string, signer?: string, expected?: number, total?: number, owed?: number}} finding
 * @param {{calledUpShareCapital?: number}} [figures] - the balance sheet figure a share capital finding names
 * @returns {string}
 */
export function noteFindingSentence(finding, { calledUpShareCapital } = {}) {
  const name = finding.name || siteText("ch.notes.the-director", "the director");
  switch (finding.rule) {
    case "too-many-rows":
      return siteText("ch.notes.too-many-rows", "The note on advances holds at most {limit} rows, one for each director.", {
        limit: MAX_DIRECTORS_ADVANCES,
      });
    case "name-missing":
      return siteText("ch.notes.name-missing", "Enter the director's name in each advance row.");
    case "name-too-long":
      return siteText("ch.notes.name-too-long", "A director's name in an advance row is at most {limit} characters.", {
        limit: MAX_ADVANCE_NAME_LENGTH,
      });
    case "figure":
      return siteText("ch.notes.figure", "The amounts of the advance to {name} are whole pounds, and none is less than nothing.", { name });
    case "terms-missing":
      return siteText("ch.notes.terms-missing", "Give the interest rate and main conditions of the advance to {name}.", { name });
    case "terms-too-long":
      return siteText(
        "ch.notes.terms-too-long",
        "The interest rate and main conditions of the advance to {name} are at most {limit} characters.",
        { name, limit: MAX_ADVANCE_TERMS_LENGTH },
      );
    case "arithmetic":
      return siteText(
        "ch.notes.arithmetic",
        "The advance to {name} does not add up: owed at the start, plus advanced, less repaid is £{expected}, so owed at the end is £{expected}.",
        { name, expected: finding.expected },
      );
    case "same-director":
      return siteText(
        "ch.notes.same-director",
        "{name} has two advance rows. Give each director one row, with the amounts of all their advances added together.",
        { name },
      );
    case "not-a-director":
      return siteText(
        "ch.small.advance-not-director",
        "{name} is named for an advance, but is not among the directors listed. Add them to the directors, or correct the name.",
        { name },
      );
    case "not-the-signer":
      return siteText(
        "ch.micro.advance-not-signer",
        "{name} is named for an advance, but on micro-entity accounts an advance names the director who signs the accounts, {signer}. Correct the name.",
        { name, signer: finding.signer },
      );
    case "sum":
      return siteText(
        "ch.notes.sum",
        "The amounts owed at the end of the advances add up to £{total}, but the balance sheet shows £{owed} owed by directors.",
        { total: finding.total, owed: finding.owed },
      );
    case "advances-required":
      return siteText(
        "ch.notes.advances-required",
        "The balance sheet shows amounts owed by directors. Give each director who owes the company money a row in the note on advances.",
      );
    case "share-class":
      return siteText("ch.notes.share-class", "Choose the class of the shares.");
    case "nominal-value":
      return siteText("ch.notes.nominal-value", "Enter the nominal value of each share, in pounds.");
    default:
      return siteText(
        "ch.notes.whole-shares",
        "The nominal value of each share must divide the called up share capital of £{capital} into whole shares.",
        { capital: calledUpShareCapital },
      );
  }
}
