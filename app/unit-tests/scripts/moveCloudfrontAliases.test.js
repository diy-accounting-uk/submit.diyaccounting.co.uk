// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/moveCloudfrontAliases.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("scripts/move-cloudfront-aliases.sh");
const ACCOUNT = "111111111111";
const APEX = "prod-submit.diyaccounting.co.uk";
const ALIAS = "submit.diyaccounting.co.uk";
const NEW = "ENEWDIST";
const OLD = "EOLDDIST";
const NEW_ORIGIN = "prod-bbbbbbb.submit.diyaccounting.co.uk";
const OLD_ORIGIN = "prod-aaaaaaa.submit.diyaccounting.co.uk";

// A stub `aws` that keeps CloudFront state in files: $STUB_DIR/dists/<id>/aliases holds one alias per
// line and .../originfor the OriginFor tag. Each call is logged to calls.log as "<verb> <id> <detail>".
// STUB_REFUSE_ASSOCIATE makes associate-alias fail with IllegalUpdate and change nothing.
// STUB_VANISH_ON names a verb: the first call of that verb finds distribution STUB_VANISH_ID deleted,
// as the self-destruct of an old deployment would leave it.
const AWS_STUB = `#!/bin/bash
args=("$@")
flag() { local i; for ((i = 0; i < \${#args[@]}; i++)); do [ "\${args[$i]}" = "$1" ] && { echo "\${args[$((i + 1))]}"; return; }; done; }
[ "$1" = cloudfront ] || exit 0
verb="$2"
[ "$verb" = wait ] && verb="wait-$3"
D="$STUB_DIR/dists"
nosuch() { echo "An error occurred (NoSuchDistribution) when calling the $1 operation: The specified distribution does not exist." >&2; exit 254; }
holder() { local f; for f in "$D"/*/aliases; do [ -e "$f" ] || continue; grep -qxF "$1" "$f" && { basename "$(dirname "$f")"; return; }; done; }
if [ -n "\${STUB_VANISH_ON:-}" ] && [ "$verb" = "$STUB_VANISH_ON" ] && [ ! -e "$STUB_DIR/vanished" ]; then
  touch "$STUB_DIR/vanished"
  rm -rf "\${D:?}/\${STUB_VANISH_ID:?}"
fi
log() { echo "$verb \${1:-} \${2:-}" >> "$STUB_DIR/calls.log"; }
case "$verb" in
  list-distributions)
    q=$(flag --query)
    a=$(printf '%s' "$q" | sed -n "s/.*contains(Aliases.Items, '\\\\([^']*\\\\)').*/\\\\1/p")
    log - "$a"
    h=$(holder "$a")
    echo "\${h:-None}"
    ;;
  list-tags-for-resource)
    id=$(flag --resource); id="\${id##*/}"
    log "$id"
    [ -d "$D/$id" ] || nosuch ListTagsForResource
    if [ -s "$D/$id/originfor" ]; then cat "$D/$id/originfor"; else echo None; fi
    ;;
  associate-alias)
    id=$(flag --target-distribution-id); a=$(flag --alias)
    log "$id" "$a"
    [ -d "$D/$id" ] || nosuch AssociateAlias
    if [ -n "\${STUB_REFUSE_ASSOCIATE:-}" ]; then echo "An error occurred (IllegalUpdate) when calling the AssociateAlias operation: refused" >&2; exit 254; fi
    h=$(holder "$a")
    if [ -z "$h" ]; then echo "An error occurred (InvalidArgument) when calling the AssociateAlias operation: no distribution holds the alias" >&2; exit 254; fi
    grep -vxF "$a" "$D/$h/aliases" > "$D/$h/aliases.new"; mv "$D/$h/aliases.new" "$D/$h/aliases"
    echo "$a" >> "$D/$id/aliases"
    ;;
  get-distribution-config)
    id=$(flag --id); q=$(flag --query)
    log "$id" "$q"
    [ -d "$D/$id" ] || nosuch GetDistributionConfig
    if [ "$q" = ETag ]; then echo "ETAG-$id"; else jq -R . "$D/$id/aliases" | jq -s '{Comment: "c", Aliases: {Quantity: length, Items: .}}'; fi
    ;;
  update-distribution)
    id=$(flag --id); cfg=$(flag --distribution-config)
    jq -r '.Aliases.Items[]' "\${cfg#file://}" > "$STUB_DIR/update.aliases"
    log "$id" "$(paste -sd, "$STUB_DIR/update.aliases")"
    [ -d "$D/$id" ] || nosuch UpdateDistribution
    while IFS= read -r a; do h=$(holder "$a"); if [ -n "$h" ] && [ "$h" != "$id" ]; then echo "An error occurred (CNAMEAlreadyExists) when calling the UpdateDistribution operation" >&2; exit 254; fi; done < "$STUB_DIR/update.aliases"
    cp "$STUB_DIR/update.aliases" "$D/$id/aliases"
    echo '{}'
    ;;
  wait-distribution-deployed)
    log "$(flag --id)"
    ;;
  get-distribution)
    log "$(flag --id)"
    jq -R . "$D/$(flag --id)/aliases" | jq -s .
    ;;
esac
exit 0
`;

