// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

window.onload = function() {
    // Determine if we're logged in by checking for Cognito session
    const isLoggedIn = document.cookie.includes('AWSELBAuthSessionCookie') ||
                      document.cookie.includes('cognito') ||
                      localStorage.getItem('cognitoToken');

    const ui = SwaggerUIBundle({
        url: './openapi.json',
        dom_id: '#swagger-ui',
        deepLinking: true,
        validatorUrl: null,
        presets: [
            SwaggerUIBundle.presets.apis,
            SwaggerUIStandalonePreset
        ],
        plugins: [
            SwaggerUIBundle.plugins.DownloadUrl
        ],
        layout: "StandaloneLayout",
        requestInterceptor: function(request) {
            // If logged in via the website, include cookies for same-origin requests
            if (isLoggedIn && request.url.startsWith(window.location.origin)) {
                request.credentials = 'include';
            }
            return request;
        },
        onComplete: function() {
            if (isLoggedIn) {
                // Show a notice that the user is authenticated
                const authNotice = document.createElement('div');
                authNotice.style.cssText = 'background: #d4edda; border: 1px solid #c3e6cb; color: #155724; padding: 10px; margin: 10px; border-radius: 4px;';
                authNotice.textContent = "✓ You appear to be logged in. API calls will use your existing session.";
                document.querySelector('.swagger-ui').prepend(authNotice);
            }
        }
    });

    window.ui = ui;
};
