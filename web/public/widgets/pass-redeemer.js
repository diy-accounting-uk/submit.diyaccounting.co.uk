// Pass Redeemer Widget
// Lets a pass link work when it points straight at an activity page (VAT
// obligations, VAT submission, pass generation) instead of forcing the user
// through bundles.html first to register the tokens. Include this script on
// any page that can be a pass destination; it looks for `?pass=` in the URL
// on load and redeems it in place.

(function () {
  "use strict";

  const passReasonMessages = {
    not_found: "Pass not found. Please check the code and try again.",
    expired: "This pass has expired.",
    exhausted: "This pass has been fully used.",
    revoked: "This pass has been revoked.",
    wrong_email: "This pass is restricted to a different email address.",
    email_required: "This pass requires email verification.",
    not_yet_valid: "This pass is not yet valid.",
  };

  function getIdToken() {
    try {
      return localStorage.getItem("cognitoIdToken");
    } catch {
      return null;
    }
  }

  function removePassFromUrl() {
    const url = new URL(window.location);
    url.searchParams.delete("pass");
    window.history.replaceState({}, "", url);
  }

  // Show an error via the shared status widget, with a link back to Bundles
  // so the user always has a next step for an expired/invalid pass.
  function reportError(message) {
    if (typeof window.showStatus !== "function") return;
    window.showStatus(message, "error");
    try {
      const container = document.getElementById("statusMessagesContainer");
      const contents = container ? container.querySelectorAll(".status-message-content") : [];
      const last = contents[contents.length - 1];
      if (last) {
        last.appendChild(document.createTextNode(" "));
        const link = document.createElement("a");
        link.href = "/bundles.html";
        link.textContent = "Go to Bundles";
        last.appendChild(link);
      }
    } catch {}
  }

  async function refreshEntitlement() {
    try {
      if (window.requestCache && typeof window.requestCache.invalidate === "function") {
        window.requestCache.invalidate("/api/v1/bundle");
      }
    } catch {}
    try {
      const userInfoJson = localStorage.getItem("userInfo");
      const userId = userInfoJson && JSON.parse(userInfoJson)?.sub;
      if (userId && window.bundleCache && typeof window.bundleCache.clearBundles === "function") {
        await window.bundleCache.clearBundles(userId);
      }
    } catch {}
    window.dispatchEvent(new CustomEvent("bundle-changed"));
    try {
      if (window.EntitlementStatus && typeof window.EntitlementStatus.update === "function") {
        await window.EntitlementStatus.update();
      }
    } catch {}
  }

  async function redeemCode(code) {
    let response;
    try {
      response = await window.fetchWithIdToken("/api/v1/pass", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code }),
      });
    } catch (err) {
      removePassFromUrl();
      reportError(`Failed to redeem pass: ${err?.message || err}.`);
      return;
    }
    const body = await response.json().catch(() => ({}));

    if (body.requiresSubscription) {
      // Pass is valid but the bundle it unlocks needs a paid subscription —
      // that has to go through Stripe checkout on the Bundles page.
      try {
        sessionStorage.setItem(
          "passValidation",
          JSON.stringify({ code, bundleId: body.bundleId, valid: true, testPass: body.testPass || false }),
        );
      } catch {}
      removePassFromUrl();
      if (typeof window.showStatus === "function") {
        window.showStatus("Pass valid! This bundle needs a subscription — continue on the Bundles page to finish.", "info");
      }
      return;
    }

    if (body.redeemed) {
      removePassFromUrl();
      if (body.testPass) {
        try {
          sessionStorage.setItem("hmrcAccount", "sandbox");
        } catch {}
      }
      await refreshEntitlement();
      if (typeof window.showStatus === "function") {
        window.showStatus(`Pass redeemed! Bundle "${body.bundleId}" has been added.`, "success");
      }
      return;
    }

    removePassFromUrl();
    const msg = passReasonMessages[body.reason] || `Pass redemption failed: ${body.reason || "unknown error"}.`;
    reportError(msg);
  }

  async function tryRedeemFromUrl() {
    const params = new URLSearchParams(window.location.search);
    const code = (params.get("pass") || "").trim().toLowerCase();
    if (!code) return;

    if (!getIdToken()) {
      try {
        sessionStorage.setItem("pendingPass", code);
        sessionStorage.setItem("postLoginRedirect", window.location.pathname + window.location.search);
      } catch {}
      if (typeof window.showStatus === "function") {
        window.showStatus("Log in to redeem your pass.", "info");
      }
      return;
    }

    await redeemCode(code);
  }

  function init() {
    if (window.__submitReady__) {
      tryRedeemFromUrl();
    } else {
      document.addEventListener("submit-ready", tryRedeemFromUrl, { once: true });
    }
  }

  if (typeof window !== "undefined") {
    window.PassRedeemer = { tryRedeemFromUrl };
  }

  init();
})();
