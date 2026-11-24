// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability CH-27 Send a company's own Company Tax Return to HMRC as a test in live
// - **Use when:** a company's own return, built from its diya-gl book, must be checked by HMRC's live Transaction Engine against the live rules and the company's records (rule 1610, the period HMRC holds) before it is filed, without filing it.
// - **Does:** hmrc-tpvs-ct600.js --til builds the return, the computations and the accounts from --book, asks for the company's Government Gateway user ID and password at a prompt that does not echo, posts the message to the live Transaction Engine as class HMRC-CT-CT600-TIL with no GatewayTest, polls it to a final response or an error, deletes it with the same class, and writes the transcript with the user ID and password blanked. It refuses --ets, --tamper-irmark, --scenario and --agent, and needs --utr, the three --registered-office options and HMRC_CT_VENDOR_ID.
// - **Run:** `HMRC_CT_VENDOR_ID=<vendor id> node scripts/hmrc-tpvs-ct600.js --til --book <book dir> --micro --utr <company UTR> --registered-office-line1 <line> --registered-office-town <town> --registered-office-postcode <postcode> --out <dir>`
// - **Entry:** `scripts/lib/testInLiveCt600.js:testInLiveRefusals`; `scripts/lib/etsCt600.js:runTestInLiveExchange`; `scripts/hmrc-tpvs-ct600.js`
// - **Files:** scripts/lib/testInLiveCt600.js, scripts/lib/etsCt600.js, scripts/hmrc-tpvs-ct600.js, app/unit-tests/scripts/testInLiveCt600.test.js, app/unit-tests/scripts/etsCt600.test.js
// - **Keywords:** test in live, TIL, HMRC-CT-CT600-TIL, CT600, corporation tax, live transaction engine, government gateway, rule 1610, files nothing
// - **Related:** CH-19
// @end-capability

// The option checks and the credentials prompt for scripts/hmrc-tpvs-ct600.js --til, which sends a
// company's own return to HMRC's live Transaction Engine as a test-in-live message. The Government
// Gateway user ID and password are typed at a prompt that does not echo and stay in memory.

// Options that make a fixture or a test message, which a message to the live service must not carry.
const REFUSED_WITH_TIL = {
  "--ets": "--til goes to HMRC's live service and --ets to the External Test Service; give one of them",
  "--tamper-irmark": "--tamper-irmark is a case of the External Test Service",
  "--scenario": "--scenario builds a return from a scenario file, and --til sends a company's own return from its book",
  "--agent": "--agent files with a fixture client reference",
};
// The live message carries the company's own figures and address, so nothing comes from a default.
const REQUIRED_WITH_TIL = ["--book", "--utr", "--registered-office-line1", "--registered-office-town", "--registered-office-postcode"];

/**
 * The reasons a --til command line cannot run, or an empty list when it can.
 * @param {string[]} args - the command line after the script path
 * @param {Record<string, string|undefined>} env
 * @returns {string[]}
 */
export function testInLiveRefusals(args, env) {
  const refusals = Object.entries(REFUSED_WITH_TIL)
    .filter(([flag]) => args.includes(flag))
    .map(([, reason]) => reason);
  const valueOf = (flag) => {
    const index = args.indexOf(flag);
    const value = index === -1 ? undefined : args[index + 1];
    return value && !value.startsWith("--") ? value : undefined;
  };
  const missing = REQUIRED_WITH_TIL.filter((flag) => !valueOf(flag));
  if (missing.length > 0) refusals.push(`--til needs ${missing.join(", ")}`);
  const utr = valueOf("--utr");
  if (utr && !/^\d{10}$/.test(utr)) refusals.push("--utr must be the company's 10-digit UTR");
  if (!/^\d{4}$/.test((env.HMRC_CT_VENDOR_ID ?? "").trim()))
    refusals.push("--til needs HMRC_CT_VENDOR_ID, the 4-digit vendor ID SDST issues");
  return refusals;
}

/**
 * Read one line from a terminal without echoing it. Backspace removes the last character; Ctrl-C
 * rejects. Only the question is written to the output.
 * @param {string} question
 * @param {object} [streams]
 * @param {NodeJS.ReadStream} [streams.input] - a terminal
 * @param {NodeJS.WritableStream} [streams.output]
 * @returns {Promise<string>}
 */
export function promptHidden(question, { input = process.stdin, output = process.stderr } = {}) {
  if (!input.isTTY)
    return Promise.reject(new Error("The Government Gateway credentials are typed at a terminal; standard input is not one"));
  output.write(question);
  input.setRawMode(true);
  input.setEncoding("utf8");
  input.resume();
  return new Promise((resolve, reject) => {
    let value = "";
    const finish = (settle) => {
      input.removeListener("data", onData);
      input.setRawMode(false);
      input.pause();
      output.write("\n");
      settle();
    };
    function onData(chunk) {
      for (const character of chunk) {
        if (character === "\r" || character === "\n") return finish(() => resolve(value));
        if (character === "\u0003") return finish(() => reject(new Error("Cancelled at the prompt; nothing was sent to HMRC")));
        if (character === "\u007f" || character === "\b") value = value.slice(0, -1);
        else value += character;
      }
      return undefined;
    }
    input.on("data", onData);
  });
}

/**
 * Ask for the company's Government Gateway user ID and password, neither echoed.
 * @param {object} [streams] - as promptHidden
 * @returns {Promise<{senderId: string, password: string}>}
 */
export async function promptGatewayCredentials(streams) {
  const senderId = await promptHidden("Government Gateway user ID (not shown): ", streams);
  const password = await promptHidden("Government Gateway password (not shown): ", streams);
  if (!senderId || !password) throw new Error("The Government Gateway user ID and password are both needed; nothing was sent to HMRC");
  return { senderId, password };
}
