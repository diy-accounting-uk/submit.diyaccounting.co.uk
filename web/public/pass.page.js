// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-58 Pass link landing page
// - **Use when:** a person opens a pass link and must see what the pass gives, redeem it with one click, and see the bundle that it added.
// - **Does:** pass.html reads `?pass=`, checks it with the public `GET /api/v1/pass`, and shows the bundle, its passSummary from submit.catalogue.toml, its tokens and its end date. "Redeem pass" reads `/api/v1/bundle`, stops when the account holds the bundle, and otherwise posts to `/api/v1/pass`. A signed-out click stores `postLoginRedirect` and `passAddOnReturn` in sessionStorage and goes to the sign-in page. A link from an activity page adds `next=<path>`; a path on this site becomes the "Continue" button of the redeemed state, and the page never follows it without a click. "Sign out and use another account" stores the pass link in `passReturnAfterSignOut`, and signed-out.html forwards to it once. On return the page posts once when `passAddOnReturn` equals the code in the URL, and never posts on load without that flag. The result for the code stays in sessionStorage, so a reload makes no call. Each refusal reason has one sentence and one next step. bundles.html with `?pass=` forwards here.
// - **Run:** open `/pass.html?pass=<code>`; `npx playwright test --project=browser-tests web/browser-tests/pass.browser.test.js`
// - **Entry:** `web/public/pass.page.js`
// - **Files:** web/public/pass.html, web/public/pass.page.js, web/public/widgets/pass-redeemer.js, web/public/auth/signed-out.page.js, web/public/css/pass-page.css, web/browser-tests/pass.browser.test.js
// - **Keywords:** pass link, pass landing, redeem pass, pass.html, passAddOnReturn, passSummary
// - **Related:** BILL-08, BILL-10
// @end-capability

const PASS_RESULTS_KEY = "passResults";
const ADD_ON_RETURN_KEY = "passAddOnReturn";
const SIGN_OUT_RETURN_KEY = "passReturnAfterSignOut";

const el = (id) => document.getElementById(id);

const getIdToken = () => {
  try {
    return localStorage.getItem("cognitoIdToken");
  } catch {
    return null;
  }
};

const getSignedInEmail = () => {
  try {
    return JSON.parse(localStorage.getItem("userInfo"))?.email || "";
  } catch {
    return "";
  }
};

const readResults = () => {
  try {
    return JSON.parse(sessionStorage.getItem(PASS_RESULTS_KEY)) || {};
  } catch {
    return {};
  }
};

const storeResult = (code, result) => {
  try {
    sessionStorage.setItem(PASS_RESULTS_KEY, JSON.stringify({ ...readResults(), [code]: result }));
  } catch {}
};

const SIGN_IN_PATH = "/auth/login.html";

// One sentence and one next step for each refusal. The key is the reason the API answers.
const ERROR_SENTENCES = {
  not_found: "We cannot find this pass. Check that the link is complete, or ask the sender for a new one.",
  expired: "This pass has ended. Ask the sender for a new one.",
  exhausted: "This pass has been used. Ask the sender for a new one.",
  revoked: "This pass has been cancelled. Ask the sender for a new one.",
  not_yet_valid: "This pass does not start yet. Open the link again later.",
  held_for_review: "This pass is paused while we check it. Open the link again tomorrow.",
  email_required: "This pass is for one email address. Sign in with the Google account for that address.",
  own_pass: "You made this pass. Send the link to someone else to use.",
  referral_already_used: "Your account has already used a pass link from someone. An account uses one.",
  already_redeemed: "Your account has already used this pass.",
  network_error: "We could not reach DIY Accounting Submit. Check your connection and try again.",
};

const durationWords = (isoDuration) => {
  const match = /^P(\d+)([DM])$/.exec(isoDuration || "");
  if (!match) return null;
  const count = Number(match[1]);
  const unit = match[2] === "D" ? "day" : "month";
  return `${count} ${unit}${count === 1 ? "" : "s"}`;
};

