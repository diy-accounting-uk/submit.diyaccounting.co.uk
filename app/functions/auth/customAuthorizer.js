// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/auth/customAuthorizer.js
// Custom Lambda authorizer that extracts JWT from X-Authorization header
// and validates it against Cognito, similar to native JWT authorizer

import { createLogger } from "../../lib/logger.js";
import { CognitoJwtVerifier } from "aws-jwt-verify";
import { CognitoIdentityProviderClient, AdminUserGlobalSignOutCommand } from "@aws-sdk/client-cognito-identity-provider";
import { getHeader } from "../../lib/httpResponseHelper.js";
import { initializeSalt, hashSub } from "../../services/subHasher.js";
import { publishActivityEvent } from "../../lib/activityAlert.js";
import { getSessionGeo, putSessionGeo } from "../../data/dynamoDbSecurityStateRepository.js";

const logger = createLogger({ source: "app/functions/auth/customAuthorizer.js" });

// Cache the verifier instance across Lambda invocations
let verifier = null;

/**
 * The client ids this authorizer accepts: the main Submit client, plus the submission MCP's
 * own client once COGNITO_MCP_CLIENT_ID is set (Decisions 4 -- the MCP's HMRC and Companies
 * House calls authenticate with its own sign-in instead of a copied Submit token). Blank until
 * the deploy wiring sets it, so an unset value changes nothing here.
 *
 * @returns {string[]}
 */
function acceptedClientIds() {
  const ids = [process.env.COGNITO_USER_POOL_CLIENT_ID];
  if (process.env.COGNITO_MCP_CLIENT_ID) ids.push(process.env.COGNITO_MCP_CLIENT_ID);
  return ids.filter(Boolean);
}

// A second verifier, for the ID token sent alongside the access token in X-Id-Token (see
// hmrc-service.js's getGovClientHeaders). The access token authorizes the request; the ID token
// is only ever used to read custom:mfa_method and identities for the O28 Gov-Client-Multi-Factor
// build below, so its verification failing never denies a request on its own.
let idTokenVerifier = null;

// Cache the Cognito client across Lambda invocations, same pattern as the JWT verifier.
let cognitoClient = null;

function getCognitoClient() {
  if (!cognitoClient) {
    cognitoClient = new CognitoIdentityProviderClient();
  }
  return cognitoClient;
}

function getVerifier() {
  if (!verifier) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_USER_POOL_CLIENT_ID;

    if (!userPoolId || !clientId) {
      throw new Error("Missing COGNITO_USER_POOL_ID or COGNITO_USER_POOL_CLIENT_ID environment variables");
    }

    verifier = CognitoJwtVerifier.create({
      userPoolId: userPoolId,
      tokenUse: "access",
      clientId: acceptedClientIds(),
    });

    logger.info({
      message: "Created Cognito JWT verifier",
      userPoolId,
      clientId: clientId.substring(0, 8) + "...",
    });
  }
  return verifier;
}

function getIdTokenVerifier() {
  if (!idTokenVerifier) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const clientId = process.env.COGNITO_USER_POOL_CLIENT_ID;

    if (!userPoolId || !clientId) {
      throw new Error("Missing COGNITO_USER_POOL_ID or COGNITO_USER_POOL_CLIENT_ID environment variables");
    }

    idTokenVerifier = CognitoJwtVerifier.create({
      userPoolId: userPoolId,
      tokenUse: "id",
      clientId: acceptedClientIds(),
    });
  }
  return idTokenVerifier;
}

/**
 * True when a verified ID token's `identities` claim shows a federated sign-in (e.g. Google).
 * Cognito carries this claim as a JSON string, not a native array.
 *
 * @param {object} idPayload - verified ID token payload
 * @returns {boolean}
 */
function hasFederatedIdentity(idPayload) {
  const raw = idPayload?.identities;
  if (!raw) return false;
  if (Array.isArray(raw)) return raw.length > 0;
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) && parsed.length > 0;
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Verify the caller's ID token, when sent, and extract the O28 fraud-prevention MFA signal from
 * its claims: custom:mfa_method (set by the Pre Token Generation trigger for TOTP users) and
 * identities (set by Cognito for federated sign-ins). Best-effort -- a missing or unverifiable ID
 * token, or a sub that doesn't match the already-verified access token, leaves the request
 * authorized on the access token alone and simply carries no MFA context forward, rather than
 * denying it.
 *
 * @param {object} headers - the request's headers
 * @param {string} accessTokenSub - the sub already verified from the access token
 * @returns {Promise<{mfaMethod?: string, federated?: boolean, authTime?: string}>}
 */
export async function extractMfaContext(headers, accessTokenSub) {
  const idToken = getHeader(headers, "x-id-token");
  if (!idToken) return {};

  let idPayload;
  try {
    idPayload = await getIdTokenVerifier().verify(idToken);
  } catch (error) {
    logger.warn({
      message: "ID token verification failed; no server-built Gov-Client-Multi-Factor for this request",
      error: error.message,
    });
    return {};
  }

  if (idPayload.sub !== accessTokenSub) {
    logger.warn({ message: "ID token sub does not match the verified access token's sub; ignoring its claims" });
    return {};
  }

  return {
    mfaMethod: idPayload["custom:mfa_method"],
    federated: hasFederatedIdentity(idPayload),
    authTime: idPayload.auth_time !== undefined ? String(idPayload.auth_time) : undefined,
  };
}

