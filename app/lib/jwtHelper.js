// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/jwtHelper.js

import { createLogger } from "./logger.js";
import { getHeader } from "./httpResponseHelper.js";

const logger = createLogger({ source: "app/lib/jwtHelper.js" });

export function decodeJwtNoVerify(token) {
  try {
    const parts = String(token || "").split(".");
    if (parts.length < 2) return null;
    const payloadRaw = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payloadRaw, "base64").toString("utf8");
    const payload = JSON.parse(json);
    logger.info({ message: "Decoded JWT payload", payload });
    return payload;
  } catch (error) {
    logger.warn({ message: "JWT decode failed", error });
    return null;
  }
}

// Extract Cognito JWT from Authorization header
export function decodeJwtToken(eventHeaders) {
  const authHeader = getHeader(eventHeaders, "Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    throw new Error("Unauthorized - Missing or invalid authorization header");
  }

  const token = authHeader.split(" ")[1];

  // Decode JWT to get user's Cognito ID (sub)
  const decodedToken = decodeJwtNoVerify(token);
  if (!decodedToken || !decodedToken.sub) {
    logger.warn({ message: "JWT decode failed or missing sub" });
    throw new Error("Unauthorized - Invalid token");
  }

  return decodedToken;
}

export function getUserSub(event) {
  // Try standard Authorization header first
  const headers = event?.headers || {};

  const tryExtract = (bearerValue) => {
    if (!bearerValue || !bearerValue.startsWith("Bearer ")) return null;
    const token = bearerValue.split(" ")[1];
    const claims = decodeJwtNoVerify(token);
    return claims?.sub || null;
  };

  // Case-insensitive lookup for Authorization header
  const auth = getHeader(headers, "authorization");
  const subFromAuth = tryExtract(auth);
  if (subFromAuth) return subFromAuth;

  // Fallback to X-Authorization header if present
  const xAuth = getHeader(headers, "x-authorization");
  const subFromXAuth = tryExtract(xAuth);
  if (subFromXAuth) return subFromXAuth;

  return null;
}
