/* SPDX-License-Identifier: AGPL-3.0-only */
/* Copyright (C) 2025-2026 DIY Accounting Ltd */

// Google Analytics 4 — Submit (submit.diyaccounting.co.uk)
// The measurement id is per environment, not hardcoded: it comes from /submit.env's
// GA4_MEASUREMENT_ID key, generated at deploy time (see web/public/submit.env). This script
// loads in <head>, before lib/env-loader.js runs, so it reads /submit.env itself rather than
// waiting on window.envReady.
window.dataLayer = window.dataLayer || [];
function gtag() {
  dataLayer.push(arguments);
}
gtag("consent", "default", { analytics_storage: "denied" });
// A returning visitor who already accepted the cookie banner shouldn't have
// to accept it again on every page — apply their saved choice straight away.
try {
  if (localStorage.getItem("consent.analytics") === "granted") {
    gtag("consent", "update", { analytics_storage: "granted" });
  }
} catch (error) {
  console.warn("Failed to read analytics consent from localStorage:", error);
}

// Reads one KEY=value line out of the plain-text /submit.env body. Blank when the key is
// missing or its value is empty, which happens on any environment without its own GA4 property.
function readSubmitEnvValue(envText, key) {
  const prefix = `${key}=`;
  for (const line of envText.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length).trim();
    }
  }
  return "";
}

function startGa4(measurementId) {
  gtag("js", new Date());
  gtag("config", measurementId);

  // Dynamically load gtag.js (CSP: no inline scripts allowed)
  const script = document.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
  document.head.appendChild(script);
}

fetch("/submit.env", { cache: "no-store" })
  .then((response) => (response.ok ? response.text() : ""))
  .then((envText) => {
    const measurementId = readSubmitEnvValue(envText, "GA4_MEASUREMENT_ID");
    if (measurementId) {
      startGa4(measurementId);
    }
  })
  .catch((error) => console.warn("Failed to read GA4_MEASUREMENT_ID from /submit.env:", error));
