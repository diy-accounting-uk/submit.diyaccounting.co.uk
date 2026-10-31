<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

<!-- @capability SS-01 Run the diya-gl calculation engine
- **Use when:** a diya-gl book's figures must be computed in JavaScript, independent of the Excel package.
- **Does:** diya-gl-engine.js is the pure-JS computation core: it derives sales, purchases, payroll, tax and balance-sheet figures from a book's lines the same way the spreadsheet template does. diya-gl-calculator.js runs it over a book and returns the report the reconcile and judge tooling compares against the Excel recalculation. product-workbook.js and the browser bundle both load the same module.
- **Run:** `import { computeReport } from "app/lib/diya-gl-calculator.js"`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-engine.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-calculator.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-engine.js, ../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-calculator.js, ../spreadsheets.diyaccounting.co.uk/app/test/diya-gl-calculator.test.js
- **Keywords:** diya-gl engine, second engine, js computation, calculator, independent recalculation, book figures
- **Related:** SS-16, SS-11
@end-capability -->

<!-- @capability SS-02 Validate diya-gl books against the v2 schema
- **Use when:** a book.toml or lines.jsonl document must be checked against the published diya-gl format before it is trusted.
- **Does:** diya-gl-schema.js loads the published JSON Schema documents and validates a book and its lines against them. build-diya-gl-spec.js (SS-07) publishes the same schemas as the public format specification. app/lib/book-checks.js runs a further set of accounting checks (unbalanced entries, missing accounts) beyond schema shape.
- **Run:** `import { validateBook, validateLines } from "app/lib/diya-gl-schema.js"`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-schema.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-schema.js, ../spreadsheets.diyaccounting.co.uk/app/lib/book-checks.js, ../spreadsheets.diyaccounting.co.uk/app/lib/book-checks, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/schema/diya-gl-book-v2.schema.json, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/schema/diya-gl-lines-v2.schema.json
- **Keywords:** diya-gl schema, book.toml, lines.jsonl, v2 schema, book checks, validation
- **Related:** SS-03, SS-07
@end-capability -->

<!-- @capability SS-03 Read and write diya-gl interchange formats
- **Use when:** a book must move between book.toml/lines.jsonl, a diya-gl zip, a single-file JSON or a package zip.
- **Does:** diya-gl-interchange.js reads every kind of diya-gl source a customer can hand it and writes the diya-gl zip and JSON downloads. diya-gl-canonical.js is the one canonical form book and line comparisons are made in, so field order and formatting never register as a data difference. diya-gl-loader.js turns loaded diya-gl data into the scenario shape the spreadsheet generator writes onto a template. Submit's mcp/lib/book-tools.js (MCP-03) and app/services/microEntityAccounts.js (MCP-04, DATA-52) read the same book.toml/lines.jsonl shape this module defines.
- **Run:** `import { readBookSource, writeDiyaGlZip, writeBookJson } from "app/lib/diya-gl-interchange.js"`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-interchange.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-canonical.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-loader.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-interchange.js, ../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-canonical.js, ../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-loader.js
- **Keywords:** diya-gl interchange, book.toml, lines.jsonl, canonical form, diya-gl zip, single-file json, workbook set
- **Related:** SS-02, SS-15, SS-16, MCP-03, MCP-04, DATA-52
@end-capability -->

<!-- @capability SS-04 Apply book edits and derivations
- **Use when:** a line must be added, changed or removed on a book, from the page, the CLI or the MCP server, the same way everywhere.
- **Does:** diya-gl-edits.js exports the named edit functions (addSaleLine, addPurchaseLine, addBankLine, addPayrollLine, changeLineAmount, removeLine and more) every caller reaches through the engine bundle, so no caller reimplements an edit. diya-gl-edits-ltd.js adds Company-specific derivations (dividends, corporation tax, fixed assets) on top of the shared set.
- **Run:** `import { addSaleLine, changeLineAmount } from "app/lib/diya-gl-edits.js"`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-edits.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-edits-ltd.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-edits.js, ../spreadsheets.diyaccounting.co.uk/app/lib/diya-gl-edits-ltd.js, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/edits.js
- **Keywords:** diya-gl edits, addSaleLine, changeLineAmount, removeLine, undo stack, ltd derivations, dividends, corporation tax
- **Related:** SS-01, SS-26
@end-capability -->

<!-- @capability SS-05 Run the diya-gl CLI
- **Use when:** a book must be recalculated, read or written from the command line or a script, outside the browser.
- **Does:** diya-gl.js dispatches `diya-gl <recalc|read-workbook|write-workbook|mcp>` to report.js, export.js, write-workbook.js or diya-gl-mcp.js (SS-06); each subcommand also ships as its own bin (diya-gl-recalc, diya-gl-read-workbook, diya-gl-write-workbook) for a caller that wants one command on its PATH. The package publishes to npm and a Docker image (SS-20).
- **Run:** `npx diya-gl recalc --package bst --source-dir <dir>`; `npx diya-gl read-workbook --file <path>`; `npx diya-gl write-workbook --data <dir>`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/diya-gl/bin/diya-gl.js`; `../spreadsheets.diyaccounting.co.uk/diya-gl/bin/diya-gl-recalc.js`; `../spreadsheets.diyaccounting.co.uk/diya-gl/bin/diya-gl-read-workbook.js`; `../spreadsheets.diyaccounting.co.uk/diya-gl/bin/diya-gl-write-workbook.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/diya-gl/bin/diya-gl.js, ../spreadsheets.diyaccounting.co.uk/diya-gl/bin/diya-gl-recalc.js, ../spreadsheets.diyaccounting.co.uk/diya-gl/bin/diya-gl-read-workbook.js, ../spreadsheets.diyaccounting.co.uk/diya-gl/bin/diya-gl-write-workbook.js, ../spreadsheets.diyaccounting.co.uk/diya-gl/bin/run-dist-bin.js, ../spreadsheets.diyaccounting.co.uk/diya-gl/package.json, ../spreadsheets.diyaccounting.co.uk/diya-gl/Dockerfile, ../spreadsheets.diyaccounting.co.uk/diya-gl/smoke.sh, ../spreadsheets.diyaccounting.co.uk/diya-gl/parity.sh
- **Keywords:** diya-gl cli, recalc, read-workbook, write-workbook, npx diya-gl, docker image, dist bin
- **Related:** SS-06, SS-15, SS-16, SS-20
@end-capability -->

