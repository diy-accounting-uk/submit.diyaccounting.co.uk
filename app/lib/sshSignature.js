// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/sshSignature.js
//
// Verifies an SSHSIG signature (the format `ssh-keygen -Y sign` writes, PROTOCOL.sshsig in the
// OpenSSH source) made by an ssh-ed25519 key, with Node's crypto only. The caller passes the
// base64 body of the armoured signature, without the BEGIN and END lines and without line breaks.

import { createHash, createPublicKey, verify } from "node:crypto";

const MAGIC = Buffer.from("SSHSIG");
const ED25519 = "ssh-ed25519";

function reader(buffer) {
  let offset = 0;
  return {
    bytes(length) {
      if (offset + length > buffer.length) throw new Error("truncated");
      const out = buffer.subarray(offset, offset + length);
      offset += length;
      return out;
    },
    string() {
      return this.bytes(this.bytes(4).readUInt32BE(0));
    },
    uint32() {
      return this.bytes(4).readUInt32BE(0);
    },
    done() {
      return offset === buffer.length;
    },
  };
}

function sshString(value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
}

// The raw 32-byte key of an ssh-ed25519 public key blob (string "ssh-ed25519", string key).
function ed25519KeyFromBlob(blob) {
  const r = reader(blob);
  if (r.string().toString() !== ED25519) throw new Error("not an ssh-ed25519 key");
  const key = r.string();
  if (key.length !== 32 || !r.done()) throw new Error("bad ssh-ed25519 key");
  return key;
}

/**
 * The raw 32-byte key of an OpenSSH public key line ("ssh-ed25519 AAAA... comment"), or null when
 * the line is not an ssh-ed25519 key.
 *
 * @param {string} line
 * @returns {Buffer|null}
 */
export function parseSshEd25519PublicKey(line) {
  if (typeof line !== "string") return null;
  const [type, base64] = line.trim().split(/\s+/);
  if (type !== ED25519 || !base64) return null;
  try {
    return ed25519KeyFromBlob(Buffer.from(base64, "base64"));
  } catch {
    return null;
  }
}

/**
 * Whether `signature` is a valid SSHSIG over `message` in `namespace`, made by the private half of
 * `publicKeyLine`. Any malformed input answers false.
 *
 * @param {object} args
 * @param {string} args.publicKeyLine - the signer's OpenSSH public key line
 * @param {string} args.namespace - the -n value given to ssh-keygen -Y sign
 * @param {string|Buffer} args.message - the exact bytes that were signed
 * @param {string} args.signature - base64 body of the armoured SSHSIG
 * @returns {boolean}
 */
export function verifySshSignature({ publicKeyLine, namespace, message, signature }) {
  const expectedKey = parseSshEd25519PublicKey(publicKeyLine);
  if (!expectedKey || typeof signature !== "string" || !/^[A-Za-z0-9+/=]+$/.test(signature)) return false;
  try {
    const r = reader(Buffer.from(signature, "base64"));
    if (!r.bytes(6).equals(MAGIC) || r.uint32() !== 1) return false;
    const signerKey = ed25519KeyFromBlob(r.string());
    const signedNamespace = r.string().toString();
    const reserved = r.string();
    const hashAlgorithm = r.string().toString();
    const signatureBlob = reader(r.string());
    if (!r.done()) return false;
    if (!signerKey.equals(expectedKey) || signedNamespace !== namespace) return false;
    if (hashAlgorithm !== "sha512" && hashAlgorithm !== "sha256") return false;
    if (signatureBlob.string().toString() !== ED25519) return false;
    const rawSignature = signatureBlob.string();
    if (rawSignature.length !== 64 || !signatureBlob.done()) return false;
    const digest = createHash(hashAlgorithm).update(message).digest();
    const signedData = Buffer.concat([MAGIC, sshString(namespace), sshString(reserved), sshString(hashAlgorithm), sshString(digest)]);
    const key = createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: expectedKey.toString("base64url") }, format: "jwk" });
    return verify(null, signedData, key, rawSignature);
  } catch {
    return false;
  }
}
