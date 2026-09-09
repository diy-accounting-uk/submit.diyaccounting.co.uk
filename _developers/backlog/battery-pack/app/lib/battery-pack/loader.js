// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * AGPL Battery Pack - Runtime Loader
 *
 * Loads encrypted modules at runtime by decrypting them with a private key
 * from environment variables, AWS Secrets Manager, or a local key file.
 *
 * Two loading styles:
 *
 *   // Synchronous (recommended for dev ergonomics - no async/await needed)
 *   import { loadProtectedModuleSync } from './lib/battery-pack/loader.js';
 *   const impl = loadProtectedModuleSync(new URL('./impl.js.enc', import.meta.url));
 *
 *   // Async (for AWS Secrets Manager in production)
 *   import { loadProtectedModule } from './lib/battery-pack/loader.js';
 *   const impl = await loadProtectedModule('./impl.js.enc');
 */

import { readFileSync, existsSync } from 'fs';
import { dirname, resolve, basename, join } from 'path';
import { fileURLToPath } from 'url';
import { decrypt } from './crypto.js';

// Cache for loaded modules (decrypt once per process)
const moduleCache = new Map();

// Cached private key (loaded once per process)
let cachedPrivateKey = null;

/**
 * Get the private key synchronously from local sources.
 * For development and CI where the key is available locally.
 *
 * Checks in order:
 *   1. BATTERY_PACK_PRIVATE_KEY env var (base64-encoded PEM)
 *   2. BATTERY_PACK_PRIVATE_KEY_FILE env var (path to PEM file)
 *   3. ./battery-pack.key (default location in project root)
 *
 * @returns {string} - Private key PEM
 * @throws {Error} - If no key found
 */
function getPrivateKeySync() {
  if (cachedPrivateKey) {
    return cachedPrivateKey;
  }

  // Option 1: Direct key from environment (base64-encoded to handle newlines)
  if (process.env.BATTERY_PACK_PRIVATE_KEY) {
    cachedPrivateKey = Buffer.from(process.env.BATTERY_PACK_PRIVATE_KEY, 'base64').toString('utf8');
    return cachedPrivateKey;
  }

  // Option 2: Key file path from env
  if (process.env.BATTERY_PACK_PRIVATE_KEY_FILE) {
    cachedPrivateKey = readFileSync(process.env.BATTERY_PACK_PRIVATE_KEY_FILE, 'utf8');
    return cachedPrivateKey;
  }

  // Option 3: Default file in project root (walk up from current file to find it)
  const searchPaths = [
    './battery-pack.key',
    '../battery-pack.key',
    '../../battery-pack.key',
    '../../../battery-pack.key',
  ];

  for (const searchPath of searchPaths) {
    if (existsSync(searchPath)) {
      cachedPrivateKey = readFileSync(searchPath, 'utf8');
      return cachedPrivateKey;
    }
  }

  // Also try relative to this file's location
  const thisDir = dirname(fileURLToPath(import.meta.url));
  const projectRoot = join(thisDir, '..', '..');
  const rootKeyPath = join(projectRoot, 'battery-pack.key');
  if (existsSync(rootKeyPath)) {
    cachedPrivateKey = readFileSync(rootKeyPath, 'utf8');
    return cachedPrivateKey;
  }

  throw new Error(
    'No private key found. For local development:\n\n' +
    '  1. Get battery-pack.key from your team (password manager, secure share, etc.)\n' +
    '  2. Place it in the project root directory\n\n' +
    'Or set one of these environment variables:\n' +
    '  - BATTERY_PACK_PRIVATE_KEY (base64-encoded PEM)\n' +
    '  - BATTERY_PACK_PRIVATE_KEY_FILE (path to PEM file)\n\n' +
    'See README for complete setup instructions.'
  );
}

/**
 * Load and execute an encrypted JavaScript module synchronously.
 *
 * This is the recommended approach for development because:
 * - Zero friction: works exactly like normal imports
 * - Fast: decryption takes ~1ms for typical modules
 * - Cached: only decrypts once per process
 *
 * @param {string|URL} encryptedPath - Path to .enc file (string or import.meta.url-based URL)
 * @param {object} options
 * @param {string} options.privateKey - Optional direct private key (skips env lookup)
 * @param {boolean} options.noCache - Don't cache the decrypted module
 * @returns {any} - The module's exports
 */
