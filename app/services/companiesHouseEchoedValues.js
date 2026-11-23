// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseEchoedValues.js
// Companies House's reason for a rejection can repeat what the filing sent: a person's name, an
// address, the company's name. A poll that reads the rejection later, after the reader has left,
// no longer holds the request, so the submit Lambda keeps a keyed hash of each word of those
// values, never the words, and the poll takes out of the reason each word whose hash it holds,
// before the reason is stored, logged or shown.

import { getPreviousVersions, getSaltVersion, hashSubWithVersion } from "./subHasher.js";
import { createLogger } from "../lib/logger.js";
// Each run of words taken out of a reason reads as the submit-time error texts put a request's value,
// so a reader meets one wording whichever answer named the value.
import { REMOVED_VALUE } from "./companiesHouseErrorText.js";

const logger = createLogger({ source: "app/services/companiesHouseEchoedValues.js" });

// The fields of a request whose values a rejection's reason could repeat: names, addresses and the
// company's name. Every string below a field of these names is read, so a list of directors or an
// address object counts. A code, a date or a choice of the form is none of them.
const ECHOED_FIELD =
  /name|director|officer|forename|surname|premise|street|thoroughfare|town|county|postcode|address|locality|careof|pobox/i;

// A word holds at least one letter: a figure or a date in a reason is Companies House's own.
const WORD = /[\p{L}\p{N}][\p{L}\p{N}'’]*/gu;
const HAS_LETTER = /\p{L}/u;

// Words of a company's name or an address that Companies House's own sentences use as well.
const KEPT_WORDS = new Set(["THE", "AND", "OF", "LIMITED", "LTD", "PLC", "LLP", "CIC", "COMPANY", "CO"]);

const HASH_LENGTH = 24;

const comparable = (word) => word.normalize("NFC").toUpperCase();

function echoedWords(value, underEchoedField, words) {
  if (typeof value === "string") {
    if (!underEchoedField) return;
    for (const [word] of value.matchAll(WORD)) {
      const upper = comparable(word);
      if (HAS_LETTER.test(upper) && !KEPT_WORDS.has(upper)) words.add(upper);
    }
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) echoedWords(entry, underEchoedField, words);
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      if (key === "companyAuthCode") continue;
      echoedWords(entry, underEchoedField || ECHOED_FIELD.test(key), words);
    }
  }
}

function wordHash(userSub, word, saltVersion) {
  return hashSubWithVersion(`companies-house-echo:${userSub}:${word}`, saltVersion).slice(0, HASH_LENGTH);
}

/**
 * The keyed hashes of the words a rejection could repeat from a request, under the account's salt
 * version, or undefined when the request holds none. Needs initializeSalt().
 * @param {object} sent - the request as the route read it
 * @param {string} userSub
 * @returns {{saltVersion: string, hashes: string[]}|undefined}
 */
export function echoedValuesOf(sent, userSub) {
  const words = new Set();
  echoedWords(sent, false, words);
  if (words.size === 0) return undefined;
  const saltVersion = getSaltVersion();
  return { saltVersion, hashes: [...new Set([...words].map((word) => wordHash(userSub, word, saltVersion)))].sort() };
}

/**
 * A text with each word whose keyed hash the echoed values hold replaced by REMOVED_VALUE.
 * @param {string} text
 * @param {{saltVersion: string, hashes: string[]}|undefined} echoedValues
 * @param {string} userSub
 * @returns {string}
 */
export function withoutEchoedValues(text, echoedValues, userSub) {
  if (typeof text !== "string" || !echoedValues?.hashes?.length) return text;
  const hashes = new Set(echoedValues.hashes);
  const echoed = (word) => HAS_LETTER.test(word) && hashes.has(wordHash(userSub, comparable(word), echoedValues.saltVersion));
  let result = "";
  let from = 0;
  let lastRemovedEnd = -1;
  for (const match of text.matchAll(WORD)) {
    const gap = text.slice(from, match.index);
    const isEchoed = echoed(match[0]);
    if (!isEchoed) {
      result += gap + match[0];
    } else if (lastRemovedEnd === from && /^[ ,]*$/.test(gap)) {
      // The words of one name, or of one address, read as one removal.
    } else {
      result += gap + REMOVED_VALUE;
    }
    from = match.index + match[0].length;
    if (isEchoed) lastRemovedEnd = from;
  }
  return result + text.slice(from);
}

/**
 * A status with the echoed values taken out of each rejection's description.
 * @param {{rejections?: Array<{description?: string}>}} status
 * @param {{saltVersion: string, hashes: string[]}|undefined} echoedValues
 * @param {string} userSub
 * @returns {object}
 */
export function statusWithoutEchoedValues(status, echoedValues, userSub) {
  if (!status?.rejections?.length || !echoedValues?.hashes?.length) return status;
  // A salt rotation that has since retired the filing's salt version leaves its hashes unreadable:
  // no word can be told apart, so each reason is kept as one removal, and the poll records it.
  if (echoedValues.saltVersion !== getSaltVersion() && !getPreviousVersions().includes(echoedValues.saltVersion)) {
    logger.warn({ message: "A rejection's reasons were removed whole: the filing's salt version is no longer held" });
    return { ...status, rejections: status.rejections.map((rejection) => ({ ...rejection, description: REMOVED_VALUE })) };
  }
  return {
    ...status,
    rejections: status.rejections.map((rejection) => ({
      ...rejection,
      description: withoutEchoedValues(rejection.description, echoedValues, userSub),
    })),
  };
}
