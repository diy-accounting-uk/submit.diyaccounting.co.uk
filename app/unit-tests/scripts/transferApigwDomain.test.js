// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/transferApigwDomain.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("scripts/transfer-apigw-domain.sh");
const APEX = "prod-submit.diyaccounting.co.uk";
const ALIAS = "submit.diyaccounting.co.uk";
const NEW_API = "newapi1234";
const OLD_API = "oldapi5678";
const CERT = "arn:aws:acm:eu-west-2:111111111111:certificate/right";
const OTHER_CERT = "arn:aws:acm:eu-west-2:111111111111:certificate/other";

// A stub `aws` that keeps API Gateway state in files: $STUB_DIR/domains/<domain>/cert holds the
// certificate and .../mappings holds one "id,api,stage,key" line per mapping. Each call is logged to
// calls.log as "<verb> <domain> <detail>". STUB_VANISH_ON names a verb: the first call of that verb
// finds the domain deleted, as a destroy running beside it would leave it.
const AWS_STUB = `#!/bin/bash
args=("$@")
flag() { local i; for ((i = 0; i < \${#args[@]}; i++)); do [ "\${args[$i]}" = "$1" ] && { echo "\${args[$((i + 1))]}"; return; }; done; }
[ "$1" = apigatewayv2 ] || exit 0
verb="$2"
domain=$(flag --domain-name)
d="$STUB_DIR/domains/$domain"
notfound() { echo "An error occurred (NotFoundException) when calling the $1 operation: Invalid domain name identifier specified" >&2; exit 254; }
if [ -n "\${STUB_VANISH_ON:-}" ] && [ "$verb" = "$STUB_VANISH_ON" ] && [ ! -e "$STUB_DIR/vanished" ]; then
  touch "$STUB_DIR/vanished"
  rm -rf "$d"
fi
log() { echo "$verb $domain \${1:-}" >> "$STUB_DIR/calls.log"; }
case "$verb" in
  get-domain-name)
    log
    [ -d "$d" ] || notfound GetDomainName
    cat "$d/cert"
    ;;
  get-api-mappings)
    log
    [ -d "$d" ] || notfound GetApiMappings
    paste -sd '\\t' "$d/mappings"
    ;;
  update-api-mapping)
    id=$(flag --api-mapping-id); api=$(flag --api-id); stage=$(flag --stage)
    log "$id $api $stage"
    [ -d "$d" ] || notfound UpdateApiMapping
    grep -q "^$id," "$d/mappings" || notfound UpdateApiMapping
    sed -i.bak "s/^$id,[^,]*,[^,]*,/$id,$api,$stage,/" "$d/mappings"
    ;;
  create-api-mapping)
    api=$(flag --api-id); stage=$(flag --stage)
    log "$api $stage"
    [ -d "$d" ] || notfound CreateApiMapping
    echo "created$(wc -l < "$d/mappings" | tr -d ' '),$api,$stage," >> "$d/mappings"
    ;;
  delete-api-mapping)
    id=$(flag --api-mapping-id)
    log "$id"
    [ -d "$d" ] || notfound DeleteApiMapping
    sed -i.bak "/^$id,/d" "$d/mappings"
    ;;
  delete-domain-name)
    log
    [ -d "$d" ] || notfound DeleteDomainName
    rm -rf "$d"
    ;;
  create-domain-name)
    config=$(flag --domain-name-configurations)
    log
    if [ -d "$d" ]; then echo "An error occurred (ConflictException) when calling the CreateDomainName operation: The domain name you provided already exists." >&2; exit 254; fi
    mkdir -p "$d"
    cert="\${config#CertificateArn=}"
    echo "\${cert%%,*}" > "$d/cert"
    : > "$d/mappings"
    ;;
esac
exit 0
`;

const SLEEP_STUB = `#!/bin/bash
echo "sleep - $1" >> "$STUB_DIR/calls.log"
`;

let dir;

const seedDomain = (domain, cert, mappings) => {
  const d = join(dir, "domains", domain);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "cert"), `${cert}\n`);
  writeFileSync(join(d, "mappings"), mappings.map((m) => `${m}\n`).join(""));
};

const mappingsOf = (domain) => {
  const file = join(dir, "domains", domain, "mappings");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8").split("\n").filter(Boolean);
};

const runScript = (domains, env = {}) => {
  const result = spawnSync("/bin/bash", [SCRIPT, NEW_API, CERT, ...domains], {
    env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, STUB_DIR: dir, STUB_VANISH_ON: "", ...env },
    encoding: "utf8",
  });
  const calls = readFileSync(join(dir, "calls.log"), "utf8").split("\n").filter(Boolean);
  const verbs = calls.map((call) => call.split(" ")[0]);
  return { ...result, calls, verbs };
};