let dir;

const seedDist = (id, aliases, originFor) => {
  const d = join(dir, "dists", id);
  mkdirSync(d, { recursive: true });
  writeFileSync(join(d, "aliases"), aliases.map((a) => `${a}\n`).join(""));
  writeFileSync(join(d, "originfor"), originFor ? `${originFor}\n` : "");
};

const aliasesOf = (id) => {
  const file = join(dir, "dists", id, "aliases");
  if (!existsSync(file)) return null;
  return readFileSync(file, "utf8").split("\n").filter(Boolean);
};

const runScript = (aliases, env = {}) => {
  const result = spawnSync("/bin/bash", [SCRIPT, NEW, ACCOUNT, NEW_ORIGIN, ...aliases], {
    env: { ...process.env, PATH: `${join(dir, "bin")}:${process.env.PATH}`, STUB_DIR: dir, ...env },
    encoding: "utf8",
  });
  const logFile = join(dir, "calls.log");
  const calls = existsSync(logFile) ? readFileSync(logFile, "utf8").split("\n").filter(Boolean) : [];
  const verbs = calls.map((call) => call.split(" ")[0]);
  return { ...result, calls, verbs };
};

describe("move-cloudfront-aliases.sh", { timeout: 30000 }, () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "move-cf-aliases-"));
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin", "aws"), AWS_STUB);
    chmodSync(join(dir, "bin", "aws"), 0o755);
    writeFileSync(join(dir, "calls.log"), "");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("an alias held by another distribution moves in one associate-alias call each, with no update that empties the holder", () => {
    seedDist(OLD, [OLD_ORIGIN, APEX, ALIAS], OLD_ORIGIN);
    seedDist(NEW, [NEW_ORIGIN], NEW_ORIGIN);

    const { status, stdout, stderr, calls, verbs } = runScript([APEX, ALIAS]);

    expect(status, stderr).toBe(0);
    expect(calls.filter((c) => c.startsWith("associate-alias"))).toEqual([
      `associate-alias ${NEW} ${APEX}`,
      `associate-alias ${NEW} ${ALIAS}`,
    ]);
    expect(verbs).not.toContain("update-distribution");
    expect(aliasesOf(NEW)).toEqual([NEW_ORIGIN, APEX, ALIAS]);
    expect(aliasesOf(OLD)).toEqual([OLD_ORIGIN]);
    expect(calls).toContain(`wait-distribution-deployed ${NEW} `);
    expect(stdout).toBe("prod-aaaaaaa");
  });

  test("the target is deployed before the script returns, after the last move", () => {
    seedDist(OLD, [OLD_ORIGIN, APEX], OLD_ORIGIN);
    seedDist(NEW, [NEW_ORIGIN], NEW_ORIGIN);

    const { status, verbs } = runScript([APEX]);

    expect(status).toBe(0);
    expect(verbs.lastIndexOf("wait-distribution-deployed")).toBeGreaterThan(verbs.lastIndexOf("associate-alias"));
  });

  test("an alias that no distribution holds is added to the target with update-distribution", () => {
    seedDist(NEW, [NEW_ORIGIN], NEW_ORIGIN);

    const { status, stdout, stderr, calls, verbs } = runScript([APEX, ALIAS]);

    expect(status, stderr).toBe(0);
    expect(verbs).not.toContain("associate-alias");
    expect(calls.filter((c) => c.startsWith("update-distribution"))).toEqual([`update-distribution ${NEW} ${NEW_ORIGIN},${APEX},${ALIAS}`]);
    expect(aliasesOf(NEW)).toEqual([NEW_ORIGIN, APEX, ALIAS]);
    expect(verbs).toContain("wait-distribution-deployed");
    expect(stdout).toBe("");
  });

  test("a holder deleted before the move sends its alias to the add path", () => {
    seedDist(OLD, [OLD_ORIGIN, APEX], OLD_ORIGIN);
    seedDist(NEW, [NEW_ORIGIN], NEW_ORIGIN);

    const { status, stderr, calls } = runScript([APEX], { STUB_VANISH_ON: "associate-alias", STUB_VANISH_ID: OLD });

    expect(status, stderr).toBe(0);
    expect(aliasesOf(OLD)).toBeNull();
    expect(calls).toContain(`update-distribution ${NEW} ${NEW_ORIGIN},${APEX}`);
    expect(aliasesOf(NEW)).toEqual([NEW_ORIGIN, APEX]);
  });

  test("a holder deleted before its tags are read names no deployment and its alias is added", () => {
    seedDist(OLD, [OLD_ORIGIN, APEX], OLD_ORIGIN);
    seedDist(NEW, [NEW_ORIGIN], NEW_ORIGIN);

    const { status, stdout, stderr } = runScript([APEX], { STUB_VANISH_ON: "list-tags-for-resource", STUB_VANISH_ID: OLD });

    expect(status, stderr).toBe(0);
    expect(stdout).toBe("");
    expect(aliasesOf(NEW)).toEqual([NEW_ORIGIN, APEX]);
  });

  test("a refused move stops with exit 1 and leaves the alias on its holder", () => {
    seedDist(OLD, [OLD_ORIGIN, APEX, ALIAS], OLD_ORIGIN);
    seedDist(NEW, [NEW_ORIGIN], NEW_ORIGIN);

    const { status, stderr, verbs } = runScript([APEX, ALIAS], { STUB_REFUSE_ASSOCIATE: "1" });

    expect(status).toBe(1);
    expect(stderr).toMatch(/associate-alias refused to move \[prod-submit\.diyaccounting\.co\.uk\]/);
    expect(verbs).not.toContain("update-distribution");
    expect(verbs).not.toContain("wait-distribution-deployed");
    expect(aliasesOf(OLD)).toEqual([OLD_ORIGIN, APEX, ALIAS]);
    expect(aliasesOf(NEW)).toEqual([NEW_ORIGIN]);
  });

  test("aliases the target already holds cause no change and no wait", () => {
    seedDist(NEW, [NEW_ORIGIN, APEX, ALIAS], NEW_ORIGIN);

    const { status, stdout, verbs } = runScript([APEX, ALIAS]);

    expect(status).toBe(0);
    expect(verbs).not.toContain("associate-alias");
    expect(verbs).not.toContain("update-distribution");
    expect(verbs).not.toContain("wait-distribution-deployed");
    expect(stdout).toBe("");
  });

  test("a holder whose OriginFor is the apex itself names no deployment", () => {
    seedDist(OLD, [APEX], APEX);
    seedDist(NEW, [NEW_ORIGIN], NEW_ORIGIN);

    const { status, stdout } = runScript([APEX]);

    expect(status).toBe(0);
    expect(stdout).toBe("");
    expect(aliasesOf(NEW)).toEqual([NEW_ORIGIN, APEX]);
  });

  test("a target that lacks its origin domain gets it added beside the moved aliases", () => {
    seedDist(OLD, [OLD_ORIGIN, APEX], OLD_ORIGIN);
    seedDist(NEW, [], NEW_ORIGIN);

    const { status, stderr, calls } = runScript([APEX]);

    expect(status, stderr).toBe(0);
    expect(calls).toContain(`associate-alias ${NEW} ${APEX}`);
    expect(calls).toContain(`update-distribution ${NEW} ${APEX},${NEW_ORIGIN}`);
  });

  test("missing arguments exit 2 with the usage", () => {
    const result = spawnSync("/bin/bash", [SCRIPT, NEW, ACCOUNT, NEW_ORIGIN], { encoding: "utf8" });
    expect(result.status).toBe(2);
    expect(result.stderr).toMatch(/Usage/);
  });
});
