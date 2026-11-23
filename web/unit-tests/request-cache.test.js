// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

const SOURCE = fs.readFileSync(path.join(process.cwd(), "web/public/lib/request-cache.js"), "utf-8");

const answer = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  headers: new Headers(),
  json: async () => body,
});

function loadRequestCache(fetchImplementation) {
  const window = {};
  vi.stubGlobal("window", window);
  vi.stubGlobal("fetch", vi.fn(fetchImplementation));
  new Function(SOURCE)();
  return window.requestCache;
}

describe("the page's request cache", () => {
  beforeEach(() => vi.unstubAllGlobals());
  afterEach(() => vi.unstubAllGlobals());

  it("answers and caches a 2xx answer", async () => {
    const cache = loadRequestCache(async () => answer(200, { bundles: [] }));
    await expect(cache.getJSON("/api/v1/bundle", { ttlMs: 5000 })).resolves.toEqual({ bundles: [] });
    await cache.getJSON("/api/v1/bundle", { ttlMs: 5000 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects any other status with an error that carries the status and the JSON body", async () => {
    const cache = loadRequestCache(async () => answer(500, { message: "The bundles could not be read" }));
    const error = await cache.getJSON("/api/v1/bundle", { ttlMs: 5000 }).catch((caught) => caught);
    expect(error).toBeInstanceOf(Error);
    expect(error.status).toBe(500);
    expect(error.body).toEqual({ message: "The bundles could not be read" });
    expect(error.message).toBe("The bundles could not be read");
  });

  it("keeps no failed answer, so the next read asks again and can succeed", async () => {
    let calls = 0;
    const cache = loadRequestCache(async () => (++calls === 1 ? answer(503, {}) : answer(200, { bundles: ["x"] })));
    await expect(cache.getJSON("/api/v1/bundle", { ttlMs: 5000 })).rejects.toMatchObject({ status: 503 });
    await expect(cache.getJSON("/api/v1/bundle", { ttlMs: 5000 })).resolves.toEqual({ bundles: ["x"] });
  });

  it("rejects a failed answer with no JSON body by its status", async () => {
    const cache = loadRequestCache(async () => ({
      ok: false,
      status: 502,
      headers: new Headers(),
      json: async () => JSON.parse("<html>"),
    }));
    await expect(cache.getJSON("/api/v1/bundle")).rejects.toMatchObject({
      status: 502,
      body: null,
      message: "Request failed with status 502",
    });
  });

  it("rejects a failed answer to a request it does not cache", async () => {
    const cache = loadRequestCache(async () => answer(403, { message: "Forbidden" }));
    await expect(cache.getJSON("/api/v1/thing", { init: { method: "POST" } })).rejects.toMatchObject({ status: 403 });
  });

  it("answers the cached body when a read past its time is answered 304 for its ETag", async () => {
    const withEtag = (status, body) => ({
      ...answer(status, body),
      ok: status >= 200 && status < 300,
      headers: new Headers({ ETag: '"v1"' }),
    });
    let calls = 0;
    const cache = loadRequestCache(async (url, init) => {
      calls += 1;
      if (calls === 1) return withEtag(200, { bundles: ["x"] });
      expect(new Headers(init.headers).get("If-None-Match")).toBe('"v1"');
      return withEtag(304, null);
    });
    vi.useFakeTimers();
    try {
      await expect(cache.getJSON("/api/v1/bundle", { ttlMs: 1000 })).resolves.toEqual({ bundles: ["x"] });
      vi.advanceTimersByTime(1500);
      await expect(cache.getJSON("/api/v1/bundle", { ttlMs: 1000 })).resolves.toEqual({ bundles: ["x"] });
      expect(calls).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("answers a read made after an aborted one from its own request, as a page that aborts its earlier read needs", async () => {
    const cache = loadRequestCache(
      (url, init) =>
        new Promise((resolve, reject) => {
          const signal = init && init.signal;
          if (signal) signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })));
          setTimeout(() => resolve(answer(200, { bundles: ["x"] })), 10);
        }),
    );
    const first = new AbortController();
    const firstRead = cache.getJSON("/api/v1/bundle", { ttlMs: 5000, init: { signal: first.signal } });
    first.abort();
    const second = new AbortController();
    const secondRead = cache.getJSON("/api/v1/bundle", { ttlMs: 5000, init: { signal: second.signal } });

    await expect(firstRead).rejects.toMatchObject({ name: "AbortError" });
    await expect(secondRead).resolves.toEqual({ bundles: ["x"] });
    await expect(cache.getJSON("/api/v1/bundle", { ttlMs: 5000 })).resolves.toEqual({ bundles: ["x"] });
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
