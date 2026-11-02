// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect } from "vitest";
import {
  CLOCK_NAME_PREFIX,
  LANES,
  LANE_NAMES,
  REDEEMER_LANES,
  REFERRER_LANES,
  clockName,
  expectedAmountPence,
  laneEmail,
  latestIso,
  parseEnsureOutput,
  pollUntil,
  secondAfter,
  secondBefore,
  unwrap,
} from "../../../behaviour-tests/helpers/commissionCi.js";

describe("behaviour-tests/helpers/commissionCi", () => {
  test("the lanes are the operator, three referrers and seven redeemers", () => {
    expect(LANE_NAMES).toHaveLength(11);
    expect(REFERRER_LANES).toHaveLength(3);
    expect(REDEEMER_LANES).toHaveLength(7);
    for (const lane of LANE_NAMES) expect(laneEmail(lane)).toBe(`synthetic-${lane}@test.diyaccounting.co.uk`);
  });

  test("a card number is shared only by R1 and J1c", () => {
    const byCard = new Map();
    for (const [lane, { cardNumber }] of Object.entries(LANES)) {
      if (!cardNumber) continue;
      byCard.set(cardNumber, [...(byCard.get(cardNumber) ?? []), lane]);
    }
    const shared = [...byCard.values()].filter((lanes) => lanes.length > 1);
    expect(shared).toEqual([["commission-j1-referrer", "commission-j1-redeemer-c"]]);
    expect(LANES["commission-j1-redeemer-a"].cardNumber).not.toBe("4242424242424242");
  });

  test("a clock name carries the cleanup prefix, the run and the group", () => {
    expect(clockName("123", "J1")).toBe(`${CLOCK_NAME_PREFIX}123-J1`);
  });

  test("the expected amount follows the ledger formula", () => {
    expect(expectedAmountPence({ netPence: 70, rateBps: 3300, eligibleMonths: 1, lineMonths: 1 })).toBe(23);
    expect(expectedAmountPence({ netPence: 70, rateBps: 10000, eligibleMonths: 1, lineMonths: 1 })).toBe(70);
    expect(expectedAmountPence({ netPence: 1200, rateBps: 3300, eligibleMonths: 3, lineMonths: 12 })).toBe(99);
  });

  test("the ensure output is read from the plain lines, not the export lines", () => {
    const stdout = [
      "export TEST_AUTH_USERNAME='u@test.diyaccounting.co.uk'",
      "export TEST_AUTH_PASSWORD='Testabc#'",
      "TEST_AUTH_USERNAME=u@test.diyaccounting.co.uk",
      "TEST_AUTH_PASSWORD=Testabc#",
      "TOTP_SECRET=JBSWY3DPEHPK3PXP",
    ].join("\n");
    expect(parseEnsureOutput(stdout)).toEqual({
      username: "u@test.diyaccounting.co.uk",
      password: "Testabc#",
      totpSecret: "JBSWY3DPEHPK3PXP",
    });
    expect(() => parseEnsureOutput("nothing")).toThrow(/printed no/);
  });

  test("as-of helpers move one second", () => {
    expect(secondBefore("2026-01-01T00:00:10.000Z")).toBe("2026-01-01T00:00:09.000Z");
    expect(secondAfter("2026-01-01T00:00:10.000Z")).toBe("2026-01-01T00:00:11.000Z");
    expect(latestIso("2026-01-01T00:00:00.000Z", "2026-03-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z")).toBe("2026-03-01T00:00:00.000Z");
  });

  test("unwrap returns the data member when there is one", () => {
    expect(unwrap({ data: { a: 1 } })).toEqual({ a: 1 });
    expect(unwrap({ a: 1 })).toEqual({ a: 1 });
    expect(unwrap(null)).toBeNull();
  });

  test("pollUntil returns the first truthy value and throws at the limit", async () => {
    let calls = 0;
    expect(await pollUntil("a value", async () => (++calls === 3 ? "ok" : null), { intervalMs: 1, limitMs: 1000 })).toBe("ok");
    await expect(pollUntil("never", async () => null, { intervalMs: 1, limitMs: 20 })).rejects.toThrow(/Timed out/);
  });
});
