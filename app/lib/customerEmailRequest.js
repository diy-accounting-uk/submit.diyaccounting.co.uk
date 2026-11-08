// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-27 Email the customer after a key event
// - **Use when:** a handler must send the customer an email after a subscription, a filed receipt, or a pass generated or redeemed.
// - **Does:** requestCustomerEmail puts one CustomerEmailRequest on the activity bus and never throws. The customerEmailSend worker renders the message and sends it through SES. The customerEmailEvent function records bounces and complaints.
// - **Run:** `import { requestCustomerEmail } from "app/lib/customerEmailRequest.js"`
// - **Entry:** `app/lib/customerEmailRequest.js:requestCustomerEmail`; `app/functions/email/customerEmailSend.js:handler`; `app/functions/email/customerEmailEvent.js:handler`
// - **Files:** app/lib/customerEmailRequest.js, app/lib/customerEmailTemplates.js, app/lib/passMedia.js, app/services/customerEmailSender.js, app/functions/email/customerEmailSend.js, app/functions/email/customerEmailEvent.js, app/unit-tests/lib/customerEmailRequest.test.js, app/unit-tests/lib/customerEmailTemplates.test.js, app/unit-tests/lib/passMedia.test.js, app/unit-tests/services/customerEmailSender.test.js, app/unit-tests/functions/customerEmailSend.test.js, app/unit-tests/functions/customerEmailEvent.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/EmailStack.java, .github/workflows/customer-email-proof.yml
// - **Keywords:** customer email, ses, transactional email, receipt email, pass email, subscription email, bounce, complaint
// - **Related:** DATA-01, OPS-182, OPS-181, SITE-29
// @end-capability

// app/lib/customerEmailRequest.js

import { randomUUID } from "node:crypto";
import { EventBridgeClient, PutEventsCommand } from "@aws-sdk/client-eventbridge";
import { createLogger, context } from "./logger.js";
import { resolveActivityBusRegion } from "./activityAlert.js";
import { emitMetric } from "./emfMetrics.js";

const logger = createLogger({ source: "app/lib/customerEmailRequest.js" });

const ebClient = new EventBridgeClient({ region: resolveActivityBusRegion() });

// A kind that goes to the operator carries no customer account. Every other kind names one.
const ACCOUNTLESS_KINDS = new Set(["notice-digest"]);

/** True when a request of this kind names a customer account. */
export function kindHasAccount(kind) {
  return !ACCOUNTLESS_KINDS.has(kind);
}

/**
 * Ask for one customer email. The request goes to the activity bus; a worker resolves the address,
 * renders the message and sends it. The call never throws, so a failed request never fails the
 * event that caused it.
 *
 * A request holds references and short fields only. A receipt travels as its receiptId.
 *
 * @param {Object} params
 * @param {"subscription-started"|"submission-receipt"|"pass-generated"|"pass-redeemed"|"notice-digest"} params.kind
 * @param {string} [params.userSub] - Raw sub of the account; the worker finds the address from it
 * @param {string} [params.to] - Address, only for a caller that has no raw sub (the billing webhook)
 * @param {string} [params.hashedSub] - Hashed sub, for a caller that has no raw sub
 * @param {boolean} [params.synthetic] - True when a test or sandbox flow caused the event
 * @param {Object} [params.data] - Short fields the template reads
 * @returns {Promise<{requested: boolean}>}
 */
export async function requestCustomerEmail({ kind, userSub, to, hashedSub, synthetic = false, data }) {
  const busName = process.env.ACTIVITY_BUS_NAME;
  if (!busName) {
    logger.info({ message: "ACTIVITY_BUS_NAME not set, skipping customer email request", kind });
    return { requested: false };
  }
  const userId = userSub || hashedSub;
  if (!userId && kindHasAccount(kind)) {
    logger.warn({ message: "Customer email request has no account reference", kind });
    return { requested: false };
  }
  const requestId = context.get("requestId") || randomUUID();
  try {
    const result = await ebClient.send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: busName,
            Source: "diy.submit",
            DetailType: "CustomerEmailRequest",
            Detail: JSON.stringify({
              userId,
              requestId,
              payload: { kind, userSub, to, hashedSub, synthetic: Boolean(synthetic), data },
            }),
          },
        ],
      }),
    );
    if (result?.FailedEntryCount > 0) {
      throw Object.assign(new Error("PutEventsFailedEntry"), { name: "PutEventsFailedEntry" });
    }
    logger.info({ message: "Customer email requested", kind, requestId });
    return { requested: true };
  } catch (err) {
    logger.warn({ message: "Customer email request failed", kind, requestId, errorName: err.name });
    emitMetric({
      namespace: "Submit/Business",
      metricName: "CustomerEmailFailure",
      dimensions: { Actor: synthetic ? "test-user" : "customer" },
    });
    return { requested: false };
  }
}
