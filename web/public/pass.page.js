// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability BILL-58 Pass link landing page
// - **Use when:** a person opens a pass link and must see what the pass gives, redeem it with one click, and see the bundle that it added.
// - **Does:** pass.html reads `?pass=`, checks it with the public `GET /api/v1/pass`, and shows the bundle, its passSummary from submit.catalogue.toml, its tokens and its end date. "Redeem pass" posts to `/api/v1/pass`, and the server decides: an account that holds the bundle on terms at least as good gets the already_held state from the answer, and a pass that would give better terms replaces the held bundle. A signed-out click stores `postLoginRedirect` and `passAddOnReturn` in sessionStorage and goes to the sign-in page. A link from an activity page adds `next=<path>`; a path on this site becomes the "Continue" button of the redeemed state, and the page never follows it without a click. "Sign out and use another account" stores the pass link in `passReturnAfterSignOut`, and signed-out.html forwards to it once. On return the page posts once when `passAddOnReturn` equals the code in the URL, and never posts on load without that flag. The result for the code stays in sessionStorage, so a reload makes no call. Each refusal reason has one sentence and one next step. bundles.html with `?pass=` forwards here.
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

const getStoredIdToken = () => {
  try {
    return localStorage.getItem("cognitoIdToken");
  } catch {
    return null;
  }
};