// Lambda authorizer ingestHandler
export async function ingestHandler(event) {
  await initializeSalt();
  // HTTP API v2 uses routeArn or methodArn
  const routeArn = event.routeArn || event.methodArn;

  logger.info({
    message: "Custom authorizer invoked",
    routeArn: routeArn,
    requestContext: event.requestContext,
    headers: Object.keys(event.headers || {}),
    identitySource: event.identitySource,
  });

  try {
    // Extract token from X-Authorization header (case-insensitive)
    const headers = event.headers || {};
    const xAuthHeader = getHeader(headers, "x-authorization");

    if (!xAuthHeader) {
      logger.warn({ message: "Missing X-Authorization header", headers: Object.keys(headers) });
      return generateDenyPolicy(routeArn);
    }

    // Extract Bearer token
    const tokenMatch = xAuthHeader.match(/^Bearer (.+)$/i);
    if (!tokenMatch) {
      logger.warn({
        message: "Invalid X-Authorization header format, expected 'Bearer <token>'",
        headerValue: xAuthHeader.substring(0, 20),
      });
      return generateDenyPolicy(routeArn);
    }

    const token = tokenMatch[1].trim();

    const jwtVerifier = getVerifier();
    const payload = await jwtVerifier.verify(token);

    logger.info({
      message: "JWT token verified successfully",
      sub: payload.sub,
      username: payload.username,
      scopes: payload.scope,
    });

    // Mid-session country-change check (issue #10 acceptance criterion 4).
    const countryHeader = getHeader(headers, "cloudfront-viewer-country");
    const countryCheck = await checkCountryChange(payload, countryHeader);
    if (countryCheck.decision === "deny") {
      logger.warn({
        message: "Denying due to session country check",
        reason: countryCheck.reason,
        sub: payload.sub,
      });
      return denyPolicyDocument(routeArn);
    }

    // O28: read the MFA signal off the ID token sent in X-Id-Token, if any, to build
    // Gov-Client-Multi-Factor server-side in buildFraudHeaders.js.
    const mfaContext = await extractMfaContext(headers, payload.sub);

    // Generate allow policy with JWT claims in context
    return generateAllowPolicy(routeArn, payload, mfaContext);
  } catch (error) {
    logger.error({
      message: "Authorization failed",
      error: error.message,
      errorType: error.name,
      stack: error.stack,
    });
    return generateDenyPolicy(routeArn);
  }
}

// Generate IAM policy to allow access
function generateAllowPolicy(routeArn, jwtPayload, mfaContext = {}) {
  // Extract API Gateway ARN components and create a wildcard policy
  // routeArn format: arn:aws:execute-api:region:account-id:api-id/stage/method/resource
  // We need to allow access to the specific route
  let policyResource = routeArn;

  // try {
  if (routeArn && routeArn.includes(":execute-api:")) {
    const arnParts = routeArn.split(":");
    const region = arnParts[3];
    const accountId = arnParts[4];
    const apiAndMore = arnParts[5]; // api-id/stage/method/resource
    const apiId = apiAndMore.split("/")[0];

    // Wildcard stage, method, and resource to avoid brittle exact matching on HTTP API
    policyResource = `arn:aws:execute-api:${region}:${accountId}:${apiId}/*/*/*`;
  }

  // Flatten all JWT claims into simple string values for context
  const flatContext = {};
  for (const [k, v] of Object.entries(jwtPayload || {})) {
    if (v === undefined || v === null) continue;
    switch (typeof v) {
      case "string":
      case "number":
      case "boolean":
        flatContext[k] = String(v);
        break;
      default:
        try {
          flatContext[k] = JSON.stringify(v);
        } catch (error) {
          logger.warn({ message: `Failed to stringify claim ${k}, storing as empty string`, error: error.message });

          flatContext[k] = String(v);
        }
    }
  }
  // Ensure common time claims are strings (overwrite if necessary)
  if (jwtPayload) {
    flatContext.auth_time = String(jwtPayload.auth_time || flatContext.auth_time || "");
    flatContext.iat = String(jwtPayload.iat || flatContext.iat || "");
    flatContext.exp = String(jwtPayload.exp || flatContext.exp || "");
  }

  return {
    principalId: jwtPayload.sub,
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Allow",
          Resource: policyResource,
        },
      ],
    },
    context: {
      // Context values for HTTP API Lambda authorizer (IAM response type) must be simple types.
      // Avoid nested objects to prevent API Gateway 500 errors.
      ...flatContext,
      sub: jwtPayload.sub,
      username: jwtPayload["cognito:username"] || jwtPayload.username || jwtPayload.sub,
      email: jwtPayload.email || "",
      scope: jwtPayload.scope || "",
      token_use: jwtPayload.token_use || "access",
      // Prefer the ID token's auth_time (the O28 MFA build's source of truth) over the access
      // token's own copy of the same claim, falling back to it when there was no ID token.
      auth_time: String(mfaContext.authTime || jwtPayload.auth_time || ""),
      iat: String(jwtPayload.iat || ""),
      exp: String(jwtPayload.exp || ""),
      // O28: Gov-Client-Multi-Factor inputs, read from the verified ID token above.
      mfa_method: mfaContext.mfaMethod || "",
      mfa_federated: mfaContext.federated ? "true" : "false",
    },
  };
}

