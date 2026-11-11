// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// The --scenario mode of scripts/hmrc-tpvs-ct600.js: read the arguments, file the scenario, print
// one summary line and return the exit code. A scenario the product refuses prints the field and
// message instead of a stack trace.

import { readEtsInputs } from "./etsCt600.js";
import { readScenario, runScenario } from "./ctScenario.js";

const DEFAULT_TPVS_UTR = "8596148860";

function argument(argv, name, fallback) {
  const index = argv.indexOf(name);
  return index === -1 ? fallback : argv[index + 1];
}

/**
 * @param {{argv: string[], env: Record<string, string|undefined>, run?: typeof runScenario, log?: (line: string) => void}} input
 * @returns {Promise<number>} the process exit code
 */
export async function runScenarioCommand({ argv, env, run = runScenario, log = console.log }) {
  const file = argument(argv, "--scenario", undefined);
  if (!file || file.startsWith("--")) {
    log("--scenario needs a scenario file");
    return 1;
  }
  let scenario;
  let etsInputs;
  try {
    scenario = readScenario(file);
    etsInputs = argv.includes("--ets") ? readEtsInputs(env) : undefined;
  } catch (error) {
    log(error.message);
    return 1;
  }
  const utr = etsInputs ? etsInputs.utr : argument(argv, "--utr", DEFAULT_TPVS_UTR);
  const outDirectory = argument(argv, "--out", "target/ct-scenarios");
  const { exitCode, result } = await run({
    scenario,
    outDirectory,
    utr,
    ets: etsInputs ? { senderId: etsInputs.senderId, password: etsInputs.password, vendorId: etsInputs.vendorId } : undefined,
  });
  if (result.outcome === "refused") {
    log(`${scenario.name}: refused by the product at ${result.field}: ${result.message}`);
  } else {
    log(
      `${scenario.name}: ${result.outcome} by ${result.service.toUpperCase()}; IRmark ${result.irmark}; ` +
        `${result.errors.length} error(s) ${result.errors.map((error) => `${error.number ?? ""} ${error.text}`.trim()).join(" | ")}`,
    );
  }
  return exitCode;
}
