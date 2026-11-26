// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/form-draft.test.js

import { describe, test, expect, vi } from "vitest";
import {
  DEFAULT_KEEP_DAYS,
  KEEP_DAYS_KEY,
  deleteAllDrafts,
  deleteDraft,
  deleteExpiredDrafts,
  draftKey,
  draftSaver,
  keepDays,
  loadDraft,
  saveDraft,
  setKeepDays,
} from "../public/lib/form-draft.js";

function memoryStorage() {
  const items = new Map();
  return {
    get length() {
      return items.size;
    },
    key: (index) => [...items.keys()][index] ?? null,
    getItem: (key) => (items.has(key) ? items.get(key) : null),
    setItem: (key, value) => items.set(key, String(value)),
    removeItem: (key) => items.delete(key),
    items,
  };
}

const NOW = Date.parse("2026-11-26T10:00:00.000Z");
const DAY = 86_400_000;
const SCOPE = { journey: "ct600", sub: "sub-a", companyNumber: "00000001" };
const PERIOD = { periodStart: "2025-04-01", periodEnd: "2026-03-31" };

describe("form-draft", () => {
  test("a record is keyed by the journey, the user's sub and the company number", () => {
    expect(draftKey(SCOPE)).toBe("formDraft.ct600.sub-a.00000001");
    expect(draftKey({ ...SCOPE, sub: "sub-b" })).not.toBe(draftKey(SCOPE));
    expect(draftKey({ ...SCOPE, companyNumber: "00000002" })).not.toBe(draftKey(SCOPE));
  });

  test("a saved record holds the values, the period, the time saved and an expiry 28 days on by default", () => {
    const storage = memoryStorage();
    saveDraft(storage, { ...SCOPE, period: PERIOD, values: { currentTurnover: "1000", periodStart: "2025-04-01" } }, NOW);

    const record = JSON.parse(storage.getItem(draftKey(SCOPE)));
    expect(record.values).toEqual({ currentTurnover: "1000", periodStart: "2025-04-01" });
    expect(record.period).toEqual(PERIOD);
    expect(record.savedAt).toBe("2026-11-26T10:00:00.000Z");
    expect(DEFAULT_KEEP_DAYS).toBe(28);
    expect(Date.parse(record.expiresAt) - NOW).toBe(28 * DAY);
  });

  test("a saved record never holds the Government Gateway user ID and password or the authentication code", () => {
    const storage = memoryStorage();
    saveDraft(
      storage,
      {
        ...SCOPE,
        period: PERIOD,
        values: { currentTurnover: "1000", gatewayUserId: "user", gatewayPassword: "secret", companyAuthCode: "ABC123" },
      },
      NOW,
    );

    const stored = storage.getItem(draftKey(SCOPE));
    expect(JSON.parse(stored).values).toEqual({ currentTurnover: "1000" });
    expect(stored).not.toContain("secret");
    expect(stored).not.toContain("ABC123");
    expect(stored).not.toContain("gateway");
  });

  test("the chosen days set the expiry, and a record past it is not loaded and is deleted", () => {
    const storage = memoryStorage();
    setKeepDays(storage, 7);
    expect(keepDays(storage)).toBe(7);
    saveDraft(storage, { ...SCOPE, period: PERIOD, values: { a: "1" } }, NOW);

    expect(loadDraft(storage, SCOPE, NOW + 7 * DAY - 1)?.values).toEqual({ a: "1" });
    expect(loadDraft(storage, SCOPE, NOW + 7 * DAY)).toBeNull();
    expect(storage.getItem(draftKey(SCOPE))).toBeNull();
  });

  test("do not keep saves nothing and deletes the person's records", () => {
    const storage = memoryStorage();
    saveDraft(storage, { ...SCOPE, period: PERIOD, values: { a: "1" } }, NOW);
    setKeepDays(storage, 0, { sub: "sub-a" });

    expect(storage.getItem(draftKey(SCOPE))).toBeNull();
    expect(saveDraft(storage, { ...SCOPE, period: PERIOD, values: { a: "2" } }, NOW)).toBeNull();
    expect(storage.getItem(draftKey(SCOPE))).toBeNull();
    expect(() => setKeepDays(storage, 14)).toThrow(/7, 28, 90, 0/);
  });

  test("a stored choice that is not one of the choices reads as the default", () => {
    const storage = memoryStorage();
    storage.setItem(KEEP_DAYS_KEY, "365");
    expect(keepDays(storage)).toBe(DEFAULT_KEEP_DAYS);
  });

  test("nothing is saved for a signed-out person or without a company", () => {
    const storage = memoryStorage();
    expect(saveDraft(storage, { ...SCOPE, sub: null, period: PERIOD, values: { a: "1" } }, NOW)).toBeNull();
    expect(saveDraft(storage, { ...SCOPE, companyNumber: undefined, period: PERIOD, values: { a: "1" } }, NOW)).toBeNull();
    expect(storage.length).toBe(0);
  });

  test("delete removes one record, and delete all removes every record of the person and no one else's", () => {
    const storage = memoryStorage();
    const other = { ...SCOPE, companyNumber: "00000002" };
    const someoneElse = { ...SCOPE, sub: "sub-b" };
    for (const scope of [SCOPE, other, someoneElse]) saveDraft(storage, { ...scope, period: PERIOD, values: { a: "1" } }, NOW);
    setKeepDays(storage, 90);

    deleteDraft(storage, SCOPE);
    expect(storage.getItem(draftKey(SCOPE))).toBeNull();
    expect(storage.getItem(draftKey(other))).not.toBeNull();

    expect(deleteAllDrafts(storage, "sub-a")).toBe(1);
    expect(storage.getItem(draftKey(other))).toBeNull();
    expect(storage.getItem(draftKey(someoneElse))).not.toBeNull();
    expect(keepDays(storage)).toBe(90);
  });

  test("deleting expired records removes those past their expiry and unreadable ones, and keeps the rest and the choice", () => {
    const storage = memoryStorage();
    setKeepDays(storage, 7);
    saveDraft(storage, { ...SCOPE, period: PERIOD, values: { a: "1" } }, NOW - 8 * DAY);
    const live = { ...SCOPE, companyNumber: "00000002" };
    saveDraft(storage, { ...live, period: PERIOD, values: { a: "1" } }, NOW);
    storage.setItem("formDraft.ct600.sub-a.00000003", "not json");
    storage.setItem("unrelated", "kept");

    expect(deleteExpiredDrafts(storage, NOW)).toBe(2);
    expect(storage.getItem(draftKey(live))).not.toBeNull();
    expect(storage.getItem("unrelated")).toBe("kept");
    expect(keepDays(storage)).toBe(7);
  });

  test("the saver runs once, one delay after the last change, and cancel stops it", () => {
    vi.useFakeTimers();
    try {
      const save = vi.fn();
      const saver = draftSaver(save, 1000);
      saver.schedule();
      vi.advanceTimersByTime(600);
      saver.schedule();
      vi.advanceTimersByTime(999);
      expect(save).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(save).toHaveBeenCalledTimes(1);

      saver.schedule();
      saver.cancel();
      vi.advanceTimersByTime(2000);
      expect(save).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  test("storage that throws saves nothing and loads nothing", () => {
    const failing = {
      length: 0,
      key: () => null,
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    };
    expect(saveDraft(failing, { ...SCOPE, period: PERIOD, values: { a: "1" } }, NOW)).toBeNull();
    expect(loadDraft(failing, SCOPE, NOW)).toBeNull();
    expect(() => deleteAllDrafts(failing, "sub-a")).not.toThrow();
  });
});