// IAM policy document denying access, with no side effect. Callers that already published
// their own reason-specific activity event (the country-change check) use this directly, so
// a deny isn't double-reported as both a specific reason and the generic "auth-denied".
function denyPolicyDocument(routeArn) {
  return {
    principalId: "user",
    policyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "execute-api:Invoke",
          Effect: "Deny",
          Resource: routeArn,
        },
      ],
    },
  };
}

// Generate IAM policy to deny access, publishing the generic denial event. Used for every
// deny that isn't already covered by a more specific event (missing/invalid header, JWT
// verification failure).
async function generateDenyPolicy(routeArn) {
  await publishActivityEvent({
    event: "auth-denied",
    summary: "Authorization denied",
  });
  return denyPolicyDocument(routeArn);
}

/**
 * Pure decision for the mid-session country check (issue #10 acceptance criterion 4). No
 * DynamoDB, Cognito or EventBridge calls here -- the caller executes whatever this returns.
 *
 * @param {Object} params
 * @param {string|null} params.countryHeader - CloudFront-Viewer-Country, or null/undefined
 * @param {{country?: string, revokedAt?: number}|null} params.storedItem - the geo#{hashedSub} item, or null
 * @param {number} params.tokenIat - the verified token's iat claim, epoch seconds
 * @param {number} [params.nowEpochSeconds] - defaults to the current time
 * @returns {{decision: "allow"|"deny", reason?: string, write?: {country: string, revokedAt?: number}, globalSignOut?: boolean, activityEvent?: boolean}}
 */
export function evaluateCountryChange({ countryHeader, storedItem, tokenIat, nowEpochSeconds = Math.floor(Date.now() / 1000) }) {
  // No country header: local, simulator and direct API Gateway calls carry none. Skip the check.
  if (!countryHeader) {
    return { decision: "allow" };
  }

  // A replay of a stolen token has an iat older than the last revocation: deny until the
  // item's TTL expires, by which time the token itself has expired too.
  if (storedItem?.revokedAt && tokenIat < storedItem.revokedAt) {
    return { decision: "deny", reason: "session-revoked" };
  }

  // First request from this consumer: record the baseline country and allow.
  if (!storedItem?.country) {
    return { decision: "allow", write: { country: countryHeader } };
  }

  // Same country as last seen: allow, no write needed.
  if (storedItem.country === countryHeader) {
    return { decision: "allow" };
  }

  // Country changed. Force re-authentication: revoke refresh tokens and record the new
  // country together with the revocation in one write. Writing the new country now (rather
  // than leaving the stale one) is what lets a genuine re-login from this country succeed on
  // its first request afterwards instead of mismatching against the old country forever.
  return {
    decision: "deny",
    reason: "country-changed",
    write: { country: countryHeader, revokedAt: nowEpochSeconds },
    globalSignOut: true,
    activityEvent: true,
  };
}

/**
 * Runs the country-change check for one request: reads stored state, evaluates the pure
 * decision, then executes whatever side effects it calls for. A no-op (allow, no I/O at all)
 * when there's no country header or the security state table isn't configured.
 *
 * @param {Object} payload - verified JWT payload
 * @param {string|null} countryHeader
 * @returns {Promise<{decision: "allow"|"deny", reason?: string}>}
 */
async function checkCountryChange(payload, countryHeader) {
  if (!countryHeader) {
    return { decision: "allow" };
  }
  if (!process.env.SECURITY_STATE_DYNAMODB_TABLE_NAME) {
    return { decision: "allow" };
  }

  const hashedSub = hashSub(payload.sub);
  const storedItem = await getSessionGeo(hashedSub);
  const result = evaluateCountryChange({ countryHeader, storedItem, tokenIat: payload.iat });

  if (result.write) {
    await putSessionGeo(hashedSub, result.write);
  }

  if (result.globalSignOut) {
    const userPoolId = process.env.COGNITO_USER_POOL_ID;
    const username = payload["cognito:username"] || payload.username || payload.sub;
    await getCognitoClient().send(new AdminUserGlobalSignOutCommand({ UserPoolId: userPoolId, Username: username }));
  }

  if (result.activityEvent) {
    await publishActivityEvent({
      event: "auth-country-change",
      summary: "Session country changed mid-session; revoked and forced re-authentication",
      flow: "operational",
      userSub: payload.sub,
      detail: { previousCountry: storedItem?.country, newCountry: countryHeader },
    });
  }

  return result;
}
