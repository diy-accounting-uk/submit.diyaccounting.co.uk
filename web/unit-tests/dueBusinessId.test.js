// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/dueBusinessId.test.js

import { describe, test, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { isValidBusinessId, newBusinessId } from "../public/lib/due/due-business-id.js";

describe("a due list business id", () => {
  test.each([
    ["x-1234567890", "a UTR after a prefix"],
    ["utr-1234567890k", "a UTR with its K after a prefix"],
    ["vat-gb-123456789", "a VAT number split from its GB"],
    ["shop-123456789012", "a VAT number with its branch digits"],
    ["acct1234567890", "a UTR among letters"],
    ["123-456-789", "a VAT number written in groups"],
    ["12345-67890", "a UTR written in groups"],
    ["jane-qq123456c", "a National Insurance number after a name"],
    ["ab-12-34-56-c", "a National Insurance number written in groups"],
    ["shop-12345678", "a company number after a prefix"],
    ["co-12-34-56-78", "a company number written in groups"],
    ["acme-sc123456-ltd", "a company number between words"],
    ["r0000001-shop", "a company number of a letter and seven digits"],
    ["xab123456cx", "a National Insurance number among letters"],
    ["acct12345678", "a company number among letters"],
    ["xsc123456", "a company number with its letters among letters"],
    ["1234-5678", "a company number written in two groups of four"],
  ])("refuses %s, which holds %s", (id) => {
    expect(isValidBusinessId(id)).toBe(false);
  });

  test.each(["shop-1", "kq7x2m9p", "2024-11-22", "b-2024", "1", "12345678901", "3f2b8c1e-9d4a-4f6b-8a2c-5e7d9b1a0c3f"])(
    "takes %s, which holds no identifier",
    (id) => {
      expect(isValidBusinessId(id)).toBe(true);
    },
  );

  test("a new id is a UUID the rule takes, drawn again while one holds an identifier's form", () => {
    const drawn = ["12345678-9d4a-4f6b-8a2c-5e7d9b1a0c3f", "3f2b8c1e-9d4a-4f6b-8a2c-123456789012", "3f2b8c1e-9d4a-4f6b-8a2c-5e7d9b1a0c3f"];
    expect(newBusinessId(() => drawn.shift())).toBe("3f2b8c1e-9d4a-4f6b-8a2c-5e7d9b1a0c3f");
    expect(drawn).toEqual([]);
    for (let index = 0; index < 1000; index += 1) expect(isValidBusinessId(newBusinessId(randomUUID))).toBe(true);
  });
});
