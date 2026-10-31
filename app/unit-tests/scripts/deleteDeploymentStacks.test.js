// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/scripts/deleteDeploymentStacks.test.js

import { describe, test, expect, beforeEach, afterEach } from "vitest";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, chmodSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const SCRIPT = resolve("scripts/delete-deployment-stacks.sh");
const DEPLOYMENT = "prod-abc1234";
const PREFIX = `${DEPLOYMENT}-app-`;

const PHASE_1 = ["SelfDestructStack", "OpsStack", "PublishStack"];
const PHASE_2 = ["EdgeStack"];
const PHASE_3 = ["ApiRoutesStack", "ApiStack"];
const PHASE_4 = [
  "AuthStack",
  "HmrcStack",
  "HmrcItsaStack",
  "HmrcItsaPropertyStack",
  "CompaniesHouseStack",
  "AccountStack",
  "BillingStack",
  "DiyaGlStack",
  "McpStack",
];

// A stub `aws` that logs each call in arrival order. A stack exists until its delete-stack call,
// then reports DELETE_IN_PROGRESS for 2 describes (STUB_SLOW stacks: 25) and is gone; the first
// describe that finds it gone logs wait-return. STUB_ABSENT lists stacks that never exist,
// STUB_FAILED lists stacks that report DELETE_FAILED after the first delete, STUB_EXPORTS and
// STUB_IMPORTS script the guard.
const STUB = `#!/bin/bash
args=("$@")
flag() { local i; for ((i = 0; i < \${#args[@]}; i++)); do [ "\${args[$i]}" = "$1" ] && { echo "\${args[$((i + 1))]}"; return; }; done; }
has() { local a; for a in "\${args[@]}"; do [ "$a" = "$1" ] && return 0; done; return 1; }
listed() { case ",$1," in *",$2,"*) return 0 ;; esac; local item; for item in \${1//,/ }; do case "$2" in *"$item") return 0 ;; esac; done; return 1; }
log() { echo "$(date +%s) $1 \${2:--} \${3:-}" >> "$STUB_DIR/calls.log"; }
[ "$1" = cloudformation ] || exit 0
case "$2" in
  describe-stacks)
    stack=$(flag --stack-name)
    log describe "$stack"
    gone() { echo "An error occurred (ValidationError) when calling the DescribeStacks operation: Stack [$stack] does not exist" >&2; exit 255; }
    listed "$STUB_ABSENT" "$stack" && gone
    [ -e "$STUB_DIR/$stack.gone" ] && gone
    if [ -e "$STUB_DIR/$stack.deleted" ] && [ ! -e "$STUB_DIR/$stack.forced" ]; then
      polls=$(cat "$STUB_DIR/$stack.polls" 2>/dev/null || echo 0)
      echo $((polls + 1)) > "$STUB_DIR/$stack.polls"
      limit=2
      listed "$STUB_SLOW" "$stack" && limit=25
      if [ "$polls" -lt "$limit" ]; then echo DELETE_IN_PROGRESS; exit 0; fi
      log wait-return "$stack"
      if listed "$STUB_FAILED" "$stack"; then echo DELETE_FAILED; exit 0; fi
      touch "$STUB_DIR/$stack.gone"
      gone
    fi
    echo CREATE_COMPLETE
    ;;
  delete-stack)
    stack=$(flag --stack-name)
    if has --deletion-mode; then
      log force-delete "$stack"
      touch "$STUB_DIR/$stack.forced" "$STUB_DIR/$stack.gone"
    else
      log delete "$stack"
      touch "$STUB_DIR/$stack.deleted"
    fi
    ;;
  list-exports)
    log list-exports - "$(flag --region)"
    [ -n "$STUB_EXPORTS" ] && printf '%b\\n' "$STUB_EXPORTS"
    ;;
  list-imports)
    name=$(flag --export-name)
    log list-imports "$name"
    case ",$STUB_IMPORTS," in *",$name="*) entry=\${STUB_IMPORTS#*$name=}; echo "\${entry%%,*}" ;; *) exit 255 ;; esac
    ;;
esac
exit 0
`;

