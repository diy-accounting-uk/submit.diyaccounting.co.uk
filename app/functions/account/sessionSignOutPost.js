// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/account/sessionSignOutPost.js
//
// Authenticated sign-out for all three Cognito app clients (submit, books, mcp), behind the
// all-clients JWT authoriser (ApiStack.java). Publishes the "logout" activity event this
// client's session item names, then deletes that item -- see PLAN_SIGN_IN_PARITY.md "The
// session rule".

import { createLogger } from "../../lib/logger.js";
import { extractUserFromAuthorizerContext, http200OkResponse, http401UnauthorizedResponse } from "../../lib/httpResponseHelper.js";
import { registerLambdaRoute } from "../../lib/httpServerToLambdaAdaptor.js";
import { respondWithDiyaGlCors } from "../../lib/diyaGlCors.js";
import { resolveAppClient } from "../../lib/appClientResolver.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { getSignInSession, deleteSignInSession } from "../../data/dynamoDbSecurityStateRepository.js";
import { publishActivityEvent, classifyActor, maskEmail } from "../../lib/activityAlert.js";

const logger = createLogger({ source: "app/functions/account/sessionSignOutPost.js" });

/* v8 ignore start */
export function apiEndpoint(app) {
  registerLambdaRoute(app, "post", "/api/v1/session/sign-out", ingestHandler);
}
/* v8 ignore stop */

export async function ingestHandler(event) {
  return respondWithDiyaGlCors(event, async ({ request, corsHeaders }) => {
    const user = extractUserFromAuthorizerContext(event);
    if (!user) {
      return http401UnauthorizedResponse({ request, headers: corsHeaders, message: "Authentication required" });
    }

    await initializeSalt();
    const appClient = await resolveAppClient(user.appClientId);
    const hashedSub = hashSub(user.sub);
    const session = appClient ? await getSignInSession(hashedSub, appClient) : null;

    await publishActivityEvent({
      event: "logout",
      summary: `Logout: ${maskEmail(user.email)}`,
      actor: classifyActor(user.email),
      flow: "user-journey",
      userSub: user.sub,
      appClient,
      sessionId: session?.sessionId,
    });

    if (appClient) {
      await deleteSignInSession(hashedSub, appClient);
    } else {
      logger.warn({ message: "Sign-out with an unresolved app client; no session item to delete", appClientId: user.appClientId });
    }

    return http200OkResponse({ request, headers: corsHeaders, data: { ok: true } });
  });
}
