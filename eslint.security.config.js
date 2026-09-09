// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import security from "eslint-plugin-security";
import sonarjs from "eslint-plugin-sonarjs";
import globals from "globals";

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    plugins: {
      security,
      sonarjs, // Loaded so eslint-disable comments for sonarjs rules don't cause errors
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    linterOptions: {
      reportUnusedDisableDirectives: false,
    },
    rules: {
      // Only security rules - disable any sonarjs that might be inherited
      "sonarjs/no-nested-conditional": "off",
      "sonarjs/no-nested-template-literals": "off",
      "sonarjs/pseudo-random": "off",
      "sonarjs/no-parameter-reassignment": "off",
      "sonarjs/no-os-command-from-path": "off",
      ...security.configs.recommended.rules,
      // Disabled: generates too many false positives for intentional obj[key] patterns.
      // Real object injection risks are mitigated by input validation at API boundaries.
      "security/detect-object-injection": "off",
      "security/detect-non-literal-regexp": "warn",
      "security/detect-non-literal-require": "warn",
      "security/detect-non-literal-fs-filename": "warn",
      "security/detect-eval-with-expression": "error",
      "security/detect-no-csrf-before-method-override": "error",
      "security/detect-possible-timing-attacks": "warn",
      "security/detect-pseudoRandomBytes": "error",
      "security/detect-unsafe-regex": "error",
      "security/detect-buffer-noassert": "error",
      "security/detect-child-process": "warn",
      "security/detect-disable-mustache-escape": "error",
      "security/detect-new-buffer": "error",
      "security/detect-bidi-characters": "error",
    },
  },
  {
    ignores: [
      "node_modules/",
      "target/",
      "cdk.out/",
      "cdk-environment/cdk.out/",
      "cdk-application/cdk.out/",
      "*.min.js",
      "web/public/tests/",
      // Exclude test files - not production code
      "**/*-tests/**",
      "**/*.test.js",
      "**/*.spec.js",
      "behaviour-tests/",
      "app/http-simulator/routes/",
      "app/test-helpers/",
      // Exclude build scripts - not production code
      "scripts/",
      // Exclude config files
      "eslint.config.js",
      "eslint.security.config.js",
      // Exclude bundled files (generated, contain eslint-disable for other configs)
      "**/*.bundle.js",
      // Exclude entry points that have eslint-disable for other plugins
      "web/public/submit.js",
      "web/public/lib/test-data-generator.js",
      // Note: bundleManagement.js and hmrcApi.js have eslint-disable for sonarjs (code quality)
      // but are now included in security scanning since this config only uses security plugin
      // Exclude non-production directories
      "_developers/",
      // Simulator is auto-generated from web/public/ - never edit directly
      "web/public-simulator/",
    ],
  },
];