const formatDate = (iso) => {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });
};

const tokensWords = (tokensGranted) => {
  if (tokensGranted === "unlimited") return "unlimited tokens";
  if (typeof tokensGranted !== "number") return null;
  return `${tokensGranted} token${tokensGranted === 1 ? "" : "s"}`;
};

// A pass link from an activity page carries that page as `next`. Only a path on this site is kept.
const readNext = () => {
  const next = new URLSearchParams(window.location.search).get("next");
  if (!next || next.includes("\\") || typeof window.postLoginRedirectTarget !== "function") return "";
  return window.postLoginRedirectTarget(next) === next ? next : "";
};

// The sign-out returns to a fixed address, which forwards here once from this key.
const signOutAndReturn = () => {
  try {
    sessionStorage.setItem(SIGN_OUT_RETURN_KEY, window.location.pathname + window.location.search);
  } catch {}
  window.logout?.();
};

let catalogueBundles = [];
let currentCode = "";
let nextPath = "";
let passCheck = null;
let firstRender = true;

const loadCatalogue = async () => {
  try {
    const res = await fetch("/submit.catalogue.toml");
    const text = await res.text();
    const { parseCatalogueText } = await import("/lib/services/catalog-service.js");
    catalogueBundles = parseCatalogueText(text)?.bundles || [];
  } catch {
    catalogueBundles = [];
  }
};

const bundleInfo = (bundleId) => {
  const entry = catalogueBundles.find((candidate) => candidate.id === bundleId) || {};
  return {
    id: bundleId,
    name: entry.name || bundleId,
    summary: entry.passSummary || "",
    tokensGranted: entry.tokensGranted,
    timeout: entry.timeout,
  };
};

// The card keeps its height between states; the state's heading takes focus after each change.
function render({
  heading,
  message = "",
  error = "",
  card = null,
  redeem = null,
  home = false,
  bundles = false,
  after = "",
  form = false,
}) {
  el("passHeading").textContent = heading;
  el("passMessage").textContent = message;
  el("passMessage").hidden = !message;
  el("passError").textContent = error;
  el("passError").hidden = !error;

  const bundleBox = el("passBundle");
  bundleBox.replaceChildren();
  if (card) bundleBox.append(card);
  bundleBox.hidden = !card;

  el("passForm").hidden = !form;

  const redeemBtn = el("passRedeemBtn");
  redeemBtn.hidden = !redeem;
  if (redeem) {
    redeemBtn.textContent = redeem.label;
    redeemBtn.disabled = Boolean(redeem.disabled);
    redeemBtn.onclick = redeem.onClick || null;
    // Only "Redeem pass" starts the bundle activity; the button's other labels act on the page.
    if (redeem.leaves) redeemBtn.removeAttribute("data-activity-start");
    else redeemBtn.setAttribute("data-activity-start", "bundle");
  }
  el("passHomeLink").hidden = !home;
  el("passBundlesLink").hidden = !bundles;
  el("passAfterAction").textContent = after;
  el("passAfterAction").hidden = !after;

  if (firstRender) {
    firstRender = false;
    return;
  }
  el("passHeading").focus();
}

function bundleCardEl(info, noteParts) {
  const card = document.createElement("div");
  card.className = "service-item bundle-row";
  const line = document.createElement("span");
  line.className = "bundle-row-line";
  const name = document.createElement("span");
  name.className = "bundle-row-name";
  name.textContent = info.name;
  line.append(name);
  const note = document.createElement("div");
  note.className = "bundle-note";
  note.textContent = noteParts.join(" · ");
  card.append(line, note);
  return card;
}

function endDateWords(expiry, timeout) {
  if (expiry) return formatDate(expiry) ? `ends on ${formatDate(expiry)}` : null;
  const lasts = durationWords(timeout);
  return lasts ? `lasts ${lasts}` : "no end date";
}