export function loadProtectedModuleSync(encryptedPath, options = {}) {
  const absolutePath = encryptedPath instanceof URL
    ? fileURLToPath(encryptedPath)
    : resolve(encryptedPath);

  // Check cache first
  if (!options.noCache && moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath);
  }

  // Get private key
  const privateKey = options.privateKey || getPrivateKeySync();

  // Read and decrypt
  const encryptedBlob = readFileSync(absolutePath);
  const decryptedCode = decrypt(encryptedBlob, privateKey).toString('utf8');

  // Execute the decrypted code as a module
  const moduleExports = executeAsModuleSync(decryptedCode, absolutePath);

  // Cache the result
  if (!options.noCache) {
    moduleCache.set(absolutePath, moduleExports);
  }

  return moduleExports;
}

/**
 * Execute decrypted JavaScript code as a module (synchronous version).
 *
 * @param {string} code - Decrypted JavaScript code
 * @param {string} modulePath - Path for error messages
 * @returns {any} - Module exports
 */
function executeAsModuleSync(code, modulePath) {
  // Check if code uses ESM exports
  const hasExport = /\bexport\s+(default|const|let|var|function|class|{)/.test(code);

  if (hasExport) {
    // Transform ESM exports to work with eval
    let transformed = code
      .replace(/export\s+default\s+/g, '__exports.default = ')
      .replace(/export\s+(const|let|var)\s+(\w+)\s*=/g, (_, kind, name) => `${kind} ${name} =`)
      .replace(/export\s+function\s+(\w+)/g, 'function $1')
      .replace(/export\s+class\s+(\w+)/g, 'class $1');

    const wrappedCode = `
      (function() {
        const __exports = {};
        ${transformed}
        ${extractExportAssignments(code)}
        return __exports;
      })()
    `;

    try {
      return eval(wrappedCode);
    } catch (error) {
      throw new Error(`Failed to execute protected module ${modulePath}: ${error.message}`);
    }
  } else {
    // Code uses module.exports or returns directly
    const wrappedCode = `
      (function() {
        const module = { exports: {} };
        const exports = module.exports;
        ${code}
        return module.exports;
      })()
    `;

    try {
      return eval(wrappedCode);
    } catch (error) {
      throw new Error(`Failed to execute protected module ${modulePath}: ${error.message}`);
    }
  }
}

/**
 * Get the private key from environment or AWS Secrets Manager (async version).
 * Falls back to sync sources first, then tries AWS Secrets Manager.
 *
 * @returns {Promise<string>} - Private key PEM
 */
async function getPrivateKey() {
  // Try sync sources first (faster, no network)
  try {
    return getPrivateKeySync();
  } catch {
    // Fall through to AWS Secrets Manager
  }

  // Option: AWS Secrets Manager (async)
  if (process.env.BATTERY_PACK_PRIVATE_KEY_ARN) {
    const { SecretsManagerClient, GetSecretValueCommand } = await import('@aws-sdk/client-secrets-manager');
    const client = new SecretsManagerClient({});
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: process.env.BATTERY_PACK_PRIVATE_KEY_ARN })
    );
    cachedPrivateKey = response.SecretString;
    return cachedPrivateKey;
  }

  throw new Error(
    'No private key configured. Set one of:\n' +
      '  - BATTERY_PACK_PRIVATE_KEY (base64-encoded PEM)\n' +
      '  - BATTERY_PACK_PRIVATE_KEY_FILE (path to PEM file)\n' +
      '  - BATTERY_PACK_PRIVATE_KEY_ARN (AWS Secrets Manager ARN)\n' +
      '  - Place battery-pack.key in the project root\n\n' +
      'See README for setup instructions.'
  );
}

/**
 * Load and execute an encrypted JavaScript module.
 *
 * The encrypted file should contain valid JavaScript that will be
 * executed in a module context. The module should export its API.
 *
 * @param {string} encryptedPath - Path to .enc file (relative to caller or absolute)
 * @param {object} options
 * @param {string} options.privateKey - Optional direct private key (skips env lookup)
 * @param {boolean} options.noCache - Don't cache the decrypted module
 * @returns {Promise<any>} - The module's exports
 */
