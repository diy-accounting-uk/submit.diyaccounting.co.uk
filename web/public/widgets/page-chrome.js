// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability SITE-14 Render page chrome and widgets
// - **Use when:** a page needs the shared header, nav and footer, or a small shared UI widget.
// - **Does:** page-chrome.js builds the shared header, main nav and footer around each page's own static h1. It leaves a fallback link in place until it has run, so a script failure never strands the page. loading-spinner.js, status-messages.js and view-source-link.js are smaller widgets. dom-utils.js holds the underlying DOM helpers. developer-mode.js adds a header toggle visible only to users with a synthetic test bundle.
// - **Run:** no command; see Does and Entry
// - **Entry:** `web/public/widgets/page-chrome.js`; `web/public/lib/utils/dom-utils.js:showStatus`
// - **Files:** web/public/widgets/page-chrome.js, web/public/widgets/loading-spinner.js, web/public/widgets/status-messages.js, web/public/widgets/view-source-link.js, web/public/lib/utils/dom-utils.js, web/public/developer-mode.js, web/browser-tests/navigation.browser.test.js, web/browser-tests/mobileLayout.browser.test.js
// - **Keywords:** page chrome, header nav footer, loading spinner, status messages, developer mode, synthetic bundle toggle, dom helpers
// - **Related:** SITE-12, SITE-17
// @end-capability

// Page Chrome Widget
//
// Renders the header band (home, help and the account row) and the main nav
// above a page's own <h1> (and optional <p class="subtitle">), and fills in the
// footer, so that markup shared by every page lives once instead of being
// copy-pasted per page.
//
// Every page keeps its <h1> (and subtitle) as plain static HTML inside
// <header> - only the surrounding chrome is built here - so a page's title is
// never dependent on this script running. <header> also carries a small
// static fallback link (the ".chrome-fallback" paragraph) that is only
// removed once this widget has successfully built the real header: if this
// script 404s, is stubbed empty, or throws, that fallback link is what is
// left on the page, so a page never degrades to a dead end with no way back
// to the site.
//
// A page opts in with:
//   <header><p class="chrome-fallback"><a href="...">DIY Accounting Submit</a></p><h1>...</h1></header>
//   <footer></footer>
//   <script src="widgets/page-chrome.js"></script>   (adjusted for page depth)
//
// The script tag's own src encodes how many directories up the site root is
// from this page (the same "../" idiom already used for the stylesheet and
// every other shared asset), so that idiom is reused here instead of parsing
// window.location.pathname, which would include the whole filesystem path
// under file://.