const RATE_LIMITED = ["create-domain-name", "delete-domain-name"];

describe("transfer-apigw-domain.sh", { timeout: 30000 }, () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "transfer-apigw-"));
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin", "aws"), AWS_STUB);
    writeFileSync(join(dir, "bin", "sleep"), SLEEP_STUB);
    chmodSync(join(dir, "bin", "aws"), 0o755);
    chmodSync(join(dir, "bin", "sleep"), 0o755);
    writeFileSync(join(dir, "calls.log"), "");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("a mapping that already names the API and $default changes nothing", () => {
    seedDomain(APEX, CERT, [`m1,${NEW_API},$default,`]);
    const { status, stdout, verbs } = runScript([APEX]);
    expect(status).toBe(0);
    expect(stdout).toContain("already names API");
    expect(verbs).toEqual(["get-domain-name", "get-api-mappings", "get-api-mappings"]);
    expect(mappingsOf(APEX)).toEqual([`m1,${NEW_API},$default,`]);
  });

  test("a mapping to another API moves in place and the domain is never deleted", () => {
    seedDomain(APEX, CERT, [`m1,${OLD_API},$default,`]);
    const { status, stdout, calls, verbs } = runScript([APEX]);
    expect(status).toBe(0);
    expect(calls).toContain(`update-api-mapping ${APEX} m1 ${NEW_API} $default`);
    expect(verbs.filter((verb) => RATE_LIMITED.includes(verb) || verb === "delete-api-mapping" || verb === "sleep")).toEqual([]);
    expect(mappingsOf(APEX)).toEqual([`m1,${NEW_API},$default,`]);
    expect(stdout).toContain(`Verified: [${APEX}] has exactly one API mapping to API [${NEW_API}]`);
  });

  test("two domains moved in place have no wait between them", () => {
    seedDomain(APEX, CERT, [`m1,${OLD_API},$default,`]);
    seedDomain(ALIAS, CERT, [`m2,${OLD_API},$default,`]);
    const { status, verbs } = runScript([APEX, ALIAS]);
    expect(status).toBe(0);
    expect(verbs.filter((verb) => verb === "update-api-mapping")).toHaveLength(2);
    expect(verbs).not.toContain("sleep");
    expect(mappingsOf(ALIAS)).toEqual([`m2,${NEW_API},$default,`]);
  });

  test("a domain with no mapping gets one created", () => {
    seedDomain(APEX, CERT, []);
    const { status, verbs } = runScript([APEX]);
    expect(status).toBe(0);
    expect(verbs).toContain("create-api-mapping");
    expect(verbs.filter((verb) => RATE_LIMITED.includes(verb))).toEqual([]);
    expect(mappingsOf(APEX)).toEqual([`created0,${NEW_API},$default,`]);
  });

  test("a domain with two mappings fails, lists them and changes nothing", () => {
    seedDomain(APEX, CERT, [`m1,${OLD_API},$default,`, `m2,${OLD_API},$default,v1`]);
    const { status, stderr, verbs } = runScript([APEX]);
    expect(status).toBe(1);
    expect(stderr).toContain("has 2 API mappings");
    expect(stderr).toContain(`m1,${OLD_API},$default,`);
    expect(stderr).toContain(`m2,${OLD_API},$default,v1`);
    expect(verbs).toEqual(["get-domain-name", "get-api-mappings"]);
  });

  test("a single mapping with a key fails and changes nothing", () => {
    seedDomain(APEX, CERT, [`m1,${OLD_API},$default,v1`]);
    const { status, stderr, verbs } = runScript([APEX]);
    expect(status).toBe(1);
    expect(stderr).toContain("with key [v1]");
    expect(verbs).toEqual(["get-domain-name", "get-api-mappings"]);
  });

  test("a missing domain is created with its mapping", () => {
    const { status, verbs } = runScript([APEX]);
    expect(status).toBe(0);
    expect(verbs).toEqual(["get-domain-name", "create-domain-name", "create-api-mapping", "get-api-mappings"]);
    expect(mappingsOf(APEX)).toEqual([`created0,${NEW_API},$default,`]);
    expect(readFileSync(join(dir, "domains", APEX, "cert"), "utf8").trim()).toBe(CERT);
  });

  test("a domain with another certificate is deleted and created again, and the next domain waits", () => {
    seedDomain(APEX, OTHER_CERT, [`m1,${OLD_API},$default,`]);
    seedDomain(ALIAS, CERT, [`m2,${OLD_API},$default,`]);
    const { status, calls, verbs } = runScript([APEX, ALIAS]);
    expect(status).toBe(0);
    expect(verbs.slice(0, 8)).toEqual([
      "get-domain-name",
      "get-api-mappings",
      "delete-api-mapping",
      "delete-domain-name",
      "sleep",
      "create-domain-name",
      "create-api-mapping",
      "get-api-mappings",
    ]);
    expect(calls).toContain("sleep - 15");
    expect(verbs.indexOf("sleep", 5)).toBeLessThan(verbs.indexOf("update-api-mapping"));
    expect(readFileSync(join(dir, "domains", APEX, "cert"), "utf8").trim()).toBe(CERT);
    expect(mappingsOf(APEX)).toEqual([`created0,${NEW_API},$default,`]);
    expect(mappingsOf(ALIAS)).toEqual([`m2,${NEW_API},$default,`]);
  });

  test("a domain deleted before the move goes to the create path and ends with a mapping", () => {
    seedDomain(APEX, CERT, [`m1,${OLD_API},$default,`]);
    const { status, stdout, verbs } = runScript([APEX], { STUB_VANISH_ON: "update-api-mapping" });
    expect(status).toBe(0);
    expect(stdout).toContain("disappeared during the move");
    expect(verbs).toEqual([
      "get-domain-name",
      "get-api-mappings",
      "update-api-mapping",
      "create-domain-name",
      "create-api-mapping",
      "get-api-mappings",
    ]);
    expect(mappingsOf(APEX)).toEqual([`created0,${NEW_API},$default,`]);
  });

  test("a domain deleted while its mappings are read goes to the create path", () => {
    seedDomain(APEX, CERT, [`m1,${OLD_API},$default,`]);
    const { status, verbs } = runScript([APEX], { STUB_VANISH_ON: "get-api-mappings" });
    expect(status).toBe(0);
    expect(verbs).toEqual(["get-domain-name", "get-api-mappings", "create-domain-name", "create-api-mapping", "get-api-mappings"]);
    expect(mappingsOf(APEX)).toEqual([`created0,${NEW_API},$default,`]);
  });

  test("a domain that appears before the create gets its mapping moved in place", () => {
    const vanishedThenBack = join(dir, "bin", "aws-real");
    writeFileSync(vanishedThenBack, AWS_STUB);
    chmodSync(vanishedThenBack, 0o755);
    // get-domain-name answers NotFound once, then the domain stands with a mapping to the old API.
    writeFileSync(
      join(dir, "bin", "aws"),
      `#!/bin/bash
if [ "$2" = get-domain-name ] && [ ! -e "$STUB_DIR/seeded" ]; then
  touch "$STUB_DIR/seeded"
  echo "get-domain-name x" >> "$STUB_DIR/calls.log"
  mkdir -p "$STUB_DIR/domains/${APEX}"
  echo "${CERT}" > "$STUB_DIR/domains/${APEX}/cert"
  echo "m1,${OLD_API},\\$default," > "$STUB_DIR/domains/${APEX}/mappings"
  echo "An error occurred (NotFoundException) when calling the GetDomainName operation" >&2
  exit 254
fi
exec "${vanishedThenBack}" "$@"
`,
    );
    const { status, verbs } = runScript([APEX]);
    expect(status).toBe(0);
    expect(verbs).toEqual(["get-domain-name", "create-domain-name", "get-api-mappings", "update-api-mapping", "get-api-mappings"]);
    expect(mappingsOf(APEX)).toEqual([`m1,${NEW_API},$default,`]);
  });

  test("a verification that finds no mapping to the API fails the run", () => {
    seedDomain(APEX, CERT, [`m1,${OLD_API},$default,`]);
    // update-api-mapping reports success and changes nothing.
    const real = join(dir, "bin", "aws-real");
    writeFileSync(real, AWS_STUB);
    chmodSync(real, 0o755);
    writeFileSync(
      join(dir, "bin", "aws"),
      `#!/bin/bash
if [ "$2" = update-api-mapping ]; then echo "update-api-mapping noop" >> "$STUB_DIR/calls.log"; exit 0; fi
exec "${real}" "$@"
`,
    );
    const { status, stderr } = runScript([APEX]);
    expect(status).toBe(1);
    expect(stderr).toContain(`has 0 API mappings to API [${NEW_API}]`);
  });

  test("any other error on the domain read fails without a change", () => {
    writeFileSync(
      join(dir, "bin", "aws"),
      `#!/bin/bash
echo "$2 x" >> "$STUB_DIR/calls.log"
echo "An error occurred (AccessDeniedException) when calling the GetDomainName operation" >&2
exit 254
`,
    );
    const { status, verbs } = runScript([APEX]);
    expect(status).toBe(1);
    expect(verbs).toEqual(["get-domain-name"]);
  });
});
