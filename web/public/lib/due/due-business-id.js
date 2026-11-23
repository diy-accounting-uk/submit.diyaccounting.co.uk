// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The id of a business on the due list. The page makes it up and the due list API checks it with the
// same rule, so a page draws a new id until the rule takes it.

const BUSINESS_ID = /^[A-Za-z0-9-]{1,40}$/;

// The forms of the identifiers a business id must not hold: a VAT number of 9 or 12 digits with or
// without GB, a UTR of 10 digits with or without its K, and a National Insurance number. These are
// also written in groups (123-456-789, AB-12-34-56-C), so they are looked for in each run of the
// id's hyphen-separated parts joined together.
const GROUPED_IDENTIFIER_FORMS = [/^(GB)?(\d{9}|\d{12})$/, /^(\d{10}K?|K\d{10})$/, /^[A-Z]{2}\d{6}[A-D]?$/];
// A company number, of 8 digits or of letters and digits, is looked for in each part on its own, in
// a run of parts of up to 3 characters each (12-34-56-78), and in two parts of 4 (1234-5678). Other
// numbers (1, 2024, 11 digits, a date's 2024-11-22) are none of these.
const WHOLE_IDENTIFIER_FORMS = [/^\d{8}$/, /^[A-Z]{2}\d{6}$/, /^[A-Z]\d{7}$/];
// A company number, a VAT number or a UTR among letters in one part (acct12345678, acct1234567890): a
// run of exactly 8, 9, 10 or 12 digits.
const DIGITS_OF_AN_IDENTIFIER = /(?<!\d)(\d{8}|\d{9}|\d{10}|\d{12})(?!\d)/;
// A National Insurance number or a company number with its letters, among other letters in one part
// (xab123456cx, xsc123456): its letters, then its digits, with no digit straight after.
const LETTERED_IDENTIFIER_FORMS = [/[A-Z]{2}\d{6}(?!\d)/, /[A-Z]\d{7}(?!\d)/];

function holdsAnIdentifier(value) {
  const parts = value.toUpperCase().split("-");
  for (let start = 0; start < parts.length; start += 1) {
    if (WHOLE_IDENTIFIER_FORMS.some((form) => form.test(parts[start]))) return true;
    if (DIGITS_OF_AN_IDENTIFIER.test(parts[start])) return true;
    if (LETTERED_IDENTIFIER_FORMS.some((form) => form.test(parts[start]))) return true;
    for (let end = start + 1; end <= parts.length; end += 1) {
      const run = parts.slice(start, end);
      const joined = run.join("");
      if (GROUPED_IDENTIFIER_FORMS.some((form) => form.test(joined))) return true;
      const grouped = run.every((part) => part.length <= 3) || (run.length === 2 && run.every((part) => part.length === 4));
      if (grouped && WHOLE_IDENTIFIER_FORMS.some((form) => form.test(joined))) return true;
    }
  }
  return false;
}

/**
 * Whether a value can be a business id. The page makes the id up for each business it adds: it names
 * the business in the path and in the row keys and says nothing about it, so an id that holds an
 * identifier of a person or a business anywhere in it is refused.
 * @returns {boolean}
 */
export function isValidBusinessId(value) {
  if (typeof value !== "string" || !BUSINESS_ID.test(value)) return false;
  return !holdsAnIdentifier(value);
}

/**
 * A new business id: a random UUID, drawn again while it holds the form of an identifier (about one
 * in four does, by its digits).
 * @param {() => string} [randomUUID]
 * @returns {string}
 */
export function newBusinessId(randomUUID = () => globalThis.crypto.randomUUID()) {
  for (;;) {
    const id = randomUUID();
    if (isValidBusinessId(id)) return id;
  }
}
