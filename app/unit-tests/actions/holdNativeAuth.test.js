// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/actions/holdNativeAuth.test.js

import { describe, test, expect, vi, afterEach } from "vitest";
import { GetParameterCommand, PutParameterCommand } from "@aws-sdk/client-ssm";

import {
  holdersParameterName,
  isHolderStale,
  addHolder,
  removeHolder,
  applyHold,
  scriptHolder,
} from "../../../.github/actions/hold-native-auth/hold-native-auth.mjs";

const NOW_MS = Date.parse("2026-09-27T00:00:00.000Z");
const STALE_AFTER_MS = 4 * 60 * 60 * 1000;

function holder(id, since = "2026-09-26T23:59:00.000Z", runId = "36278688448") {
  return { id, runId, workflow: "probe-test", since };
}

describe("holdersParameterName", () => {
  test("scopes the parameter to the environment", () => {
    expect(holdersParameterName("prod")).toBe("/submit/prod/native-auth-holders");
    expect(holdersParameterName("ci")).toBe("/submit/ci/native-auth-holders");
  });
});

describe("isHolderStale", () => {
  test("is held just inside the staleness window with its run still unfinished", () => {
    expect(isHolderStale(holder("run-1"), { nowMs: NOW_MS, staleAfterMs: STALE_AFTER_MS, runFinished: false })).toBe(false);
  });

  test("is stale once it has outlived the staleness window even with its run unfinished", () => {
    const oldHolder = holder("run-1", "2026-09-26T19:00:00.000Z");
    expect(isHolderStale(oldHolder, { nowMs: NOW_MS, staleAfterMs: STALE_AFTER_MS, runFinished: false })).toBe(true);
  });

  test("is stale once its run has finished, even inside the staleness window", () => {
    expect(isHolderStale(holder("run-1"), { nowMs: NOW_MS, staleAfterMs: STALE_AFTER_MS, runFinished: true })).toBe(true);
  });

  test("is held while its run's status could not be determined", () => {
    expect(isHolderStale(holder("run-1"), { nowMs: NOW_MS, staleAfterMs: STALE_AFTER_MS, runFinished: null })).toBe(false);
  });

  test("is stale when its timestamp cannot be parsed", () => {
    expect(isHolderStale(holder("run-1", "not-a-timestamp"), { nowMs: NOW_MS, staleAfterMs: STALE_AFTER_MS, runFinished: false })).toBe(
      true,
    );
  });
});

describe("addHolder", () => {
  test("appends a new holder", () => {
    const holders = addHolder([holder("run-1")], holder("run-2"));
    expect(holders.map((h) => h.id)).toEqual(["run-1", "run-2"]);
  });

  test("is idempotent against a holder with the same id already present", () => {
    const existing = [holder("run-1")];
    expect(addHolder(existing, holder("run-1", "2026-09-27T00:00:00.000Z"))).toEqual(existing);
  });

  test("appends to an empty list", () => {
    expect(addHolder([], holder("run-1"))).toEqual([holder("run-1")]);
  });
});

describe("removeHolder", () => {
  test("removes the holder matching the given id", () => {
    const holders = removeHolder([holder("run-1"), holder("run-2")], "run-1");
    expect(holders.map((h) => h.id)).toEqual(["run-2"]);
  });

  test("is a no-op when no holder matches the given id", () => {
    const holders = [holder("run-1")];
    expect(removeHolder(holders, "run-2")).toEqual(holders);
  });

  test("against an empty list returns an empty list", () => {
    expect(removeHolder([], "run-1")).toEqual([]);
  });
});

describe("scriptHolder", () => {
  test("inside a workflow run, holds for that run and job", () => {
    const env = { GITHUB_RUN_ID: "45240940814", GITHUB_JOB: "exploratory", GITHUB_WORKFLOW: "test-behaviour" };
    expect(scriptHolder(env, { username: "runner", hostname: "fv-az1" })).toEqual({
      id: "45240940814-exploratory-native-test",
      runId: "45240940814",
      workflow: "test-behaviour",
    });
  });

  test("on a person's machine, holds for that user and host, with no run", () => {
    expect(scriptHolder({}, { username: "jo", hostname: "laptop" })).toEqual({ id: "local-jo@laptop", runId: null, workflow: "local" });
  });
});