export async function loadProtectedModule(encryptedPath, options = {}) {
  const absolutePath = resolve(encryptedPath);

  // Check cache first
  if (!options.noCache && moduleCache.has(absolutePath)) {
    return moduleCache.get(absolutePath);
  }

  // Get private key
  const privateKey = options.privateKey || (await getPrivateKey());

  // Read and decrypt
  const encryptedBlob = readFileSync(absolutePath);
  const decryptedCode = decrypt(encryptedBlob, privateKey).toString('utf8');

  // Execute the decrypted code as a module
  // We wrap it in an async IIFE that returns exports
  const moduleExports = await executeAsModule(decryptedCode, absolutePath);

  // Cache the result
  if (!options.noCache) {
    moduleCache.set(absolutePath, moduleExports);
  }

  return moduleExports;
}

/**
 * Execute decrypted JavaScript code as a module.
 *
 * The code can use `export` syntax - we transform it to work with dynamic execution.
 *
 * @param {string} code - Decrypted JavaScript code
 * @param {string} modulePath - Path for error messages
 * @returns {Promise<any>} - Module exports
 */
async function executeAsModule(code, modulePath) {
  // For ESM-style code with exports, we need to transform it
  // This is a simple approach - for production you might want a proper transform

  // Check if code uses ESM exports
  const hasExport = /\bexport\s+(default|const|let|var|function|class|{)/.test(code);

  if (hasExport) {
    // Transform ESM exports to CommonJS-style for eval
    // This is simplified - handles common patterns
    let transformed = code
      // export default X -> module.exports.default = X
      .replace(/export\s+default\s+/g, '__exports.default = ')
      // export const/let/var name = -> const/let/var name = ; __exports.name = name
      .replace(/export\s+(const|let|var)\s+(\w+)\s*=/g, (_, kind, name) => {
        return `${kind} ${name} =`;
      })
      // export function name() -> function name() ; __exports.name = name
      .replace(/export\s+function\s+(\w+)/g, 'function $1')
      // export class name -> class name ; __exports.name = name
      .replace(/export\s+class\s+(\w+)/g, 'class $1');

    // Wrap in function that collects exports
    const wrappedCode = `
      (async () => {
        const __exports = {};
        ${transformed}
        // Collect named exports by scanning for declarations
        ${extractExportAssignments(code)}
        return __exports;
      })()
    `;

    try {
      return await eval(wrappedCode);
    } catch (error) {
      throw new Error(`Failed to execute protected module ${modulePath}: ${error.message}`);
    }
  } else {
    // Code uses module.exports or returns directly
    const wrappedCode = `
      (async () => {
        const module = { exports: {} };
        const exports = module.exports;
        ${code}
        return module.exports;
      })()
    `;

    try {
      return await eval(wrappedCode);
    } catch (error) {
      throw new Error(`Failed to execute protected module ${modulePath}: ${error.message}`);
    }
  }
}

/**
 * Extract export assignments from original code to add to transformed code.
 * E.g., "export const foo = 1" -> "__exports.foo = foo;"
 */
function extractExportAssignments(code) {
  const assignments = [];

  // Match export const/let/var name
  const varMatches = code.matchAll(/export\s+(?:const|let|var)\s+(\w+)/g);
  for (const match of varMatches) {
    assignments.push(`__exports.${match[1]} = ${match[1]};`);
  }

  // Match export function name
  const funcMatches = code.matchAll(/export\s+function\s+(\w+)/g);
  for (const match of funcMatches) {
    assignments.push(`__exports.${match[1]} = ${match[1]};`);
  }

  // Match export class name
  const classMatches = code.matchAll(/export\s+class\s+(\w+)/g);
  for (const match of classMatches) {
    assignments.push(`__exports.${match[1]} = ${match[1]};`);
  }

  return assignments.join('\n');
}

/**
 * Clear the module cache.
 * Useful for testing or when you need to reload modules.
 */
export function clearModuleCache() {
  moduleCache.clear();
}

/**
 * Clear the cached private key.
 * Useful for testing different key scenarios.
 */
export function clearKeyCache() {
  cachedPrivateKey = null;
}

/**
 * Check if a private key is available (without loading a module).
 * Useful for startup checks or conditional behavior.
 *
 * @returns {boolean}
 */
export function hasPrivateKey() {
  try {
    getPrivateKeySync();
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if a protected module can be loaded.
 * Returns false with a descriptive error if not.
 *
 * @param {string} encryptedPath - Path to .enc file
 * @returns {Promise<{ ok: boolean, error?: string }>}
 */
export async function checkProtectedModule(encryptedPath) {
  try {
    await loadProtectedModule(encryptedPath, { noCache: true });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}