function showError(reason, { email = getSignedInEmail() } = {}) {
  if (reason === "wrong_email") {
    const signedInAs = email ? ` You are signed in as ${email}.` : "";
    render({
      heading: "This pass did not work",
      error: `This pass is for a different email address.${signedInAs}`,
      redeem: { label: "Sign out and use another account", leaves: true, onClick: signOutAndReturn },
    });
    return;
  }
  const sentence = ERROR_SENTENCES[reason] || "This pass did not work. Ask the sender for a new one.";
  if (reason === "network_error") {
    render({
      heading: "This pass did not work",
      error: sentence,
      redeem: { label: "Try again", leaves: true, onClick: () => start() },
    });
    return;
  }
  render({ heading: "This pass did not work", error: sentence, home: true });
}

function showRedeemed(result) {
  const goOn = nextPath ? { label: "Continue", leaves: true, onClick: () => window.location.assign(nextPath) } : null;
  const info = bundleInfo(result.bundleId);
  const tokens = tokensWords(info.tokensGranted);
  const endsWords = endDateWords(result.expiry, info.timeout);
  const noteParts = [tokens && `${tokens} allocated`, endsWords].filter(Boolean);
  const sentences = [`Your pass added ${info.name}.`];
  if (info.summary) sentences.push(`You can now ${info.summary}.`);
  if (tokens) sentences.push(typeof info.tokensGranted === "number" ? `You have ${tokens}.` : "There is no limit on tokens.");
  if (result.expiry && formatDate(result.expiry)) sentences.push(`It ends on ${formatDate(result.expiry)}.`);
  else if (endsWords === "no end date") sentences.push("There is no end date.");
  render({
    heading: "Pass redeemed",
    message: sentences.join(" "),
    card: bundleCardEl(info, noteParts),
    redeem: goOn,
    home: true,
    bundles: true,
  });
}

function showHeld(info) {
  render({
    heading: "You already have this bundle",
    message: `Your account already has ${info.name}. This pass is still unused, so you can give it to someone else.`,
    home: true,
    bundles: true,
  });
}

function showValid(check) {
  const info = bundleInfo(check.bundleId);
  const signedIn = Boolean(getIdToken());
  const tokens = tokensWords(info.tokensGranted);
  const lasts = durationWords(info.timeout);
  const sentences = [`This pass adds ${info.name} to your DIY Accounting Submit account.`];
  if (info.summary) sentences.push(`With it you can ${info.summary}.`);
  if (tokens) sentences.push(typeof info.tokensGranted === "number" ? `It comes with ${tokens}.` : "It has no limit on tokens.");
  if (typeof info.tokensGranted === "number" && /VAT/.test(info.summary)) sentences.push("A VAT return uses 1 token.");
  if (lasts) sentences.push(`It lasts ${lasts}.`);
  let after;
  if (signedIn) {
    const email = getSignedInEmail();
    after = email ? `You are signed in as ${email}.` : "";
  } else {
    after = `You sign in with Google next. When you come back, ${info.name} is on your account.`;
    if (check.emailRestricted) after += " Use the Google account for the email address that this pass was sent to.";
  }
  render({
    heading: `You have a pass for ${info.name}`,
    message: sentences.join(" "),
    redeem: { label: "Redeem pass", onClick: () => onRedeemClick() },
    after,
  });
}

function showAdding(info) {
  render({
    heading: `Adding ${info.name}`,
    message: "",
    redeem: { label: "Redeem pass", disabled: true },
  });
}

async function readHeldBundles() {
  const response = await window.fetchWithIdToken("/api/v1/bundle", {});
  if (!response.ok) throw new Error("bundle_read_failed");
  const body = await response.json().catch(() => ({}));
  return Array.isArray(body.bundles) ? body.bundles : [];
}

const holdsBundle = (bundles, bundleId) => bundles.some((entry) => entry.bundleId === bundleId && entry.allocated);