// An SSM client that keeps one parameter in memory, so the read-modify-write and its read-back
// run as they do against SSM.
function memorySsmClient(initialHolders) {
  let value = initialHolders === undefined ? undefined : JSON.stringify(initialHolders);
  return {
    holders: () => (value === undefined ? undefined : JSON.parse(value)),
    send: async (command) => {
      if (command instanceof GetParameterCommand) {
        if (value === undefined) throw Object.assign(new Error("not found"), { name: "ParameterNotFound" });
        return { Parameter: { Value: value } };
      }
      if (command instanceof PutParameterCommand) {
        value = command.input.Value;
        return {};
      }
      throw new Error(`unexpected command ${command.constructor.name}`);
    },
  };
}

describe("applyHold", () => {
  const LOCAL = { id: "local-jo@laptop", runId: null, workflow: "local" };
  const WORKFLOW = { id: "36278688448", runId: "36278688448", workflow: "video-capture" };
  const recent = () => new Date(Date.now() - 60 * 1000).toISOString();

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("enable adds the holder to an environment with no holders and turns native auth on", async () => {
    const ssmClient = memorySsmClient(undefined);
    const toggle = vi.fn();

    const result = await applyHold({
      mode: "enable",
      environmentName: "prod",
      holder: LOCAL,
      ssmClient,
      staleAfterMs: STALE_AFTER_MS,
      toggle,
    });

    expect(toggle).toHaveBeenCalledWith("enable");
    expect(result.toggled).toBe("enable");
    expect(ssmClient.holders().map((each) => each.id)).toEqual(["local-jo@laptop"]);
  });

  test("a workflow's disable leaves native auth on while a local enable still holds it", async () => {
    const ssmClient = memorySsmClient([
      { ...LOCAL, since: recent() },
      { ...WORKFLOW, since: recent() },
    ]);
    const toggle = vi.fn();

    const result = await applyHold({
      mode: "disable",
      environmentName: "prod",
      holder: WORKFLOW,
      ssmClient,
      staleAfterMs: STALE_AFTER_MS,
      toggle,
    });

    expect(toggle).not.toHaveBeenCalled();
    expect(result.toggled).toBeNull();
    expect(ssmClient.holders().map((each) => each.id)).toEqual(["local-jo@laptop"]);
  });

  test("a local disable leaves native auth on while a workflow still holds it", async () => {
    const ssmClient = memorySsmClient([
      { ...WORKFLOW, since: recent() },
      { ...LOCAL, since: recent() },
    ]);
    const toggle = vi.fn();

    await applyHold({ mode: "disable", environmentName: "prod", holder: LOCAL, ssmClient, staleAfterMs: STALE_AFTER_MS, toggle });

    expect(toggle).not.toHaveBeenCalled();
    expect(ssmClient.holders().map((each) => each.id)).toEqual(["36278688448"]);
  });

  test("the last holder's disable turns native auth off", async () => {
    const ssmClient = memorySsmClient([{ ...LOCAL, since: recent() }]);
    const toggle = vi.fn();

    const result = await applyHold({
      mode: "disable",
      environmentName: "prod",
      holder: LOCAL,
      ssmClient,
      staleAfterMs: STALE_AFTER_MS,
      toggle,
    });

    expect(toggle).toHaveBeenCalledWith("disable");
    expect(result.toggled).toBe("disable");
    expect(ssmClient.holders()).toEqual([]);
  });

  test("a local holder is never looked up on GitHub, and goes once it outlives the staleness window", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const oldLocal = { ...LOCAL, since: new Date(Date.now() - STALE_AFTER_MS - 60 * 1000).toISOString() };
    const ssmClient = memorySsmClient([oldLocal]);
    const toggle = vi.fn();

    await applyHold({
      mode: "disable",
      environmentName: "prod",
      holder: WORKFLOW,
      ssmClient,
      staleAfterMs: STALE_AFTER_MS,
      repository: "diy-accounting-uk/submit.diyaccounting.co.uk",
      token: "token",
      toggle,
    });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(toggle).toHaveBeenCalledWith("disable");
  });

  test("with no token, another workflow's holder is kept inside the staleness window", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const ssmClient = memorySsmClient([{ ...WORKFLOW, since: recent() }]);
    const toggle = vi.fn();

    await applyHold({ mode: "disable", environmentName: "prod", holder: LOCAL, ssmClient, staleAfterMs: STALE_AFTER_MS, toggle });

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(toggle).not.toHaveBeenCalled();
    expect(ssmClient.holders().map((each) => each.id)).toEqual(["36278688448"]);
  });
});