<!-- @capability SS-06 Serve the diya-gl MCP server
- **Use when:** an MCP session needs to extract, report on, edit or save a diya-gl book without HMRC filing.
- **Does:** diya-gl-mcp.js is a stdio MCP server over a hand-rolled JSON-RPC transport (no @modelcontextprotocol/sdk, to avoid its HTTP-framework dependencies), exposing four tools: extract_book, report, edit_lines and save_workbook, across all four products. app/lib/mcp/server.js is the method table (initialize, tools/list, tools/call); diya-gl-tools.js wires each tool to export.js, diya-gl-edits.js or product-workbook.js. Submit's own mcp/ package (MCP-01) is a separate server for HMRC filing, not this one.
- **Run:** `node app/bin/diya-gl-mcp.js`; `npm run mcp:diya-gl`; `npx diya-gl mcp`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/diya-gl-mcp.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/mcp/server.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/mcp/diya-gl-tools.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/mcp/jsonrpc-stdio.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/diya-gl-mcp.js, ../spreadsheets.diyaccounting.co.uk/app/lib/mcp/server.js, ../spreadsheets.diyaccounting.co.uk/app/lib/mcp/diya-gl-tools.js, ../spreadsheets.diyaccounting.co.uk/app/lib/mcp/jsonrpc-stdio.js, ../spreadsheets.diyaccounting.co.uk/.mcp.json
- **Keywords:** diya-gl mcp, extract_book, edit_lines, save_workbook, stdio mcp server, json-rpc, model context protocol
- **Related:** SS-04, SS-05, MCP-01, MCP-03
@end-capability -->

<!-- @capability SS-07 Publish the diya-gl format specification page
- **Use when:** the public diya-gl format page must reflect the schemas, HMRC field mappings and checks the code actually carries.
- **Does:** build-diya-gl-spec.js reads the v2 schemas, the HMRC form-layout and SA103 mapping data, book-checks.js run over one example book per product, and the published reconciliation reports, then writes every table on spec.html from those artefacts, so the page cannot claim a field or check the code does not carry.
- **Run:** `npm run build:diya-gl-spec`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/build-diya-gl-spec.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/build-diya-gl-spec.js, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/spec.html
- **Keywords:** diya-gl spec, format specification, spec.html, schema tables, sa103 mapping, form layouts
- **Related:** SS-02
@end-capability -->

<!-- @capability SS-08 Generate spreadsheet packages from product modules
- **Use when:** a product's Excel workbooks must be regenerated for a tax year from its product module and template.
- **Does:** generate.js dispatches to the four product modules (app/products/bst.js, taxi.js, se.js, ltd.js), which define their own metadata; generator.js writes scenario data onto the template, applies the year-end sequence and core properties. Multi-file products (SE, Ltd) recalculate through spreadsheet-runner.js's LibreOffice pipeline.
- **Run:** `npm run generate`; `node app/bin/generate.js --package bst`; `node app/bin/generate.js --years se-2025-2026`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/generate.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/generator.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/generate.js, ../spreadsheets.diyaccounting.co.uk/app/lib/generator.js, ../spreadsheets.diyaccounting.co.uk/app/products, ../spreadsheets.diyaccounting.co.uk/app/lib/spreadsheet-runner.js
- **Keywords:** generate packages, product modules, bst taxi se ltd, template, year-end sequence, libreoffice roundtrip
- **Related:** SS-09, SS-11
@end-capability -->

<!-- @capability SS-09 Build package zips and the catalogue
- **Use when:** generated packages must become the zip files and catalogue.toml the download page and S3 sync read.
- **Does:** build-packages.js scans packages/ directories, builds zips into target/zips/ through package-builder.js, and writes web/spreadsheets.diyaccounting.co.uk/public/catalogue.toml. Deployment uploads the zips to S3 separately from the CDK BucketDeployment, which never prunes them.
- **Run:** `npm run build:packages`; `node app/bin/build-packages.js --years 2`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/build-packages.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/package-builder.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/build-packages.js, ../spreadsheets.diyaccounting.co.uk/app/lib/package-builder.js, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/catalogue.toml
- **Keywords:** build packages, package zips, catalogue.toml, target/zips, s3 sync, bucketdeployment prune false
- **Related:** SS-08, SS-21
@end-capability -->

<!-- @capability SS-10 Extract reconciliation scenarios from master books
- **Use when:** a reconciliation fixture, or the diya-gl subset behind it, must be regenerated from a master book under examples/.
- **Does:** extract-scenarios.js writes every fixture and its diya-gl subset from the master books (precision-code-ltd, brickwork-pro, sp-sixty-driving, kestrel-executive-cars, basic-taxi-driver). No fixture states a figure of its own: transactions and expectations are derived here from each master's journals and ledgers. The CI sync gate (`npm run gate:fixtures`) reverts a hand-edited generated fixture.
- **Run:** `npm run extract-scenarios`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/extract-scenarios.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/extract-scenarios.js, ../spreadsheets.diyaccounting.co.uk/app/lib/scenario-extractor.js, ../spreadsheets.diyaccounting.co.uk/examples
- **Keywords:** extract scenarios, master books, fixture, gate fixtures, source-derived, examples directory
- **Related:** SS-11
@end-capability -->

<!-- @capability SS-11 Reconcile generated packages against expected figures
- **Use when:** a generated package's recalculated figures must be checked against its fixture's expected values, or against a diya-gl book that populated it.
- **Does:** reconcile.js runs test scenarios against generated packages and compares computed results to expected values, per product. `--book` checks a package populated from a real diya-gl book against diya-gl-calculator.js's independent JS computation of the same book, a second engine over the same input rather than a curated fixture.
- **Run:** `npm run reconciliation`; `node app/bin/reconcile.js --package bst`; `node app/bin/reconcile.js --book <dir>`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/reconcile.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/reconcile.js, ../spreadsheets.diyaccounting.co.uk/app/products
- **Keywords:** reconcile, reconciliation, expected values, book check, second engine, compliance report
- **Related:** SS-01, SS-08, SS-12, SS-13
@end-capability -->

<!-- @capability SS-12 Judge reconciliation reports with an LLM
- **Use when:** a reconciled report's headline indicators must be checked for sense, not just arithmetic.
- **Does:** judge-reconciliation.js sends a digest of headline and indicator figures (balance sheet, turnover, profit, tax charge, VAT boxes, profit-bridge residue) to Nova 2 Lite for a pass/fail verdict, escalating a fail or unparseable answer to Nova Pro before it blocks anything. It skips an unchanged digest against a committed verdict.
- **Run:** `npm run judge:reconciliation`; `node app/bin/judge-reconciliation.js --package ltd`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/judge-reconciliation.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/judge-reconciliation.js, ../spreadsheets.diyaccounting.co.uk/app/data/judge-rubric.md, ../spreadsheets.diyaccounting.co.uk/app/lib/report-indicators.js
- **Keywords:** judge reconciliation, llm judge, nova lite, nova pro, judge rubric, headline indicators, verdict
- **Related:** SS-11
@end-capability -->

