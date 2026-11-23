// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/companies-house-namesakes.js
// Tells apart two people on a company's register who share a name, wherever a page offers a choice
// of them or names the one chosen: by the month and year of birth the register shows, or, where it
// gives none or both share it, by the date of an officer's appointment or the date Companies House
// was notified of a PSC. A person with a name no one else on the list has needs nothing more. Reads
// window.companiesHouseLabels for the dates.

(function () {
  "use strict";

  function siteText(id, english, values) {
    if (window.siteText) return window.siteText(id, english, values);
    return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
  }

  const comparable = (name) =>
    String(name || "")
      .trim()
      .replace(/\s+/g, " ")
      .toUpperCase();
  const birthOf = (person) =>
    person.dateOfBirth?.month && person.dateOfBirth?.year ? `${person.dateOfBirth.year}-${person.dateOfBirth.month}` : "";

  /**
   * The words that tell a person apart from others on the list with the same name, or "".
   * @param {{name: string, dateOfBirth?: {month: number, year: number}, appointedOn?: string, notifiedOn?: string}} person
   * @param {object[]} people - everyone the choice offers, the person among them
   * @returns {string}
   */
  function namesakeNote(person, people) {
    const namesakes = people.filter((other) => other !== person && comparable(other.name) === comparable(person.name));
    if (namesakes.length === 0) return "";
    const labels = window.companiesHouseLabels;
    const birth = birthOf(person);
    const born = birth
      ? siteText("ch.namesake.born", "born {month}", {
          month: labels.formatMonthYear(person.dateOfBirth.month, person.dateOfBirth.year),
        })
      : "";
    const birthTellsApart = Boolean(birth) && namesakes.every((other) => birthOf(other) !== birth);
    if (birthTellsApart) return born;
    let dated = "";
    if (person.appointedOn) {
      dated = siteText("ch.namesake.appointed", "appointed {date}", { date: labels.formatCompanyDate(person.appointedOn) });
    } else if (person.notifiedOn) {
      dated = siteText("ch.namesake.notified", "notified {date}", { date: labels.formatCompanyDate(person.notifiedOn) });
    }
    if (!dated) return born;
    return born ? `${born}, ${dated}` : dated;
  }

  /**
   * A person's name with what tells them apart from a namesake, and any other words in brackets.
   * @param {object} person
   * @param {object[]} people
   * @param {string} [described] - such as the role, which comes first in the brackets
   * @returns {string}
   */
  function namedApart(person, people, described) {
    const parts = [described, namesakeNote(person, people)].filter(Boolean);
    return parts.length ? `${person.name} (${parts.join(", ")})` : person.name;
  }

  /**
   * A person's name, then what tells them apart from a namesake, then the other words in brackets:
   * "Jo Smith, born June 1985 (Individual)". The PSC pages name a person this way.
   * @param {object} person
   * @param {object[]} people
   * @param {string} described - such as the kind of PSC
   * @returns {string}
   */
  function namedApartBefore(person, people, described) {
    const note = namesakeNote(person, people);
    if (!note) return `${person.name} (${described})`;
    return siteText("ch.namesake.named-with-note", "{name}, {note} ({described})", { name: person.name, note, described });
  }

  window.companiesHouseNamesakes = { namesakeNote, namedApart, namedApartBefore };
})();
