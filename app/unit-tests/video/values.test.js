// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/unit-tests/video/values.test.js

import { describe, test, expect } from "vitest";
import { substituteValues } from "../../../scripts/lib/video/values.js";

const now = new Date("2026-09-04T10:00:00Z");

describe("substituteValues", () => {
  test("leaves text with no placeholder alone", () => {
    expect(substituteValues("Retrieve Obligations", {}, now)).toBe("Retrieve Obligations");
  });

  test("resolves a named value", () => {
    expect(substituteValues("{{hmrcVatNumber}}", { hmrcVatNumber: "193054661" }, now)).toBe("193054661");
  });

  test("resolves several placeholders in one string", () => {
    expect(substituteValues("{{today}} for {{hmrcVatNumber}}", { hmrcVatNumber: "193054661" }, now)).toBe("2026-09-04 for 193054661");
  });

  test("resolves the run's date from the clock it is given", () => {
    expect(substituteValues("{{today}}", {}, now)).toBe("2026-09-04");
    expect(substituteValues("{{daysAgo:10}}", {}, now)).toBe("2026-08-25");
    expect(substituteValues("{{monthsAgo:11}}", {}, now)).toBe("2025-10-04");
    expect(substituteValues("{{yearsAgo:2}}", {}, now)).toBe("2024-09-04");
  });

  test("clamps a month shift onto a day the target month has", () => {
    expect(substituteValues("{{monthsAgo:1}}", {}, new Date("2026-03-31T10:00:00Z"))).toBe("2026-02-28");
  });

  test("an eleven month window stays inside the API's 366 day limit", () => {
    const from = Date.parse(substituteValues("{{monthsAgo:11}}", {}, now));
    const to = Date.parse(substituteValues("{{today}}", {}, now));
    expect((to - from) / 86400000).toBeLessThan(366);
  });

  test("throws when a placeholder has no value for the run", () => {
    expect(() => substituteValues("{{hmrcVatNumber}}", {}, now)).toThrow(/no value for this run/);
  });

  test("throws on an unknown placeholder rather than typing it into the page", () => {
    expect(() => substituteValues("{{madeUp}}", {}, now)).toThrow(/madeUp/);
  });
});