<!-- @capability SS-13 Cross-check figures across product packages
- **Use when:** a figure that should agree between BST, SE and Ltd packages for the same non-VAT scenario must be checked for consistency.
- **Does:** cross-package-reconciliation.js reads the reconciliation reports for a shared scenario and asserts pre-tax profit is identical across BST, SE and Ltd, since face-value amounts carry no VAT split.
- **Run:** `npm run cross-package-reconciliation`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/cross-package-reconciliation.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/cross-package-reconciliation.js
- **Keywords:** cross-package reconciliation, pre-tax profit, bst se ltd, shared scenario
- **Related:** SS-11
@end-capability -->

<!-- @capability SS-14 Verify export and report roundtrip and stability
- **Use when:** the fidelity of the export/report loop, or the stability of recalculation, must be scored rather than assumed.
- **Does:** verify-roundtrip.js scores EQ1 (report.json agreement between the Excel-side and JS-side report.js runs) and EQ2 (canonical-line and book.toml agreement between the export and its fixture), distinguishing a declared structural absence from a real loss. verify-stability.js scores EQ3: idempotence, comparing saved-mode and recalculate-mode cell values and requiring every moved cell to be listed in volatile-cells.json with a reason.
- **Run:** `npm run verify:roundtrip`; `npm run verify:stability`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/verify-roundtrip.js`; `../spreadsheets.diyaccounting.co.uk/app/bin/verify-stability.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/verify-roundtrip.js, ../spreadsheets.diyaccounting.co.uk/app/bin/verify-stability.js, ../spreadsheets.diyaccounting.co.uk/app/data/volatile-cells.json, ../spreadsheets.diyaccounting.co.uk/app/data/roundtrip-unrepresentable.json
- **Keywords:** verify roundtrip, verify stability, eq1, eq2, eq3, idempotence, volatile cells
- **Related:** SS-15
@end-capability -->

<!-- @capability SS-15 Extract diya-gl data and financial reports from populated packages
- **Use when:** a populated Excel package, or a customer's own upload, must yield its diya-gl data or its financial reports.
- **Does:** export.js reads any source diya-gl-interchange.js understands and writes book.toml/lines.jsonl in canonical form plus report.json, validated against the published schema. report.js reads xlsx cell values (saved or recalculated) or computes reports straight from diya-gl data with `--data`, so an Excel-side and a JS-side run can be compared on the same scenario.
- **Run:** `npm run export`; `node app/bin/export.js --file <path>`; `npm run report -- --package bst --source-dir <dir>`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/export.js`; `../spreadsheets.diyaccounting.co.uk/app/bin/report.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/export.js, ../spreadsheets.diyaccounting.co.uk/app/bin/report.js, ../spreadsheets.diyaccounting.co.uk/app/lib/report-generator.js, ../spreadsheets.diyaccounting.co.uk/app/lib/xlsx-reader.js
- **Keywords:** export, report, book.toml, lines.jsonl, report.json, data mode, recalculate mode
- **Related:** SS-03, SS-14, SS-16
@end-capability -->

<!-- @capability SS-16 Write workbooks from diya-gl data
- **Use when:** a book.toml/lines.jsonl document, or any interchange kind, must become the Excel workbook(s) the template composes.
- **Does:** write-workbook.js takes diya-gl data and writes it through product-workbook.js's saveWorkbook path as cached formula results, the same way the books page's client-side export does; no LibreOffice recalculation runs.
- **Run:** `npm run write-workbook`; `node app/bin/write-workbook.js --data <dir> --output-dir <dir>`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/write-workbook.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/product-workbook.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/write-workbook.js, ../spreadsheets.diyaccounting.co.uk/app/lib/product-workbook.js
- **Keywords:** write-workbook, savework book, cached formula results, no recalculation, package zip
- **Related:** SS-01, SS-03, SS-05
@end-capability -->

<!-- @capability SS-17 Build reconciliation pages and record releases
- **Use when:** the published reconciliation pages must reflect the latest reports, or a diya-gl release must be recorded on them.
- **Does:** build-reconciliation-pages.js builds each product's reconciliation.html/json and screenshots from reports/*.md and the fixtures, rebuilds the index, and (`--record`) appends a diya-gl release to app/data/releases.json and releases.html. publish-diya-gl.yml (SS-20) calls it after a version publishes.
- **Run:** `node app/bin/build-reconciliation-pages.js --product all`; `node app/bin/build-reconciliation-pages.js --record diya-gl-v1.0.0`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/build-reconciliation-pages.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/build-reconciliation-pages.js, ../spreadsheets.diyaccounting.co.uk/app/data/releases.json, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/reconciliation
- **Keywords:** reconciliation pages, releases.json, release record, screenshots, index-only
- **Related:** SS-20
@end-capability -->

<!-- @capability SS-18 Archive a cut of packages to diy-accounting-archive
- **Use when:** a tax year's finished packages must be copied into diy-accounting-archive with provenance.
- **Does:** The archive-packages skill copies every fully formed package directory under packages/ at one commit into diy-accounting-uk/diy-accounting-archive under packages-published/GB Accounts <tax year>/, with provenance in packages-published/MANIFEST.toml. Run by an operator or a Claude session; no workflow or schedule does it, and no commit there is bot-authored.
- **Run:** `Follow the archive-packages skill`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/archive-packages/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/archive-packages/SKILL.md, ../spreadsheets.diyaccounting.co.uk/scripts/archive-packages.js
- **Keywords:** archive packages, cut, diy-accounting-archive, manifest.toml, packages-published
- **Related:** SS-09
@end-capability -->

