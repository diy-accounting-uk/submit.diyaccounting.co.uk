// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Pre Token Generation Lambda trigger for Cognito User Pool.
// Injects custom:mfa_method claim into ID tokens when the user has TOTP MFA configured.
// This is needed because Cognito does not populate the amr claim for native TOTP auth,
// and cognito:preferred_mfa_setting is not passed in event.request.userAttributes.

import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient();

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

  return event;
};
