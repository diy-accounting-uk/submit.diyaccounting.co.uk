// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeEach, vi } from "vitest";

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

const { readSecret, refreshAfterAuthFailure, withSecretRetry, resetSecretCache, SECRET_TTL_MS, FORCE_REFRESH_MIN_MS } =
  await import("@app/lib/cachedSecret.js");

describe("cachedSecret", () => {
  beforeEach(() => {
    send.mockReset();
    resetSecretCache();
  });

  it("reads once inside the five minute window", async () => {
    send.mockResolvedValue({ SecretString: "one" });
    const t0 = 1_000_000;
    expect(await readSecret("s", { now: t0 })).toBe("one");
    expect(await readSecret("s", { now: t0 + SECRET_TTL_MS - 1 })).toBe("one");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("reads again after five minutes and returns the rolled value", async () => {
    send.mockResolvedValueOnce({ SecretString: "one" }).mockResolvedValueOnce({ SecretString: "two" });
    const t0 = 1_000_000;
    await readSecret("s", { now: t0 });
    expect(await readSecret("s", { now: t0 + SECRET_TTL_MS })).toBe("two");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("shares one request between concurrent reads", async () => {
    send.mockResolvedValue({ SecretString: "one" });
    await Promise.all([readSecret("s"), readSecret("s")]);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps each secret apart", async () => {
    send.mockImplementation(async ({ input }) => ({ SecretString: `v-${input.SecretId}` }));
    expect(await readSecret("a")).toBe("v-a");
    expect(await readSecret("b")).toBe("v-b");
  });

  it("does not cache a failed read", async () => {
    send.mockRejectedValueOnce(new Error("denied")).mockResolvedValueOnce({ SecretString: "one" });
    await expect(readSecret("s")).rejects.toThrow("denied");
    expect(await readSecret("s")).toBe("one");
  });

  it("refuses a secret with no string value", async () => {
    send.mockResolvedValue({});
    await expect(readSecret("s")).rejects.toThrow(/no SecretString/);
  });

  it("returns the new value after a forced refresh when the secret changed", async () => {
    send.mockResolvedValueOnce({ SecretString: "one" }).mockResolvedValueOnce({ SecretString: "two" });
    const used = await readSecret("s", { now: 1_000_000 });
    expect(await refreshAfterAuthFailure("s", used, { now: 1_000_000 + FORCE_REFRESH_MIN_MS })).toBe("two");
    expect(await readSecret("s", { now: 1_000_000 + FORCE_REFRESH_MIN_MS })).toBe("two");
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("returns null after a forced refresh when the secret is unchanged", async () => {
    send.mockResolvedValue({ SecretString: "one" });
    const used = await readSecret("s", { now: 1_000_000 });
    expect(await refreshAfterAuthFailure("s", used, { now: 1_000_000 + FORCE_REFRESH_MIN_MS })).toBeNull();
  });

  it("does not read again for a forced refresh inside ten seconds of the last read", async () => {
    send.mockResolvedValueOnce({ SecretString: "one" }).mockResolvedValueOnce({ SecretString: "two" });
    const used = await readSecret("s", { now: 1_000_000 });
    expect(await refreshAfterAuthFailure("s", used, { now: 1_000_000 + FORCE_REFRESH_MIN_MS - 1 })).toBeNull();
    expect(send).toHaveBeenCalledTimes(1);
  });

  describe("withSecretRetry", () => {
    const isUnauthorized = (error) => error.status === 401;
    const unauthorized = () => Object.assign(new Error("unauthorized"), { status: 401 });

    it("returns the first result without a second read when the call succeeds", async () => {
      send.mockResolvedValue({ SecretString: "one" });
      const attempt = vi.fn(async (value) => `ok-${value}`);
      expect(await withSecretRetry("s", attempt, isUnauthorized)).toBe("ok-one");
      expect(attempt).toHaveBeenCalledTimes(1);
      expect(send).toHaveBeenCalledTimes(1);
    });

    it("retries once with the rolled value after an authentication failure", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(1_000_000);
        send.mockResolvedValueOnce({ SecretString: "one" }).mockResolvedValueOnce({ SecretString: "two" });
        const attempt = vi.fn(async (value) => {
          if (value === "one") {
            vi.setSystemTime(Date.now() + FORCE_REFRESH_MIN_MS);
            throw unauthorized();
          }
          return `ok-${value}`;
        });
        expect(await withSecretRetry("s", attempt, isUnauthorized)).toBe("ok-two");
        expect(attempt.mock.calls.map(([value]) => value)).toEqual(["one", "two"]);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not retry when the secret still holds the used value", async () => {
      send.mockResolvedValue({ SecretString: "one" });
      const attempt = vi.fn(async () => {
        throw unauthorized();
      });
      await expect(withSecretRetry("s", attempt, isUnauthorized)).rejects.toThrow("unauthorized");
      expect(attempt).toHaveBeenCalledTimes(1);
    });

    it("throws the second failure and never tries a third time", async () => {
      vi.useFakeTimers();
      try {
        vi.setSystemTime(1_000_000);
        send.mockResolvedValueOnce({ SecretString: "one" }).mockResolvedValueOnce({ SecretString: "two" });
        const attempt = vi.fn(async () => {
          vi.setSystemTime(Date.now() + FORCE_REFRESH_MIN_MS);
          throw unauthorized();
        });
        await expect(withSecretRetry("s", attempt, isUnauthorized)).rejects.toThrow("unauthorized");
        expect(attempt).toHaveBeenCalledTimes(2);
        expect(send).toHaveBeenCalledTimes(2);
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not retry an error that is not an authentication failure", async () => {
      send.mockResolvedValue({ SecretString: "one" });
      const attempt = vi.fn(async () => {
        throw Object.assign(new Error("server"), { status: 500 });
      });
      await expect(withSecretRetry("s", attempt, isUnauthorized)).rejects.toThrow("server");
      expect(attempt).toHaveBeenCalledTimes(1);
    });
  });
});