<!-- @capability SS-19 Update annual HMRC tax rate data
- **Use when:** a new tax year's Income Tax, National Insurance or VAT thresholds must reach the SE/Ltd TOML data and the regenerated packages.
- **Does:** The package-updates skill lists what changes year to year (personal allowance, NI thresholds, VAT registration threshold) and the HMRC sources for each. hmrc-rate-urls.cjs and update-tax-data.sh pull and apply the update; the generate/reconcile/deploy pipeline then republishes.
- **Run:** `npm run hmrc-rate-urls`; `npm run update-tax-data`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/package-updates/SKILL.md`; `../spreadsheets.diyaccounting.co.uk/scripts/update-tax-data.sh`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/package-updates/SKILL.md, ../spreadsheets.diyaccounting.co.uk/scripts/update-tax-data.sh, ../spreadsheets.diyaccounting.co.uk/scripts/hmrc-rate-urls.cjs, ../spreadsheets.diyaccounting.co.uk/app/data
- **Keywords:** tax data update, hmrc rates, personal allowance, ni thresholds, annual update, package-updates skill
- **Related:** SS-08
@end-capability -->

<!-- @capability SS-20 Publish diya-gl to npm, GHCR and the Homebrew tap
- **Use when:** a green prod deploy from main should publish diya-gl's next version, or a finish-only rerun must complete a partial publish.
- **Does:** publish-diya-gl.yml checks whether diya-gl/package.json's version is already on npm; if not, it packs and smoke-tests the tarball, publishes to npm with provenance, builds and pushes a GHCR image, tags the commit, records the release (SS-17), rolls the patch version on main, and dispatches the homebrew-diya-gl tap. Every step keys on the registry/tag state, not on which run did the work, so a re-dispatch always finishes an interrupted publish.
- **Run:** `gh workflow run publish-diya-gl.yml`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.github/workflows/publish-diya-gl.yml`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.github/workflows/publish-diya-gl.yml, ../spreadsheets.diyaccounting.co.uk/diya-gl/package.json, ../spreadsheets.diyaccounting.co.uk/diya-gl/Dockerfile
- **Keywords:** publish diya-gl, npm publish, ghcr image, homebrew tap, version roll, finish-only rerun
- **Related:** SS-05, SS-17
@end-capability -->

<!-- @capability SS-21 Serve the spreadsheets product catalogue and downloads
- **Use when:** the spreadsheets.diyaccounting.co.uk homepage, product catalogue or a package download must be shown or changed.
- **Does:** index.html lists the products from catalogue.toml (SS-09); download.html serves each package's zip from /zips/ (symlinked to target/zips/ in dev). download-page.js reads the query parameters and hands off to the donation flow.
- **Run:** no command; see Does and Entry
- **Entry:** `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/index.html`; `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/download.html`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/index.html, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/download.html, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/download-page.js
- **Keywords:** spreadsheets homepage, product catalogue, download page, catalogue.toml, zips
- **Related:** SS-09, SS-22
@end-capability -->

<!-- @capability SS-22 Take Stripe and PayPal donations
- **Use when:** a download or the donate page must offer a Stripe Payment Link or PayPal donate button, or the Stripe side needs setting up.
- **Does:** donate.html carries Stripe Payment Links (buy.stripe.com, preset and custom amounts) and a PayPal classic hosted Donate button; donate-page.js tracks the return from a download (SS-21) into a donation prompt. build-donate-page.mjs generates donate.html from donate.template.html. stripe-spreadsheets-setup.js is the idempotent Stripe-side setup script for the product and Payment Links.
- **Run:** `npm run build:donate-page`; `STRIPE_SECRET_KEY=sk_test_... node scripts/stripe-spreadsheets-setup.js`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/donate.template.html`; `../spreadsheets.diyaccounting.co.uk/scripts/build-donate-page.mjs`; `../spreadsheets.diyaccounting.co.uk/scripts/stripe-spreadsheets-setup.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/donate.html, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/donate.template.html, ../spreadsheets.diyaccounting.co.uk/scripts/build-donate-page.mjs, ../spreadsheets.diyaccounting.co.uk/scripts/stripe-spreadsheets-setup.js, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/donate-page.js
- **Keywords:** donate, stripe payment links, paypal donate button, custom amount, donate template
- **Related:** SS-21, SS-32
@end-capability -->

<!-- @capability SS-23 Serve knowledge base, article and community content
- **Use when:** the knowledge-base, article, references, community or recently-updated pages must be shown, searched or regenerated.
- **Does:** knowledge-base.html, all-articles.html, references.html, community.html and recently-updated.html read their own TOML index; kb-search.js does fuzzy bigram-plus-keyword search over the articles; generate-knowledge-base-toml.cjs writes knowledge-base.toml from the article Markdown/HTML pairs under web/.../public/articles/.
- **Run:** `npm run build:knowledge-base`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/scripts/generate-knowledge-base-toml.cjs`; `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/kb-search.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/knowledge-base.html, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/knowledge-base.toml, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/all-articles.html, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/references.html, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/community.html, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/recently-updated.html, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/articles, ../spreadsheets.diyaccounting.co.uk/scripts/generate-knowledge-base-toml.cjs, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/kb-search.js, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/knowledge-base-page.js, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/references-page.js, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/community-page.js, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/recently-updated-page.js, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/docs-download.js, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/lightbox.js
- **Keywords:** knowledge base, articles, kb-search, community page, references page, recently-updated, fuzzy search
@end-capability -->

<!-- @capability SS-24 Compile the redirect engine
- **Use when:** a URL on either site must redirect, or a site's redirects.toml has changed.
- **Does:** build-spreadsheets-redirects.cjs compiles each site's own redirects.toml into that site's redirect-function.js, a CloudFront Function SpreadsheetsStack (SS-35) attaches to the distribution. Both generated files are gitignored and rebuilt at build and deploy time; `npm run build:redirects` runs both sites.
- **Run:** `npm run build:redirects`; `node scripts/build-spreadsheets-redirects.cjs --site spreadsheets`; `node scripts/build-spreadsheets-redirects.cjs --site diya-gl`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/scripts/build-spreadsheets-redirects.cjs`
- **Files:** ../spreadsheets.diyaccounting.co.uk/scripts/build-spreadsheets-redirects.cjs, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/redirects.toml, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/redirects.toml
- **Keywords:** redirect engine, redirects.toml, redirect-function.js, cloudfront function, build:redirects
- **Related:** SS-35
@end-capability -->

<!-- @capability SS-25 Generate sitemaps
- **Use when:** either site's sitemap.xml must reflect the current catalogue or knowledge base.
- **Does:** build-sitemaps.js reads knowledge-base.toml and catalogue.toml and writes sitemap.xml for both spreadsheets.diyaccounting.co.uk and diya-gl.co.uk through sitemap-builder.js.
- **Run:** `npm run build:sitemaps`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/build-sitemaps.js`; `../spreadsheets.diyaccounting.co.uk/app/lib/sitemap-builder.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/build-sitemaps.js, ../spreadsheets.diyaccounting.co.uk/app/lib/sitemap-builder.js
- **Keywords:** sitemap, sitemap.xml, build sitemaps, seo
- **Related:** SS-23
@end-capability -->

<!-- @capability SS-26 Serve the DIYA-GL product pages and shell
- **Use when:** one of the four DIYA-GL product pages (bst, se, taxi, ltd) needs its page shell, views or per-product manifest changed.
- **Does:** shell.js mounts the shared page shell (state, empty state, file picker, drop zone, deep links, undo, inspector, save menu, toast, mobile bars) plus the two shared views, driven by the product manifest in web/diya-gl.co.uk/public/products/<id>.js the page names in body[data-product]. data.js builds window.DIYA_GL_SNAPSHOT from an upload, an example book, a blank book or autosave; headlines.js paints the year-at-a-glance stat tiles and charts from that snapshot.
- **Run:** no command; see Does and Entry
- **Entry:** `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/shell.js`; `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/data.js`; `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/headlines.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/bst.html, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/se.html, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/taxi.html, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/ltd.html, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/shell.js, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/data.js, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/headlines.js, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/products
- **Keywords:** diya-gl shell, book page, product manifest, diya_gl_snapshot, headlines strip, empty state, deep links
- **Related:** SS-04, SS-27, SS-29
@end-capability -->

