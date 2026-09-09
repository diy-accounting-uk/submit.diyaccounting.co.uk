// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Minimal client module (page-level, promise-deduped)
// - In-memory only (page-scoped)
// - Deduplicates in-flight GET requests
// - TTL-based freshness with optional ETag revalidation
// - Explicit invalidation by URL substring

(function () {
  "use strict";

  // L1 cache: key -> { ts, ttlMs, promise, data, etag, init }
  const L1 = new Map();

  function keyFrom(url, init) {
    const method = (init && init.method ? init.method : "GET").toUpperCase();
    if (method !== "GET") return null; // only cache GET
    // Key by method + url only. Headers like Authorization are assumed stable in a page session.
    return method + " " + url;
  }

  // Helper to detect if init has Authorization header
  function hasAuthHeader(init) {
    if (!init || !init.headers) return false;
    const headers = init.headers;
    if (headers instanceof Headers) {
      return headers.has("Authorization") || headers.has("authorization");
    }
    if (Array.isArray(headers)) {
      return headers.some(([k]) => k.toLowerCase() === "authorization");
    }
    if (typeof headers === "object") {
      return Object.keys(headers).some((k) => k.toLowerCase() === "authorization");
    }
    return false;
  }

  // Helper to choose the right fetch function
  function chooseFetch(init) {
    if (hasAuthHeader(init) && typeof window !== "undefined" && typeof window.fetchWithIdToken === "function") {
      return window.fetchWithIdToken;
    }
    return fetch;
  }

  async function fetchWithETag(url, init, prevEtag) {
    const headers = new Headers((init && init.headers) || {});
    if (prevEtag) headers.set("If-None-Match", prevEtag);
    const fetchFn = chooseFetch(init);
    const res = await fetchFn(url, { ...init, headers });
    if (res.status === 304) {
      return { status: 304, etag: prevEtag };
    }
    const etag = res.headers.get("ETag") || undefined;
    const data = await res.json();
    return { status: res.status, etag, data };
  }

  function invalidate(urlPrefixOrExact) {
    if (!urlPrefixOrExact) return;
    for (const k of Array.from(L1.keys())) {
      if (k.includes(urlPrefixOrExact)) L1.delete(k);
    }
  }

  async function getJSON(url, { ttlMs = 0, force = false, init = undefined } = {}) {
    const k = keyFrom(url, init || { method: "GET" });
    if (!k) {
      // Not a cacheable GET request
      const fetchFn = chooseFetch(init);
      const res = await fetchFn(url, init);
      return res.json();
    }

    const now = Date.now();
    const entry = L1.get(k);

    // Serve from in-flight promise if present and either TTL is 0 (dedupe only) or still fresh
    if (entry && entry.promise && !force && (entry.ttlMs === 0 || now - entry.ts < entry.ttlMs)) {
      return entry.promise;
    }

    // Serve fresh cached data directly when available
    if (entry && entry.data && !force && entry.ttlMs > 0 && now - entry.ts < entry.ttlMs) {
      return entry.data;
    }

    const request = (async () => {
      try {
        if (entry && entry.etag && entry.ttlMs > 0 && now - entry.ts >= entry.ttlMs) {
          // TTL expired; try ETag revalidation
          const r = await fetchWithETag(url, entry.init || init, entry.etag);
          if (r.status === 304) {
            if (L1.get(k) === record) {
              entry.ts = Date.now();
              entry.promise = null;
            }
            return entry.data;
          }
          const fresh = { ts: Date.now(), ttlMs, data: r.data, etag: r.etag, init, promise: null };
          if (L1.get(k) === record) {
            L1.set(k, fresh);
          }
          return r.data;
        } else {
          const fetchFn = chooseFetch(init);
          const res = await fetchFn(url, init);
          const etag = res.headers.get("ETag") || undefined;
          const data = await res.json();
          const fresh = { ts: Date.now(), ttlMs, data, etag, init, promise: null };
          if (L1.get(k) === record) {
            L1.set(k, fresh);
          }
          return data;
        }
      } catch (e) {
        // Do not cache failures
        if (L1.get(k) === record) {
          L1.delete(k);
        }
        throw e;
      }
    })();

    const record = entry || { ts: now, ttlMs, init };
    record.promise = request;
    record.ttlMs = ttlMs;
    record.ts = now;
    record.init = init;
    L1.set(k, record);
    return request;
  }

  // Expose globally for non-module pages
  window.requestCache = {
    getJSON,
    invalidate,
  };
})();
