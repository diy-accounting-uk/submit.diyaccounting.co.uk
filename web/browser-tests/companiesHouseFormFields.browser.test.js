// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/companiesHouseFormFields.browser.test.js
// Each Companies House form page on the shared filing route leads the labels and legends of its
// fields with the paper form and section they answer, and notes under them the form's guidance and
// a link to the form on GOV.UK, in English and in Welsh.

import { test, expect } from "@playwright/test";
import { serveRealSite, SITE_ORIGIN } from "./serveRealSite.js";

const PAGES = [
  "allotShares",
  "appointOfficer",
  "ceasePsc",
  "changeAccountingRefDate",
  "changeCompanyName",
  "changeOfficer",
  "changePscDetails",
  "notifyPsc",
  "pscStatements",
  "recordsLocation",
  "removeOfficer",
];

// Every field a page lists, as the page shows it: the heading's reference and text, and the note's
// links and text. A page's own hint can carry links of its own ahead of the form links.
function readFields(page, name) {
  return page.evaluate((pageName) => {
    const fields = window.companiesHouseFormFields.fieldsOf(pageName);
    return fields.map((field) => {
      const heading = field.label
        ? document.querySelector(`label[for="${field.label}"]`)
        : (field.fieldset
            ? document.getElementById(field.fieldset)
            : document.getElementById(field.fieldsetOf).closest("fieldset")
          ).querySelector(":scope > legend");
      const reference = heading.dataset.formReference;
      const noteId = field.label
        ? document.getElementById(`${field.label}-hint`)
          ? `${field.label}-hint`
          : `${field.label}-form-note`
        : null;
      const note = noteId ? document.getElementById(noteId) : heading.nextElementSibling;
      return {
        forms: Object.keys(field.sections),
        reference,
        heading: heading.textContent.trim().replace(/\s+/g, " "),
        links: [...note.querySelectorAll("a")].map((link) => ({ href: link.getAttribute("href"), text: link.textContent })),
        note: note.textContent.trim().replace(/\s+/g, " "),
      };
    });
  }, name);
}

for (const [language, prefix, formWord, linkWord] of [
  ["English", "", "Form", "Companies House form"],
  ["Welsh", "/cy", "Ffurflen", "Ffurflen Tŷ’r Cwmnïau"],
]) {
  for (const name of PAGES) {
    test(`${name} in ${language}: each listed field names its form and section and links to the form`, async ({ page }) => {
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message));
      await serveRealSite(page, { signedIn: true });
      await page.goto(`${SITE_ORIGIN}${prefix}/companies-house/${name}.html`, { waitUntil: "networkidle" });
      const fields = await readFields(page, name);
      expect(fields.length).toBeGreaterThan(0);
      for (const field of fields) {
        expect(field.reference.startsWith(formWord)).toBe(true);
        expect(field.heading.startsWith(`${field.reference}: `)).toBe(true);
        expect(field.links.slice(-field.forms.length).map(({ text }) => text)).toEqual(field.forms.map((form) => `${linkWord} ${form}`));
        for (const link of field.links.slice(-field.forms.length))
          expect(link.href).toMatch(/^https:\/\/www\.gov\.uk\/government\/publications\/[a-z0-9-]+$/);
        if (prefix) expect(field.note).toContain("(yn Saesneg)");
      }
      expect(errors).toEqual([]);
    });
  }
}

test("a legend with its own hint keeps it and adds the form's guidance and link after it", async ({ page }) => {
  await serveRealSite(page, { signedIn: true });
  await page.goto(`${SITE_ORIGIN}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  const legend = page.locator("fieldset:has(#periodChoices) > legend");
  await expect(legend).toHaveText("Form AA01, section 2: Accounting period to change");
  await expect(page.locator("#period-hint")).toHaveText(
    "The current period and the one before it, as Companies House shows them. The form changes one of these two. The current period is the one that has not yet ended; the immediately previous period is the one before it. Companies House form AA01.",
  );
  await expect(page.locator("#period-hint a")).toHaveAttribute(
    "href",
    "https://www.gov.uk/government/publications/change-your-company-accounting-reference-date-aa01",
  );
});

test("a field with its own hint and no guidance keeps the hint and adds the link after it", async ({ page }) => {
  await serveRealSite(page, { signedIn: true });
  await page.goto(`${SITE_ORIGIN}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  await expect(page.locator('label[for="newPeriodEnd"]')).toHaveText("Form AA01, section 3: New end date of the period");
  await expect(page.locator("#newPeriodEnd-hint")).toHaveText(
    "An earlier date shortens the period. A later date extends it. Companies House form AA01.",
  );
  await expect(page.locator("#newPeriodEnd")).toHaveAttribute("aria-describedby", "newPeriodEnd-hint");
});

test("a choice with no hint gets a note after the choice, which its box is described by", async ({ page }) => {
  await serveRealSite(page, { signedIn: true });
  await page.goto(`${SITE_ORIGIN}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  const note = page.locator(".choice:has(#extendedBefore) + #extendedBefore-form-note");
  await expect(note).toHaveText("Companies House form AA01.");
  await expect(page.locator("#extendedBefore")).toHaveAttribute("aria-describedby", "extendedBefore-form-note");
});

test("the rules the quoted guidance states are said once on the page", async ({ page }) => {
  await serveRealSite(page, { signedIn: true });
  await page.goto(`${SITE_ORIGIN}/companies-house/changeAccountingRefDate.html`, { waitUntil: "networkidle" });
  // The page's own refusal for overdue accounts quotes the rule too, and shows only when it applies.
  const text = await page.evaluate(() => {
    const main = document.querySelector("main").cloneNode(true);
    main.querySelector("#accountsOverdue").remove();
    return main.textContent.replace(/\s+/g, " ");
  });
  expect(text.match(/accounts are overdue\./g)).toHaveLength(1);
  expect(text.match(/more than once in five years/g)).toHaveLength(1);
});

test("forms that share a section are named together, and a form with another section after them", async ({ page }) => {
  await serveRealSite(page, { signedIn: true });
  await page.goto(`${SITE_ORIGIN}/companies-house/notifyPsc.html`, { waitUntil: "networkidle" });
  await expect(page.locator('label[for="confirmationDate"] .form-reference')).toHaveText(
    "Forms PSC01 and PSC02, section 8; Form PSC03, section 9",
  );
  await expect(page.locator('label[for="notificationDate"] .form-reference')).toHaveText("Forms PSC01, PSC02 and PSC03, section 2");
});

test("Welsh joins two forms with ac before a form whose letters start with a vowel sound", async ({ page }) => {
  await serveRealSite(page, { signedIn: true });
  await page.goto(`${SITE_ORIGIN}/cy/companies-house/appointOfficer.html`, { waitUntil: "networkidle" });
  await expect(page.locator('label[for="corporateName"] .form-reference')).toHaveText("Ffurflenni AP02 ac AP04, adran 3");
  await page.goto(`${SITE_ORIGIN}/cy/companies-house/removeOfficer.html`, { waitUntil: "networkidle" });
  await expect(page.locator('label[for="corporateName"] .form-reference')).toHaveText("Ffurflenni TM01 a TM02, adran 2");
});
