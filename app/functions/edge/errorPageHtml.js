// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/edge/errorPageHtml.js
// Error page HTML generation - separated for unit testing.
// The copy matches the static pages under web/public/errors/.

const ERROR_MESSAGES = {
  403: {
    title: "You cannot open this page",
    subtitle: "Your account does not have access to this page.",
    next: "Sign in with an account that has access, or go to the home page.",
    retry: false,
  },
  404: {
    title: "Page not found",
    subtitle: "The address may be wrong, or the page may have moved.",
    next: "Check the address, or go to the home page and find it from the menu.",
    retry: false,
  },
  500: {
    title: "Something went wrong",
    subtitle: "The problem is on our side, not yours.",
    next: "Try again in a minute. If it keeps happening, tell us on the Help page.",
    retry: true,
  },
  502: {
    title: "The service is not answering",
    subtitle: "One of our systems did not give a good answer.",
    next: "Try again in a minute. Nothing you entered has been sent to HMRC.",
    retry: true,
  },
  503: {
    title: "The service is busy",
    subtitle: "We are busy or being updated.",
    next: "Wait a minute, then try again. Your sign-in is kept.",
    retry: true,
  },
  504: {
    title: "The request took too long",
    subtitle: "The service did not answer in time.",
    next: "Try again. A VAT return you sent may still have been received, so check your receipts before you send it again.",
    retry: true,
  },
};

const GENERIC_ERROR = {
  title: "Something went wrong",
  subtitle: "We could not complete your request.",
  next: "Go to the home page and try again.",
  retry: false,
};

/**
 * Generate a self-contained error page. The page reflects nothing from the request.
 * @param {number} statusCode - HTTP status code
 * @returns {string} - Complete HTML page
 */
export function generateErrorHtml(statusCode) {
  const errorInfo = ERROR_MESSAGES[statusCode] || GENERIC_ERROR;
  const retryButton = errorInfo.retry ? `\n        <button type="button" class="btn" id="retryBtn">Try again</button>` : "";
  const homeClass = errorInfo.retry ? "btn btn-secondary" : "btn";

  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
  <meta charset="UTF-8">
  <title>${errorInfo.title} - DIY Accounting Submit</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    :root { color-scheme: light dark; --c-canvas: #f6f7f9; --c-paper: #ffffff; --c-ink: #1b2a41; --c-ink-muted: #4a5568; --c-rule: #8a94a6; --c-brand: #2c5aa0; --c-on-brand: #ffffff; }
    @media (prefers-color-scheme: dark) {
      :root { --c-canvas: #10161f; --c-paper: #17202b; --c-ink: #e6ebf2; --c-ink-muted: #a9b4c4; --c-rule: #6b778a; --c-brand: #8fb4ec; --c-on-brand: #10161f; }
    }
    body { margin: 0; background: var(--c-canvas); color: var(--c-ink); font-family: system-ui, sans-serif; line-height: 1.5; }
    header, main, footer { max-width: 40rem; margin: 0 auto; padding: 0 1rem; }
    .brand { margin: 0; padding: 0.75rem 0; border-bottom: 3px double var(--c-ink); font-weight: 700; }
    a { color: var(--c-brand); }
    .brand a { color: var(--c-ink); text-decoration: none; }
    .subtitle { color: var(--c-ink-muted); }
    .error-panel { background: var(--c-paper); border: 1px solid var(--c-rule); border-radius: 0.5rem; padding: 1rem 1.25rem; }
    .error-actions { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
    .btn { min-width: 12rem; padding: 0.6rem 1rem; border: 2px solid var(--c-brand); border-radius: 0.375rem; background: var(--c-brand); color: var(--c-on-brand); font: inherit; font-weight: 700; text-align: center; text-decoration: none; cursor: pointer; }
    .btn-secondary { background: transparent; color: var(--c-brand); }
    footer { padding-top: 1.5rem; padding-bottom: 1.5rem; color: var(--c-ink-muted); font-size: 0.875rem; }
    footer nav a { margin-right: 1rem; }
  </style>
  <link rel="stylesheet" href="/submit.css">
</head>
<body>
  <header>
    <p class="brand"><a href="/">DIY Accounting Submit</a></p>
    <h1>${errorInfo.title}</h1>
    <p class="subtitle">${errorInfo.subtitle}</p>
  </header>

  <main id="mainContent">
    <div class="form-container error-panel">
      <p>${errorInfo.next}</p>
      <div class="error-actions">${retryButton}
        <a href="/" class="${homeClass}" id="returnHomeBtn">Go to the home page</a>
      </div>
    </div>
  </main>

  <footer>
    <nav class="footer-links" aria-label="Site information">
      <a href="/privacy.html">Privacy</a>
      <a href="/terms.html">Terms</a>
      <a href="/accessibility.html">Accessibility</a>
      <a href="/help.html">Help</a>
    </nav>
    <p class="footer-legal">&copy; 2006-2026 DIY Accounting Limited.</p>
  </footer>

  <script>
    var retry = document.getElementById('retryBtn');
    if (retry) retry.addEventListener('click', function () { window.location.reload(); });
  </script>
</body>
</html>`;
}