(function () {
  "use strict";

  // The sign-in address that returns to a page: loginPath?next=<the page's path from the site root>.
  // The page defaults to the current one, or its copy in the chosen language; a page under /auth/
  // and the home page need no target.
  // A reader whose choice is Welsh signs in on the sign-in page's Welsh copy.
  function signInHref(loginPath, returnTo) {
    const target = returnTo === undefined ? copyInChromeLanguage() + window.location.search : returnTo;
    const signInPath = welshSignInPath(loginPath);
    if (!target.startsWith("/") || target === "/" || /^\/(cy\/)?auth\//.test(target)) return signInPath;
    return signInPath + "?next=" + encodeURIComponent(target);
  }
  window.signInHref = signInHref;

  function welshSignInPath(loginPath) {
    if (chromeLanguage() !== "cy" || (window.WELSH_COPIES || []).indexOf("auth/login.html") === -1) return loginPath;
    if (/(^|\/)cy\/auth\/login\.html$/.test(loginPath)) return loginPath;
    return loginPath.replace(/(^|\/)auth\/login\.html$/, "$1cy/auth/login.html");
  }

  // Runs before any page script or widget: a stored sign-in whose id or access token has expired and
  // that has no refresh token to renew it is cleared once, so the page renders signed out and no call
  // carries the dead token.
  (function clearUnrenewableSession() {
    try {
      const expired = (jwt) => {
        if (!jwt) return false;
        const claims = JSON.parse(atob(jwt.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
        return Boolean(claims.exp) && claims.exp * 1000 < Date.now();
      };
      const readExpired = (key) => {
        try {
          return expired(localStorage.getItem(key));
        } catch {
          return false;
        }
      };
      if (localStorage.getItem("cognitoRefreshToken")) return;
      if (!readExpired("cognitoIdToken") && !readExpired("cognitoAccessToken")) return;
      for (const key of ["cognitoAccessToken", "cognitoIdToken", "userInfo"]) localStorage.removeItem(key);
    } catch {
      // storage unavailable: nothing was stored
    }
  })();

  const HOME_ICON_PATH = "M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z";
  const INFO_ICON_PATH = "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z";

  // The colour scheme choice: "device" (no attribute), "light" or "dark".
  // A page that pins data-theme="light" in its markup keeps the pin and gets no switch.
  const THEME_STORAGE_KEY = "colourScheme";
  const THEME_MODES = ["device", "light", "dark"];
  const THEME_ICON_PATHS = {
    device: "M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18V4c4.41 0 8 3.59 8 8s-3.59 8-8 8z",
    light:
      "M12 7c-2.76 0-5 2.24-5 5s2.24 5 5 5 5-2.24 5-5-2.24-5-5-5zM2 13h2v-2H2v2zm18 0h2v-2h-2v2zM11 2v2h2V2h-2zm0 18v2h2v-2h-2zM5.99 4.58L4.58 5.99l1.41 1.41 1.41-1.41-1.41-1.41zm12.37 12.37l-1.41 1.41 1.41 1.41 1.41-1.41-1.41-1.41zm1.41-11.31l-1.41-1.41-1.41 1.41 1.41 1.41 1.41-1.41zM7.4 18.36l-1.41-1.41-1.41 1.41 1.41 1.41 1.41-1.41z",
    dark: "M12 3a9 9 0 1 0 9 9c0-.46-.04-.92-.1-1.36a5.389 5.389 0 0 1-4.4 2.26 5.403 5.403 0 0 1-3.14-9.8c-.44-.06-.9-.1-1.36-.1z",
  };

  const themePinnedLight = document.documentElement.getAttribute("data-theme") === "light";

  function readStoredTheme() {
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      return THEME_MODES.indexOf(stored) === -1 ? "device" : stored;
    } catch {
      return "device";
    }
  }

  function storeTheme(mode) {
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, mode);
      return true;
    } catch {
      return false;
    }
  }

  function applyTheme(mode) {
    if (mode === "device") document.documentElement.removeAttribute("data-theme");
    else document.documentElement.setAttribute("data-theme", mode);
  }

  // Runs as the script loads, before the header is built, so a stored dark choice paints dark.
  if (!themePinnedLight) applyTheme(readStoredTheme());

  // One whole sentence for each mode, because the Welsh name of the next mode mutates after "i".
  function themeButtonLabel(mode) {
    if (mode === "light") return siteText("chrome.theme-light", "Colour scheme: light. Switch to dark.");
    if (mode === "dark") return siteText("chrome.theme-dark", "Colour scheme: dark. Switch to device setting.");
    return siteText("chrome.theme-device", "Colour scheme: device setting. Switch to light.");
  }

  function renderThemeButton(button, mode) {
    button.setAttribute("aria-label", themeButtonLabel(mode));
    button.setAttribute("title", themeButtonLabel(mode));
    button.setAttribute("data-theme-mode", mode);
    button.querySelector("path").setAttribute("d", THEME_ICON_PATHS[mode]);
  }

  function buildThemeButtonHtml() {
    return (
      '<button type="button" class="theme-toggle">' +
      '<svg class="theme-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="" /></svg>' +
      "</button>"
    );
  }

  function wireThemeButton(header) {
    const button = header.querySelector(".theme-toggle");
    if (!button) return;
    let mode = readStoredTheme();
    renderThemeButton(button, mode);
    button.addEventListener("click", function () {
      mode = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
      applyTheme(mode);
      storeTheme(mode);
      renderThemeButton(button, mode);
    });
  }

  // The language choice: "en" or "cy". The language option stores it and nothing else does. With no
  // stored choice the chrome takes the language of the page. The Welsh text of the chrome and of
  // every script that calls siteText comes from lib/welsh-text.js, which scripts/build-welsh-pages.mjs
  // writes from i18n/cy.toml.
  const LANGUAGE_STORAGE_KEY = "siteLanguage";
  const LANGUAGES = ["en", "cy"];
  const LANGUAGE_NAMES = { en: "English", cy: "Cymraeg" };
  const HREFLANG = { en: "en-GB", cy: "cy" };

  function readStoredLanguage() {
    try {
      const stored = window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
      return LANGUAGES.indexOf(stored) === -1 ? null : stored;
    } catch {
      return null;
    }
  }

  function storeLanguage(language) {
    try {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
      return true;
    } catch {
      return false;
    }
  }

  const pageLanguage = document.documentElement.getAttribute("lang") === "cy" ? "cy" : "en";
  const chosenLanguage = readStoredLanguage() || pageLanguage;

  // A parser-blocking script written here runs before the scripts that follow page-chrome.js, so
  // every widget and page script finds the Welsh text. A Welsh page carries the tag itself.
  if (chosenLanguage === "cy" && !window.WELSH_TEXT && document.readyState === "loading") {
    // eslint-disable-next-line no-unsanitized/method -- a fixed script tag; the prefix comes from this script's own src
    document.write('<script src="' + computeRootPrefix() + 'lib/welsh-text.js"></script>');
  }

  // The language the chrome reads in: the choice, when its text has loaded.
  function chromeLanguage() {
    return chosenLanguage === "cy" && window.WELSH_TEXT ? "cy" : "en";
  }

  // siteText("<id>", "<English>", { name: value }) gives the text in the chrome's language. The id
  // and the English are literals, so the Welsh build finds each call and checks its entry in
  // i18n/cy.toml; "{name}" in either text takes values.name.
  function siteText(id, english, values) {
    const welsh = chromeLanguage() === "cy" ? window.WELSH_TEXT[id] : undefined;
    const text = welsh === undefined ? english : welsh;
    if (!values) return text;
    return text.replace(/\{([a-z]+)\}/g, function (whole, name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? String(values[name]) : whole;
    });
  }

  window.siteText = siteText;
  window.siteLanguage = {
    current: function () {
      return readStoredLanguage() || pageLanguage;
    },
    chrome: chromeLanguage,
    store: storeLanguage,
  };
  document.documentElement.setAttribute("data-chrome-language", chosenLanguage);

  function escapeHtml(text) {
    return String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  // The page's alternate in a language, as a path from the site root, or null.
  function alternatePath(language) {
    const link = document.querySelector('head link[rel="alternate"][hreflang="' + HREFLANG[language] + '"]');
    if (!link) return null;
    try {
      return new URL(link.getAttribute("href")).pathname;
    } catch {
      return null;
    }
  }

  // This page's path, or the path of its copy in the chrome's language when it has one.
  function copyInChromeLanguage() {
    const language = chromeLanguage();
    const copy = language === pageLanguage ? null : alternatePath(language);
    return copy || window.location.pathname;
  }

  // A site path (no leading slash, "" for the home page) in the chrome's language: its Welsh copy
  // when the chrome is Welsh and the page has one. inEnglish is true for a Welsh reader sent to an
  // English page.
  function chromeTarget(target) {
    if (chromeLanguage() !== "cy") return { target: target, inEnglish: false };
    const path = target === "" ? "index.html" : target;
    if ((window.WELSH_COPIES || []).indexOf(path) !== -1) return { target: "cy/" + path, inEnglish: false };
    return { target: target, inEnglish: true };
  }

  function inEnglishMarkHtml(inEnglish) {
    return inEnglish ? ' <span class="lang-mark">' + escapeHtml(siteText("chrome.in-english", "(in English)")) + "</span>" : "";
  }

  // The copy in a language of the address as it is now, with its query: a pass code or a company
  // number goes with the reader, and a parameter the page has already removed does not. A page
  // served at an address other than its own path (the company lookup's drill-down, opened cold or
  // moved with history.pushState) has its Welsh copy at the same address under /cy/.
  function copyOfAddress(rootPrefix, copy, language) {
    const here = window.location.pathname;
    const own = alternatePath(pageLanguage);
    const elsewhere = own !== null && here !== own && here + "index.html" !== own;
    let path = copy;
    if (elsewhere) path = language === "cy" ? "/cy" + here : here.replace(/^\/cy(?=\/)/, "");
    return (rootPrefix + path.replace(/^\//, "") || "./") + window.location.search;
  }

  // The link's address is read again when it is about to be used. pointerdown comes before a
  // click, a middle click and the context menu's "open in new tab", with a mouse, a pen or a
  // finger; focus comes before a keyboard's Enter or menu key; click covers an address that
  // changed while the link held focus.
  function followAddress(link, address) {
    const refresh = function () {
      link.setAttribute("href", address());
    };
    refresh();
    ["pointerdown", "focus", "click"].forEach(function (type) {
      link.addEventListener(type, refresh);
    });
  }

  // The option names the other language. It goes to this page's copy in that language when there
  // is one, and to this page again when there is not, so the chrome changes and the body stays.
  function buildLanguageSwitch(rootPrefix) {
    const language = chromeLanguage();
    const other = language === "cy" ? "en" : "cy";
    const copy = pageLanguage === other ? null : alternatePath(other);
    const nav = document.createElement("div");
    nav.className = "language-switch";
    nav.setAttribute("role", "group");
    nav.setAttribute("aria-label", siteText("chrome.language", "Language"));
    const item = document.createElement("a");
    if (copy) {
      followAddress(item, function () {
        return copyOfAddress(rootPrefix, copy, other);
      });
      item.setAttribute("hreflang", HREFLANG[other]);
    } else {
      followAddress(item, function () {
        return window.location.href.split("#")[0];
      });
    }
    item.setAttribute("lang", HREFLANG[other]);
    item.textContent = LANGUAGE_NAMES[other];
    item.addEventListener("click", function () {
      storeLanguage(other);
    });
    nav.append(item);
    return nav;
  }

  // A line under the nav when the body is in one language and the chrome in the other.
  function buildLanguageNotice(rootPrefix) {
    const language = chromeLanguage();
    if (language === pageLanguage) return null;
    const copy = alternatePath(language);
    const notice = document.createElement("p");
    notice.className = "language-notice";
    notice.setAttribute("lang", HREFLANG[language]);
    if (!copy) {
      notice.textContent = siteText("chrome.notice-in-english", "This page is in English.");
      return notice;
    }
    const link = document.createElement("a");
    followAddress(link, function () {
      return copyOfAddress(rootPrefix, copy, language);
    });
    link.setAttribute("hreflang", HREFLANG[language]);
    if (language === "cy") {
      notice.append(siteText("chrome.notice-welsh-copy", "This page is also in Welsh.") + " ");
      link.textContent = siteText("chrome.read-in-welsh", "Read it in Welsh");
    } else {
      notice.append(siteText("chrome.notice-english-copy", "This page is in Welsh.") + " ");
      link.textContent = siteText("chrome.read-in-english", "Read it in English");
    }
    notice.append(link);
    return notice;
  }

  // A function, so each label is read in the chrome's language when the nav is built.
  function navLinks() {
    return [
      { label: siteText("chrome.nav-activities", "Activities"), target: "" },
      { label: siteText("chrome.nav-receipts", "Receipts"), target: "hmrc/receipt/receipts.html" },
      { label: siteText("chrome.nav-bundles", "Bundles"), target: "bundles.html" },
      { label: siteText("chrome.nav-spreadsheets", "Spreadsheets"), target: "spreadsheets.html" },
      { label: siteText("chrome.nav-mtd-calendar", "MTD calendar"), target: "mtd-calendar.html" },
      { label: siteText("chrome.nav-tax-rates", "Tax rates"), target: "rates.html" },
      { label: siteText("chrome.nav-tools", "Tools"), target: "tools.html" },
      // Last, so the link that appears when the catalogue loads moves no other link.
      { label: siteText("chrome.nav-practice", "Practice"), target: "practice.html", activity: "practice" },
    ];
  }

  function findOwnScript() {
    return document.currentScript || document.querySelector('script[src$="widgets/page-chrome.js"]');
  }

  // The script's own src already carries the "../" (or "") prefix needed to
  // reach the site root from this page - reuse it rather than deriving depth
  // from the URL, which would break under file:// (the pathname there is the
  // full disk path, not just the path below web/public).
  function computeRootPrefix() {
    const scriptEl = findOwnScript();
    const src = scriptEl && scriptEl.getAttribute("src");
    const marker = "widgets/page-chrome.js";
    if (!src) return "";
    const idx = src.indexOf(marker);
    return idx === -1 ? "" : src.slice(0, idx);
  }

  function isActiveTarget(target, pathname) {
    if (target === "") {
      return pathname === "/" || /\/$/.test(pathname) || /\/index\.html$/.test(pathname);
    }
    return pathname.indexOf("/" + target) !== -1;
  }

  function hrefOf(rootPrefix, target) {
    return rootPrefix + target || "./";
  }

  function buildHeaderNavHtml(rootPrefix) {
    const home = chromeTarget("");
    const about = chromeTarget("about.html");
    const aboutLabel = siteText("chrome.about", "About") + (about.inEnglish ? " " + siteText("chrome.in-english", "(in English)") : "");
    return (
      '<div class="header-nav"' +
      chromeLangAttribute() +
      ">" +
      '<div class="header-left">' +
      '<a href="' +
      hrefOf(rootPrefix, home.target) +
      '" title="' +
      escapeHtml(siteText("chrome.home", "Home")) +
      '" class="home-link">' +
      '<svg class="home-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
      HOME_ICON_PATH +
      '" /></svg>' +
      '<span class="brand-name">DIY Accounting Submit</span>' +
      "</a>" +
      '<a href="' +
      hrefOf(rootPrefix, about.target) +
      '" title="' +
      escapeHtml(aboutLabel) +
      '" aria-label="' +
      escapeHtml(aboutLabel) +
      '" class="info-link">' +
      '<svg class="info-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
      INFO_ICON_PATH +
      '" /></svg>' +
      "</a>" +
      (themePinnedLight ? "" : buildThemeButtonHtml()) +
      "</div>" +
      '<div class="auth-section">' +
      '<span class="entitlement-status">' +
      escapeHtml(siteText("chrome.activity-unrestricted", "Activity: unrestricted")) +
      "</span>" +
      '<span class="login-status">' +
      escapeHtml(siteText("chrome.not-signed-in", "Not signed in")) +
      "</span>" +
      '<a href="' +
      escapeHtml(signInHref(rootPrefix + "auth/login.html")) +
      '" class="login-link">' +
      escapeHtml(siteText("chrome.sign-in", "Sign in")) +
      "</a>" +
      "</div>" +
      "</div>"
    );
  }

  // The lang attribute for chrome that reads in a language other than the page's.
  function chromeLangAttribute() {
    const language = chromeLanguage();
    return language === pageLanguage ? "" : ' lang="' + HREFLANG[language] + '"';
  }

  function buildNavHtml(rootPrefix, pathname) {
    const links = navLinks().map(function (link) {
      const resolved = chromeTarget(link.target);
      const active = isActiveTarget(link.target, pathname) ? ' class="active" aria-current="page"' : "";
      const gated = link.activity ? ' data-activity="' + link.activity + '" hidden' : "";
      return (
        '<a href="' +
        hrefOf(rootPrefix, resolved.target) +
        '"' +
        active +
        gated +
        ">" +
        escapeHtml(link.label) +
        inEnglishMarkHtml(resolved.inEnglish) +
        "</a>"
      );
    });
    return (
      '<nav class="main-nav" aria-label="' +
      escapeHtml(siteText("chrome.main-navigation", "Main navigation")) +
      '"' +
      chromeLangAttribute() +
      ">" +
      links.join("") +
      "</nav>"
    );
  }

  // The landing pages for the filings that are production on prod.
  function filingPages() {
    return [
      { label: siteText("chrome.footer-vat-return", "VAT return from a spreadsheet"), target: "vat-return-from-a-spreadsheet.html" },
      { label: siteText("chrome.footer-micro-entity", "Micro-entity accounts"), target: "micro-entity-accounts.html" },
      { label: siteText("chrome.footer-small-company", "Small company accounts"), target: "small-company-accounts.html" },
      { label: siteText("chrome.footer-dormant-company", "Dormant company accounts"), target: "dormant-company-accounts.html" },
      { label: siteText("chrome.footer-confirmation-statement", "Confirmation statement"), target: "confirmation-statement.html" },
    ];
  }

  function siteLinks() {
    return [
      { label: siteText("chrome.footer-privacy", "Privacy"), target: "privacy.html" },
      { label: siteText("chrome.footer-security", "Security"), target: "security.html" },
      { label: siteText("chrome.footer-terms", "Terms"), target: "terms.html" },
      { label: siteText("chrome.footer-accessibility", "Accessibility"), target: "accessibility.html" },
      { label: siteText("chrome.footer-cookie-choices", "Cookie choices"), cookieChoices: true },
      { label: siteText("chrome.about", "About"), target: "about.html" },
      { label: siteText("chrome.footer-help", "Help"), target: "help.html" },
    ];
  }

  function footerLinkHtml(rootPrefix, link) {
    if (link.cookieChoices) return '<a href="#" data-cookie-choices>' + escapeHtml(link.label) + "</a>";
    const resolved = chromeTarget(link.target);
    return (
      '<a href="' + hrefOf(rootPrefix, resolved.target) + '">' + escapeHtml(link.label) + inEnglishMarkHtml(resolved.inEnglish) + "</a>"
    );
  }

  // The developer links stay hidden until developer mode shows them.
  function buildFooterHtml(rootPrefix) {
    const filingLinks = filingPages()
      .map((link) => footerLinkHtml(rootPrefix, link))
      .join("");

    const devLinks =
      '<a href="#" id="viewSourceLink" style="display: none">' +
      escapeHtml(siteText("chrome.dev-view-source", "view source")) +
      "</a>" +
      '<a id="latestTestsLink" style="display: none" target="_blank" href="' +
      rootPrefix +
      'tests/index.html">' +
      escapeHtml(siteText("chrome.dev-tests", "tests")) +
      "</a>" +
      '<a id="apiDocsLink" style="display: none" target="_blank" href="' +
      rootPrefix +
      'docs/api/index.html">' +
      escapeHtml(siteText("chrome.dev-api", "api")) +
      "</a>";

    const sourceLink =
      '<a href="https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk" target="_blank" rel="noopener">' +
      escapeHtml(siteText("chrome.footer-source", "Source")) +
      "</a>";

    const licenceLink =
      '<a href="https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/blob/main/LICENSE" target="_blank" rel="noopener">PolyForm Internal Use License</a>' +
      inEnglishMarkHtml(chromeLanguage() === "cy");
    const legal = escapeHtml(siteText("chrome.footer-legal", "Free to use under the {licence}.")).replace("{licence}", licenceLink);

    return (
      '<nav class="footer-links" aria-label="' +
      escapeHtml(siteText("chrome.footer-site-information", "Site information")) +
      '">' +
      filingLinks +
      siteLinks()
        .map((link) => footerLinkHtml(rootPrefix, link))
        .join("") +
      sourceLink +
      devLinks +
      "</nav>" +
      '<p class="footer-legal">&copy; 2006-2026 DIY Accounting Limited. ' +
      legal +
      "</p>"
    );
  }

  // The nav goes straight after the header band, so the reading order and the
  // tab order match what the eye sees: band, nav, then the page's own title.
  function renderHeader(header, rootPrefix) {
    const pathname = window.location.pathname;
    const navHtml = buildNavHtml(rootPrefix, pathname);
    const headerNavHtml = buildHeaderNavHtml(rootPrefix);

    const fallback = header.querySelector(".chrome-fallback");
    if (fallback) fallback.remove();

    // eslint-disable-next-line no-unsanitized/method -- both strings are built from the fixed link tables, the escaped catalogue text and the page-relative root prefix
    header.insertAdjacentHTML("afterbegin", headerNavHtml + navHtml);
    wireThemeButton(header);
    header.querySelector(".header-left").append(buildLanguageSwitch(rootPrefix));
    const notice = buildLanguageNotice(rootPrefix);
    if (notice) header.querySelector(".main-nav").after(notice);
  }

  // The skip link is each page's own markup; it reads in the chrome's language too. A Welsh copy's
  // skip link carries its Welsh; a callback page that callback-language.js set to Welsh has English markup.
  function renderSkipLink() {
    const skipLink = document.querySelector("body > .skip-link");
    if (!skipLink) return;
    const markedInPageLanguage = pageLanguage === "en" || skipLink.hasAttribute("data-i18n");
    if (chromeLanguage() === pageLanguage && markedInPageLanguage) return;
    skipLink.textContent = siteText("common.skip-link", "Skip to main content");
    if (chromeLanguage() !== pageLanguage) skipLink.setAttribute("lang", HREFLANG[chromeLanguage()]);
  }

  function loadTomlParser(rootPrefix) {
    if (window.TOML) return Promise.resolve();
    return new Promise(function (resolve, reject) {
      const script = document.createElement("script");
      script.src = rootPrefix + "lib/toml-parser.js";
      script.onload = resolve;
      script.onerror = reject;
      document.head.appendChild(script);
    });
  }

  // A nav link that names a catalogue activity shows only where the catalogue lists that activity
  // in this environment, or preview features are on. It starts hidden, so a page that cannot read
  // the catalogue shows no link.
  async function revealListedNavLinks(header, rootPrefix) {
    const gated = header.querySelectorAll(".main-nav a[data-activity]");
    if (gated.length === 0) return;
    try {
      await loadTomlParser(rootPrefix);
      const service = await import("/lib/services/catalog-service.js");
      const viewerSettings = await import("/lib/services/viewer-settings.js");
      const [catalogText, environmentName, viewer] = await Promise.all([
        service.fetchCatalogText(new URL(rootPrefix + "submit.catalogue.toml", window.location.href).href),
        service.fetchCurrentEnvironmentName(new URL(rootPrefix + "submit.environment-name.txt", window.location.href).href),
        viewerSettings.fetchViewer(),
      ]);
      const catalog = window.TOML.parse(catalogText);
      gated.forEach(function (anchor) {
        const activity = (catalog.activities || []).find(function (entry) {
          return entry.id === anchor.dataset.activity;
        });
        if (activity && service.isActivityShown(activity, environmentName, viewer)) anchor.hidden = false;
      });
    } catch (err) {
      console.warn("page-chrome: could not read the catalogue for the nav", err);
    }
  }

  function renderFooter(footer, rootPrefix) {
    // eslint-disable-next-line no-unsanitized/property -- the footer markup is fixed text, the escaped catalogue text and the page-relative root prefix
    footer.innerHTML = buildFooterHtml(rootPrefix);
    const language = chromeLanguage();
    if (language !== pageLanguage) footer.setAttribute("lang", HREFLANG[language]);
  }

  function renderPageChrome() {
    const header = document.querySelector("header");
    const footer = document.querySelector("body > footer");
    const rootPrefix = computeRootPrefix();
    renderSkipLink();

    // Each render is independent: a mistake building one must not cost the
    // other, and either failing must leave that element's existing static
    // fallback content in place rather than a half-built shell.
    if (header) {
      try {
        renderHeader(header, rootPrefix);
        revealListedNavLinks(header, rootPrefix);
      } catch (err) {
        console.error("page-chrome: failed to render header, leaving static fallback in place", err);
      }
    }

    if (footer) {
      try {
        renderFooter(footer, rootPrefix);
      } catch (err) {
        console.error("page-chrome: failed to render footer", err);
      }
    }
  }

  if (typeof window !== "undefined") {
    window.PageChrome = { render: renderPageChrome };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", renderPageChrome);
  } else {
    renderPageChrome();
  }
})();
