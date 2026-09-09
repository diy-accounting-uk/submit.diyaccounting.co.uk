// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// bundle-cache.js
(function () {
  "use strict";

  const DB_NAME = "diy-submit-cache";
  const STORE_NAME = "bundles";
  const DB_VERSION = 1;

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function (event) {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      req.onerror = (e) => reject(e.target.error);
      req.onsuccess = (e) => resolve(e.target.result);
    });
  }

  async function withStore(type, callback) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, type);
      const store = tx.objectStore(STORE_NAME);
      const result = callback(store);
      tx.oncomplete = () => resolve(result);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  function buildKey(userId) {
    return `bundles:${userId}`;
  }

  /**
   * Handle the result of a store.get request
   * @param {IDBRequest} request - The IndexedDB request
   * @returns {Promise<any|null>} The cached value or null
   */
  function handleGetRequest(request) {
    return new Promise((resolve) => {
      request.onsuccess = (event) => {
        const record = event.target.result;
        if (!record) {
          resolve(null);
          return;
        }
        // expire stale records
        if (record.expires && record.expires <= Date.now()) {
          resolve(null);
          return;
        }
        resolve(record.value);
      };
      request.onerror = () => resolve(null);
    });
  }

  async function getBundles(userId) {
    const key = buildKey(userId);
    return withStore("readonly", (store) => handleGetRequest(store.get(key)));
  }

  async function setBundles(userId, value, ttlMs) {
    const key = buildKey(userId);
    const expires = Date.now() + (ttlMs || 0);
    return withStore("readwrite", (store) => {
      store.put({ key, value, expires });
    });
  }

  async function clearBundles(userId) {
    const key = buildKey(userId);
    return withStore("readwrite", (store) => {
      store.delete(key);
    });
  }

  window.bundleCache = { getBundles, setBundles, clearBundles };
})();