// An expired id token is no sign-in.
const getIdToken = () => {
  const token = getStoredIdToken();
  return token && !window.isTokenExpired(token) ? token : null;
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

// The landing attribution analytics.js stored once the visitor accepted the banner: the click id
// and campaign tags. The server writes it on the granted bundle row, and only when it is present.
const readPassLandingAttribution = () => {
  try {
    const raw = localStorage.getItem("attribution.landing");
    return raw ? JSON.parse(raw) : undefined;
  } catch {
    return undefined;
  }
};

// The language siteText writes in, so the summaries, dates and mutations match the sentences around them.
const inWelsh = () => window.siteLanguage.chrome() === "cy";
const locale = () => (inWelsh() ? "cy-GB" : "en-GB");
const siteText = (id, english, values) => window.siteText(id, english, values);

// One sentence and one next step for each refusal. The key is the reason the API answers.
const errorSentence = (reason) =>
  ({
    not_found: () =>
      siteText("pass.error-not-found", "We cannot find this pass. Check the four words, or the link, or ask the sender for a new one."),
    expired: () => siteText("pass.error-expired", "This pass has ended. Ask the sender for a new one."),
    exhausted: () => siteText("pass.error-exhausted", "This pass has been used. Ask the sender for a new one."),
    revoked: () => siteText("pass.error-revoked", "This pass has been cancelled. Ask the sender for a new one."),
    not_yet_valid: () => siteText("pass.error-not-yet-valid", "This pass does not start yet. Open the link again later."),
    held_for_review: () => siteText("pass.error-held-for-review", "This pass is paused while we check it. Open the link again tomorrow."),
    email_required: () =>
      siteText(
        "pass.error-email-required",
        "This pass is for one email address. Sign in with the Google or Microsoft account for that address.",
      ),
    own_pass: () => siteText("pass.error-own-pass", "You made this pass. Send the link to someone else to use."),
    referral_already_used: () =>
      siteText("pass.error-referral-already-used", "Your account has already used a pass link from someone. An account uses one."),
    already_redeemed: () => siteText("pass.error-already-redeemed", "Your account has already used this pass."),
    account_limit_reached: () =>
      siteText("pass.error-account-limit-reached", "Your account has used this pass as many times as it allows."),
    network_error: () => siteText("pass.error-network", "We could not reach DIY Accounting Submit. Check your connection and try again."),
  })[reason]?.() || siteText("pass.error-other", "This pass did not work. Ask the sender for a new one.");

// "1 year", "6 months", "7 days" in the pass card's wording, in the page's language.
const durationWords = (isoDuration) => window.passCard.durationWords(isoDuration, { siteText: window.siteText });

const formatDate = (iso) => {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  return date.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
};

// A bundle that lasts under two days is shown with its time, because the date alone hides when a day pass ends.
const formatEnd = (iso, timeout) => {
  const date = new Date(iso);
  if (isNaN(date.getTime())) return null;
  const days = /^P(\d+)D$/.exec(timeout || "");
  if (!days || Number(days[1]) >= 2) return formatDate(iso);
  const day = date.toLocaleDateString(locale(), { day: "numeric", month: "long", year: "numeric" });
  const time = date.toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit", timeZoneName: "short" });
  return siteText("pass.date-at-time", "{day} at {time}", { day, time });
};

const tokensWords = (tokensGranted) => {
  if (tokensGranted === "unlimited") return siteText("pass.tokens-unlimited", "unlimited tokens");
  if (typeof tokensGranted !== "number") return null;
  return tokensGranted === 1
    ? siteText("pass.tokens-one", "1 token")
    : siteText("pass.tokens-many", "{count} tokens", { count: tokensGranted });
};

// Welsh soft mutation of a summary's first word where it follows "gallwch": cyflwyno becomes gyflwyno.
const SOFT_MUTATIONS = [
  ["ll", "l"],
  ["rh", "r"],
  ["c", "g"],
  ["p", "b"],
  ["t", "d"],
  ["g", ""],
  ["b", "f"],
  ["d", "dd"],
  ["m", "f"],
];
const afterGallwch = (summary) => {
  if (!inWelsh()) return summary;
  const mutation = SOFT_MUTATIONS.find(([radical]) => summary.startsWith(radical));
  return mutation ? mutation[1] + summary.slice(mutation[0].length) : summary;
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
    summary: (inWelsh() && entry.passSummaryCy) || entry.passSummary || "",
    englishSummary: entry.passSummary || "",
    tokensGranted: entry.tokensGranted,
    timeout: entry.timeout,
    allocation: entry.allocation,
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
  typed = "",
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
  if (form) el("passInput").value = typed;

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
  // A pass that was not found leaves nothing to read next, so the focus goes to the box to type again.
  if (form && error) el("passInput").focus();
  else el("passHeading").focus();
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

// The end of a granted bundle in the card's note: its end date, how long it lasts, or no end.
function endDateWords(expiry, timeout) {
  if (expiry) {
    const ends = formatEnd(expiry, timeout);
    return ends ? { words: siteText("pass.note-ends-on", "ends on {date}", { date: ends }), noEnd: false } : null;
  }
  const lasts = durationWords(timeout);
  if (lasts) return { words: siteText("pass.note-lasts", "lasts {lasts}", { lasts }), noEnd: false };
  return { words: siteText("pass.note-no-end", "no end date"), noEnd: true };
}

function showError(reason, { email = getSignedInEmail() } = {}) {
  const heading = siteText("pass.heading-did-not-work", "This pass did not work");
  if (reason === "wrong_email") {
    const wrongAddress = siteText("pass.error-wrong-email", "This pass is for a different email address.");
    const signedInAs = email ? siteText("pass.signed-in-as", "You are signed in as {email}.", { email }) : "";
    render({
      heading,
      error: [wrongAddress, signedInAs].filter(Boolean).join(" "),
      redeem: {
        label: siteText("pass.sign-out-and-switch", "Sign out and use another account"),
        leaves: true,
        onClick: signOutAndReturn,
      },
    });
    return;
  }
  const sentence = errorSentence(reason);
  if (reason === "network_error") {
    render({
      heading,
      error: sentence,
      redeem: { label: siteText("pass.try-again", "Try again"), leaves: true, onClick: () => start() },
    });
    return;
  }
  if (reason === "not_found") {
    render({ heading, error: sentence, form: true, typed: currentCode, home: true });
    return;
  }
  render({ heading, error: sentence, home: true });
}

function showRedeemed(result) {
  const goOn = nextPath
    ? { label: siteText("pass.continue", "Continue"), leaves: true, onClick: () => window.location.assign(nextPath) }
    : null;
  const info = bundleInfo(result.bundleId);
  const tokens = tokensWords(info.tokensGranted);
  const ends = endDateWords(result.expiry, info.timeout);
  const noteParts = [tokens && siteText("pass.note-allocated", "{tokens} allocated", { tokens }), ends?.words].filter(Boolean);
  const sentences = [siteText("pass.redeemed-added", "Your pass added {name}.", { name: info.name })];
  if (info.summary) sentences.push(siteText("pass.redeemed-can-now", "You can now {summary}.", { summary: afterGallwch(info.summary) }));
  if (tokens) {
    sentences.push(
      typeof info.tokensGranted === "number"
        ? siteText("pass.redeemed-you-have", "You have {tokens}.", { tokens })
        : siteText("pass.redeemed-no-token-limit", "There is no limit on tokens."),
    );
  }
  if (result.expiry && formatEnd(result.expiry, info.timeout)) {
    sentences.push(siteText("pass.redeemed-ends-on", "It ends on {date}.", { date: formatEnd(result.expiry, info.timeout) }));
  } else if (ends?.noEnd) sentences.push(siteText("pass.redeemed-no-end", "There is no end date."));
  render({
    heading: siteText("pass.heading-redeemed", "Pass redeemed"),
    message: sentences.join(" "),
    card: bundleCardEl(info, noteParts),
    redeem: goOn,
    home: true,
    bundles: true,
  });
}

function showHeld(info) {
  render({
    heading: siteText("pass.heading-held", "You already have this bundle"),
    message: siteText(
      "pass.held",
      "Your account already has {name} on terms at least as good as this pass gives. This pass is still unused, so you can give it to someone else.",
      { name: info.name },
    ),
    home: true,
    bundles: true,
  });
}

// A campaign pass sets its own duration and tokens for each bundle it grants, over the catalogue's.
function withGrantTerms(info, grant) {
  if (!grant) return info;
  return {
    ...info,
    ...(grant.duration ? { timeout: grant.duration } : {}),
    ...(grant.tokens !== undefined ? { tokensGranted: grant.tokens } : {}),
  };
}

function showValid(check) {
  const info = withGrantTerms(bundleInfo(check.bundleId), check.grants?.[0]);
  // Each further bundle of a campaign pass, with its own duration and tokens, as the pass card words them.
  const alsoAdds = window.passCard
    .grantedBundles({ grants: (check.grants || []).slice(1) }, { bundles: catalogueBundles })
    .map((bundle) => window.passCard.bundleLine(bundle, { siteText: window.siteText }));
  const signedIn = Boolean(getIdToken());
  const tokens = tokensWords(info.tokensGranted);
  const lasts = durationWords(info.timeout);
  const noCard = info.allocation !== "on-pass-on-subscription";
  const filesVat = /VAT/.test(info.englishSummary);
  const freeFiling = noCard && lasts && typeof info.tokensGranted === "number" && filesVat;
  const sentences = [];
  if (freeFiling) sentences.push(siteText("pass.valid-free-filing", "Free VAT filing for {lasts}. No card needed.", { lasts }));
  sentences.push(siteText("pass.valid-adds", "This pass adds {name} to your DIY Accounting Submit account.", { name: info.name }));
  if (info.summary) sentences.push(siteText("pass.valid-with-it", "With it you can {summary}.", { summary: afterGallwch(info.summary) }));
  if (tokens) {
    sentences.push(
      typeof info.tokensGranted === "number"
        ? siteText("pass.valid-comes-with", "It comes with {tokens}.", { tokens })
        : siteText("pass.valid-no-token-limit", "It has no limit on tokens."),
    );
  }
  if (typeof info.tokensGranted === "number" && filesVat) sentences.push(siteText("pass.valid-vat-token", "A VAT return uses 1 token."));
  if (lasts) sentences.push(siteText("pass.valid-lasts", "It lasts {lasts}.", { lasts }));
  if (alsoAdds.length) sentences.push(siteText("pass.valid-also-adds", "It also adds {bundles}.", { bundles: alsoAdds.join("; ") }));
  let after;
  if (signedIn) {
    const email = getSignedInEmail();
    after = email ? siteText("pass.signed-in-as", "You are signed in as {email}.", { email }) : "";
  } else {
    after = siteText(
      "pass.valid-sign-in-next",
      "You sign in with a Google or Microsoft account next. When you come back, {name} is on your account.",
      { name: info.name },
    );
    if (check.emailRestricted) {
      after += ` ${siteText("pass.valid-email-restricted", "Use the Google or Microsoft account for the email address that this pass was sent to.")}`;
    }
  }
  render({
    heading: siteText("pass.heading-valid", "You have a pass for {name}", { name: info.name }),
    message: sentences.join(" "),
    redeem: { label: siteText("pass.redeem", "Redeem pass"), onClick: () => onRedeemClick() },
    after,
  });
}

function showAdding(info) {
  render({
    heading: siteText("pass.heading-adding", "Adding {name}", { name: info.name }),
    message: "",
    redeem: { label: siteText("pass.redeem", "Redeem pass"), disabled: true },
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

// The reader's language, so the server sends the pass redeemed email in it, as the generate pages do.
function siteLanguageHeader() {
  return window.siteLanguage && window.siteLanguage.current() === "cy" ? { "X-Site-Language": "cy" } : {};
}

async function redeem() {
  const info = bundleInfo(passCheck.bundleId);
  showAdding(info);
  try {
    const response = await window.fetchWithIdToken("/api/v1/pass", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...siteLanguageHeader() },
      body: JSON.stringify({ code: currentCode, acquisition: readPassLandingAttribution() }),
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
        heading: siteText("pass.heading-subscribe", "Subscribe to add {name}", { name: info.name }),
        message: siteText("pass.subscribe", "This pass lets you subscribe to {name}. Open your bundles to start the subscription.", {
          name: info.name,
        }),
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
      showHeld(body.bundleId ? bundleInfo(body.bundleId) : info);
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

async function onRedeemClick() {
  if (!getIdToken() && getStoredIdToken() && (await window.ensureSession({ force: true }))) {
    redeem();
    return;
  }
  if (getIdToken()) {
    redeem();
    return;
  }
  if (getStoredIdToken()) window.clearSession();
  try {
    sessionStorage.setItem("postLoginRedirect", window.location.pathname + window.location.search);
    sessionStorage.setItem(ADD_ON_RETURN_KEY, currentCode);
  } catch {}
  window.location.href = window.signInHref ? window.signInHref(SIGN_IN_PATH, "/") : SIGN_IN_PATH;
}

function showEntry() {
  render({
    heading: siteText("pass.heading-enter", "Enter your pass"),
    message: siteText("pass.enter", "Type the four words of your pass, then press Redeem pass."),
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

  render({ heading: siteText("pass.heading-checking", "Checking your pass"), message: "" });
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
