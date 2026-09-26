// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/unit-tests/correlation-utils.test.js

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import { prepareRedirect, nextRedirectRequestId } from "../public/lib/utils/correlation-utils.js";

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
