// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * AGPL Battery Pack - Crypto Utilities
 *
 * Provides RSA + AES hybrid encryption for protecting source files.
 * The public key encrypts, only the private key holder can decrypt.
 *
 * Files are encrypted with AES-256-GCM (fast, for arbitrary size),
 * and the AES key is encrypted with RSA-OAEP (for key exchange).
 */

import { generateKeyPairSync, publicEncrypt, privateDecrypt, randomBytes, createCipheriv, createDecipheriv } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { mkdirSync } from 'fs';

const AES_ALGORITHM = 'aes-256-gcm';
const RSA_PADDING = { padding: 4 }; // RSA_PKCS1_OAEP_PADDING

/**
 * Generate a new RSA keypair for the project.
 * The private key should be stored as a GitHub/AWS secret.
 * The public key can be committed to the repo.
 *
 * @param {number} modulusLength - RSA key size (default 4096)
 * @returns {{ publicKey: string, privateKey: string }}
 */
export function generateKeypair(modulusLength = 4096) {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });
  return { publicKey, privateKey };
}

/**
 * Encrypt a file using hybrid RSA+AES encryption.
 *
 * Output format (binary):
 *   [2 bytes: encrypted AES key length]
 *   [N bytes: RSA-encrypted AES key]
 *   [12 bytes: AES-GCM IV]
 *   [16 bytes: AES-GCM auth tag]
 *   [remaining: AES-encrypted ciphertext]
 *
 * @param {Buffer|string} plaintext - Content to encrypt
 * @param {string} publicKeyPem - RSA public key in PEM format
 * @returns {Buffer} - Encrypted blob
 */
export function encrypt(plaintext, publicKeyPem) {
  const plaintextBuffer = Buffer.isBuffer(plaintext) ? plaintext : Buffer.from(plaintext, 'utf8');

  // Generate random AES key and IV
  const aesKey = randomBytes(32); // 256 bits
  const iv = randomBytes(12); // 96 bits for GCM

  // Encrypt the AES key with RSA
  const encryptedAesKey = publicEncrypt(
    { key: publicKeyPem, ...RSA_PADDING },
    aesKey
  );

  // Encrypt the plaintext with AES-GCM
  const cipher = createCipheriv(AES_ALGORITHM, aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintextBuffer), cipher.final()]);
  const authTag = cipher.getAuthTag();

  // Pack everything together
  const keyLengthBuffer = Buffer.alloc(2);
  keyLengthBuffer.writeUInt16BE(encryptedAesKey.length);

  return Buffer.concat([keyLengthBuffer, encryptedAesKey, iv, authTag, ciphertext]);
}

/**
 * Decrypt a file encrypted with encrypt().
 *
 * @param {Buffer} encryptedBlob - Output from encrypt()
 * @param {string} privateKeyPem - RSA private key in PEM format
 * @returns {Buffer} - Decrypted plaintext
 */
export function decrypt(encryptedBlob, privateKeyPem) {
  let offset = 0;

  // Read encrypted AES key length
  const keyLength = encryptedBlob.readUInt16BE(offset);
  offset += 2;

  // Read encrypted AES key
  const encryptedAesKey = encryptedBlob.subarray(offset, offset + keyLength);
  offset += keyLength;

  // Read IV (12 bytes)
  const iv = encryptedBlob.subarray(offset, offset + 12);
  offset += 12;

  // Read auth tag (16 bytes)
  const authTag = encryptedBlob.subarray(offset, offset + 16);
  offset += 16;

  // Read ciphertext (remaining bytes)
  const ciphertext = encryptedBlob.subarray(offset);

  // Decrypt the AES key with RSA
  const aesKey = privateDecrypt({ key: privateKeyPem, ...RSA_PADDING }, encryptedAesKey);

  // Decrypt the ciphertext with AES-GCM
  const decipher = createDecipheriv(AES_ALGORITHM, aesKey, iv);
  decipher.setAuthTag(authTag);
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);

  return plaintext;
}

/**
 * Encrypt a file and write to .enc file
 *
 * @param {string} inputPath - Path to plaintext file
 * @param {string} publicKeyPem - RSA public key
 * @param {string} outputPath - Optional output path (default: inputPath + '.enc')
 */
export function encryptFile(inputPath, publicKeyPem, outputPath = null) {
  const plaintext = readFileSync(inputPath);
  const encrypted = encrypt(plaintext, publicKeyPem);
  const outPath = outputPath || `${inputPath}.enc`;

  const outDir = dirname(outPath);
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }

  writeFileSync(outPath, encrypted);
  return outPath;
}

/**
 * Decrypt a .enc file
 *
 * @param {string} encryptedPath - Path to encrypted file
 * @param {string} privateKeyPem - RSA private key
 * @returns {Buffer} - Decrypted content
 */
export function decryptFile(encryptedPath, privateKeyPem) {
  const encrypted = readFileSync(encryptedPath);
  return decrypt(encrypted, privateKeyPem);
}

/**
 * Check if a private key can decrypt content encrypted with the corresponding public key.
 * Useful for validating keypair before deployment.
 *
 * @param {string} publicKeyPem
 * @param {string} privateKeyPem
 * @returns {boolean}
 */
export function validateKeypair(publicKeyPem, privateKeyPem) {
  try {
    const testMessage = 'battery-pack-validation-' + Date.now();
    const encrypted = encrypt(testMessage, publicKeyPem);
    const decrypted = decrypt(encrypted, privateKeyPem);
    return decrypted.toString('utf8') === testMessage;
  } catch {
    return false;
  }
}
