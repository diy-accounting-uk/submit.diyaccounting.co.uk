#!/usr/bin/env node
// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

/**
 * AGPL Battery Pack - CLI
 *
 * Commands:
 *   battery-pack keygen              - Generate a new keypair
 *   battery-pack encrypt <file>      - Encrypt a file
 *   battery-pack decrypt <file>      - Decrypt a file (for debugging)
 *   battery-pack verify              - Verify keypair matches
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve, basename, dirname, join } from 'path';
import { generateKeypair, encryptFile, decryptFile, validateKeypair } from './crypto.js';

const args = process.argv.slice(2);
const command = args[0];

function usage() {
  console.log(`
AGPL Battery Pack - Encryption tools for "batteries not included" open source

Usage:
  battery-pack keygen [--output <dir>]
    Generate a new RSA keypair.
    Writes battery-pack.pub (commit this) and battery-pack.key (keep secret!)

  battery-pack encrypt <file> [--key <pubkey>] [--output <file.enc>]
    Encrypt a file using the public key.
    Default key: ./battery-pack.pub
    Default output: <file>.enc

  battery-pack decrypt <file.enc> [--key <privkey>] [--output <file>]
    Decrypt a file using the private key.
    Default key: ./battery-pack.key or BATTERY_PACK_PRIVATE_KEY env
    Default output: stdout

  battery-pack verify [--pub <pubkey>] [--priv <privkey>]
    Verify that a keypair matches.

  battery-pack encrypt-batch <glob> [--key <pubkey>]
    Encrypt multiple files matching a glob pattern.

Environment:
  BATTERY_PACK_PRIVATE_KEY       Base64-encoded private key PEM
  BATTERY_PACK_PRIVATE_KEY_FILE  Path to private key file
  BATTERY_PACK_PUBLIC_KEY_FILE   Path to public key file (default: ./battery-pack.pub)

Examples:
  # Initial setup (run once, commit battery-pack.pub, secret battery-pack.key)
  battery-pack keygen

  # Encrypt a source file before committing
  battery-pack encrypt src/core/adapter.js

  # In CI/production, decrypt at runtime (see loader.js)
  BATTERY_PACK_PRIVATE_KEY_ARN=arn:aws:... node your-app.js
`);
}

async function main() {
  if (!command || command === '--help' || command === '-h') {
    usage();
    process.exit(0);
  }

  switch (command) {
    case 'keygen':
      await cmdKeygen();
      break;
    case 'encrypt':
      await cmdEncrypt();
      break;
    case 'decrypt':
      await cmdDecrypt();
      break;
    case 'verify':
      await cmdVerify();
      break;
    case 'encrypt-batch':
      await cmdEncryptBatch();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      usage();
      process.exit(1);
  }
}

async function cmdKeygen() {
  const outputDir = getArg('--output') || '.';

  console.log('Generating 4096-bit RSA keypair...');
  const { publicKey, privateKey } = generateKeypair(4096);

  const pubPath = join(outputDir, 'battery-pack.pub');
  const keyPath = join(outputDir, 'battery-pack.key');

  writeFileSync(pubPath, publicKey);
  writeFileSync(keyPath, privateKey, { mode: 0o600 }); // Restrict permissions

  console.log(`
✓ Keypair generated!

  Public key:  ${pubPath}  (commit this to your repo)
  Private key: ${keyPath}  (KEEP SECRET - add to GitHub secrets / AWS Secrets Manager)

Next steps:
  1. Add battery-pack.key to .gitignore
  2. Store the private key as a GitHub secret:
     gh secret set BATTERY_PACK_PRIVATE_KEY < battery-pack.key
  3. Or store in AWS Secrets Manager and set BATTERY_PACK_PRIVATE_KEY_ARN

To encrypt files:
  battery-pack encrypt src/core/adapter.js
`);
}

async function cmdEncrypt() {
  const inputFile = args[1];
  if (!inputFile) {
    console.error('Error: No input file specified');
    process.exit(1);
  }

  const pubKeyPath = getArg('--key') || process.env.BATTERY_PACK_PUBLIC_KEY_FILE || './battery-pack.pub';
  const outputPath = getArg('--output') || `${inputFile}.enc`;

  if (!existsSync(pubKeyPath)) {
    console.error(`Error: Public key not found: ${pubKeyPath}`);
    console.error('Run "battery-pack keygen" first, or specify --key <path>');
    process.exit(1);
  }

  if (!existsSync(inputFile)) {
    console.error(`Error: Input file not found: ${inputFile}`);
    process.exit(1);
  }

  const publicKey = readFileSync(pubKeyPath, 'utf8');
  const result = encryptFile(inputFile, publicKey, outputPath);

  console.log(`✓ Encrypted: ${inputFile} -> ${result}`);
  console.log(`
Next steps:
  1. Add ${inputFile} to .gitignore (or delete it)
  2. Commit ${result} to your repo
  3. Update your code to use loadProtectedModule('${result}')
`);
}

async function cmdDecrypt() {
  const inputFile = args[1];
  if (!inputFile) {
    console.error('Error: No input file specified');
    process.exit(1);
  }

  const privateKey = await getPrivateKey();
  const decrypted = decryptFile(inputFile, privateKey);

  const outputPath = getArg('--output');
  if (outputPath) {
    writeFileSync(outputPath, decrypted);
    console.log(`✓ Decrypted: ${inputFile} -> ${outputPath}`);
  } else {
    // Output to stdout
    process.stdout.write(decrypted);
  }
}

async function cmdVerify() {
  const pubKeyPath = getArg('--pub') || './battery-pack.pub';
  const privKeyPath = getArg('--priv') || './battery-pack.key';

  let publicKey, privateKey;

  if (existsSync(pubKeyPath)) {
    publicKey = readFileSync(pubKeyPath, 'utf8');
  } else {
    console.error(`Error: Public key not found: ${pubKeyPath}`);
    process.exit(1);
  }

  try {
    privateKey = await getPrivateKey(privKeyPath);
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }

  const isValid = validateKeypair(publicKey, privateKey);

  if (isValid) {
    console.log('✓ Keypair is valid - public and private keys match');
  } else {
    console.error('✗ Keypair is INVALID - keys do not match');
    process.exit(1);
  }
}

async function cmdEncryptBatch() {
  const pattern = args[1];
  if (!pattern) {
    console.error('Error: No glob pattern specified');
    process.exit(1);
  }

  const { glob } = await import('glob');
  const files = await glob(pattern);

  if (files.length === 0) {
    console.error(`No files matched: ${pattern}`);
    process.exit(1);
  }

  const pubKeyPath = getArg('--key') || './battery-pack.pub';
  const publicKey = readFileSync(pubKeyPath, 'utf8');

  console.log(`Encrypting ${files.length} files...`);
  for (const file of files) {
    const outPath = `${file}.enc`;
    encryptFile(file, publicKey, outPath);
    console.log(`  ✓ ${file} -> ${outPath}`);
  }

  console.log(`\nDone! Remember to .gitignore the original files.`);
}

// Helper: get private key from various sources
async function getPrivateKey(defaultPath = './battery-pack.key') {
  // Direct env var (base64-encoded)
  if (process.env.BATTERY_PACK_PRIVATE_KEY) {
    return Buffer.from(process.env.BATTERY_PACK_PRIVATE_KEY, 'base64').toString('utf8');
  }

  // File path from env
  if (process.env.BATTERY_PACK_PRIVATE_KEY_FILE) {
    return readFileSync(process.env.BATTERY_PACK_PRIVATE_KEY_FILE, 'utf8');
  }

  // Default file path
  if (existsSync(defaultPath)) {
    return readFileSync(defaultPath, 'utf8');
  }

  throw new Error(
    `Private key not found. Set BATTERY_PACK_PRIVATE_KEY, BATTERY_PACK_PRIVATE_KEY_FILE, or create ${defaultPath}`
  );
}

// Helper: get argument value
function getArg(name) {
  const idx = args.indexOf(name);
  if (idx !== -1 && args[idx + 1]) {
    return args[idx + 1];
  }
  return null;
}

main().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
