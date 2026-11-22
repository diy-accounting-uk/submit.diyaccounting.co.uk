// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/services/cognitoAccountCreation.js
// When an account was created, as its user pool records it: one read of the user by its name.

import { CognitoIdentityProviderClient, AdminGetUserCommand } from "@aws-sdk/client-cognito-identity-provider";

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || "eu-west-2" });

/**
 * The time the user pool created the account. An environment with no user pool (the local
 * simulator and proxy sign in through a stand-in) has no creation time to read.
 * @param {string} username - the token's username, or the account's sub
 * @returns {Promise<Date|undefined>}
 */
export async function accountCreatedAt(username) {
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) return undefined;
  const user = await cognito.send(new AdminGetUserCommand({ UserPoolId: userPoolId, Username: username }));
  return user.UserCreateDate ? new Date(user.UserCreateDate) : undefined;
}
