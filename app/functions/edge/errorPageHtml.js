// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/edge/errorPageHtml.js
// Error page HTML generation - separated for unit testing

const ERROR_MESSAGES = {
  403: { title: "Forbidden", message: "You do not have permission to access this resource." },
  404: { title: "Not Found", message: "The page you requested could not be found." },
  500: { title: "Server Error", message: "An unexpected error occurred. Please try again later." },
  502: { title: "Bad Gateway", message: "The server received an invalid response." },
  503: { title: "Service Unavailable", message: "The service is temporarily unavailable." },
  504: { title: "Gateway Timeout", message: "The server took too long to respond." },
};

/**
 * Generate error page HTML with consistent layout
 * @param {number} statusCode - HTTP status code
 * @param {string} requestedUri - The URI that was requested
 * @returns {string} - Complete HTML page
 */
export function generateErrorHtml(statusCode, requestedUri = "") {
  const errorInfo = ERROR_MESSAGES[statusCode] || {
    title: "Error",
    message: "An error occurred while processing your request.",
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>DIY Accounting Submit - ${statusCode} ${errorInfo.title}</title>
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <link rel="stylesheet" href="/submit.css">
</head>
<body>
  <header>
    <div class="header-nav">
      <div class="header-left">
        <a href="/index.html" title="Home" class="home-link">
          <svg class="home-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
          </svg>
        </a>
        <a href="/about.html" title="About & Help" class="info-link">
          <svg class="info-icon" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/>
          </svg>
        </a>
      </div>
      <div class="auth-section">
        <span class="entitlement-status">Activity: unrestricted</span>
        <span class="login-status" id="loginStatus">Not logged in</span>
        <a href="/auth/login.html" class="login-link" id="loginLink">Log in</a>
      </div>
    </div>
    <h1>DIY Accounting Submit</h1>
    <p class="subtitle">${statusCode} ${errorInfo.title}</p>
  </header>

  <main id="mainContent">
    <div class="form-container" style="text-align: center; padding: 2em;">
      <div class="error-content">
        <h2>${errorInfo.title}</h2>
        <p>${errorInfo.message}</p>
        <p class="requested-url">Requested URL: <code id="requestedUrl">${requestedUri}</code></p>
      </div>
      <div class="navigation-container" style="margin-top: 2em;">
        <button type="button" class="btn" onclick="window.location.href='/'">Return to Home</button>
      </div>
    </div>
  </main>

  <footer>
    <div class="footer-content">
      <div class="footer-left">
        <a href="/about.html">About</a>
        <a href="/privacy.html">Privacy</a>
        <a href="/terms.html">Terms</a>
      </div>
      <div class="footer-center">
        <p>&copy; 2006-2026 DIY Accounting Limited</p>
        <p>
          Free to use.
          <a href="https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk" target="_blank" rel="noopener">Source</a> available
          under the
          <a href="https://github.com/diy-accounting-uk/submit.diyaccounting.co.uk/blob/main/LICENSE" target="_blank" rel="noopener">PolyForm Internal Use License</a>.
        </p>
      </div>
      <div class="footer-right"></div>
    </div>
  </footer>

  <script>
    // Display actual URL from browser if not already set by server
    if (!document.getElementById('requestedUrl').textContent) {
      document.getElementById('requestedUrl').textContent = window.location.href;
    }

    // Check auth status from localStorage
    (function() {
      const idToken = localStorage.getItem('cognitoIdToken');
      const userInfo = localStorage.getItem('userInfo');
      const loginStatus = document.getElementById('loginStatus');
      const loginLink = document.getElementById('loginLink');

      if (idToken && userInfo) {
        try {
          const user = JSON.parse(userInfo);
          loginStatus.textContent = user.email || 'Logged in';
          loginLink.textContent = 'Log out';
          loginLink.href = '#';
          loginLink.onclick = function(e) {
            e.preventDefault();
            localStorage.removeItem('cognitoIdToken');
            localStorage.removeItem('cognitoAccessToken');
            localStorage.removeItem('cognitoRefreshToken');
            localStorage.removeItem('userInfo');
            window.location.reload();
          };
        } catch (e) {
          // Parse error, keep default state
        }
      }
    })();
  </script>
</body>
</html>`;
}
