// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability HMRC-42 Queue a new fraud prevention header shape for HMRC's validator
// - **Use when:** a request to HMRC has a fraud prevention header structure that the validator consumer has not checked today.
// - **Does:** enqueueFraudPreventionHeaderCheck reduces the headers of an HMRC request to a shape, keeps the shape hashes each warm Lambda has seen today, and sends one SQS message for a shape it has not seen. The message holds the shape and the API template, with no header value. It is best effort: a failed or slow send is logged and never reaches the caller, and the caller does not wait for it.
// - **Run:** `import { enqueueFraudPreventionHeaderCheck } from "app/lib/fraudPreventionHeaderCheckQueue.js"`
// - **Entry:** `app/lib/fraudPreventionHeaderCheckQueue.js:enqueueFraudPreventionHeaderCheck`
// - **Files:** app/lib/fraudPreventionHeaderCheckQueue.js, app/unit-tests/lib/fraudPreventionHeaderCheckQueue.test.js
// - **Keywords:** fraud prevention headers, sqs, validator queue, shape sampling, best effort
// - **Related:** HMRC-41, HMRC-43
// @end-capability

// app/lib/fraudPreventionHeaderCheckQueue.js

import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { createLogger } from "./logger.js";
import { fraudPreventionHeaderShape } from "./fraudPreventionHeaderShape.js";

const logger = createLogger({ source: "app/lib/fraudPreventionHeaderCheckQueue.js" });

export const FPH_CHECK_USER_ID = "fph-check";

let sqsClient;
let seenDay;
let seenShapes = new Set();

function client() {
  sqsClient ??= new SQSClient({ region: process.env.AWS_REGION || "eu-west-2" });
  return sqsClient;
}

/**
 * Send one message for a header shape this container has not queued today. The shape holds no
 * header value. Never throws.
 * @param {{api: string, headers: object|Headers, now?: Date}} request
 * @returns {Promise<void>}
 */
export async function enqueueFraudPreventionHeaderCheck({ api, headers, now = new Date() }) {
  try {
    const queueUrl = process.env.FPH_CHECK_QUEUE_URL;
    if (!queueUrl) return;
    const described = fraudPreventionHeaderShape(headers);
    if (!described) return;
    const day = now.toISOString().slice(0, 10);
    if (day !== seenDay) {
      seenDay = day;
      seenShapes = new Set();
    }
    if (seenShapes.has(described.shapeHash)) return;
    seenShapes.add(described.shapeHash);
    const payload = { shapeHash: described.shapeHash, firstSeenAt: now.toISOString(), api, shape: described.shape };
    await client().send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({ userId: FPH_CHECK_USER_ID, requestId: described.shapeHash, payload }),
      }),
    );
  } catch (error) {
    logger.warn({ message: "Fraud prevention header check not queued", error: error?.message });
  }
}

/** Forget the shapes seen so far. For tests. */
export function resetFraudPreventionHeaderCheckQueueForTest() {
  seenDay = undefined;
  seenShapes = new Set();
  sqsClient = undefined;
}
