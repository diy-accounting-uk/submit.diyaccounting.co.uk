// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/companies-house-namesakes.test.js

import { describe, it, expect, beforeAll } from "vitest";

describe("companies-house-namesakes", () => {
  let namesakes;
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/companies-house-labels.js");
    await import("../public/lib/companies-house-namesakes.js");
    namesakes = window.companiesHouseNamesakes;
  });

  const person = (name, birth, appointedOn) => ({
    name,
    ...(birth ? { dateOfBirth: { month: birth[1], year: birth[0] } } : {}),
    ...(appointedOn ? { appointedOn } : {}),
  });

  it("a name no one else on the list has needs nothing more", () => {
    const alone = person("SMITH, John", [1980, 3], "2015-01-01");
    expect(namesakes.namedApart(alone, [alone, person("JONES, Ann", [1975, 2])], "Director")).toBe("SMITH, John (Director)");
  });

  it("three officers of one name: a birth month no other has is enough, and a shared one adds the appointment date", () => {
    const first = person("SMITH, John", [1980, 3], "2015-01-01");
    const second = person("Smith,  John", [1980, 3], "2019-06-01");
    const third = person("SMITH, John", [1990, 7], "2020-02-02");
    const people = [first, second, third];

    expect(namesakes.namesakeNote(first, people)).toBe("born March 1980, appointed 1 January 2015");
    expect(namesakes.namesakeNote(second, people)).toBe("born March 1980, appointed 1 June 2019");
    expect(namesakes.namesakeNote(third, people)).toBe("born July 1990");
    expect(new Set(people.map((one) => namesakes.namedApart(one, people))).size).toBe(3);
  });

  it("a corporate officer with no date of birth is told apart by its appointment date", () => {
    const earlier = person("SIMULATOR SECRETARIES LIMITED", null, "2018-03-01");
    const later = person("SIMULATOR SECRETARIES LIMITED", null, "2021-09-15");
    expect(namesakes.namedApart(earlier, [earlier, later], "Corporate secretary")).toBe(
      "SIMULATOR SECRETARIES LIMITED (Corporate secretary, appointed 1 March 2018)",
    );
    expect(namesakes.namesakeNote(later, [earlier, later])).toBe("appointed 15 September 2021");
  });

  it("an officer resigned and reappointed is one current officer, so the current list needs no note", () => {
    const resigned = { ...person("SMITH, John", [1980, 3], "2010-01-01"), resignedOn: "2014-01-01" };
    const reappointed = person("SMITH, John", [1980, 3], "2016-05-01");
    const current = [resigned, reappointed].filter((officer) => !officer.resignedOn);
    expect(namesakes.namesakeNote(reappointed, current)).toBe("");
    expect(namesakes.namesakeNote(reappointed, [resigned, reappointed])).toBe("born March 1980, appointed 1 May 2016");
  });

  it("in Welsh the month and the date are Welsh", () => {
    window.siteLanguage = { chrome: () => "cy" };
    window.siteText = (id, english, values) => {
      const welsh = { "ch.namesake.born": "ganwyd {month}", "ch.namesake.appointed": "penodwyd {date}" }[id] ?? english;
      return welsh.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
    };
    try {
      const first = person("SMITH, John", [1980, 3], "2015-01-01");
      const second = person("SMITH, John", [1980, 3], "2019-06-01");
      expect(namesakes.namesakeNote(first, [first, second])).toBe("ganwyd Mawrth 1980, penodwyd 1 Ionawr 2015");
    } finally {
      delete window.siteLanguage;
      delete window.siteText;
    }
  });
});
