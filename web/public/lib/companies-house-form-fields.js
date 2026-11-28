// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-form-fields.js
// The field pattern of the Companies House form pages on the shared filing route: each field this
// file names gets the paper form and section it answers ("Form AA01, section 3") ahead of its label
// or legend, and a note under it with the form's guidance and a link to the form on GOV.UK. The
// pages' fields have no place in DIY Accounting's spreadsheets, so there is no workbook disclosure.
// The page is found by its file name; the fields of each page are listed below by element id.

(function () {
  "use strict";

  function siteText(id, english, values) {
    if (window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  const PUBLICATIONS = "https://www.gov.uk/government/publications/";

  // Each paper form's page on GOV.UK.
  const FORM_PAGES = {
    AA01: "change-your-company-accounting-reference-date-aa01",
    SH01: "return-of-allotment-of-shares-sh01",
    NM01: "change-a-company-name-nm01",
    AP02: "appoint-a-corporate-director-ap02",
    AP04: "appoint-a-corporate-secretary-ap04",
    CH01: "change-the-details-of-a-director-ch01",
    CH02: "change-the-details-of-a-corporate-director-ch02",
    CH03: "change-the-details-of-a-secretary-ch03",
    CH04: "change-the-details-of-a-corporate-secretary-ch04",
    TM01: "terminate-an-appointment-of-a-director-tm01",
    TM02: "terminate-an-appointment-of-a-secretary-tm02",
    PSC01: "give-notice-of-individual-person-with-significant-control-psc01",
    PSC02: "give-notice-of-relevant-legal-entity-with-significant-control-psc02",
    PSC03: "give-notice-of-other-registrable-person-with-significant-control-psc03",
    PSC04: "give-notice-of-change-of-details-for-person-with-significant-control-psc04",
    PSC05: "give-notice-of-change-of-details-for-relevant-legal-entity-with-significant-control-psc05",
    PSC06: "give-notice-of-change-of-details-of-other-registrable-person-with-significant-control-psc06",
    PSC07: "give-notice-of-ceasing-to-be-a-person-with-significant-control-psc07",
    PSC08: "give-notice-of-psc-statements-psc08",
    PSC09: "give-notice-of-update-to-psc-statements-psc09",
    AD02: "file-a-single-alternative-inspection-location-ad02",
    AD03: "change-location-of-records-to-single-alternative-inspection-location-ad03",
    AD04: "change-location-of-company-records-to-registered-office-ad04",
  };

  /** The address of a paper form's page on GOV.UK. */
  function formUrl(form) {
    const slug = FORM_PAGES[form];
    if (!slug) throw new Error(`No GOV.UK page for form ${form}`);
    return PUBLICATIONS + slug;
  }

  // The fields of each page. A target is `label` (the label of the element with that id),
  // `fieldset` (the legend of the fieldset with that id) or `fieldsetOf` (the legend of the nearest
  // fieldset around the element with that id). `sections` is the field's section on each form it
  // answers. `guidance` is the form's own guidance for the field, where it adds to what the page says.
  const PAGE_FIELDS = {
    changeAccountingRefDate: [
      {
        fieldsetOf: "periodChoices",
        sections: { AA01: "2" },
        guidance: () =>
          siteText(
            "chform.aa01-period",
            "The current period is the one that has not yet ended; the immediately previous period is the one before it.",
          ),
      },
      {
        label: "newPeriodEnd",
        sections: { AA01: "3" },
        guidance: () => siteText("chform.aa01-new-date", "You cannot change a period whose accounts are overdue."),
      },
      {
        label: "extendedBefore",
        sections: { AA01: "4" },
        guidance: () =>
          siteText(
            "chform.aa01-five-years",
            "A company may extend more than once in five years only when it is in administration or has the Secretary of State's approval.",
          ),
      },
      { label: "fiveYearExtensionReason", sections: { AA01: "4" } },
      { label: "extensionAuthorisedCode", sections: { AA01: "4" } },
    ],
    allotShares: [
      {
        fieldsetOf: "startDate",
        sections: { SH01: "2" },
        guidance: () =>
          siteText(
            "chform.sh01-dates",
            "If every share was allotted on one day, give that day as the from date. For shares allotted over a period, give both dates.",
          ),
      },
      { fieldsetOf: "allotmentRows", sections: { SH01: "3" } },
      { fieldsetOf: "beforeTables", sections: { SH01: "4" } },
      { label: "confirmCapital", sections: { SH01: "4" } },
    ],
    changeCompanyName: [
      {
        label: "proposedName",
        sections: { NM01: "2" },
        guidance: () =>
          siteText(
            "chform.nm01-name",
            "Companies House does not allow a name another company already has. A name with a sensitive word or expression needs its supporting letter before Companies House can change the name.",
          ),
      },
    ],
    appointOfficer: [
      { label: "corporateName", sections: { AP02: "3", AP04: "3" } },
      { label: "ukRegistrationNumber", sections: { AP02: "4", AP04: "4" } },
      { label: "legalForm", sections: { AP02: "5", AP04: "5" } },
      { label: "lawGoverned", sections: { AP02: "5", AP04: "5" } },
      { label: "placeRegistered", sections: { AP02: "5", AP04: "5" } },
      { label: "nonUkRegistrationNumber", sections: { AP02: "5", AP04: "5" } },
    ],
    changeOfficer: [
      { fieldset: "personFields", sections: { CH01: "2", CH03: "2" } },
      { label: "corporateName", sections: { CH02: "2", CH04: "2" } },
      { fieldset: "dobFields", sections: { CH01: "2" } },
      { label: "dateOfChange", sections: { CH01: "3", CH02: "3", CH03: "3", CH04: "3" } },
      { fieldset: "newNameFields", sections: { CH01: "4", CH03: "4" } },
      { label: "newCorporateName", sections: { CH02: "4", CH04: "4" } },
      { fieldset: "serviceAddressFields", sections: { CH01: "5", CH03: "5" } },
      { fieldset: "corporateAddressFields", sections: { CH02: "5", CH04: "5" } },
      { fieldset: "residentialAddressFields", sections: { CH01: "6" } },
      { label: "nationality", sections: { CH01: "6" } },
      { label: "legalForm", sections: { CH02: "6", CH04: "6" } },
      { label: "lawGoverned", sections: { CH02: "6", CH04: "6" } },
    ],
    removeOfficer: [
      { fieldset: "personFields", sections: { TM01: "2", TM02: "2" } },
      { label: "corporateName", sections: { TM01: "2", TM02: "2" } },
      { fieldset: "dobFields", sections: { TM01: "2" } },
      {
        label: "resignationDate",
        sections: { TM01: "3", TM02: "3" },
        guidance: () => siteText("chform.tm-one-appointment", "Each filing ends one appointment."),
      },
    ],
    notifyPsc: [
      { label: "forename", sections: { PSC01: "3" } },
      { label: "dateOfBirth", sections: { PSC01: "3" } },
      { label: "nationality", sections: { PSC01: "3" } },
      { fieldset: "serviceAddress", sections: { PSC01: "4" } },
      { fieldset: "homeAddress", sections: { PSC01: "A2" } },
      { label: "personalCode", sections: { PSC01: "A4" } },
      { label: "entityName", sections: { PSC02: "3", PSC03: "3" } },
      { fieldset: "officeAddress", sections: { PSC02: "3", PSC03: "4" } },
      { label: "legalForm", sections: { PSC02: "4", PSC03: "5" } },
      { label: "lawGoverned", sections: { PSC02: "4", PSC03: "5" } },
      { fieldsetOf: "control-hint", sections: { PSC01: "5", PSC02: "5", PSC03: "6" } },
      { fieldset: "firmControls", sections: { PSC01: "6", PSC02: "6", PSC03: "7" } },
      { fieldset: "trustControls", sections: { PSC01: "7", PSC02: "7", PSC03: "8" } },
      {
        label: "notificationDate",
        sections: { PSC01: "2", PSC02: "2", PSC03: "2" },
        guidance: () => siteText("chform.psc-became", "This cannot be before 6 April 2016."),
      },
      {
        label: "confirmationDate",
        sections: { PSC01: "8", PSC02: "8", PSC03: "9" },
        guidance: () =>
          siteText(
            "chform.psc-confirmed",
            "The later of the date the company had confirmation of the person's status and the date it had all their required particulars.",
          ),
      },
    ],
    changePscDetails: [
      { fieldset: "nameSection", sections: { PSC04: "4", PSC05: "4", PSC06: "4" } },
      { fieldset: "addressSection", sections: { PSC04: "5", PSC05: "5", PSC06: "5" } },
      { fieldset: "residenceSection", sections: { PSC04: "6" } },
      { fieldset: "nationalitySection", sections: { PSC04: "6" } },
      { fieldset: "legalSection", sections: { PSC05: "6", PSC06: "6" } },
      { fieldset: "controlSection", sections: { PSC04: "7", PSC05: "7", PSC06: "7" } },
      {
        label: "dateOfChange",
        sections: { PSC04: "3", PSC05: "3", PSC06: "3" },
        guidance: () =>
          siteText(
            "chform.psc-change-date",
            "Give every change that happened on this date. A change on another date needs its own filing.",
          ),
      },
      {
        label: "confirmationDate",
        sections: { PSC04: "10", PSC05: "10", PSC06: "10" },
        guidance: () =>
          siteText(
            "chform.psc-change-confirmed",
            "The date the company had confirmation that the details changed, how they changed and the date of the change.",
          ),
      },
    ],
    ceasePsc: [
      { fieldsetOf: "pscChoices", sections: { PSC07: "2" } },
      { label: "cessationDate", sections: { PSC07: "4" } },
      {
        label: "confirmationDate",
        sections: { PSC07: "5" },
        guidance: () =>
          siteText(
            "chform.psc07-confirmed",
            "If the company had confirmation that the person ceased, and of the date they ceased, on different dates, give the later of the two.",
          ),
      },
    ],
    pscStatements: [
      {
        label: "relevantDate",
        sections: { PSC08: "2", PSC09: "2" },
        guidance: () =>
          siteText(
            "chform.psc08-relevant-date",
            "The date the company first knew or had cause to believe the statement was true, the date a notice had to be complied with, or the date a restrictions notice was given.",
          ),
      },
      { fieldset: "notifySection", sections: { PSC08: "3" } },
      { fieldset: "withdrawSection", sections: { PSC09: "3" } },
      { fieldset: "reasonSection", sections: { PSC09: "8" } },
    ],
    recordsLocation: [
      {
        fieldset: "addressFields",
        sections: { AD02: "2" },
        guidance: () =>
          siteText("chform.ad02-sail", "The inspection location must be in the part of the United Kingdom the company is registered in."),
      },
    ],
  };

  // A list of forms, "AP02 and AP04". Welsh joins with "ac" before a form whose letters start with
  // a vowel sound, so that case has its own text.
  function joinedText(items) {
    if (items.length === 1) return items[0];
    const values = { first: items.slice(0, -1).join(", "), last: items.at(-1) };
    return /^[ACEFHILMNORSX]/.test(values.last)
      ? siteText("chform.join-vowel", "{first} and {last}", values)
      : siteText("chform.join", "{first} and {last}", values);
  }

  /**
   * The reference ahead of a field's label: the forms that share a section are named together, and
   * each group of forms with its section, in the order the forms are listed.
   * @param {Object<string, string>} sections - the section of the field on each form
   */
  function referenceText(sections) {
    const groups = new Map();
    for (const [form, section] of Object.entries(sections)) groups.set(section, [...(groups.get(section) ?? []), form]);
    return [...groups.entries()]
      .map(([section, forms]) =>
        forms.length === 1
          ? siteText("chform.reference-one", "Form {form}, section {section}", { form: forms[0], section })
          : siteText("chform.reference-many", "Forms {forms}, section {section}", { forms: joinedText(forms), section }),
      )
      .join("; ");
  }

  function create(tag, attributes, ...children) {
    const node = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
    node.append(...children);
    return node;
  }

  function headingOf(field) {
    if (field.label) {
      const label = document.querySelector(`label[for="${field.label}"]`);
      if (!label) throw new Error(`No label for #${field.label}`);
      return label;
    }
    const fieldset = field.fieldset
      ? document.getElementById(field.fieldset)
      : document.getElementById(field.fieldsetOf)?.closest("fieldset");
    const legend = fieldset?.querySelector(":scope > legend");
    if (!legend) throw new Error(`No legend for ${field.fieldset ?? field.fieldsetOf}`);
    return legend;
  }

  // The note under a heading: the page's own hint for the field when it has one, else a new hint
  // the field's control is described by.
  function noteFor(field, heading) {
    const id = field.label ?? field.fieldset ?? field.fieldsetOf;
    const existing = field.label ? document.getElementById(`${field.label}-hint`) : heading.nextElementSibling;
    if (existing?.matches("p.hint")) return existing;
    const note = create("p", { class: "hint", id: `${id}-form-note` });
    const choice = heading.parentElement.classList.contains("choice") ? heading.parentElement : heading;
    choice.after(note);
    const control = field.label ? document.getElementById(field.label) : null;
    if (control) control.setAttribute("aria-describedby", [control.getAttribute("aria-describedby"), note.id].filter(Boolean).join(" "));
    return note;
  }

  function linksTo(forms) {
    const inEnglish = window.siteLanguage?.chrome?.() === "cy" ? [" ", create("span", { class: "lang-mark" }, "(yn Saesneg)")] : [];
    const anchors = forms.flatMap((form, index) => [
      ...(index > 0 ? [", "] : []),
      create(
        "a",
        { href: formUrl(form), target: "_blank", rel: "noopener" },
        siteText("chform.form-link", "Companies House form {form}", { form }),
      ),
    ]);
    return [...anchors, ...inEnglish, "."];
  }

  function gapAfter(text) {
    if (!text.trim()) return "";
    return /[.!?]$/.test(text.trim()) ? " " : ". ";
  }

  /** Give one field its reference and note. */
  function decorateField(field) {
    const heading = headingOf(field);
    if (heading.dataset.formReference) return;
    const reference = referenceText(field.sections);
    heading.dataset.formReference = reference;
    heading.prepend(create("span", { class: "form-reference" }, reference), ": ");
    const note = noteFor(field, heading);
    const guidance = field.guidance ? field.guidance() : "";
    note.append(gapAfter(note.textContent), guidance, gapAfter(guidance), ...linksTo(Object.keys(field.sections)));
    note.hidden = false;
  }

  /** The fields of a page, by its file name without .html. */
  function fieldsOf(page) {
    return PAGE_FIELDS[page] ?? [];
  }

  /** Give every field the page lists its reference and note. */
  function decoratePage(page) {
    fieldsOf(page).forEach(decorateField);
  }

  function pageName() {
    return (window.location.pathname.split("/").pop() || "").replace(/\.html$/, "");
  }

  window.companiesHouseFormFields = { decoratePage, fieldsOf, referenceText, formUrl };

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => decoratePage(pageName()));
  else decoratePage(pageName());
})();
