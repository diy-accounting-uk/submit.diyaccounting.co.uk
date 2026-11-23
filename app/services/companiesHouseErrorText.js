// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/companiesHouseErrorText.js
// What a filing route keeps of the gateway's errors: Companies House's error text can repeat a
// value of the request (a name, an address, a code), and the text goes into the filing state, the
// activity event and the answer. Each error keeps its number, who raised it, its type and its
// location; its text keeps everything but the request's values, each taken out.

/** What an echoed value of the request becomes in an error text. */
export const REMOVED_VALUE = "[a value of the request]";

// Every string in a request, however deep: a value Companies House could repeat.
function stringsOf(value) {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(stringsOf);
  if (value && typeof value === "object") return Object.values(value).flatMap(stringsOf);
  return [];
}

const escapeRegExp = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * A gateway answer's errors with each value of the request taken out of their texts, longest value
 * first, ignoring case, where the value stands as whole words: a value inside a longer word of the
 * error's own text (a surname "Field" in "missing fields") leaves that word as it is. Values shorter
 * than three characters stay, since they match ordinary words and numbers of the error's own text.
 * @param {{errors?: object[]}} parsed - the parsed gateway answer
 * @param {object} request - every field the route sent, the company's and the form's
 * @returns {object} the answer with its errors' texts cleaned; every other field as it came
 */
export function withoutRequestValues(parsed, request) {
  if (!parsed?.errors?.length) return parsed;
  const values = [...new Set(stringsOf(request).map((value) => value.trim()))]
    .filter((value) => value.length >= 3)
    .sort((a, b) => b.length - a.length);
  const cleaned = (text) =>
    values.reduce(
      (remaining, value) =>
        remaining.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(value)}(?![\\p{L}\\p{N}])`, "giu"), REMOVED_VALUE),
      text,
    );
  return {
    ...parsed,
    errors: parsed.errors.map((error) => (typeof error.text === "string" ? { ...error, text: cleaned(error.text) } : error)),
  };
}
