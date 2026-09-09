// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { test, describe } from 'node:test';
import assert from 'node:assert';
import { generateKeypair, encrypt, decrypt, validateKeypair } from '../crypto.js';

describe('crypto', () => {
  test('generateKeypair creates valid PEM keys', () => {
    const { publicKey, privateKey } = generateKeypair(2048); // Smaller for faster tests

    assert.ok(publicKey.includes('-----BEGIN PUBLIC KEY-----'));
    assert.ok(publicKey.includes('-----END PUBLIC KEY-----'));
    assert.ok(privateKey.includes('-----BEGIN PRIVATE KEY-----'));
    assert.ok(privateKey.includes('-----END PRIVATE KEY-----'));
  });

  test('encrypt and decrypt round-trip', () => {
    const { publicKey, privateKey } = generateKeypair(2048);
    const plaintext = 'export const secret = "hello world";';

    const encrypted = encrypt(plaintext, publicKey);
    const decrypted = decrypt(encrypted, privateKey);

    assert.strictEqual(decrypted.toString('utf8'), plaintext);
  });

  test('encrypt produces different output each time (random IV)', () => {
    const { publicKey } = generateKeypair(2048);
    const plaintext = 'same input';

    const encrypted1 = encrypt(plaintext, publicKey);
    const encrypted2 = encrypt(plaintext, publicKey);

    assert.notDeepStrictEqual(encrypted1, encrypted2);
  });

  test('decrypt fails with wrong key', () => {
    const keypair1 = generateKeypair(2048);
    const keypair2 = generateKeypair(2048);

    const encrypted = encrypt('secret', keypair1.publicKey);

    assert.throws(() => {
      decrypt(encrypted, keypair2.privateKey);
    });
  });

  test('validateKeypair returns true for matching pair', () => {
    const { publicKey, privateKey } = generateKeypair(2048);
    assert.strictEqual(validateKeypair(publicKey, privateKey), true);
  });

  test('validateKeypair returns false for mismatched pair', () => {
    const keypair1 = generateKeypair(2048);
    const keypair2 = generateKeypair(2048);
    assert.strictEqual(validateKeypair(keypair1.publicKey, keypair2.privateKey), false);
  });

  test('handles large content (> RSA key size)', () => {
    const { publicKey, privateKey } = generateKeypair(2048);
    // Create content larger than RSA can encrypt directly (> 245 bytes for 2048-bit)
    const largeContent = 'x'.repeat(10000);

    const encrypted = encrypt(largeContent, publicKey);
    const decrypted = decrypt(encrypted, privateKey);

    assert.strictEqual(decrypted.toString('utf8'), largeContent);
  });

  test('handles binary content', () => {
    const { publicKey, privateKey } = generateKeypair(2048);
    const binaryContent = Buffer.from([0x00, 0x01, 0x02, 0xff, 0xfe, 0xfd]);

    const encrypted = encrypt(binaryContent, publicKey);
    const decrypted = decrypt(encrypted, privateKey);

    assert.deepStrictEqual(decrypted, binaryContent);
  });
});