<!-- @capability SS-27 Save and load books locally and via Submit's cloud store
- **Use when:** a DIYA-GL book must be saved to a download, autosaved in the browser, or signed in and saved to the reader's account.
- **Does:** save.js writes the current book as a diya-gl zip or JSON download through diya-gl-interchange.js. autosave.js keeps the working book in IndexedDB only, with no network call. cloud.js signs the reader into Submit's Cognito pool (a public OAuth client id set in cloud-config.js, the BooksUserPoolClientId output of Submit's IdentityStack) and calls Submit's four /api/v1/books routes (BILL-17..BILL-23), showing a choice card on any conflict rather than merging or overwriting silently.
- **Run:** no command; see Does and Entry
- **Entry:** `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/save.js`; `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/autosave.js`; `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/save.js, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/autosave.js, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud.js, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud-config.js
- **Keywords:** save book, autosave, indexeddb, cloud sign-in, cognito, pkce, books api, conflict card
- **Related:** SS-26, SS-28, BILL-17, BILL-23, BILL-39, MCP-03
@end-capability -->

<!-- @capability SS-28 Store books in Google Drive
- **Use when:** a reader wants a second, Google Drive-backed store for a DIYA-GL book, alongside Submit's cloud store.
- **Does:** drive.js requests a Drive token scoped to drive.file (files this page created, nothing else in the reader's Drive) directly from Google, since Cognito's hosted UI never carries a Google token, and keeps it in sessionStorage under the same "diya-gl.cloud." prefix cloud.js clears on sign-out. isOffered() keeps every Drive control off the page until the operator's console steps add diya-gl.co.uk and ci.diya-gl.co.uk as authorised origins for the Google OAuth client (DATA-44).
- **Run:** no command; see Does and Entry
- **Entry:** `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/drive.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/drive.js, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/cloud-config.js
- **Keywords:** google drive, drive.file scope, second store, drive token, authorised origins
- **Related:** SS-27
@end-capability -->

<!-- @capability SS-29 Serve DIYA-GL as an offline PWA
- **Use when:** a DIYA-GL page must keep working offline once it has been opened online, or the service worker's cache scope changes.
- **Does:** pwa.js registers sw.js after the page finishes loading, so registration never competes with the engine bundle and resources loading on first paint. The service worker's cache scope is why diya-gl-events.js (SS-33) is kept apart from ecommerce-events.js.
- **Run:** no command; see Does and Entry
- **Entry:** `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/pwa.js`; `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/sw.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/pwa.js, ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/sw.js
- **Keywords:** pwa, service worker, offline, sw.js, cache scope
- **Related:** SS-26, SS-33
@end-capability -->

<!-- @capability SS-30 Serve the holding page and failover
- **Use when:** live spreadsheets.diyaccounting.co.uk traffic must move onto a maintenance page and back.
- **Does:** HoldingStack (one per environment, in the spreadsheets account) serves web/spreadsheets.diyaccounting.co.uk/holding/index.html on a `holding.` subdomain, and CloudFront's 403/404 error responses fail over to it so deep links never show a raw S3 error. deploy-holding.yml dispatches the CDK deploy with `target: holding` or `restore`.
- **Run:** `gh workflow run deploy-holding.yml -f target=holding`; `gh workflow run deploy-holding.yml -f target=restore`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.github/workflows/deploy-holding.yml`; `../spreadsheets.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/spreadsheets/stacks/HoldingStack.java`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.github/workflows/deploy-holding.yml, ../spreadsheets.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/spreadsheets/stacks/HoldingStack.java, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/holding/index.html, ../spreadsheets.diyaccounting.co.uk/RUNBOOK_HOLDING_FAILOVER.md
- **Keywords:** holding page, failover, maintenance page, holdingstack, deploy-holding, runbook
- **Related:** SS-35
@end-capability -->

<!-- @capability SS-31 Load GA4 analytics with consent gating
- **Use when:** a page on either site needs GA4 loaded, gated behind the visitor's cookie choice, or visitor-kind classified.
- **Does:** lib/analytics.js sets GA4 consent denied by default (Measurement ID G-X4ZPD99X2K, property 523400333, shared with diyaccounting.co.uk and submit.diyaccounting.co.uk through a cross-domain linker), restores a returning visitor's saved choice, classifies the session as bot/synthetic/human, and loads gtag.js dynamically (CSP forbids inline scripts). consent-banner.js shows the accept/decline banner once per visitor and writes the choice to localStorage under "consent.analytics". The same script is copied into the diya-gl.co.uk build by build:diya-gl-bundle (SS-06's sibling script scripts/build-diya-gl-bundle.mjs), so both sites share one copy of the crawler list kept in step by web/unit-tests/analytics.test.js.
- **Run:** no command; see Does and Entry
- **Entry:** `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/analytics.js`; `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/consent-banner.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/analytics.js, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/consent-banner.js, ../spreadsheets.diyaccounting.co.uk/web/unit-tests/analytics.test.js, ../spreadsheets.diyaccounting.co.uk/scripts/build-diya-gl-bundle.mjs
- **Keywords:** ga4, google analytics, gtag, consent banner, consent.analytics, visitor kind, cross-domain linker, g-x4zpd99x2k
- **Related:** SS-32, SS-33, SS-34, DATA-24, SITE-15
@end-capability -->

<!-- @capability SS-32 Send GA4 ecommerce and download events
- **Use when:** the spreadsheets site needs a GA4 ecommerce event: a product list view, a runner download or a completed donation.
- **Does:** ecommerce-events.js fires view_item_list on the product catalogue page, and exposes buildPurchaseEvent (the `donate` purchase-shaped payload a completed donation sends, so the Ads Purchase conversion counts subscriptions only) and buildRunnerDownloadEvent as pure builder functions other pages call.
- **Run:** no command; see Does and Entry
- **Entry:** `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/ecommerce-events.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/ecommerce-events.js, ../spreadsheets.diyaccounting.co.uk/web/unit-tests/ecommerce-events.test.js, ../spreadsheets.diyaccounting.co.uk/web/browser-tests/site-ecommerce-events.browser.test.js
- **Keywords:** view_item_list, buildPurchaseEvent, buildRunnerDownloadEvent, donate event, ads purchase conversion, ecommerce events
- **Related:** SS-22, SS-31
@end-capability -->

