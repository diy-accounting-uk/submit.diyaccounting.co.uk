// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-company-name.js
// The rules of a company name that the change of name page and its route share. A plain ES module,
// so app/ imports it and the page loads it as a module, which also sets
// window.companiesHouseCompanyName.

// baseTypes-v2-10.xsd's companyNameString, as ChangeOfName restricts it: three characters of the
// first set, then up to 157 of the same set and * = # % +. Upper case only.
const NAME_CHARACTERS =
  "-,.:; 0-9A-Z&@$£¥€'\"«»‘’“”?!/\\\\()\\[\\]{}<>ÀÁÂÃÄÅĀĂĄÆǼÇĆĈĊČÞĎÐÈÉÊËĒĔĖĘĚĜĞĠĢĤĦÌÍÎÏĨĪĬĮİĴĶĹĻĽĿŁÑŃŅŇŊÒÓÔÕÖØŌŎŐǾŒŔŖŘŚŜŞŠŢŤŦÙÚÛÜŨŪŬŮŰŲŴẀẂẄỲÝŶŸŹŻŽ";
const PROPOSED_NAME = new RegExp(`^[${NAME_CHARACTERS}]{3}[${NAME_CHARACTERS}*=#%+]{0,157}$`, "u");

/**
 * Whether a name fits the schema's ProposedCompanyName: 3 to 160 characters of its character set.
 * @param {string} name - in upper case
 * @returns {boolean}
 */
export function isValidProposedCompanyName(name) {
  return typeof name === "string" && PROPOSED_NAME.test(name);
}

/**
 * Whether a name ends as a private limited company's name usually must: LIMITED or LTD, or, for a
 * company registered in Wales, the Welsh CYFYNGEDIG or CYF instead.
 * @param {string} name - in upper case
 * @param {{registeredInWales: boolean}} company
 * @returns {boolean}
 */
export function hasUsualLimitedEnding(name, { registeredInWales }) {
  const endings = registeredInWales ? ["LIMITED", "LTD", "CYFYNGEDIG", "CYF"] : ["LIMITED", "LTD"];
  return endings.some((ending) => new RegExp(`(^|\\s)${ending}\\.?$`, "u").test(String(name).trim()));
}

/** Whether the register's jurisdiction is Wales, where a company's name may end in the Welsh words. */
export function isRegisteredInWales(jurisdiction) {
  return jurisdiction === "wales";
}

if (typeof window !== "undefined") {
  window.companiesHouseCompanyName = { isValidProposedCompanyName, hasUsualLimitedEnding, isRegisteredInWales };
}
