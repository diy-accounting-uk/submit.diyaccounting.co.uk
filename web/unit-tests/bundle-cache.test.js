// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect, beforeEach, vi } from "vitest";
import fs from "node:fs";
import path from "node:path";

// Load the script content and eval it in this context to populate window.bundleCache
const bundleCachePath = path.join(process.cwd(), "web/public/lib/bundle-cache.js");
const scriptContent = fs.readFileSync(bundleCachePath, "utf-8");

describe("bundle-cache.js", () => {
  let mockDb;
  let mockTx;
  let mockStore;

  beforeEach(() => {
    // Setup global window and indexedDB mock
    mockStore = {
      get: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    };

    mockTx = {
      objectStore: vi.fn(() => mockStore),
      oncomplete: null,
      onerror: null,
    };

    mockDb = {
      transaction: vi.fn(() => mockTx),
      objectStoreNames: {
        contains: vi.fn(() => true),
      },
    };

    global.indexedDB = {
      open: vi.fn().mockImplementation(() => {
        const req = {
          onupgradeneeded: null,
          onsuccess: null,
          onerror: null,
        };
        // Use a microtask to trigger success
        Promise.resolve().then(() => {
          if (req.onsuccess) req.onsuccess({ target: { result: mockDb } });
        });
        return req;
      }),
    };

    global.window = {
      indexedDB: global.indexedDB,
    };

    // Evaluate the script
    eval(scriptContent);
  });

  it("getBundles returns null and DOES NOT call delete when record is expired (fixing ReadOnlyError)", async () => {
    const userId = "test-user";
    const expiredRecord = {
      key: `bundles:${userId}`,
      value: ["bundle1"],
      expires: Date.now() - 1000, // expired 1s ago
    };

    mockStore.get.mockImplementation(() => {
      const req = { onsuccess: null, onerror: null };
      Promise.resolve().then(() => {
        if (req.onsuccess) req.onsuccess({ target: { result: expiredRecord } });
      });
      return req;
    });

    mockDb.transaction.mockImplementation(() => {
      // Trigger oncomplete after a short delay
      Promise.resolve().then(() => {
        if (mockTx.oncomplete) mockTx.oncomplete();
      });
      return mockTx;
    });

    const result = await window.bundleCache.getBundles(userId);

    expect(result).toBeNull();
    // CRITICAL: Ensure store.delete was NOT called, which would cause ReadOnlyError in a readonly transaction
    expect(mockStore.delete).not.toHaveBeenCalled();
    expect(mockDb.transaction).toHaveBeenCalledWith("bundles", "readonly");
  });

  it("getBundles returns value when record is NOT expired", async () => {
    const userId = "test-user";
    const validRecord = {
      key: `bundles:${userId}`,
      value: ["bundle1"],
      expires: Date.now() + 10000, // valid for 10s
    };

    mockStore.get.mockImplementation(() => {
      const req = { onsuccess: null, onerror: null };
      Promise.resolve().then(() => {
        if (req.onsuccess) req.onsuccess({ target: { result: validRecord } });
      });
      return req;
    });

    mockDb.transaction.mockImplementation(() => {
      Promise.resolve().then(() => {
        if (mockTx.oncomplete) mockTx.oncomplete();
      });
      return mockTx;
    });

    const result = await window.bundleCache.getBundles(userId);
    expect(result).toEqual(["bundle1"]);
    expect(mockStore.delete).not.toHaveBeenCalled();
  });

  it("setBundles uses readwrite transaction", async () => {
    const userId = "test-user";
    const value = ["bundle1"];
    const ttlMs = 5000;

    mockDb.transaction.mockImplementation(() => {
      Promise.resolve().then(() => {
        if (mockTx.oncomplete) mockTx.oncomplete();
      });
      return mockTx;
    });

    await window.bundleCache.setBundles(userId, value, ttlMs);

    expect(mockDb.transaction).toHaveBeenCalledWith("bundles", "readwrite");
    expect(mockStore.put).toHaveBeenCalledWith(
      expect.objectContaining({
        key: `bundles:${userId}`,
        value: ["bundle1"],
      }),
    );
  });
});
