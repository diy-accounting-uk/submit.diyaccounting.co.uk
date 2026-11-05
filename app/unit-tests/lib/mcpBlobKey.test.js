// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/mcpBlobKey.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const send = vi.hoisted(() => vi.fn());
vi.mock("@aws-sdk/client-secrets-manager", () => ({
  SecretsManagerClient: class {
    send = send;
  },
  GetSecretValueCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const { parseBlobKeyRegistry, blobKeyRegistriesEqual, loadBlobKeys } = await import("@app/lib/mcpBlobKey.js");
const { resetSecretCache } = await import("@app/lib/cachedSecret.js");

const RAW = "r".repeat(64);

describe("mcpBlobKey", () => {
  describe("parseBlobKeyRegistry", () => {
    it("reads a raw value as version v1", () => {
      expect(parseBlobKeyRegistry(RAW)).toEqual({ current: "v1", versions: { v1: RAW } });
    });

    it("reads a registry", () => {
      const registry = { current: "v2", versions: { v1: RAW, v2: "n".repeat(64) } };
      expect(parseBlobKeyRegistry(JSON.stringify(registry))).toEqual(registry);
    });

    it.each([
      ["an empty value", ""],
      ["invalid JSON", "{nope"],
      ["a current version that is not held", JSON.stringify({ current: "v3", versions: { v1: RAW } })],
      ["no versions", JSON.stringify({ current: "v1", versions: {} })],
      ["a label that is not a version", JSON.stringify({ current: "latest", versions: { latest: RAW } })],
      ["a key that is not a string", JSON.stringify({ current: "v1", versions: { v1: 5 } })],
    ])("refuses %s", (_, raw) => {
      expect(() => parseBlobKeyRegistry(raw)).toThrow();
    });
  });

  it("compares registries by content", () => {
    expect(blobKeyRegistriesEqual(parseBlobKeyRegistry(RAW), parseBlobKeyRegistry(RAW))).toBe(true);
    expect(blobKeyRegistriesEqual(parseBlobKeyRegistry(RAW), parseBlobKeyRegistry("s".repeat(64)))).toBe(false);
  });

  describe("loadBlobKeys", () => {
    beforeEach(() => {
      send.mockReset();
      resetSecretCache();
      delete process.env.MCP_OAUTH_BLOB_KEY;
      process.env.MCP_OAUTH_BLOB_KEY_SECRET_ARN = "arn:aws:secretsmanager:eu-west-2:1:secret:ci/submit/mcp/oauth-blob-key";
    });

    afterEach(() => {
      delete process.env.MCP_OAUTH_BLOB_KEY;
      delete process.env.MCP_OAUTH_BLOB_KEY_SECRET_ARN;
    });

    it("reads the raw secret as version v1", async () => {
      send.mockResolvedValue({ SecretString: RAW });
      expect(await loadBlobKeys()).toEqual({ current: "v1", versions: { v1: RAW } });
    });

    it("reads a registry secret", async () => {
      const registry = { current: "v2", versions: { v1: RAW, v2: "n".repeat(64) } };
      send.mockResolvedValue({ SecretString: JSON.stringify(registry) });
      expect(await loadBlobKeys()).toEqual(registry);
    });

    it("reads the environment value without Secrets Manager", async () => {
      process.env.MCP_OAUTH_BLOB_KEY = RAW;
      expect(await loadBlobKeys()).toEqual({ current: "v1", versions: { v1: RAW } });
      expect(send).not.toHaveBeenCalled();
    });
  });
});
