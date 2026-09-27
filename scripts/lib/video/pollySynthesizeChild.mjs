// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/pollySynthesizeChild.mjs
//
// A single Polly SynthesizeSpeech call, run as its own process. narration.js spawns this rather
// than calling PollyClient in the capture script's own process: alongside that process's other
// concurrent work (a local server, dynalite, a screencast-recording browser), the same in-process
// call fails consistently — an HTTP/2 protocol error, or (forced to HTTP/1.1) a well-formed but
// rejected request (Polly returns UnknownOperationException) — while the identical call in a
// fresh process succeeds when that other work is quiet. Under heavier concurrent load the call has
// also hung outright with no network error at all, so both the request handler and this whole
// process carry an explicit ceiling: a hang becomes a clean, retryable failure instead of a run
// that never finishes. Parameters travel by environment variable (no shell, no escaping); the
// audio bytes are written straight to POLLY_OUTPUT_PATH.

import fs from "node:fs";
import { PollyClient, SynthesizeSpeechCommand } from "@aws-sdk/client-polly";
import { NodeHttpHandler } from "@smithy/node-http-handler";

const text = process.env.POLLY_TEXT;
const outputPath = process.env.POLLY_OUTPUT_PATH;
const voiceId = process.env.POLLY_VOICE_ID;
const engine = process.env.POLLY_ENGINE;
const region = process.env.POLLY_REGION;

if (!text || !outputPath || !voiceId || !engine || !region) {
  process.stderr.write("pollySynthesizeChild: missing one of POLLY_TEXT, POLLY_OUTPUT_PATH, POLLY_VOICE_ID, POLLY_ENGINE, POLLY_REGION\n");
  process.exit(1);
}

const WATCHDOG_MS = 20000;
const watchdog = setTimeout(() => {
  process.stderr.write(`pollySynthesizeChild: no response within ${WATCHDOG_MS}ms, giving up\n`);
  process.exit(1);
}, WATCHDOG_MS);

const client = new PollyClient({
  region,
  requestHandler: new NodeHttpHandler({ connectionTimeout: 8000, requestTimeout: 15000 }),
});
try {
  const response = await client.send(new SynthesizeSpeechCommand({ Text: text, VoiceId: voiceId, Engine: engine, OutputFormat: "mp3" }));
  const audio = await response.AudioStream.transformToByteArray();
  fs.writeFileSync(outputPath, audio);
  clearTimeout(watchdog);
} catch (error) {
  clearTimeout(watchdog);
  process.stderr.write(`pollySynthesizeChild: ${error.message}\n`);
  process.exit(1);
}
