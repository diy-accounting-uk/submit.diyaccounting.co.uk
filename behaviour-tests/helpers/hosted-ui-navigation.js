// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// behaviour-tests/helpers/hosted-ui-navigation.js

// The Cognito Hosted UI is always served from a different origin to the app
// (a custom auth domain, or *.auth.<region>.amazoncognito.com), so leaving the
// app's origin is what tells us the sign-in redirect actually happened.
export function hasReachedHostedUi(currentUrl, appOrigin) {
  let url;
  try {
    url = new URL(currentUrl);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return false;
  }
  return url.origin !== appOrigin;
}

export function hostedUiRedirectFailureMessage({ attempts, currentUrl, pageTitle, statusText }) {
  const parts = [
    `The sign-in button did not redirect to the Cognito Hosted UI after ${attempts} click(s).`,
    `Still on ${currentUrl} (title: ${pageTitle || "none"}).`,
  ];
  if (statusText) {
    parts.push(`Page status message: ${statusText}`);
  }
  return parts.join(" ");
}

export function hostedUiFormFailureMessage({ attempts, currentUrl, pageTitle, errorText }) {
  const parts = [
    `The Cognito Hosted UI sign-in form did not render after ${attempts} attempt(s).`,
    `Page is ${currentUrl} (title: ${pageTitle || "none"}).`,
  ];
  if (errorText) {
    parts.push(`Hosted UI error: ${errorText}`);
  }
  return parts.join(" ");
}
