// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Pre sign-up Lambda trigger for the Cognito User Pool.
// When a person signs in for the first time with a second identity provider, and that provider
// asserts the same email address as one existing profile, the new identity is linked to that
// profile. The person then keeps one sub, so bundles, passes and every customer record follow
// them across providers.

import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminLinkProviderForUserCommand,
} from "@aws-sdk/client-cognito-identity-provider";

const client = new CognitoIdentityProviderClient();

// The provider name and the provider's own user id from a federated userName such as
// "Google_1234" or "Microsoft_AAAAAA". Provider names hold no underscore.
export function parseFederatedUserName(userName) {
  const separator = (userName || "").indexOf("_");
  if (separator <= 0 || separator === userName.length - 1) return null;
  return { providerName: userName.slice(0, separator), providerUserId: userName.slice(separator + 1) };
}

// True when the provider asserts that the person owns the address. Google says so per address
// with email_verified. A Microsoft consumers account signs in with its email address.
export function isTrustedEmail(providerName, attributes) {
  const email = String(attributes?.email || "").toLowerCase();
  if (!email) return false;
  switch (providerName) {
    case "Google":
      return String(attributes.email_verified).toLowerCase() === "true";
    case "Microsoft":
      return true;
    default:
      return false;
  }
}

// The DestinationUser for AdminLinkProviderForUser. A native profile is named by its username
// under ProviderName "Cognito". A profile that a provider created at its first sign-in has the
// username "<provider>_<id>" and lists that provider in its identities attribute; it is named by
// the provider and the provider's own user id.
export function destinationFor(user) {
  const identitiesValue = (user.Attributes || []).find((attribute) => attribute.Name === "identities")?.Value;
  let identities;
  try {
    identities = identitiesValue ? JSON.parse(identitiesValue) : [];
  } catch {
    identities = [];
  }
  const federated = parseFederatedUserName(user.Username);
  const createdByProvider =
    federated &&
    Array.isArray(identities) &&
    identities.some((identity) => identity.providerName === federated.providerName && identity.userId === federated.providerUserId);
  if (createdByProvider) {
    return {
      ProviderName: federated.providerName,
      ProviderAttributeName: "Cognito_Subject",
      ProviderAttributeValue: federated.providerUserId,
    };
  }
  return { ProviderName: "Cognito", ProviderAttributeValue: user.Username };
}

export const handler = async (event) => {
  if (event.triggerSource !== "PreSignUp_ExternalProvider") return event;

  const federated = parseFederatedUserName(event.userName);
  const attributes = event.request?.userAttributes || {};
  // A quote or backslash would break out of the ListUsers filter string.
  if (!federated || !isTrustedEmail(federated.providerName, attributes) || /["\\]/.test(attributes.email)) {
    console.log("Pre sign-up: no link, email not asserted by provider", federated?.providerName);
    return event;
  }

  event.response = { ...(event.response || {}), autoVerifyEmail: true };

  try {
    const listed = await client.send(
      new ListUsersCommand({
        UserPoolId: event.userPoolId,
        Filter: `email = "${attributes.email}"`,
        Limit: 2,
      }),
    );
    const matches = listed.Users || [];
    if (matches.length === 0) {
      console.log("Pre sign-up: no existing profile for this email, provider", federated.providerName);
      return event;
    }
    if (matches.length > 1) {
      console.warn("Pre sign-up: more than one profile has this email, not linking, provider", federated.providerName);
      return event;
    }

    await client.send(
      new AdminLinkProviderForUserCommand({
        UserPoolId: event.userPoolId,
        DestinationUser: destinationFor(matches[0]),
        SourceUser: {
          ProviderName: federated.providerName,
          ProviderAttributeName: "Cognito_Subject",
          ProviderAttributeValue: federated.providerUserId,
        },
      }),
    );
    console.log("Pre sign-up: linked provider", federated.providerName, "to existing profile");
  } catch (error) {
    // A failed lookup or link must not block the sign-in: the person gets a separate profile.
    console.error("Pre sign-up: link failed:", error.name, error.message);
  }

  return event;
};
