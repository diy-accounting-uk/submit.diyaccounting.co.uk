// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/writeAliasTxtRecords.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("scripts/write-alias-txt-records.sh");
const ZONE = "ZTESTZONE";
const TARGET = "d111111abcdef8.cloudfront.net";

// A stub `aws` for Route 53. Each call is logged to calls.log as "<verb> <detail>", and the change
// batch goes to batch.json. STUB_CHANGE_FAIL makes change-resource-record-sets fail.
const AWS_STUB = `#!/bin/bash
args=("$@")
flag() { local i; for ((i = 0; i < \${#args[@]}; i++)); do [ "\${args[$i]}" = "$1" ] && { echo "\${args[$((i + 1))]}"; return; }; done; }
[ "$1" = route53 ] || exit 0
case "$2" in
  change-resource-record-sets)
    echo "change $(flag --hosted-zone-id)" >> "$STUB_DIR/calls.log"
    flag --change-batch > "$STUB_DIR/batch.json"
    if [ -n "\${STUB_CHANGE_FAIL:-}" ]; then echo "An error occurred (AccessDenied)" >&2; exit 254; fi
    echo "/change/C0001"
    ;;
  wait)
    echo "wait-$3 $(flag --id)" >> "$STUB_DIR/calls.log"
    ;;
esac
exit 0
`;

let dir;

const run = (args, env = {}) => {
  const result = spawnSync("/bin/bash", [SCRIPT, ...args], {
    env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, STUB_DIR: dir, ...env },
    encoding: "utf8",
  });
  const logFile = join(dir, "calls.log");
  const calls = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter(Boolean) : [];
  const batchFile = join(dir, "batch.json");
  const batch = existsSync(batchFile) ? JSON.parse(readFileSync(batchFile, "utf8")) : null;
  return { ...result, calls, batch };
};

describe("write-alias-txt-records.sh", { timeout: 30000 }, () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "write-alias-txt-"));
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin", "aws"), AWS_STUB);
    chmodSync(join(dir, "bin", "aws"), 0o755);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("each alias gets an UPSERT of the TXT record _<alias> with the target's domain name, then the change is waited for", () => {
    const { status, stderr, calls, batch } = run([ZONE, TARGET, "submit.diyaccounting.co.uk", "prod-submit.diyaccounting.co.uk"]);

    expect(status, stderr).toBe(0);
    expect(batch.Changes).toEqual([
      {
        Action: "UPSERT",
        ResourceRecordSet: { Name: "_submit.diyaccounting.co.uk.", Type: "TXT", TTL: 60, ResourceRecords: [{ Value: `"${TARGET}"` }] },
      },
      {
        Action: "UPSERT",
        ResourceRecordSet: { Name: "_prod-submit.diyaccounting.co.uk.", Type: "TXT", TTL: 60, ResourceRecords: [{ Value: `"${TARGET}"` }] },
      },
    ]);
    expect(calls).toEqual([`change ${ZONE}`, "wait-resource-record-sets-changed /change/C0001"]);
    expect(stderr).toMatch(/Upserting DNS TXT record \[_submit\.diyaccounting\.co\.uk\] = \[d111111abcdef8\.cloudfront\.net\]/);
    expect(stderr).toMatch(/is INSYNC/);
  });

  test("a failed change exits 1 and waits for nothing", () => {
    const { status, stderr, calls } = run([ZONE, TARGET, "ci-submit.diyaccounting.co.uk"], { STUB_CHANGE_FAIL: "1" });

    expect(status).toBe(1);
    expect(stderr).toMatch(/could not write the DNS TXT records/);
    expect(calls).toEqual([`change ${ZONE}`]);
  });

  test("a value that is not a CloudFront domain name exits 2 and writes nothing", () => {
    const { status, calls } = run([ZONE, "ci-set2.submit.diyaccounting.co.uk", "ci-submit.diyaccounting.co.uk"]);

    expect(status).toBe(2);
    expect(calls).toEqual([]);
  });

  test("missing arguments exit 2 with the usage", () => {
    const { status, stderr, calls } = run([ZONE, TARGET]);

    expect(status).toBe(2);
    expect(stderr).toMatch(/Usage/);
    expect(calls).toEqual([]);
  });
});
