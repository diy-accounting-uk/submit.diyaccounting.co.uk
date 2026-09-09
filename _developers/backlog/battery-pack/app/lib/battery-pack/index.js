// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * AGPL Battery Pack
 *
 * Encryption utilities for "batteries not included" open source projects.
 *
 * This package allows you to:
 *   1. Keep your source code AGPL-licensed and publicly visible
 *   2. Encrypt key components so they require a private key to run
 *   3. Maintain GitHub's "open source" classification for Actions minutes
 *   4. Deter clones without the resources to re-implement protected modules
 *
 * Usage (zero-friction development):
 *
 *   // In your wrapper module (e.g., app/services/hmrcApi.js)
 *   import { loadProtectedModuleSync } from './lib/battery-pack/index.js';
 *   const impl = loadProtectedModuleSync(new URL('./hmrcApi.impl.js.enc', import.meta.url));
 *   export const { submitVatReturn, getVatObligations } = impl;
 *
 *   // Your tests and other code import normally - no changes needed
 *   import { submitVatReturn } from '../services/hmrcApi.js';
 */

export { generateKeypair, encrypt, decrypt, encryptFile, decryptFile, validateKeypair } from './crypto.js';

export {
  loadProtectedModule,
  loadProtectedModuleSync,
  checkProtectedModule,
  clearModuleCache,
  clearKeyCache,
  hasPrivateKey,
} from './loader.js';
