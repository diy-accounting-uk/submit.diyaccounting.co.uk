// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Pre Token Generation Lambda trigger for Cognito User Pool.
// Injects custom:mfa_method claim into ID tokens when the user has TOTP MFA configured.
// This is needed because Cognito does not populate the amr claim for native TOTP auth,
// and cognito:preferred_mfa_setting is not passed in event.request.userAttributes.

import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";
import { LambdaClient, InvokeCommand } from "@aws-sdk/client-lambda";

const client = new CognitoIdentityProviderClient();
const lambdaClient = new LambdaClient();

// Cognito's own trigger timeout (IdentityStack.java sets this Lambda's timeout to 5 seconds), so
// the invoke below must return well inside it. InvocationType "Event" doesn't wait for the target
// to finish, so this bound is only for the SDK call that hands the invocation off.
const SIGN_IN_ACTIVITY_INVOKE_TIMEOUT_MS = 2000;

export const handler = async (event) => {
  const userPoolId = event.userPoolId;
  const userName = event.userName;

  console.log("Pre Token Generation trigger:", event.triggerSource, "user:", userName);

  try {
    const response = await client.send(
      new AdminGetUserCommand({
        UserPoolId: userPoolId,
        Username: userName,
      }),
    );

    const preferredMfa = response.PreferredMfaSetting;
    console.log("PreferredMfaSetting:", preferredMfa);

    if (preferredMfa === "SOFTWARE_TOKEN_MFA") {
      event.response = {
        claimsOverrideDetails: {
          claimsToAddOrOverride: {
            "custom:mfa_method": "TOTP",
          },
        },
      };
      console.log("Added custom:mfa_method=TOTP claim for user:", userName);
    }
  } catch (error) {
    // Log but don't fail the auth flow — missing MFA claim is better than blocked login
    console.error("Failed to look up user MFA setting:", error.message);
  }

  await triggerSignInActivityPublish(event);

  return event;
};

/**
 * Hand this token issue off to the signInActivityPublish Lambda, fire-and-forget. Never throws
 * and never blocks the token: a failed or slow invoke is logged and swallowed, so a sign-in or
 * refresh always completes even when the activity pipeline is unavailable.
 *
 * @param {Object} event - the Pre Token Generation event
 */
async function triggerSignInActivityPublish(event) {
  const functionName = process.env.SIGN_IN_ACTIVITY_FUNCTION_NAME;
  if (!functionName) return;

  try {
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: functionName,
        InvocationType: "Event",
        Payload: Buffer.from(
          JSON.stringify({
            triggerSource: event.triggerSource,
            clientId: event.callerContext?.clientId,
            userName: event.userName,
            sub: event.request?.userAttributes?.sub,
            email: event.request?.userAttributes?.email,
            identities: event.request?.userAttributes?.identities,
          }),
        ),
      }),
      { abortSignal: AbortSignal.timeout(SIGN_IN_ACTIVITY_INVOKE_TIMEOUT_MS) },
    );
  } catch (error) {
    console.error("Failed to invoke signInActivityPublish:", error.message);
  }
}
