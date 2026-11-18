// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/lib/sshSignature.test.js

import { describe, test, expect } from "vitest";
import { parseSshEd25519PublicKey, verifySshSignature } from "@app/lib/sshSignature.js";
import { makeSshTestKey } from "@app/test-helpers/sshSignatureTestKeys.js";

// Made with OpenSSH 10.3 from a throwaway key, whose private half was then deleted:
//   printf '%s' 'connect|anvil|1763460000' | ssh-keygen -Y sign -n submit-collab -f k -
const OPENSSH_PUBLIC_KEY = "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAINzZcymn8wTk5aKEinfvSINlQ8qjacZUV6obhP5plgOT fixture";
const OPENSSH_CONNECT_SIGNATURE =
  "U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAg3NlzKafzBOTlooSKd+9Ig2VDyqNpxlRXqhuE/mmWA5MAAAANc3VibWl0LWNvbGxhYgAAAAAAAAAGc2hhNTEyAAAAUwAAAAtzc2gtZWQyNTUxOQAAAEDl3B/c6hTeBXzUI7CgJ3JHeEXFHm+JEOMhQDWFnjHUWy1UrulGWujAzDGC6nKTuFk9ua0BHUKWReP8+/mD324P";
// The same key over a two-line message, as relay-send signs an armoured age body.
const OPENSSH_SEND_MESSAGE = "send|anvil|coordinator|1763460000123|1763460000|line one\nline two";
const OPENSSH_SEND_SIGNATURE =
  "U1NIU0lHAAAAAQAAADMAAAALc3NoLWVkMjU1MTkAAAAg3NlzKafzBOTlooSKd+9Ig2VDyqNpxlRXqhuE/mmWA5MAAAANc3VibWl0LWNvbGxhYgAAAAAAAAAGc2hhNTEyAAAAUwAAAAtzc2gtZWQyNTUxOQAAAECacStwqd4QnTR2yk3ryH7Xriim401viR3OqcRXvJbl5pLNLq9YRzFKGWboTAB/Pchrp5YUDbqQzNsjKcKn0VgL";

describe("verifySshSignature", () => {
  test("accepts a signature that ssh-keygen -Y sign made", () => {
    const args = { publicKeyLine: OPENSSH_PUBLIC_KEY, namespace: "submit-collab", message: "connect|anvil|1763460000" };
    expect(verifySshSignature({ ...args, signature: OPENSSH_CONNECT_SIGNATURE })).toBe(true);
    expect(verifySshSignature({ ...args, message: OPENSSH_SEND_MESSAGE, signature: OPENSSH_SEND_SIGNATURE })).toBe(true);
  });

  test("refuses the ssh-keygen signature for another message, namespace or key", () => {
    const base = {
      publicKeyLine: OPENSSH_PUBLIC_KEY,
      namespace: "submit-collab",
      message: "connect|anvil|1763460000",
      signature: OPENSSH_CONNECT_SIGNATURE,
    };
    expect(verifySshSignature({ ...base, message: "connect|anvil|1763460001" })).toBe(false);
    expect(verifySshSignature({ ...base, namespace: "file" })).toBe(false);
    expect(verifySshSignature({ ...base, publicKeyLine: makeSshTestKey().publicKeyLine })).toBe(false);
  });

  test("accepts sha256 and sha512 signatures from the test signer", () => {
    const key = makeSshTestKey();
    for (const hash of ["sha256", "sha512"]) {
      const signature = key.signMessage("hello", "submit-collab", hash);
      expect(verifySshSignature({ publicKeyLine: key.publicKeyLine, namespace: "submit-collab", message: "hello", signature })).toBe(true);
    }
  });

  test("answers false for malformed input instead of throwing", () => {
    const key = makeSshTestKey();
    const good = key.signMessage("hello");
    const args = { publicKeyLine: key.publicKeyLine, namespace: "submit-collab", message: "hello" };
    expect(verifySshSignature({ ...args, signature: "" })).toBe(false);
    expect(verifySshSignature({ ...args, signature: "not base64!" })).toBe(false);
    expect(verifySshSignature({ ...args, signature: good.slice(0, 40) })).toBe(false);
    expect(verifySshSignature({ ...args, signature: undefined })).toBe(false);
    expect(verifySshSignature({ ...args, publicKeyLine: "ssh-rsa AAAAB3NzaC1yc2E= x", signature: good })).toBe(false);
    expect(verifySshSignature({ ...args, signature: key.signMessage("hello", "submit-collab", "md5") })).toBe(false);
  });
});

describe("parseSshEd25519PublicKey", () => {
  test("reads the 32-byte key of an ssh-ed25519 line and refuses anything else", () => {
    expect(parseSshEd25519PublicKey(OPENSSH_PUBLIC_KEY)).toHaveLength(32);
    expect(parseSshEd25519PublicKey("ssh-ed25519 AAAA")).toBeNull();
    expect(parseSshEd25519PublicKey("ssh-rsa AAAAB3NzaC1yc2E=")).toBeNull();
    expect(parseSshEd25519PublicKey(undefined)).toBeNull();
  });
});
