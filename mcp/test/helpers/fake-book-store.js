// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { vi } from "vitest";

// The storage routes' behaviour the tools rely on: versioned PUTs guarded by if-match, the list
// with each book's kept versions, and the read of one version.
export function fakeBookStore({ versionsKept = 30 } = {}) {
  const books = new Map();
  const calls = [];
  const fetch = vi.fn(async (url, init = {}) => {
    const { pathname } = new URL(url);
    const method = init.method ?? "GET";
    calls.push({ method, pathname, headers: init.headers, body: init.body ? JSON.parse(init.body) : undefined });
    const answer = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (method === "GET" && pathname === "/api/v1/books") {
      return answer(200, { books: [...books.values()].map((book) => book.metadata) });
    }
    const versionMatch = /^\/api\/v1\/books\/([^/]+)\/versions\/([^/]+)$/.exec(pathname);
    if (method === "GET" && versionMatch) {
      const book = books.get(versionMatch[1]);
      const version = versionMatch[2] === "latest" ? book.metadata.latestVersion : Number(versionMatch[2]);
      return answer(200, { zipBase64: book.zips.get(version), metadata: book.metadata });
    }
    const putMatch = /^\/api\/v1\/books\/([^/]+)$/.exec(pathname);
    if (method === "PUT" && putMatch) {
      const bookId = putMatch[1];
      const body = JSON.parse(init.body);
      const ifMatch = init.headers["if-match"];
      const existing = books.get(bookId);
      if (existing ? ifMatch !== existing.metadata.latestETag : ifMatch) {
        return answer(412, { message: "etag-mismatch", error: { code: "etag-mismatch" } });
      }
      const version = existing ? existing.metadata.latestVersion + 1 : 1;
      const etag = `etag-${bookId.slice(0, 4)}-${version}`;
      const versions = [
        ...(existing?.metadata.versions ?? []),
        { version, etag, createdAt: `t${version}`, ...(body.change ? { change: body.change } : {}) },
      ];
      while (versions.length > versionsKept) versions.shift();
      const zips = existing?.zips ?? new Map();
      zips.set(version, body.zipBase64);
      const metadata = {
        bookId,
        title: body.title,
        product: body.product,
        periodCoveredStart: body.periodCoveredStart,
        periodCoveredEnd: body.periodCoveredEnd,
        latestVersion: version,
        latestETag: etag,
        versions,
      };
      books.set(bookId, { metadata, zips });
      return answer(200, { metadata });
    }
    throw new Error(`Unexpected ${method} ${pathname}`);
  });
  return { books, calls, fetch };
}
