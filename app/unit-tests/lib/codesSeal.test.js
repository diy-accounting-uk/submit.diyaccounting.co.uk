// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/codesSeal.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { sealCodes, openCodes } from "@app/lib/codesSeal.js";
import { resetBlobKeyCache } from "@app/lib/mcpBlobKey.js";

const ENTRY_ID = "11111111-2222-4333-8444-555555555555";
const CODES = { companyAuthCode: "Sim0123", personalCodes: ["ABCDE12345F"] };

describe("codesSeal", () => {
  beforeEach(() => {
    process.env.MCP_OAUTH_BLOB_KEY = "test-mcp-oauth-blob-key-0123456789abcdef";
    resetBlobKeyCache();
  });

  test("opens what it sealed, under the same entry", async () => {
    const sealed = await sealCodes(CODES, ENTRY_ID);
    expect(await openCodes(sealed, ENTRY_ID)).toEqual(CODES);
  });

  test("keeps the codes out of the sealed text", async () => {
    const sealed = await sealCodes(CODES, ENTRY_ID);
    expect(sealed).not.toContain("Sim0123");
    expect(Buffer.from(sealed.split(".")[3], "base64url").toString("utf8")).not.toContain("Sim0123");
  });

  test("seals the same codes differently each time", async () => {
    expect(await sealCodes(CODES, ENTRY_ID)).not.toBe(await sealCodes(CODES, ENTRY_ID));
  });

  test("refuses to open under another entry id", async () => {
    const sealed = await sealCodes(CODES, ENTRY_ID);
    await expect(openCodes(sealed, "aaaaaaaa-2222-4333-8444-555555555555")).rejects.toThrow();
  });

  test("refuses to open a value that was altered", async () => {
    const [version, iv, tag, ciphertext] = (await sealCodes(CODES, ENTRY_ID)).split(".");
    const altered = Buffer.from(ciphertext, "base64url");
    altered[0] ^= 1;
    await expect(openCodes([version, iv, tag, altered.toString("base64url")].join("."), ENTRY_ID)).rejects.toThrow();
  });

  test("refuses to open a value under another key", async () => {
    const sealed = await sealCodes(CODES, ENTRY_ID);
    process.env.MCP_OAUTH_BLOB_KEY = "a-different-key-0123456789abcdef0123456789";
    resetBlobKeyCache();
    await expect(openCodes(sealed, ENTRY_ID)).rejects.toThrow();
  });

  test("refuses a malformed value", async () => {
    await expect(openCodes("not-sealed", ENTRY_ID)).rejects.toThrow("malformed");
  });
});