let dir;

const runScript = (env = {}) => {
  const result = spawnSync("/bin/bash", [SCRIPT, DEPLOYMENT], {
    env: {
      ...process.env,
      PATH: `${join(dir, "bin")}:${process.env.PATH}`,
      STUB_DIR: dir,
      DELETE_POLL_SECONDS: "0.05",
      STUB_ABSENT: "",
      STUB_SLOW: "",
      STUB_FAILED: "",
      STUB_EXPORTS: "",
      STUB_IMPORTS: "",
      ...env,
    },
    encoding: "utf8",
  });
  const calls = readFileSync(join(dir, "calls.log"), "utf8")
    .trim()
    .split("\n")
    .map((line, order) => {
      const [time, verb, stack, extra] = line.split(" ");
      return { order, time: Number(time), verb, stack, extra };
    });
  return { ...result, calls };
};

const indexesOf = (calls, verb, stacks) =>
  calls.filter((call) => call.verb === verb && stacks.some((s) => call.stack === PREFIX + s)).map((call) => call.order);

describe("delete-deployment-stacks.sh", { timeout: 30000 }, () => {
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "delete-stacks-"));
    mkdirSync(join(dir, "bin"));
    writeFileSync(join(dir, "bin", "aws"), STUB);
    chmodSync(join(dir, "bin", "aws"), 0o755);
    writeFileSync(join(dir, "calls.log"), "");
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test("phase 2, 3 and 4 deletes start only after every wait of phase 1 has returned", () => {
    const { status, calls } = runScript({ STUB_ABSENT: "SelfDestructStack" });
    expect(status).toBe(0);
    const phaseOneWaits = indexesOf(calls, "wait-return", PHASE_1);
    expect(phaseOneWaits.length).toBeGreaterThan(0);
    for (const later of [PHASE_2, PHASE_3, PHASE_4]) {
      const deletes = indexesOf(calls, "delete", later);
      expect(deletes.length).toBe(later.length);
      expect(Math.min(...deletes)).toBeGreaterThan(Math.max(...phaseOneWaits));
    }
  });

  test("phase 4 starts only after ApiStack's wait has returned", () => {
    const { calls } = runScript();
    const apiWaits = indexesOf(calls, "wait-return", ["ApiStack"]);
    const phaseFourDeletes = indexesOf(calls, "delete", PHASE_4);
    expect(Math.min(...phaseFourDeletes)).toBeGreaterThan(Math.max(...apiWaits));
  });

  test("EdgeStack deletes in the background: phases 3 and 4 start before its wait returns", () => {
    const { status, stdout, calls } = runScript({ STUB_SLOW: "EdgeStack" });
    expect(status).toBe(0);
    const edgeWait = indexesOf(calls, "wait-return", PHASE_2);
    expect(edgeWait.length).toBe(1);
    const phaseThreeFourDeletes = indexesOf(calls, "delete", [...PHASE_3, ...PHASE_4]);
    expect(phaseThreeFourDeletes.length).toBe(PHASE_3.length + PHASE_4.length);
    expect(Math.max(...phaseThreeFourDeletes)).toBeLessThan(edgeWait[0]);
    expect(stdout).toContain(`Deleting ${PREFIX}EdgeStack in us-east-1`);
    expect(stdout.indexOf("Deleting " + PREFIX + "EdgeStack")).toBeLessThan(stdout.indexOf("=== Stack deletion complete ==="));
  });

  test("the script ends only after EdgeStack's wait has returned", () => {
    const { calls } = runScript({ STUB_SLOW: "EdgeStack" });
    const edgeWait = indexesOf(calls, "wait-return", PHASE_2);
    const lastCall = calls[calls.length - 1];
    expect(lastCall.order).toBeGreaterThanOrEqual(edgeWait[0]);
  });

  test("ApiRoutesStack finishes before ApiStack starts", () => {
    const { calls } = runScript();
    const routesWait = indexesOf(calls, "wait-return", ["ApiRoutesStack"]);
    const apiDelete = indexesOf(calls, "delete", ["ApiStack"]);
    expect(Math.min(...apiDelete)).toBeGreaterThan(Math.max(...routesWait));
  });

  test("all nine phase 4 deletes start before the first of them finishes", () => {
    const { calls } = runScript();
    const deletes = indexesOf(calls, "delete", PHASE_4);
    const waits = indexesOf(calls, "wait-return", PHASE_4);
    expect(deletes.length).toBe(9);
    expect(Math.max(...deletes)).toBeLessThan(Math.min(...waits));
  });

  test("a missing stack is skipped and the others still delete", () => {
    const { status, stdout, calls } = runScript({ STUB_ABSENT: "SelfDestructStack" });
    expect(status).toBe(0);
    expect(stdout).toContain(`${PREFIX}SelfDestructStack does not exist in eu-west-2, skipping`);
    expect(calls.some((call) => call.verb === "delete" && call.stack === `${PREFIX}SelfDestructStack`)).toBe(false);
    expect(stdout).toContain("=== Stack deletion complete ===");
  });

  test("a stack in DELETE_FAILED is deleted again with FORCE_DELETE_STACK", () => {
    const { status, stdout, calls } = runScript({ STUB_FAILED: "HmrcStack" });
    expect(status).toBe(0);
    expect(stdout).toContain(`${PREFIX}HmrcStack is DELETE_FAILED, force deleting`);
    expect(calls.filter((call) => call.verb === "force-delete").map((call) => call.stack)).toEqual([`${PREFIX}HmrcStack`]);
  });

  test("each stack's output is printed once, after its wave", () => {
    const { stdout } = runScript();
    for (const stack of PHASE_4) {
      expect(stdout.split(`Deleting ${PREFIX}${stack} in eu-west-2`).length - 1).toBe(1);
    }
  });

  test("a stack that imports an export of another stack in its wave makes the wave serial", () => {
    const exportName = "export-from-auth";
    const { status, stdout, calls } = runScript({
      STUB_EXPORTS: `${exportName}\tarn:aws:cloudformation:eu-west-2:123456789012:stack/${PREFIX}AuthStack/guid-1\nunrelated\tarn:aws:cloudformation:eu-west-2:123456789012:stack/other-app-AuthStack/guid-2`,
      STUB_IMPORTS: `${exportName}=${PREFIX}McpStack`,
    });
    expect(status).toBe(0);
    expect(stdout).toContain("Phase 4: a stack in this wave imports an export of another stack in it, deleting one at a time:");
    expect(stdout).toContain(`${PREFIX}McpStack ${PREFIX}AuthStack`);
    // Serial: each phase 4 stack's wait returns before the next stack's delete starts.
    const events = calls.filter(
      (call) => PHASE_4.some((s) => call.stack === PREFIX + s) && (call.verb === "delete" || call.verb === "wait-return"),
    );
    expect(events.map((call) => call.verb)).toEqual(PHASE_4.flatMap(() => ["delete", "wait-return"]));
    expect(existsSync(join(dir, "calls.log"))).toBe(true);
  });

  test("an export with no importer leaves the wave parallel", () => {
    const { stdout, calls } = runScript({
      STUB_EXPORTS: `export-from-auth\tarn:aws:cloudformation:eu-west-2:123456789012:stack/${PREFIX}AuthStack/guid-1`,
    });
    expect(stdout).not.toContain("deleting one at a time");
    expect(calls.some((call) => call.verb === "list-imports")).toBe(true);
    const deletes = indexesOf(calls, "delete", PHASE_4);
    const waits = indexesOf(calls, "wait-return", PHASE_4);
    expect(Math.max(...deletes)).toBeLessThan(Math.min(...waits));
  });

  test("the script needs one deployment name", () => {
    const result = spawnSync("/bin/bash", [SCRIPT], { encoding: "utf8" });
    expect(result.status).toBe(2);
  });
});
