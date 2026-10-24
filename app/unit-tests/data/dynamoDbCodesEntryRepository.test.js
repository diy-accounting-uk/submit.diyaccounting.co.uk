// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/data/dynamoDbCodesEntryRepository.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";
import { FakeCodesEntryTable } from "@app/test-helpers/fakeCodesEntryTable.js";

const table = new FakeCodesEntryTable();
vi.mock("@app/lib/dynamoDbClient.js", () => ({
  executeDynamoDbCommand: (builder) => table.execute(builder),
  getResourceName: () => "test-mcp-sessions",
}));

const { createCodesEntry, getCodesEntry, fillCodesEntry, takeCodesEntry } = await import("@app/data/dynamoDbCodesEntryRepository.js");

const OWNER = "hashed-owner";
const DIRECTORS = [{ forename: "Jo", surname: "Brick" }];

describe("dynamoDbCodesEntryRepository", () => {
  beforeEach(() => {
    table.items.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test("mints a pending entry that expires in ten minutes", async () => {
    const before = Math.floor(Date.now() / 1000);
    const { entryId, state, ttl } = await createCodesEntry({ hashedSub: OWNER, kind: "accounts", companyNumber: "12345678" });
    expect(state).toBe("pending");
    expect(ttl - before).toBeGreaterThanOrEqual(600);
    expect(ttl - before).toBeLessThanOrEqual(601);
    expect(table.items.has(`codes:${entryId}`)).toBe(true);
  });

  test("reads an entry without its sealed codes", async () => {
    const { entryId } = await createCodesEntry({
      hashedSub: OWNER,
      kind: "confirmation-statement",
      companyNumber: "12345678",
      directors: DIRECTORS,
    });
    await fillCodesEntry(entryId, "sealed-text");
    const entry = await getCodesEntry(entryId);
    expect(entry).toMatchObject({
      entryId,
      state: "filled",
      kind: "confirmation-statement",
      companyNumber: "12345678",
      directors: DIRECTORS,
    });
    expect(JSON.stringify(entry)).not.toContain("sealed-text");
  });

  test("answers null for an unknown id and for an expired entry", async () => {
    expect(await getCodesEntry("missing")).toBeNull();
    const { entryId } = await createCodesEntry({ hashedSub: OWNER, kind: "accounts", companyNumber: "12345678" });
    vi.useFakeTimers({ now: Date.now() + 11 * 60 * 1000, toFake: ["Date"] });
    expect(await getCodesEntry(entryId)).toBeNull();
  });

  test("fills a pending entry once", async () => {
    const { entryId } = await createCodesEntry({ hashedSub: OWNER, kind: "accounts", companyNumber: "12345678" });
    expect(await fillCodesEntry(entryId, "first")).toBe(true);
    expect(await fillCodesEntry(entryId, "second")).toBe(false);
    expect((await takeCodesEntry(entryId, OWNER)).sealed).toBe("first");
  });

  test("does not fill an unknown or an expired entry", async () => {
    expect(await fillCodesEntry("missing", "x")).toBe(false);
    expect(table.items.size).toBe(0);
    const { entryId } = await createCodesEntry({ hashedSub: OWNER, kind: "accounts", companyNumber: "12345678" });
    vi.useFakeTimers({ now: Date.now() + 11 * 60 * 1000, toFake: ["Date"] });
    expect(await fillCodesEntry(entryId, "x")).toBe(false);
  });

  test("hands a filled entry to its owner once and deletes it", async () => {
    const { entryId } = await createCodesEntry({ hashedSub: OWNER, kind: "accounts", companyNumber: "12345678" });
    await fillCodesEntry(entryId, "sealed-text");
    expect(await takeCodesEntry(entryId, OWNER)).toEqual({
      kind: "accounts",
      companyNumber: "12345678",
      directors: [],
      sealed: "sealed-text",
    });
    expect(await takeCodesEntry(entryId, OWNER)).toBeNull();
    expect(table.items.has(`codes:${entryId}`)).toBe(false);
  });

  test("leaves a filled entry in place for a caller who does not own it", async () => {
    const { entryId } = await createCodesEntry({ hashedSub: OWNER, kind: "accounts", companyNumber: "12345678" });
    await fillCodesEntry(entryId, "sealed-text");
    expect(await takeCodesEntry(entryId, "someone-else")).toBeNull();
    expect(table.items.has(`codes:${entryId}`)).toBe(true);
  });

  test("does not hand over an entry that is still pending or has expired", async () => {
    const pending = await createCodesEntry({ hashedSub: OWNER, kind: "accounts", companyNumber: "12345678" });
    expect(await takeCodesEntry(pending.entryId, OWNER)).toBeNull();
    await fillCodesEntry(pending.entryId, "sealed-text");
    vi.useFakeTimers({ now: Date.now() + 11 * 60 * 1000, toFake: ["Date"] });
    expect(await takeCodesEntry(pending.entryId, OWNER)).toBeNull();
  });
});