<!-- @capability SS-33 Send DIYA-GL GA4 events
- **Use when:** a book load, a book save, a donation prompt, or a cloud sign-in/save on the DIYA-GL pages must reach GA4.
- **Does:** diya-gl-events.js is a set of pure GA4 event-payload builders (book_loaded, book_saved, donation_prompt, and the cloud sign-in/save events) kept apart from lib/ecommerce-events.js so this file sits inside the service worker's cache scope (SS-29) without risking that file's view_item_list guard. shell.js and cloud.js call these builders and send the result through shell.js's own trackEvent; nothing here touches gtag or the DOM directly.
- **Run:** no command; see Does and Entry
- **Entry:** `../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/diya-gl-events.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/diya-gl.co.uk/public/diya-gl-events.js, ../spreadsheets.diyaccounting.co.uk/web/unit-tests/diya-gl-events.test.js
- **Keywords:** book_loaded, book_saved, donation_prompt, cloud sign-in event, trackEvent, ga4 event builders
- **Related:** SS-26, SS-27, SS-29, SS-31
@end-capability -->

<!-- @capability SS-34 Configure CloudWatch RUM
- **Use when:** browser-side performance and error telemetry (CloudWatch RUM) must be wired up or its config changed.
- **Does:** lib/analytics.js's initRum() loads the RUM client only once analytics consent is granted, reading its app monitor id, identity pool and guest role from lib/rum-config.js. SpreadsheetsStack overwrites the committed no-op rum-config.js with the real config at deploy time (CfnAppMonitor), so the committed copy is inert on a local server and in browser tests.
- **Run:** no command; see Does and Entry
- **Entry:** `../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/rum-config.js`; `../spreadsheets.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/spreadsheets/stacks/SpreadsheetsStack.java`
- **Files:** ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/rum-config.js, ../spreadsheets.diyaccounting.co.uk/web/spreadsheets.diyaccounting.co.uk/public/lib/analytics.js, ../spreadsheets.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/spreadsheets/stacks/SpreadsheetsStack.java
- **Keywords:** cloudwatch rum, rum-config.js, app monitor, identity pool, guest role, deploy-time overwrite
- **Related:** SS-31, SS-35, DATA-25
@end-capability -->

<!-- @capability SS-35 CDK: SpreadsheetsStack
- **Use when:** tracing or changing the S3 + CloudFront infrastructure behind either site.
- **Does:** SpreadsheetsStack.java provisions the S3 bucket, CloudFront distribution with Origin Access Control, the redirect CloudFront Function (SS-24), the RUM app monitor (SS-34) and its config-overwrite BucketDeployment, and the certificate binding. HoldingStack.java (SS-30) is a sibling stack for the maintenance page.
- **Run:** `npm run cdk:synth`; `npm run cdk:diff`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/spreadsheets/stacks/SpreadsheetsStack.java`
- **Files:** ../spreadsheets.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/spreadsheets/stacks/SpreadsheetsStack.java, ../spreadsheets.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/spreadsheets/stacks/HoldingStack.java, ../spreadsheets.diyaccounting.co.uk/infra/main/java/co/uk/diyaccounting/spreadsheets/SpreadsheetsEnvironment.java
- **Keywords:** spreadsheetsstack, cdk synth, s3 cloudfront, origin access control, oac, cdk diff
- **Related:** SS-24, SS-30, SS-34, SS-36
@end-capability -->

<!-- @capability SS-36 Deploy the spreadsheets and diya-gl sites
- **Use when:** a push or manual dispatch must deploy SpreadsheetsStack, upload package zips, smoke-test the result, or publish diya-gl after a green prod deploy.
- **Does:** deploy.yml deploys SpreadsheetsStack via CDK, uploads the zip archives, runs a smoke test, and, after a green prod deploy from a push, calls publish-diya-gl.yml (SS-20). Deploys of the same ci environment queue rather than cancel, since a cancelled CDK deploy leaves the stack part-applied.
- **Run:** `gh workflow run deploy.yml`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.github/workflows/deploy.yml`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.github/workflows/deploy.yml
- **Keywords:** deploy workflow, cdk deploy, smoke test, zip upload, queue not cancel
- **Related:** SS-20, SS-35
@end-capability -->

<!-- @capability SS-37 Request ACM certificates
- **Use when:** the ACM certificate for diya-gl.co.uk or the holding page's domain needs (re-)requesting in us-east-1.
- **Does:** request-diya-gl-cert.yml and request-holding-cert.yml each dispatch a DNS-validated ACM certificate request for their domain, over OIDC, in us-east-1 (CloudFront's required region).
- **Run:** `gh workflow run request-diya-gl-cert.yml`; `gh workflow run request-holding-cert.yml`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.github/workflows/request-diya-gl-cert.yml`; `../spreadsheets.diyaccounting.co.uk/.github/workflows/request-holding-cert.yml`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.github/workflows/request-diya-gl-cert.yml, ../spreadsheets.diyaccounting.co.uk/.github/workflows/request-holding-cert.yml
- **Keywords:** acm certificate, us-east-1, dns validation, diya-gl-cert, holding-cert
- **Related:** SS-35
@end-capability -->

