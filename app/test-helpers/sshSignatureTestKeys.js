// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/sshSignatureTestKeys.js
//
// Makes ed25519 key pairs and SSHSIG signatures in the format `ssh-keygen -Y sign` writes, so a
// test can sign as any party without the ssh-keygen binary.

import { createHash, generateKeyPairSync, sign } from "node:crypto";

function sshString(value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(body.length, 0);
  return Buffer.concat([length, body]);
}

/**
 * A new ed25519 key pair: the OpenSSH public key line and a function that signs a message as
 * `ssh-keygen -Y sign -n <namespace>` does, answering the base64 body of the armoured signature.
 */
export function makeSshTestKey(comment = "test") {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const raw = Buffer.from(publicKey.export({ format: "jwk" }).x, "base64url");
  const keyBlob = Buffer.concat([sshString("ssh-ed25519"), sshString(raw)]);
  const publicKeyLine = `ssh-ed25519 ${keyBlob.toString("base64")} ${comment}`;
  const signMessage = (message, namespace = "submit-collab", hashAlgorithm = "sha512") => {
    const digest = createHash(hashAlgorithm).update(message).digest();
    const magic = Buffer.from("SSHSIG");
    const signedData = Buffer.concat([magic, sshString(namespace), sshString(""), sshString(hashAlgorithm), sshString(digest)]);
    const rawSignature = sign(null, signedData, privateKey);
    const version = Buffer.alloc(4);
    version.writeUInt32BE(1, 0);
    const blob = Buffer.concat([
      magic,
      version,
      sshString(keyBlob),
      sshString(namespace),
      sshString(""),
      sshString(hashAlgorithm),
      sshString(Buffer.concat([sshString("ssh-ed25519"), sshString(rawSignature)])),
    ]);
    return blob.toString("base64");
  };
  return { publicKeyLine, signMessage };
}
