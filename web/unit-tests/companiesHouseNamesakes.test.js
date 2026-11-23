// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/companiesHouseNamesakes.test.js

import { describe, it, expect, beforeAll } from "vitest";

const INDIVIDUAL = "Individual";
const ENTITY = "Legal entity or other registrable person";

const psc = (dateOfBirth, notifiedOn, kind = INDIVIDUAL) => ({ name: "Jo Smith", kind, dateOfBirth, notifiedOn });

describe("companies-house-namesakes", () => {
  let namesakes;
  beforeAll(async () => {
    globalThis.window = globalThis;
    await import("../public/lib/companies-house-labels.js");
    await import("../public/lib/companies-house-namesakes.js");
    namesakes = window.companiesHouseNamesakes;
  });

  it("names a person no one else on the list shares a name with plainly", () => {
    const only = psc({ month: 6, year: 1985 }, "2016-04-06");
    expect(namesakes.namedApartBefore(only, [only], INDIVIDUAL)).toBe("Jo Smith (Individual)");
  });

  it("names a corporate PSC beside an individual of its name plainly, and the individual by birth", () => {
    const individual = psc({ month: 6, year: 1985 }, "2016-04-06");
    const entity = psc(undefined, "2019-09-01", ENTITY);
    const people = [individual, entity];
    expect(namesakes.namedApartBefore(individual, people, INDIVIDUAL)).toBe("Jo Smith, born June 1985 (Individual)");
    expect(namesakes.namedApartBefore(entity, people, ENTITY)).toBe(
      "Jo Smith, notified 1 September 2019 (Legal entity or other registrable person)",
    );
  });

  it("tells apart three PSCs of one name, two of them born in the same month, by the date Companies House was notified", () => {
    const first = psc({ month: 6, year: 1985 }, "2016-04-06");
    const second = psc({ month: 6, year: 1985 }, "2021-03-15");
    const third = psc({ month: 2, year: 1990 }, "2019-09-01");
    const people = [first, second, third];
    const labels = people.map((person) => namesakes.namedApartBefore(person, people, INDIVIDUAL));
    expect(labels).toEqual([
      "Jo Smith, born June 1985, notified 6 April 2016 (Individual)",
      "Jo Smith, born June 1985, notified 15 March 2021 (Individual)",
      "Jo Smith, born February 1990 (Individual)",
    ]);
    expect(new Set(labels).size).toBe(3);
  });

  it("tells apart two officers of one name and birth month by the date of appointment", () => {
    const officer = (appointedOn) => ({ name: "TENNANT, Marcus John", dateOfBirth: { month: 2, year: 1975 }, appointedOn });
    const people = [officer("2015-01-01"), officer("2021-06-01")];
    expect(people.map((person) => namesakes.namedApart(person, people, "director"))).toEqual([
      "TENNANT, Marcus John (director, born February 1975, appointed 1 January 2015)",
      "TENNANT, Marcus John (director, born February 1975, appointed 1 June 2021)",
    ]);
  });
});
