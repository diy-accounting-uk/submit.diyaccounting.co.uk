// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert';
import { writeFileSync, unlinkSync, mkdirSync, rmSync } from 'fs';
import { join } from 'path';
import { generateKeypair, encrypt } from '../crypto.js';
import {
  loadProtectedModuleSync,
  loadProtectedModule,
  clearModuleCache,
  clearKeyCache,
  hasPrivateKey,
} from '../loader.js';

const TEST_DIR = './test-temp';

describe('loader', () => {
  let publicKey, privateKey;

  beforeEach(() => {
    // Generate fresh keypair for each test
    const keypair = generateKeypair(2048);
    publicKey = keypair.publicKey;
    privateKey = keypair.privateKey;

    // Create temp directory
    mkdirSync(TEST_DIR, { recursive: true });

    // Clear caches
    clearModuleCache();
    clearKeyCache();

    // Remove any env vars that might interfere
    delete process.env.BATTERY_PACK_PRIVATE_KEY;
    delete process.env.BATTERY_PACK_PRIVATE_KEY_FILE;
    delete process.env.BATTERY_PACK_PRIVATE_KEY_ARN;
  });

  afterEach(() => {
    // Clean up
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {}
    try {
      unlinkSync('./battery-pack.key');
    } catch {}

    // Clear env
    delete process.env.BATTERY_PACK_PRIVATE_KEY;
    delete process.env.BATTERY_PACK_PRIVATE_KEY_FILE;
  });

  test('loadProtectedModuleSync loads ESM module with named exports', () => {
    // Create encrypted module
    const moduleCode = `
      export const greeting = 'hello';
      export function greet(name) { return greeting + ' ' + name; }
    `;
    const encrypted = encrypt(moduleCode, publicKey);
    const encPath = join(TEST_DIR, 'esm-module.js.enc');
    writeFileSync(encPath, encrypted);

    // Set up key via env
    process.env.BATTERY_PACK_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');

    // Load and use
    const mod = loadProtectedModuleSync(encPath);
    assert.strictEqual(mod.greeting, 'hello');
    assert.strictEqual(mod.greet('world'), 'hello world');
  });

  test('loadProtectedModuleSync loads CommonJS module', () => {
    const moduleCode = `
      module.exports = {
        add: (a, b) => a + b,
        multiply: (a, b) => a * b,
      };
    `;
    const encrypted = encrypt(moduleCode, publicKey);
    const encPath = join(TEST_DIR, 'cjs-module.js.enc');
    writeFileSync(encPath, encrypted);

    process.env.BATTERY_PACK_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');

    const mod = loadProtectedModuleSync(encPath);
    assert.strictEqual(mod.add(2, 3), 5);
    assert.strictEqual(mod.multiply(2, 3), 6);
  });

  test('loadProtectedModuleSync loads export default', () => {
    const moduleCode = `
      export default { version: '1.0.0' };
    `;
    const encrypted = encrypt(moduleCode, publicKey);
    const encPath = join(TEST_DIR, 'default-module.js.enc');
    writeFileSync(encPath, encrypted);

    process.env.BATTERY_PACK_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');

    const mod = loadProtectedModuleSync(encPath);
    assert.deepStrictEqual(mod.default, { version: '1.0.0' });
  });

  test('loadProtectedModuleSync caches modules', () => {
    const moduleCode = `export const timestamp = Date.now();`;
    const encrypted = encrypt(moduleCode, publicKey);
    const encPath = join(TEST_DIR, 'cached-module.js.enc');
    writeFileSync(encPath, encrypted);

    process.env.BATTERY_PACK_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');

    const mod1 = loadProtectedModuleSync(encPath);
    const mod2 = loadProtectedModuleSync(encPath);

    // Should return cached version (same timestamp)
    assert.strictEqual(mod1.timestamp, mod2.timestamp);
    assert.strictEqual(mod1, mod2); // Same object reference
  });

  test('loadProtectedModuleSync noCache option bypasses cache', () => {
    let counter = 0;
    const moduleCode = `export const value = ${++counter};`;
    const encrypted = encrypt(moduleCode, publicKey);
    const encPath = join(TEST_DIR, 'nocache-module.js.enc');
    writeFileSync(encPath, encrypted);

    process.env.BATTERY_PACK_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');

    const mod1 = loadProtectedModuleSync(encPath);

    // Update the encrypted file
    const moduleCode2 = `export const value = 999;`;
    const encrypted2 = encrypt(moduleCode2, publicKey);
    writeFileSync(encPath, encrypted2);

    // With cache, still gets old value
    const mod2 = loadProtectedModuleSync(encPath);
    assert.strictEqual(mod2.value, mod1.value);

    // With noCache, gets new value
    const mod3 = loadProtectedModuleSync(encPath, { noCache: true });
    assert.strictEqual(mod3.value, 999);
  });

  test('loadProtectedModuleSync finds key from file', () => {
    const moduleCode = `export const source = 'file';`;
    const encrypted = encrypt(moduleCode, publicKey);
    const encPath = join(TEST_DIR, 'file-key-module.js.enc');
    writeFileSync(encPath, encrypted);

    // Write key to default location
    writeFileSync('./battery-pack.key', privateKey);

    const mod = loadProtectedModuleSync(encPath);
    assert.strictEqual(mod.source, 'file');
  });

  test('hasPrivateKey returns true when key available', () => {
    writeFileSync('./battery-pack.key', privateKey);
    assert.strictEqual(hasPrivateKey(), true);
  });

  test('hasPrivateKey returns false when no key', () => {
    // No key set anywhere
    assert.strictEqual(hasPrivateKey(), false);
  });

  test('loadProtectedModuleSync throws helpful error without key', () => {
    const moduleCode = `export const x = 1;`;
    const encrypted = encrypt(moduleCode, publicKey);
    const encPath = join(TEST_DIR, 'no-key-module.js.enc');
    writeFileSync(encPath, encrypted);

    assert.throws(
      () => loadProtectedModuleSync(encPath),
      /No private key found/
    );
  });

  test('loadProtectedModule async works same as sync', async () => {
    const moduleCode = `export const async = true;`;
    const encrypted = encrypt(moduleCode, publicKey);
    const encPath = join(TEST_DIR, 'async-module.js.enc');
    writeFileSync(encPath, encrypted);

    process.env.BATTERY_PACK_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');

    const mod = await loadProtectedModule(encPath);
    assert.strictEqual(mod.async, true);
  });

  test('loadProtectedModuleSync accepts URL from import.meta.url pattern', () => {
    const moduleCode = `export const url = true;`;
    const encrypted = encrypt(moduleCode, publicKey);
    const encPath = join(TEST_DIR, 'url-module.js.enc');
    writeFileSync(encPath, encrypted);

    process.env.BATTERY_PACK_PRIVATE_KEY = Buffer.from(privateKey).toString('base64');

    // Simulate the import.meta.url pattern
    const url = new URL(encPath, `file://${process.cwd()}/`);
    const mod = loadProtectedModuleSync(url);
    assert.strictEqual(mod.url, true);
  });
});
