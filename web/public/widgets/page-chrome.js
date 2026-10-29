// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

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
  const THEME_LABELS = { device: "device setting", light: "light", dark: "dark" };

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

  function themeButtonLabel(mode) {
    const next = THEME_MODES[(THEME_MODES.indexOf(mode) + 1) % THEME_MODES.length];
    return "Colour scheme: " + THEME_LABELS[mode] + ". Switch to " + THEME_LABELS[next] + ".";
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

  const NAV_LINKS = [
    { label: "Activities", target: "" },
    { label: "Receipts", target: "hmrc/receipt/receipts.html" },
    { label: "Bundles", target: "bundles.html" },
    { label: "Practice", target: "practice.html", activity: "practice" },
    { label: "Spreadsheets", target: "spreadsheets.html" },
    { label: "MTD calendar", target: "mtd-calendar.html" },
    { label: "Tax rates", target: "rates.html" },
  ];

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

  function buildHeaderNavHtml(rootPrefix) {
    const homeHref = rootPrefix === "" ? "./" : rootPrefix;
    return (
      '<div class="header-nav">' +
      '<div class="header-left">' +
      '<a href="' +
      homeHref +
      '" title="Home" class="home-link">' +
      '<svg class="home-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
      HOME_ICON_PATH +
      '" /></svg>' +
      '<span class="brand-name">DIY Accounting Submit</span>' +
      "</a>" +
      '<a href="' +
      rootPrefix +
      'about.html" title="About & Help" class="info-link">' +
      '<svg class="info-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
      INFO_ICON_PATH +
      '" /></svg>' +
      "</a>" +
      (themePinnedLight ? "" : buildThemeButtonHtml()) +
      "</div>" +
      '<div class="auth-section">' +
      '<span class="entitlement-status">Activity: unrestricted</span>' +
      '<span class="login-status">Not logged in</span>' +
      '<a href="' +
      rootPrefix +
      'auth/login.html" class="login-link">Log in</a>' +
      "</div>" +
      "</div>"
    );
  }

  function buildNavHtml(rootPrefix, pathname) {
    const homeHref = rootPrefix === "" ? "./" : rootPrefix;
    const links = NAV_LINKS.map(function (link) {
      const href = link.target === "" ? homeHref : rootPrefix + link.target;
      const active = isActiveTarget(link.target, pathname) ? ' class="active" aria-current="page"' : "";
      const gated = link.activity ? ' data-activity="' + link.activity + '" hidden' : "";
      return '<a href="' + href + '"' + active + gated + ">" + link.label + "</a>";
    });
    return '<nav class="main-nav" aria-label="Main navigation">' + links.join("") + "</nav>";
  }

  // The developer links stay hidden until developer mode shows them.
  function buildFooterHtml(rootPrefix) {
    const devLinks =
      '<a href="#" id="viewSourceLink" style="display: none">view source</a>' +
      '<a id="latestTestsLink" style="display: none" target="_blank" href="' +
      rootPrefix +
      'tests/index.html">tests</a>' +
      '<a id="apiDocsLink" style="display: none" target="_blank" href="' +
      rootPrefix +
      'docs/api/index.html">api</a>';

    const siteLinks =
      '<a href="' +
      rootPrefix +
      'privacy.html">Privacy</a>' +
      '<a href="' +
      rootPrefix +
      'terms.html">Terms</a>' +
      '<a href="' +
      rootPrefix +
      'accessibility.html">Accessibility</a>' +
      '<a href="#" data-cookie-choices>Cookie choices</a>' +
      '<a href="' +
      rootPrefix +
      'help.html">Help</a>' +
      '<a href="https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk" target="_blank" rel="noopener">Source</a>';

    return (
      '<nav class="footer-links" aria-label="Site information">' +
      siteLinks +
      devLinks +
      "</nav>" +
      '<p class="footer-legal">&copy; 2006-2026 DIY Accounting Limited. Free to use under the ' +
      '<a href="https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/blob/main/LICENSE" target="_blank" rel="noopener">PolyForm Internal Use License</a>.' +
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

    header.insertAdjacentHTML("afterbegin", headerNavHtml + navHtml);
    wireThemeButton(header);

    // On a narrow screen the row scrolls sideways; bring the current page's link into view.
    const nav = header.querySelector(".main-nav");
    const active = nav && nav.querySelector("a.active");
    if (nav && active && nav.scrollWidth > nav.clientWidth) {
      nav.scrollLeft = Math.max(0, active.offsetLeft - nav.clientWidth / 2 + active.offsetWidth / 2);
    }
    if (nav) {
      const markScrollEdges = () => {
        nav.classList.toggle("has-more-before", nav.scrollLeft > 1);
        nav.classList.toggle("has-more-after", nav.scrollLeft + nav.clientWidth < nav.scrollWidth - 1);
      };
      nav.addEventListener("scroll", markScrollEdges, { passive: true });
      window.addEventListener("resize", markScrollEdges);
      markScrollEdges();
    }
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
  // in this environment. It starts hidden, so a page that cannot read the catalogue shows no link.
  async function revealListedNavLinks(header, rootPrefix) {
    const gated = header.querySelectorAll(".main-nav a[data-activity]");
    if (gated.length === 0) return;
    try {
      await loadTomlParser(rootPrefix);
      const service = await import("/lib/services/catalog-service.js");
      const [catalogResponse, environmentName] = await Promise.all([
        fetch(new URL(rootPrefix + "submit.catalogue.toml", window.location.href).href),
        service.fetchCurrentEnvironmentName(new URL(rootPrefix + "submit.environment-name.txt", window.location.href).href),
      ]);
      if (!catalogResponse.ok) return;
      const catalog = window.TOML.parse(await catalogResponse.text());
      gated.forEach(function (anchor) {
        const activity = (catalog.activities || []).find(function (entry) {
          return entry.id === anchor.dataset.activity;
        });
        if (activity && service.isActivityListedInEnvironment(activity, environmentName)) anchor.hidden = false;
      });
    } catch (err) {
      console.warn("page-chrome: could not read the catalogue for the nav", err);
    }
  }

  function renderFooter(footer, rootPrefix) {
    footer.innerHTML = buildFooterHtml(rootPrefix);
  }

  function renderPageChrome() {
    const header = document.querySelector("header");
    const footer = document.querySelector("body > footer");
    const rootPrefix = computeRootPrefix();

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