async function refreshEntitlement() {
  try {
    window.requestCache?.invalidate?.("/api/v1/bundle");
  } catch {}
  try {
    const uid = JSON.parse(localStorage.getItem("userInfo"))?.sub;
    if (uid && window.bundleCache) await window.bundleCache.clearBundles(uid);
  } catch {}
  window.dispatchEvent(new CustomEvent("bundle-changed"));
}

async function redeem() {
  const info = bundleInfo(passCheck.bundleId);
  showAdding(info);
  try {
    if (holdsBundle(await readHeldBundles(), info.id)) {
      showHeld(info);
      return;
    }
    const response = await window.fetchWithIdToken("/api/v1/pass", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code: currentCode }),
    });
    const body = await response.json().catch(() => ({}));

    if (body.requiresSubscription) {
      try {
        sessionStorage.setItem(
          "passValidation",
          JSON.stringify({ code: currentCode, bundleId: body.bundleId, valid: true, testPass: body.testPass || false }),
        );
        if (body.testPass) sessionStorage.setItem("hmrcAccount", "synthetic");
      } catch {}
      render({
        heading: `Subscribe to add ${info.name}`,
        message: `This pass lets you subscribe to ${info.name}. Open your bundles to start the subscription.`,
        bundles: true,
      });
      return;
    }

    if (body.redeemed) {
      if (body.testPass) {
        try {
          sessionStorage.setItem("hmrcAccount", "synthetic");
        } catch {}
      }
      const result = { bundleId: body.bundleId, expiry: body.expiry || null };
      storeResult(currentCode, result);
      await refreshEntitlement();
      showRedeemed(result);
      return;
    }

    const reason = body.reason || "";
    if (reason === "already_held") {
      showHeld(info);
      return;
    }
    if (reason === "exhausted" || reason === "already_redeemed") {
      if (holdsBundle(await readHeldBundles().catch(() => []), info.id)) {
        const result = { bundleId: info.id, expiry: null };
        storeResult(currentCode, result);
        showRedeemed(result);
        return;
      }
    }
    showError(reason);
  } catch {
    showError("network_error");
  }
}

function onRedeemClick() {
  if (getIdToken()) {
    redeem();
    return;
  }
  try {
    sessionStorage.setItem("postLoginRedirect", window.location.pathname + window.location.search);
    sessionStorage.setItem(ADD_ON_RETURN_KEY, currentCode);
  } catch {}
  window.location.href = SIGN_IN_PATH;
}

function showEntry() {
  render({
    heading: "Enter your pass",
    message: "Type the four words of your pass, then press Redeem pass.",
    form: true,
  });
}

async function start() {
  const params = new URLSearchParams(window.location.search);
  currentCode = (params.get("pass") || "").trim().toLowerCase();
  nextPath = readNext();
  try {
    sessionStorage.removeItem(SIGN_OUT_RETURN_KEY);
  } catch {}
  if (!currentCode) {
    showEntry();
    return;
  }

  const stored = readResults()[currentCode];
  if (stored) {
    await loadCatalogue();
    showRedeemed(stored);
    return;
  }

  render({ heading: "Checking your pass", message: "" });
  let check;
  try {
    const [, response] = await Promise.all([loadCatalogue(), fetch(`/api/v1/pass?code=${encodeURIComponent(currentCode)}`)]);
    check = await response.json();
  } catch {
    check = { valid: false, reason: "network_error" };
  }
  if (!check.valid) {
    showError(check.reason || "not_found", { email: getSignedInEmail() });
    return;
  }
  passCheck = check;

  let addOnReturn = null;
  try {
    addOnReturn = sessionStorage.getItem(ADD_ON_RETURN_KEY);
  } catch {}
  if (getIdToken() && addOnReturn === currentCode) {
    try {
      sessionStorage.removeItem(ADD_ON_RETURN_KEY);
    } catch {}
    await redeem();
    return;
  }
  showValid(check);
}

if (window.__submitReady__) {
  start();
} else {
  document.addEventListener("submit-ready", start, { once: true });
}
