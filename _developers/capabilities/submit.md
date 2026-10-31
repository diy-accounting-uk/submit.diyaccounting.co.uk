<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability BILL-44 Document the price-update project
- **Use when:** researching why the pricing or bundle catalogue was changed the way it was.
- **Does:** ../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_PRICE_UPDATE.md and ../private.diyaccounting.co.uk/strategy/REPORT_PRICE_UPDATE_REVIEW.md record the plan and review for the pricing update project. This area's billing and entitlement code implements that project's bundle-catalogue changes.
- **Run:** no command; see Does and Entry
- **Entry:** `../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_PRICE_UPDATE.md`; `../private.diyaccounting.co.uk/strategy/REPORT_PRICE_UPDATE_REVIEW.md`
- **Files:** ../private.diyaccounting.co.uk/engineering/submit/archive/PLAN_PRICE_UPDATE.md, ../private.diyaccounting.co.uk/strategy/REPORT_PRICE_UPDATE_REVIEW.md
- **Keywords:** price update, plan, review, bundle catalogue, pricing project
- **Related:** BILL-35, BILL-30
@end-capability -->

<!-- @capability DEV-48 Browse the deployed site with a headless browser MCP server
- **Use when:** a session must click through the ci site as a person would, or read a page's accessibility snapshot and take screenshots.
- **Does:** .mcp.json registers the playwright server, @playwright/mcp 0.0.83. It runs headless Chrome for Testing at 1280x800. Each context starts isolated from the storage state in .cache/playwright-mcp/ci-state.json. The operator approves the server once in /mcp.
- **Run:** `claude mcp list`; `npx -y @playwright/mcp@0.0.83 install-browser chrome-for-testing`
- **Entry:** `.mcp.json`
- **Files:** .mcp.json
- **Keywords:** playwright mcp, browser mcp, headless browser, exploratory qa, browser_navigate, browser_snapshot, storage state
- **Related:** DEV-49, DEV-50
@end-capability -->

<!-- @capability OPS-42 Guide ICO/GDPR compliance
- **Use when:** checking this service's obligations against UK GDPR or ICO requirements.
- **Does:** ../private.diyaccounting.co.uk/ico/ICO_CHECKLIST.md is a checklist against UK GDPR and ICO requirements for this service.
- **Run:** no command; see Does and Entry
- **Entry:** `../private.diyaccounting.co.uk/ico/ICO_CHECKLIST.md`
- **Files:** ../private.diyaccounting.co.uk/ico/ICO_CHECKLIST.md
- **Keywords:** ico checklist, uk gdpr, data protection, regulatory checklist, ico compliance
- **Related:** OPS-40, OPS-41
@end-capability -->

<!-- @capability OPS-61 Design CI branch deploys off the apex
- **Use when:** checking the design rationale behind CI branch deploys, before changing that mechanism.
- **Does:** DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md is the architecture document for deploying feature branches to CI hosts without touching the prod apex.
- **Run:** no command; see Does and Entry
- **Entry:** `../private.diyaccounting.co.uk/engineering/submit/archive/_developers/DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md`
- **Files:** ../private.diyaccounting.co.uk/engineering/submit/archive/_developers/DESIGN_CI_BRANCH_DEPLOYS_OFF_THE_APEX.md
- **Keywords:** ci branch deploys, design document, apex isolation, feature branch hosts, architecture rationale
- **Related:** OPS-10, OPS-11
@end-capability -->

<!-- @capability OPS-62 Report accessibility penetration testing
- **Use when:** checking past accessibility penetration test findings before a new test or fix.
- **Does:** REPORT_ACCESSIBILITY_PENETRATION.md holds the findings from an accessibility penetration test of the deployed site.
- **Run:** no command; see Does and Entry
- **Entry:** `REPORT_ACCESSIBILITY_PENETRATION.md`
- **Files:** REPORT_ACCESSIBILITY_PENETRATION.md
- **Keywords:** accessibility test, penetration test, findings report, deployed site audit, wcag
- **Related:** OPS-36
@end-capability -->

<!-- @capability SITE-19 Generate QR codes
- **Use when:** a page must render a scannable QR code, such as a pass-generation page.
- **Does:** qrcode.min.js is a vendored third-party QR-code renderer, MIT-licensed, from node-qrcode. Pass-generation pages outside this capability call it to render a scannable code.
- **Run:** no command; see Does and Entry
- **Entry:** `web/public/lib/qrcode.min.js`
- **Files:** web/public/lib/qrcode.min.js
- **Keywords:** qr code, node-qrcode, vendored library, pass generation, scannable code
@end-capability -->
