// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Page Chrome Widget
//
// Renders the header icons/auth-section and the main nav around a page's own
// <h1> (and optional <p class="subtitle">), and fills in the footer, so that
// markup shared by every page lives once instead of being copy-pasted per page.
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
//   <footer data-footer="full|activity|activity-boxed"></footer>
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

  const NAV_LINKS = [
    { label: "Activities", target: "" },
    { label: "Receipts", target: "hmrc/receipt/receipts.html" },
    { label: "Bundles", target: "bundles.html" },
    { label: "Spreadsheets", target: "spreadsheets.html" },
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
      "</a>" +
      '<a href="' +
      rootPrefix +
      'about.html" title="About & Help" class="info-link">' +
      '<svg class="info-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="' +
      INFO_ICON_PATH +
      '" /></svg>' +
      "</a>" +
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
      const active = isActiveTarget(link.target, pathname) ? ' class="active"' : "";
      return '<a href="' + href + '"' + active + ">" + link.label + "</a>";
    });
    return '<nav class="main-nav" aria-label="Main navigation">' + links.join("") + "</nav>";
  }

  function buildFooterHtml(rootPrefix, variant) {
    const showLegal = variant === "full";
    const boxed = variant === "full" || variant === "activity-boxed";

    const devLinks =
      '<a href="#" id="viewSourceLink" style="display: none">view source</a>' +
      '<a id="latestTestsLink" style="display: inline" target="_blank" href="' +
      rootPrefix +
      'tests/index.html">tests</a>' +
      '<a id="apiDocsLink" style="display: inline" target="_blank" href="' +
      rootPrefix +
      'docs/api/index.html"> api </a>';

    const legalLinks = showLegal
      ? '<a href="' +
        rootPrefix +
        'privacy.html">privacy</a>' +
        '<a href="' +
        rootPrefix +
        'terms.html">terms</a>' +
        '<a href="' +
        rootPrefix +
        'accessibility.html">accessibility</a>'
      : "";

    const center =
      '<div class="footer-center">' +
      "<p>&copy; 2006-2026 DIY Accounting Limited</p>" +
      "<p>Free to use. " +
      '<a href="https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk" target="_blank" rel="noopener">Source</a> ' +
      "available under the " +
      '<a href="https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/blob/main/LICENSE" target="_blank" rel="noopener">PolyForm Internal Use License</a>.' +
      "</p>" +
      "</div>";

    if (boxed) {
      return (
        '<div class="footer-content">' +
        '<div class="footer-left">' +
        devLinks +
        legalLinks +
        "</div>" +
        center +
        '<div class="footer-right"></div>' +
        "</div>"
      );
    }

    return '<div class="footer-left">' + devLinks + legalLinks + "</div>" + '<div class="footer-content">' + center + "</div>";
  }

  function renderHeader(header, rootPrefix) {
    const pathname = window.location.pathname;
    const navHtml = buildNavHtml(rootPrefix, pathname);
    const headerNavHtml = buildHeaderNavHtml(rootPrefix);

    const fallback = header.querySelector(".chrome-fallback");
    if (fallback) fallback.remove();

    header.insertAdjacentHTML("afterbegin", headerNavHtml);
    header.insertAdjacentHTML("beforeend", navHtml);
  }

  function renderFooter(footer, rootPrefix) {
    const variant = footer.getAttribute("data-footer") || "full";
    footer.innerHTML = buildFooterHtml(rootPrefix, variant);
  }

  function renderPageChrome() {
    const header = document.querySelector("header");
    const footer = document.querySelector("footer");
    const rootPrefix = computeRootPrefix();

    // Each render is independent: a mistake building one must not cost the
    // other, and either failing must leave that element's existing static
    // fallback content in place rather than a half-built shell.
    if (header) {
      try {
        renderHeader(header, rootPrefix);
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
