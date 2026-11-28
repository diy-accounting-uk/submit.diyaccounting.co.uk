// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/stripe-checkout.js
// The trip to a Stripe page: a checkout for a bundle or for one filing's fee, or the subscription
// page. Each says its stage while it asks Stripe and while it goes there, and on a failure shows
// the failure panel: what was charged and what was not, and the kind of failure with its next step.
// Page scripts load it with import("/lib/stripe-checkout.js").

import { classifyStripeFailure, showFailureDetail } from "./filing-failure.js";

function siteText(id, english, values) {
  if (globalThis.siteText) return globalThis.siteText(id, english, values);
  return english.replace(/\{([a-z]+)\}/g, (whole, name) => (values && name in values ? String(values[name]) : whole));
}

const checkoutStages = () => ({
  asking: siteText("stripe.narrate-asking-checkout", "Asking Stripe for a checkout..."),
  going: siteText("stripe.narrate-going-checkout", "Taking you to Stripe to pay..."),
  sent: siteText("stripe.failure-sent-checkout", "Nothing was charged. Stripe did not open a checkout."),
});

export const STRIPE_JOURNEYS = {
  bundleCheckout: {
    path: "/api/v1/billing/checkout",
    method: "POST",
    link: "checkoutUrl",
    text: () => ({
      ...checkoutStages(),
      after: siteText("stripe.failure-after-bundle", "Your bundles have not changed."),
    }),
  },
  activityCheckout: {
    path: "/api/v1/billing/activity-checkout",
    method: "POST",
    link: "checkoutUrl",
    text: () => ({
      ...checkoutStages(),
      after: siteText("stripe.failure-after-activity", "Nothing was filed with Companies House. The filing is sent after the fee is paid."),
    }),
  },
  subscriptionPage: {
    path: "/api/v1/billing/portal",
    method: "GET",
    link: "portalUrl",
    text: () => ({
      asking: siteText("stripe.narrate-asking-portal", "Asking Stripe for your subscription page..."),
      going: siteText("stripe.narrate-going-portal", "Taking you to your subscription page at Stripe..."),
      sent: siteText("stripe.failure-sent-portal", "Stripe did not open your subscription page."),
      after: siteText("stripe.failure-after-portal", "Your subscription and your bundles have not changed."),
    }),
  },
};

function isHtml(response) {
  return /text\/html/i.test(response.headers?.get?.("content-type") || "");
}

/** The client's error for a billing route's answer: its status, its JSON body or the firewall's HTML, and its reference. */
export function stripeAnswerError(response, body) {
  const error = new Error(body.message || `Request failed with status ${response.status}`);
  error.status = response.status;
  error.reason = body.code;
  error.body = body;
  error.html = isHtml(response);
  const requestId = response.headers?.get?.("x-request-id") || response.headers?.get?.("x-amz-cf-id");
  if (requestId) error.requestId = requestId;
  return error;
}

/**
 * Ask a billing route for a Stripe page and go there.
 * @param {keyof STRIPE_JOURNEYS} journey
 * @param {{body?: object, headers?: object, beforeRedirect?: () => void}} [options] - the request's JSON body and extra headers; beforeRedirect runs once Stripe has given the page
 * @returns {Promise<boolean>} true once the browser is on its way to Stripe; false after a failure, with the panel shown
 */
export async function goToStripe(journey, { body, headers, beforeRedirect } = {}) {
  const { path, method, link, text } = STRIPE_JOURNEYS[journey];
  const words = text();
  window.narrateStage(words.asking);
  let response;
  let answer = {};
  try {
    response = await window.fetchWithIdToken(path, {
      method,
      headers: { "Content-Type": "application/json", ...headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!isHtml(response)) answer = await response.json().catch(() => ({}));
  } catch (error) {
    console.error(`The ${journey} request got no answer:`, error);
  }
  if (response?.ok && answer[link]) {
    beforeRedirect?.();
    window.narrateStage(words.going);
    window.location.href = answer[link];
    return true;
  }
  window.endStage();
  const error = response ? stripeAnswerError(response, answer) : new TypeError("No answer");
  console.error(`The ${journey} request failed:`, error.status, error.message);
  showFailureDetail(document, { sent: words.sent, answers: words.after, failure: classifyStripeFailure(error) }).focus();
  return false;
}

/**
 * Open the Stripe checkout for one filing's fee: the change of name and the confirmation statement.
 * @param {{activityId: string, subjectKey: string, priceKey?: string, beforeRedirect?: () => void}} checkout
 */
export function startActivityCheckout({ activityId, subjectKey, priceKey, beforeRedirect }) {
  return goToStripe("activityCheckout", {
    body: { activityId, subjectKey, ...(priceKey ? { priceKey } : {}), returnTo: `${window.location.origin}${window.location.pathname}` },
    beforeRedirect,
  });
}