<!-- @capability SS-38 Initialise or regenerate repository state
- **Use when:** a fresh checkout, or a full regeneration, needs packages, reports and tax data rebuilt from scratch.
- **Does:** init.yml dispatches with options to delete packages/reports before regenerating and to delete and re-source app/data/*.toml tax data from HMRC, then runs the generation pipeline.
- **Run:** `gh workflow run init.yml`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.github/workflows/init.yml`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.github/workflows/init.yml
- **Keywords:** init workflow, regenerate, delete packages, delete tax data, fresh checkout
- **Related:** SS-08, SS-19
@end-capability -->

<!-- @capability SS-39 Guard commit author identity on PRs
- **Use when:** a pull request's commits must be checked against the allowed commit-identity list before merge.
- **Does:** identity-guard.yml reads every commit a PR adds and fails the run if any author email is not on .github/allowed-commit-identities.yml's allow-list, guarding against an inline git identity slipping through unnoticed.
- **Run:** runs automatically on `pull_request` (opened, synchronize, reopened)
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.github/workflows/identity-guard.yml`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.github/workflows/identity-guard.yml, ../spreadsheets.diyaccounting.co.uk/.github/allowed-commit-identities.yml, ../spreadsheets.diyaccounting.co.uk/scripts/check-commit-identities.sh
- **Keywords:** identity guard, commit author, allow-list, allowed-commit-identities
@end-capability -->

<!-- @capability SS-40 Run CodeQL scanning
- **Use when:** static-analysis scanning of the repository's code must run on a push, PR or schedule.
- **Does:** codeql.yml runs GitHub's CodeQL analysis on push to main, on pull requests and on a daily schedule, keyed per-ref so a branch and its PR keep independent runs.
- **Run:** runs automatically; `gh workflow run codeql.yml`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.github/workflows/codeql.yml`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.github/workflows/codeql.yml
- **Keywords:** codeql, static analysis, security scanning, scheduled scan
- **Related:** SS-45
@end-capability -->

<!-- @capability SS-41 Run the scheduled dependency and tax-data update workflow
- **Use when:** dependency or tax-data updates must be checked and applied on a schedule or push.
- **Does:** update.yml runs on a daily schedule and on push, keyed per-ref, to keep dependencies and tax data current between manual package-updates runs (SS-19).
- **Run:** runs automatically; `gh workflow run update.yml`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.github/workflows/update.yml`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.github/workflows/update.yml
- **Keywords:** update workflow, scheduled update, dependency update, daily cron
- **Related:** SS-19
@end-capability -->

<!-- @capability SS-42 Route tests by blast radius
- **Use when:** `npm test` must decide which tiers (gates, unit, calc, browser, infra) a change actually reaches.
- **Does:** test-scope.mjs diffs against the merge base with origin/main, maps changed paths through its routing table, and runs gates and unit always, calc/browser/infra only when the diff reaches them; it prints the tiers picked and ends on one VERDICT line. A detached HEAD, missing origin/main, shallow clone or empty diff escalates to the full set. A tracked .githooks/pre-push runs it on every push; `SKIP_PUSH_TESTS=1` runs the gates tier alone and says what it skipped, never silently.
- **Run:** `npm test`; `npm test -- --plan`; `npm test -- --all`; `npm test -- --base HEAD~1`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/scripts/test-scope.mjs`; `../spreadsheets.diyaccounting.co.uk/scripts/blast-radius.mjs`
- **Files:** ../spreadsheets.diyaccounting.co.uk/scripts/test-scope.mjs, ../spreadsheets.diyaccounting.co.uk/scripts/blast-radius.mjs, ../spreadsheets.diyaccounting.co.uk/.githooks/pre-push, ../spreadsheets.diyaccounting.co.uk/.githooks/install.mjs
- **Keywords:** test router, blast radius, test-scope, pre-push hook, verdict line, skip_libreoffice, tiers
- **Related:** SS-43
@end-capability -->

<!-- @capability SS-43 Run the product generation and test workflows
- **Use when:** CI must generate and reconcile one or all four products, or run the standard test/format/build gate.
- **Does:** generate-bst.yml, generate-se.yml, generate-taxi.yml and generate-ltd.yml each generate and reconcile one product; generate-all.yml runs the four in sequence (not parallel, since each commit job pushes generated output the next product's tests must read). test.yml runs lint, format check, Maven verify and CDK synth on push, PR and a daily schedule.
- **Run:** `gh workflow run generate-all.yml`; `gh workflow run generate-bst.yml`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.github/workflows/generate-all.yml`; `../spreadsheets.diyaccounting.co.uk/.github/workflows/test.yml`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.github/workflows/generate-all.yml, ../spreadsheets.diyaccounting.co.uk/.github/workflows/generate-bst.yml, ../spreadsheets.diyaccounting.co.uk/.github/workflows/generate-se.yml, ../spreadsheets.diyaccounting.co.uk/.github/workflows/generate-taxi.yml, ../spreadsheets.diyaccounting.co.uk/.github/workflows/generate-ltd.yml, ../spreadsheets.diyaccounting.co.uk/.github/workflows/test.yml
- **Keywords:** generate-all, generate-bst, generate-se, generate-taxi, generate-ltd, sequential commits, test.yml
- **Related:** SS-08, SS-11, SS-42
@end-capability -->

<!-- @capability SS-44 Run spreadsheets behaviour tests
- **Use when:** end-to-end Playwright journeys across both sites must run against local, ci or prod.
- **Does:** test:spreadsheetsBehaviour-local/-ci/-prod set SPREADSHEETS_BASE_URL and DIYA_GL_BASE_URL and run the spreadsheetsBehaviour Playwright project, teeing output to spreadsheetsBehaviour.log. A case probing a CloudFront-only path (e.g. /runners/) must target a deployed host, since the local server serves only the document root.
- **Run:** `npm run test:spreadsheetsBehaviour-local`; `npm run test:spreadsheetsBehaviour-ci`; `npm run test:spreadsheetsBehaviour-prod`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/behaviour-tests`
- **Files:** ../spreadsheets.diyaccounting.co.uk/behaviour-tests, ../spreadsheets.diyaccounting.co.uk/playwright.config.js
- **Keywords:** behaviour tests, spreadsheetsbehaviour, playwright, spreadsheets_base_url, diya_gl_base_url
- **Related:** SS-42
@end-capability -->

<!-- @capability SS-45 Run compliance checks
- **Use when:** accessibility or penetration-style checks must run against ci or prod and produce a markdown report.
- **Does:** compliance:ci-report-md/-prod-report-md run pa11y, axe (including WCAG 2.2), Lighthouse and a text-spacing check for accessibility, and eslint-security, npm audit and retire.js for penetration, then compliance-report.js turns the raw outputs into one markdown report.
- **Run:** `npm run compliance:ci-report-md`; `npm run compliance:prod-report-md`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/app/bin/compliance-report.js`
- **Files:** ../spreadsheets.diyaccounting.co.uk/app/bin/compliance-report.js, ../spreadsheets.diyaccounting.co.uk/.pa11yci.ci.json, ../spreadsheets.diyaccounting.co.uk/.pa11yci.prod.json, ../spreadsheets.diyaccounting.co.uk/eslint.security.config.js, ../spreadsheets.diyaccounting.co.uk/.retireignore.json, ../spreadsheets.diyaccounting.co.uk/REPORT_ACCESSIBILITY_PENETRATION.md
- **Keywords:** compliance report, pa11y, axe, lighthouse, text-spacing, eslint security, npm audit, retire.js
- **Related:** SS-40
@end-capability -->

<!-- @capability SS-46 Render the spreadsheets work board
- **Use when:** the operator asks for the open items, the board, or "what's in flight" in this repository.
- **Does:** The board skill renders NEXT.md's in-flight and open items with their source plan, for this repository (NEXT.md here only points at ../submit.diyaccounting.co.uk/'s plans and its own NEXT.md).
- **Run:** `/board`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/board/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/board/SKILL.md, ../spreadsheets.diyaccounting.co.uk/NEXT.md
- **Keywords:** board skill, open work, next.md, in-flight items
- **Related:** DEV-27
@end-capability -->

<!-- @capability SS-47 Work NEXT.md as dispatched sub-agents
- **Use when:** the operator says "do next", "work the backlog", or a landed batch leaves items still open here.
- **Does:** The do-next skill dispatches NEXT.md's open items as waves of worktree-isolated sub-agents, lands them on one branch, and pushes in batches for one PR.
- **Run:** `/do-next`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/do-next/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/do-next/SKILL.md
- **Keywords:** do-next skill, worktree sub-agents, dispatch backlog
- **Related:** DEV-28
@end-capability -->

<!-- @capability SS-48 Refine NEXT.md before a wave
- **Use when:** a readiness or feasibility pass over this repository's board is needed before dispatching a wave.
- **Does:** The refine skill checks every open row's references against origin/main, makes each brief complete with the lowest model that fits, shares facts across rows, and splits out any human step mixed into a row, then writes the file back and renders /board.
- **Run:** `/refine`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/refine/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/refine/SKILL.md
- **Keywords:** refine skill, board readiness, brief completeness, lowest model
- **Related:** DEV-29
@end-capability -->

<!-- @capability SS-49 Run the delivery cycle unattended
- **Use when:** the operator says "iterate" or "keep going until the board is clear" in this repository.
- **Does:** The iterate skill runs board, a wave of sub-agent batches on one branch and one PR, watch, auto-merge, watch, board, again, until no machine-only row can start.
- **Run:** `/iterate`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/iterate/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/iterate/SKILL.md
- **Keywords:** iterate skill, delivery cycle, unattended, plan-do-check-act
- **Related:** DEV-30
@end-capability -->

<!-- @capability SS-50 Watch GitHub CI to green
- **Use when:** a branch's CI needs watching to green, or the operator hands over a branch after a push.
- **Does:** The watch skill watches GitHub CI on main and every open PR's head branch until the whole scope is green, and fixes what goes red.
- **Run:** `/watch`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/watch/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/watch/SKILL.md, ../spreadsheets.diyaccounting.co.uk/scripts/watch-ci.sh
- **Keywords:** watch skill, github ci, keep it green
- **Related:** DEV-31
@end-capability -->

<!-- @capability SS-51 Merge every PR that is ready
- **Use when:** the operator says "auto-merge" or asks for the merge state of this repository.
- **Does:** The auto-merge skill catalogues worktrees, branches, uncommitted work, PRs and review threads, merges every PR that passes every gate (no unresolved review thread, no uncommitted work, branch not ahead of origin, PR head equal to branch tip, every workflow green), and hands over to /watch.
- **Run:** `/auto-merge`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/auto-merge/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/auto-merge/SKILL.md
- **Keywords:** auto-merge skill, merge gates, review threads, pr head
- **Related:** DEV-32
@end-capability -->

<!-- @capability SS-52 Preview what auto-merge would do
- **Use when:** the operator wants to see what would merge before anything changes.
- **Does:** The auto-merge-dry-run skill reports everything /auto-merge reports, with nothing changed: no merge, commit, push or file write.
- **Run:** `/auto-merge-dry-run`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/auto-merge-dry-run/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/auto-merge-dry-run/SKILL.md
- **Keywords:** auto-merge dry run, preview merge, no changes
- **Related:** DEV-33
@end-capability -->

<!-- @capability SS-53 Clean up stale branches and worktrees
- **Use when:** the operator says "clean" or "tidy the repo" in this repository.
- **Does:** The clean skill gathers merged branches, worktrees of merged branches, logs and test artefacts and build output, asks once, removes every agreed category, then fetches, switches to main and pulls once nothing is in progress.
- **Run:** `/clean`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/clean/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/clean/SKILL.md
- **Keywords:** clean skill, stale branches, worktree removal, build output
- **Related:** DEV-34
@end-capability -->

<!-- @capability SS-54 Cool down an overloaded batch
- **Use when:** a batch in this repository is stacking problems faster than it lands them.
- **Does:** The cool-down skill slows the flow of new work and settles what is already in flight: agents commit and stop, PRs and workflows are driven green one branch at a time, tracking documents catch up, and it holds the revival notes /wake reads from.
- **Run:** `/cool-down`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/cool-down/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/cool-down/SKILL.md
- **Keywords:** cool-down skill, slow the flow, settle in-flight work, revival notes
- **Related:** DEV-35
@end-capability -->

<!-- @capability SS-55 Resume normal work from cool-down
- **Use when:** the operator lifts cool-down in this repository.
- **Does:** The wake skill resumes normal work, reading the revival notes cool-down left beside the rules they undo.
- **Run:** `/wake`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/wake/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/wake/SKILL.md
- **Keywords:** wake skill, resume work, revival notes
- **Related:** DEV-36, SS-54
@end-capability -->

<!-- @capability SS-56 Write the session report
- **Use when:** the operator asks for a session report or an account of how this repository's session went.
- **Does:** The session-report skill writes ../private.diyaccounting.co.uk/sessions/REPORT_SESSION_SUBMIT_<id>_<date>.md from measured figures: the result, the method in prose, the mechanisms that worked, and losses with a board row each.
- **Run:** `/session-report`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/session-report/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/session-report/SKILL.md
- **Keywords:** session-report skill, measured figures, board row per loss
- **Related:** DEV-37
@end-capability -->

<!-- @capability SS-57 Write plain, human prose
- **Use when:** any human-facing text in this repository is being drafted: docs, comments, chat replies, site copy.
- **Does:** The plain-prose skill holds this repository's writing rules for plain, human prose and the LLM-voice tells to cut.
- **Run:** `.claude/skills/plain-prose/SKILL.md`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/plain-prose/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/plain-prose/SKILL.md
- **Keywords:** plain-prose skill, writing rules, llm-voice
- **Related:** DEV-38
@end-capability -->

<!-- @capability SS-58 Excel XML manipulation reference
- **Use when:** writing or debugging code that edits xlsx files, chases external-link caches, renames tabs for non-March year-ends, or runs the LibreOffice recalculation pipeline.
- **Does:** The excel skill catalogues xlsx-as-zip manipulation with JSZip, external-link cache updates, xls-roundtrip recalculation, and the testing approaches used across the spreadsheet pipeline.
- **Run:** `.claude/skills/excel/SKILL.md`
- **Entry:** `../spreadsheets.diyaccounting.co.uk/.claude/skills/excel/SKILL.md`
- **Files:** ../spreadsheets.diyaccounting.co.uk/.claude/skills/excel/SKILL.md
- **Keywords:** excel skill, xlsx xml, jszip, external link cache, xls roundtrip, libreoffice
- **Related:** SS-08, SS-14
@end-capability -->
