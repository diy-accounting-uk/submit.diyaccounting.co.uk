// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-gateway-text.js
// The characters the XML gateway takes in a name, an address and other free text: the pattern that
// nameAddressString and otherDataString share in baseTypes-v2-10.xsd, baseTypes-v3-6.xsd and
// baseTypes-v3-7.xsd. It takes upper-case letters with accents but few lower-case ones, so "Ŵ"
// passes and "ŵ" does not; a value with any other character is refused by the gateway, so a form
// refuses it first, naming the field and the character and never the whole value. A plain ES
// module, so the pages and app/ both read it.

/** Every character the pattern takes, each once. */
export const GATEWAY_CHARACTER_CLASS =
  "-0-9A-Za-z,.:; &@$£¥€'\"«»‘’“”?!/\\\\()[\\]{}<>*=#%+ÀÁÂÃÄÅĀĂĄÆǼÇĆĈĊČÞĎÐÈÉÊËĒĔĖĘĚĜĞĠĢĤĦÌÍÎÏĨĪĬĮİĴĶĹĻĽĿŁÑŃŅŇŊÒÓÔÕÖØŌŎŐǾŒŔŖŘŚŜŞŠŢŤŦÙÚÛÜŨŪŬŮŰŲŴẀẂẄỲÝŶŸŹŻŽſƒǺǿẅỳ";

const GATEWAY_TEXT = new RegExp(`^[${GATEWAY_CHARACTER_CLASS}]*$`, "u");
const GATEWAY_CHARACTER = new RegExp(`[${GATEWAY_CHARACTER_CLASS}]`, "u");

/**
 * The characters of a value the gateway refuses, each once, in the order they first appear.
 * @param {string|undefined|null} value
 * @returns {string[]}
 */
export function refusedCharacters(value) {
  if (value === undefined || value === null || value === "" || GATEWAY_TEXT.test(String(value))) return [];
  return [...new Set([...String(value)].filter((character) => !GATEWAY_CHARACTER.test(character)))];
}

// A line break is invisible where a reason lists the characters, so it is named in words.
const LINE_BREAKS = ["\n", "\r"];

/**
 * The refused characters as a reason lists them, with a line break, or a carriage return, named in
 * words once, where it first appears.
 * @param {string[]} refused - from refusedCharacters
 * @param {string} [lineBreakName] - the words for a line break, in the page's language
 * @returns {string[]}
 */
export function namedCharacters(refused, lineBreakName = "a line break") {
  const named = refused.map((character) => (LINE_BREAKS.includes(character) ? lineBreakName : character));
  return [...new Set(named)];
}

/**
 * The reason a value cannot go in a gateway text element, or null when it can.
 * @param {string} field - the name the reason gives the value
 * @param {string|undefined|null} value
 * @returns {string|null}
 */
export function gatewayTextProblem(field, value) {
  const refused = refusedCharacters(value);
  return refused.length ? `${field} has characters Companies House does not accept: ${namedCharacters(refused).join(" ")}` : null;
}

// Each string a path names in a value, with the field name a reason gives it. A path is dotted keys;
// "key[]" walks each entry of an array and names its index; a final "*" names every string field
// of an object.
function namedStrings(value, segments, name) {
  if (value === undefined || value === null) return [];
  if (segments.length === 0) return typeof value === "string" ? [[name, value]] : [];
  const [segment, ...rest] = segments;
  if (segment === "*") {
    if (typeof value !== "object" || Array.isArray(value)) return [];
    return Object.entries(value)
      .filter(([, part]) => typeof part === "string")
      .map(([key, part]) => [name ? `${name}.${key}` : key, part]);
  }
  const each = segment.endsWith("[]");
  const key = each ? segment.slice(0, -2) : segment;
  const child = typeof value === "object" ? value[key] : undefined;
  const childName = name ? `${name}.${key}` : key;
  if (!each) return namedStrings(child, rest, childName);
  if (!Array.isArray(child)) return [];
  return child.flatMap((entry, index) => namedStrings(entry, rest, `${childName}[${index}]`));
}

/**
 * The reasons the text fields a form names cannot go to the gateway, or [] when they all can: a
 * character the pattern does not take, or more characters than the field's schema allows. Each
 * names the field, and the characters or the limit, never the value.
 * @param {object} form - the form's fields
 * @param {Object<string, number>} textFields - each gateway text field's path, such as "surname",
 *   "address.street" or "shareholdings[].shareholders[].surname", and the maxLength its schema gives
 * @returns {string[]}
 */
export function gatewayFieldProblems(form, textFields) {
  return Object.entries(textFields).flatMap(([path, maxLength]) =>
    namedStrings(form, path.split("."), "").flatMap(([field, text]) => {
      const tooLong = [...text].length > maxLength ? [`${field} must be at most ${maxLength} characters`] : [];
      const characters = gatewayTextProblem(field, text);
      return [...tooLong, ...(characters ? [characters] : [])];
    }),
  );
}
