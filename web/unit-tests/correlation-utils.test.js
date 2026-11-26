// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/correlation-utils.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { prepareRedirect, nextRedirectRequestId, installCorrelationInterceptor } from "../public/lib/utils/correlation-utils.js";

function makeSessionStorage() {
  const store = new Map();
  return {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, value),
    removeItem: (key) => store.delete(key),
  };
}

describe("prepareRedirect", () => {
  let sessionStorage;

  beforeEach(() => {
    sessionStorage = makeSessionStorage();
    vi.stubGlobal("window", {
      sessionStorage,
      crypto: { randomUUID: () => "11111111-1111-1111-1111-111111111111" },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // A behaviour-test or probe session tags itself with sessionStorage's requestIdPrefix
  // ("test_"). The OAuth authorize page redirects away to HMRC and back; prepareRedirect is
  // what carries the request id across that redirect, so it must carry the prefix too, or the
  // request the callback page makes to exchange the code loses its test tag and reads as a
  // real customer's.
  it("carries the session's requestIdPrefix into the redirect-carried request id", () => {
    sessionStorage.setItem("requestIdPrefix", "test_");

    const id = prepareRedirect();

    expect(id.startsWith("test_")).toBe(true);
    expect(nextRedirectRequestId()).toBe(id);
  });

  it("carries no prefix when the session has none", () => {
    const id = prepareRedirect();

    expect(id.startsWith("test_")).toBe(false);
    expect(nextRedirectRequestId()).toBe(id);
  });
});

describe("the fetch wrapper's traceparent", () => {
  const TRACEPARENT = /^00-([0-9a-f]{32})-([0-9a-f]{16})-01$/;
  let originalFetch;

  beforeEach(() => {
    originalFetch = vi.fn().mockResolvedValue({ headers: { get: () => null } });
    vi.stubGlobal("window", {
      sessionStorage: makeSessionStorage(),
      location: { origin: "https://submit.example" },
      crypto: { getRandomValues: (bytes) => globalThis.crypto.getRandomValues(bytes), randomUUID: () => globalThis.crypto.randomUUID() },
      fetch: originalFetch,
      dispatchEvent: () => true,
    });
    installCorrelationInterceptor();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const sentTraceparent = (call) => originalFetch.mock.calls[call][1].headers.traceparent;

  it("sends a valid traceparent with the session's trace id and a new parent id on each request", async () => {
    await window.fetch("/api/v1/bundle");
    await window.fetch("/api/v1/hmrc/ct/return", { method: "POST", headers: { "Content-Type": "application/json" } });

    const [, firstTraceId, firstParentId] = sentTraceparent(0).match(TRACEPARENT);
    const [, secondTraceId, secondParentId] = sentTraceparent(1).match(TRACEPARENT);
    expect(secondTraceId).toBe(firstTraceId);
    expect(secondParentId).not.toBe(firstParentId);
    expect(window.sessionStorage.getItem("traceparent").split("-")[1]).toBe(firstTraceId);
  });

  it("sends no traceparent to another origin", async () => {
    await window.fetch("https://elsewhere.example/thing");

    expect(sentTraceparent(0)).toBeUndefined();
  });

  it("sends no traceparent to a protocol-relative URL or to a host that only begins with this origin", async () => {
    await window.fetch("//elsewhere.example/thing");
    await window.fetch("https://submit.example.elsewhere.example/thing");

    expect(sentTraceparent(0)).toBeUndefined();
    expect(sentTraceparent(1)).toBeUndefined();
  });

  it("sends a traceparent to a relative path and to this origin's absolute URL", async () => {
    await window.fetch("./api/v1/bundle");
    await window.fetch("https://submit.example/api/v1/bundle");

    expect(sentTraceparent(0)).toMatch(TRACEPARENT);
    expect(sentTraceparent(1)).toMatch(TRACEPARENT);
  });
});
