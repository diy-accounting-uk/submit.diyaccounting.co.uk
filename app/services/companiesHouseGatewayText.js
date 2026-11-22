// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseGatewayText.js
// The characters the XML gateway takes in a name, an address and other free text: baseTypes-v3-7.xsd's
// nameAddressString and otherDataString, which share one pattern. It takes upper-case letters with
// accents but few lower-case ones, so "Ŵ" passes and "ŵ" does not; a value with any other character
// is refused by the gateway, so a form refuses it first, naming the character.

/** Every character the pattern takes, each once. */
export const GATEWAY_CHARACTER_CLASS =
  "-0-9A-Za-z,.:; &@$£¥€'\"«»‘’“”?!/\\\\()[\\]{}<>*=#%+ÀÁÂÃÄÅĀĂĄÆǼÇĆĈĊČÞĎÐÈÉÊËĒĔĖĘĚĜĞĠĢĤĦÌÍÎÏĨĪĬĮİĴĶĹĻĽĿŁÑŃŅŇŊÒÓÔÕÖØŌŎŐǾŒŔŖŘŚŜŞŠŢŤŦÙÚÛÜŨŪŬŮŰŲŴẀẂẄỲÝŶŸŹŻŽſƒǺǿẅỳ";

const GATEWAY_TEXT = new RegExp(`^[${GATEWAY_CHARACTER_CLASS}]*$`, "u");
const GATEWAY_CHARACTER = new RegExp(`[${GATEWAY_CHARACTER_CLASS}]`, "u");

/**
 * The reason a value cannot go in a gateway text element, or null when it can.
 * @param {string} field - the name the reason gives the value
 * @param {string|undefined|null} value
 * @returns {string|null}
 */
export function gatewayTextProblem(field, value) {
  if (value === undefined || value === null || value === "" || GATEWAY_TEXT.test(String(value))) return null;
  const refused = [...new Set([...String(value)].filter((character) => !GATEWAY_CHARACTER.test(character)))];
  return `${field} has characters Companies House does not accept: ${refused.join(" ")}`;
}
