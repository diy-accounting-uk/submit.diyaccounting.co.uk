// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import js from "@eslint/js";
import google from "eslint-config-google";
import eslintPluginPrettierRecommended from "eslint-plugin-prettier/recommended";
import globals from "globals";
import promise from "eslint-plugin-promise";
import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import react from "eslint-plugin-react";
import importPlugin from "eslint-plugin-import";

const modifiedGoogleConfig = { ...google, rules: { ...google.rules } };
delete modifiedGoogleConfig.rules["valid-jsdoc"];
delete modifiedGoogleConfig.rules["require-jsdoc"];

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  js.configs.recommended,
  modifiedGoogleConfig,
  eslintPluginPrettierRecommended,
  {
    plugins: {
      promise,
      security,
      sonarjs,
      react,
      import: importPlugin,
    },
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: {
        ...globals.node,
      },
    },
    rules: {
      "prettier/prettier": "error",
      ...promise.configs.recommended.rules,
      ...sonarjs.configs.recommended.rules,
      "sonarjs/os-command": "off",
      // Raise allowed cognitive complexity from default (15) to 40
      "sonarjs/cognitive-complexity": ["error", 40],
      // Do not complain about TODO comments
      "sonarjs/todo-tag": "off",
      "no-warning-comments": "off",

      // Formatting and organisation
      "no-unused-vars": ["error", { argsIgnorePattern: "^_" }],
      "no-extra-semi": 2,
      "object-curly-newline": ["error", { consistent: true }],
      "array-element-newline": ["error", "consistent", { multiline: true, minItems: 10 }],
      "import/newline-after-import": ["error", { count: 1 }],
      "camelcase": "off",

      // ESM import rules
      "import/no-amd": "error",
      "import/no-commonjs": "error",
      "import/no-import-module-exports": "error",
      "import/no-cycle": "error",
      "import/no-dynamic-require": "error",
      "import/no-self-import": "off",
      "import/no-unresolved": "off",
      "import/no-useless-path-segments": "error",
      "import/no-duplicates": "error",
      "sonarjs/fixme-tag": "warn",
    },
  },
  {
    files: ["**/*.js"],
    ignores: ["**/*-tests/**/*.js", "**/*.test.js", "eslint.config.js", "web/pubic/tests", "web/pubic/docs"],
    rules: {
      ...security.configs.recommended.rules,
      "security/detect-non-literal-fs-filename": "off",
      "security/detect-non-literal-regexp": "off",
      "security/detect-object-injection": "off",
    },
  },
  // Browser environment for web scripts (submit site)
  {
    files: ["web/public/**/*.js", "web/browser-tests/**/*.js", "web/unit-tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        dataLayer: "writable",
        gtag: "writable",
      },
    },
    rules: {
      "sonarjs/code-eval": "off",
    },
  },
  // Browser environment for spreadsheets site (loaded via <script> tags, not ESM)
  {
    files: ["web/spreadsheets.diyaccounting.co.uk/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        dataLayer: "writable",
        gtag: "writable",
        TomlParser: "readonly",
        KBSearch: "readonly",
        debounce: "readonly",
      },
    },
    rules: {
      "no-invalid-this": "off",
      "prefer-rest-params": "off",
      "sonarjs/no-ignored-exceptions": "off",
      "sonarjs/slow-regex": "off",
      "promise/always-return": "off",
      "promise/no-nesting": "off",
    },
  },
  // Browser environment for gateway site
  {
    files: ["web/www.diyaccounting.co.uk/public/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.browser,
        dataLayer: "writable",
        gtag: "writable",
      },
    },
    rules: {
      "no-invalid-this": "off",
      "prefer-rest-params": "off",
    },
  },
  // Google Analytics gtag snippets use `arguments` by design
  {
    files: ["**/lib/analytics.js"],
    rules: {
      "prefer-rest-params": "off",
    },
  },
  {
    settings: {
      react: {
        version: "18",
      },
    },
  },
  {
    ignores: [
      "build/",
      "coverage/",
      "dist/",
      "exports/",
      "node_modules/",
      "eslint.config.js",
      "target/",
      "cdk.out/",
      // Project-specific: exclude tests and scripts from linting-fix
      "app/unit-tests/",
      "app/http-simulator/",
      "app/system-tests/",
      "web/unit-tests/",
      "scripts/",
      "behaviour-tests/",
      "web/browser-tests/",
      // Generated test reports (Playwright HTML reports contain bundled JS)
      "web/public/tests/",
      // Generated simulator build (gitignored, copied from web/public at build time)
      "web/public-simulator/",
      // Auto-generated CloudFront Function (built by scripts/build-gateway-redirects.cjs)
      "web/www.diyaccounting.co.uk/redirect-function.js",
      // Reference examples for UK Government form field standards
      "web/public/docs/hmrc-form-field-standards/",
      // Developer documentation and archive (not application code)
      "_developers/",
      // Vendored minified library
      "web/public/lib/qrcode.min.js",
      // Generated bundle (built from web/public/submit.js)
      "web/public/submit.bundle.js",
    ],
  },
];
