// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import { REMOVED_VALUE, withoutRequestValues } from "@app/services/companiesHouseErrorText.js";

describe("companiesHouseErrorText", () => {
  test("takes each value of the request out of each error text, ignoring case, longest first, keeping every other field", () => {
    const parsed = {
      errors: [
        {
          raisedBy: "Gateway",
          number: "604",
          type: "fatal",
          text: "Llewelyn at 16 Heol y Bont, Cardiff: llewelyn unknown",
          location: "Surname",
        },
      ],
      statuses: [],
      gatewayTimestamp: "2026-11-20T10:00:00Z",
    };
    const request = {
      surname: "LLEWELYN",
      address: { premise: "16", street: "Heol y Bont", postTown: "Cardiff" },
      previousNames: [{ surname: "Heol" }],
    };
    expect(withoutRequestValues(parsed, request)).toEqual({
      errors: [
        {
          raisedBy: "Gateway",
          number: "604",
          type: "fatal",
          text: `${REMOVED_VALUE} at 16 ${REMOVED_VALUE}, ${REMOVED_VALUE}: ${REMOVED_VALUE} unknown`,
          location: "Surname",
        },
      ],
      statuses: [],
      gatewayTimestamp: "2026-11-20T10:00:00Z",
    });
  });

  test("leaves a value that sits inside a longer word of the error's own text", () => {
    const parsed = {
      errors: [{ number: "604", text: "Invalid Request - Request XML contains missing fields or invalid data for FIELD" }],
    };
    expect(withoutRequestValues(parsed, { surname: "Field", companyName: "VALID TRADING LIMITED", title: "Dat" }).errors[0].text).toBe(
      `Invalid Request - Request XML contains missing fields or invalid data for ${REMOVED_VALUE}`,
    );
  });

  test("leaves an answer with no errors as it came", () => {
    const parsed = { errors: [], statuses: [{ statusCode: "ACCEPT" }] };
    expect(withoutRequestValues(parsed, { surname: "LLEWELYN" })).toBe(parsed);
  });
});
