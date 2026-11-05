// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/codesSeal.test.js

import { describe, test, expect, beforeEach } from "vitest";
import { sealCodes, openCodes } from "@app/lib/codesSeal.js";
import { resetSecretCache } from "@app/lib/cachedSecret.js";

const ENTRY_ID = "11111111-2222-4333-8444-555555555555";
const CODES = { companyAuthCode: "Sim0123", personalCodes: ["ABCDE12345F"] };

describe("codesSeal", () => {
  beforeEach(() => {
    process.env.MCP_OAUTH_BLOB_KEY = "test-mcp-oauth-blob-key-0123456789abcdef";
    resetSecretCache();
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
    resetSecretCache();
    await expect(openCodes(sealed, ENTRY_ID)).rejects.toThrow();
  });

  test("refuses a malformed value", async () => {
    await expect(openCodes("not-sealed", ENTRY_ID)).rejects.toThrow("malformed");
  });

  describe("key versions", () => {
    const V1 = "test-mcp-oauth-blob-key-0123456789abcdef";
    const V2 = "a-second-key-0123456789abcdef0123456789abcd";
    const rolled = JSON.stringify({ current: "v2", versions: { v1: V1, v2: V2 } });
    const registryV1 = JSON.stringify({ current: "v1", versions: { v1: V1 } });

    test("opens a value sealed under the raw stored key, after the store becomes a registry", async () => {
      process.env.MCP_OAUTH_BLOB_KEY = V1;
      const sealedBeforeRegistry = await sealCodes(CODES, ENTRY_ID);
      expect(sealedBeforeRegistry.startsWith("v1.")).toBe(true);
      process.env.MCP_OAUTH_BLOB_KEY = rolled;
      expect(await openCodes(sealedBeforeRegistry, ENTRY_ID)).toEqual(CODES);
    });

    test("opens a value sealed before a roll, after the roll", async () => {
      process.env.MCP_OAUTH_BLOB_KEY = registryV1;
      const sealed = await sealCodes(CODES, ENTRY_ID);
      process.env.MCP_OAUTH_BLOB_KEY = rolled;
      expect(await openCodes(sealed, ENTRY_ID)).toEqual(CODES);
    });

    test("seals under the current version and names it", async () => {
      process.env.MCP_OAUTH_BLOB_KEY = rolled;
      const sealed = await sealCodes(CODES, ENTRY_ID);
      expect(sealed.startsWith("v2.")).toBe(true);
      expect(await openCodes(sealed, ENTRY_ID)).toEqual(CODES);
    });

    test("refuses a value whose version the store no longer holds", async () => {
      process.env.MCP_OAUTH_BLOB_KEY = rolled;
      const sealed = await sealCodes(CODES, ENTRY_ID);
      process.env.MCP_OAUTH_BLOB_KEY = registryV1;
      await expect(openCodes(sealed, ENTRY_ID)).rejects.toThrow("not held");
    });

    test("refuses a value that names one version but was sealed under another", async () => {
      process.env.MCP_OAUTH_BLOB_KEY = rolled;
      const [, iv, tag, ciphertext] = (await sealCodes(CODES, ENTRY_ID)).split(".");
      await expect(openCodes(["v1", iv, tag, ciphertext].join("."), ENTRY_ID)).rejects.toThrow();
    });
  });
});
