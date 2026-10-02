<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# The spreadsheet accounting video

The second video in the how-to accounting series. Sam Green Gardening enters the same three
sales and two purchases as `videos/accounting-diya-gl-profit.json`, this time in the Basic Sole
Trader Excel workbook a user downloads from spreadsheets.diyaccounting.co.uk, and reads a net
profit of £1,200 off the Profit & Loss sheet.

## The choice: Collabora Online in the capture's own browser

We record the workbook open in Collabora Online Development Edition (CODE), which is LibreOffice
served to a browser. The existing pipeline records it like any other page:

- The real `.xlsx` from the public download opens unchanged, and LibreOffice's own engine works
  out every formula as figures go in.
- Playwright, the CDP screencast, the overlay pointer, headlines, narration, stills and the
  timeline checks all work as they do for the site videos. Nothing records the screen outside
  the browser.
- CI runs CODE as a service container beside the capture job. It needs no account, secret or
  operator step.

### The proof

`scripts/collabora-sheet-spike.js` runs against `scripts/collabora-sheet-host.js` on this
machine (Docker Desktop, amd64). It opened the downloaded workbook, entered all five
transactions and read the Profit & Loss sheet back:

| Cell | Line | Read |
| --- | --- | --- |
| C4 | Sales turnover | 1,500 |
| C6 | Cost of sales | 200 |
| C17 | Advertising | 100 |
| D24 / E24 | April / May net profit | 600 / 600 |
| C24 | Net profit for the year | 1,200 (was 0 before the entries) |

The stills show the dates parsed as dates (10-Apr-26), the text with its commas and spaces, the
`SalesApr` month total at 800.00, the `PurchasesApr` stock column at 200.00, and the P&L at
1,200. A red box drawn from `cellCursorRect` sits exactly on SalesApr!F4 at device scale factors
1 and 2. The webm shows each cell filling a character at a time. The run also passed against a
server the host did not start, with `aliasgroup1=http://.*:8099` (the CI shape).

Load timings here: the first document load in a fresh container takes about 30 seconds, and the
five entries take about a minute at 90ms a character.

## Rejected options

| Option | Tried | Why not |
| --- | --- | --- |
| 1. LibreOffice desktop on Xvfb, ffmpeg x11grab, xdotool | Yes, ubuntu:24.04 in Docker | Blind input, no overlay |
| 2. Excel for the web or Google Sheets | No account here | Sign-in the capture can't repeat safely |
| 3. A JavaScript spreadsheet in the page | Yes, HyperFormula | A facsimile, and a GPL licence |

Option 1. Calc opened the workbook in 26 seconds and ffmpeg recorded the display. xdotool sends
keys with no feedback. The Name Box entry came out mangled, a "You must enter a valid reference"
dialog opened, and every later key went to the dialog. The UNO bridge would fix the input, but the
recording would still sit outside the browser: the pointer, headlines, narration timing, stills and
timeline checks would all need a second implementation for X11. LibreOffice is not in the runner
image, and the capture job runs inside the Playwright container, so it would also need an apt
install and Xvfb there. The X11 rendering uses the dated `gen` theme.

Option 2. Excel for the web is closest to what most users see. It needs a Microsoft account with
OneDrive, the workbook uploaded, and a sign-in Playwright repeats on every run: the password and a
TOTP secret as GitHub secrets, and acceptance that Microsoft may challenge a sign-in from a CI
address and fail the capture. Google Sheets needs a Google account, and Google refuses sign-in from
automated Chromium ("This browser or app may not be secure"), so it would rest on stored cookies
that expire. The operator would have to create and maintain the account in either case.

Option 3. HyperFormula 3.4.0 with ExcelJS reading the workbook worked out all 64,472 formula cells.
After the five entries it gave the same P&L figures as above. 219 cells read `#NAME` because the
spike did not load the workbook's defined names. The calculation is fine; the display is the
problem. No open-source grid renders the workbook's fonts, fills, borders and widths the way Excel
or LibreOffice do. We would build and maintain our own imitation of the workbook, and the video
would show that, not the program a user opens. HyperFormula is GPL-3.0, at odds with this
repository's PolyForm licence. Handsontable needs a commercial licence.

## What the spike found in the package (for the spreadsheets repository)

LibreOffice keeps an `.xlsx` file's cached values when it opens one, whatever `fullCalcOnLoad`
says. The Apr27 package's cached values come from the 2025-26 template. So in LibreOffice (desktop
26.2 with default settings, and CODE), the P&L shows "TOTAL 2025-26" and month headers Apr-25 to
Mar-26 until a hard recalculation. `soffice --convert-to csv` of the P&L reproduces it. Excel
honours `fullCalcOnLoad` and shows 2026-27. The generator could write fresh cached values, or drop
the `<v>` from formula cells so LibreOffice must calculate them. Until the package changes, the
video's setup runs `.uno:CalculateHard` off camera.

## The workbook

Package: `GB Accounts Basic Sole Trader 2027-04-05 (Apr27) Excel 2007`, from
`https://spreadsheets.diyaccounting.co.uk/zips/<name>.zip`, workbook
`Financialaccountsto050427.xlsx`. The host reads it out of the zip on every run, so the video
always shows the current download.

Sheet tabs in order, with the ids Collabora gives them: `Home` (`#spreadsheet-tab0`),
`Profit & Loss Acc` (3), `SalesApr` (8), `PurchasesApr` (9), `SalesMay` (10), `PurchasesMay` (11).

Sales sheets: one row per sale from row 4. Purchase sheets: one row per purchase from row 5.

| Sheet | Column | Heading | What goes in |
| --- | --- | --- | --- |
| Sales | A | Sales Date | 10/04/2026 |
| Sales | B | Customer Name | Lawn and hedges, 12 Oak Road |
| Sales | D | Receipt record | Bank |
| Sales | F | Gross Sales Value | 500 |
| Purchases | A, B, D | Date, Supplier, Payment method | 15/04/2026, Plants and compost, Bank |
| Purchases | E, G | Expense Code Letter, Total Purchase Value | s, 200 |

C (reference) and E (sales mileage) / F (purchase mileage) stay empty. A row with no Receipt record
counts as unpaid and appears under "Sales Value not yet received", so every row records Bank.

The rows:

| Cell | Values |
| --- | --- |
| SalesApr A4:F4 | 10/04/2026, Lawn and hedges, 12 Oak Road, Bank, 500 |
| SalesApr A5:F5 | 24/04/2026, Garden tidy, 3 Mill Lane, Bank, 300 |
| PurchasesApr A5:G5 | 15/04/2026, Plants and compost, Bank, s, 200 |
| SalesMay A4:F4 | 08/05/2026, New border, 7 Elm Close, Bank, 700 |
| PurchasesMay A5:G5 | 12/05/2026, Leaflets, Bank, a, 100 |

Code `s` fills the Stock Purchases column J, which the P&L takes as cost of sales (C6). Code `a`
fills Advertising & Promotion, column R, which reaches C17. Row 1 of each journal totals the month:
`SalesApr!F1`, `PurchasesApr!G1` and the analysis columns `J1`..`W1`.

Profit & Loss Acc: column C is the year, D April, E May. Rows: 4 sales turnover, 6 cost of sales,
9 gross profit, 17 advertising and promotion, 22 total expenses, 24 net profit/loss, 28 net
taxable profit.

## Scene outline

Script name `accounting-spreadsheet-profit`, group `accounting`, auth `none`, 1920x1080 at device
scale 2. Captions follow the diya-gl video: short, second person, one action each.

| Scene | Step | Caption | Headline |
| --- | --- | --- | --- |
| setup (off camera) | goto `/`, wait, prepare, zoom | none | none |
| open | still on Home | This is the Basic Sole Trader workbook. You download it free from our spreadsheets site. | The Basic Sole Trader workbook |
| open | point at the tabs | There's a sheet for each month's sales, and one for its purchases. | A sheet for every month |
| april | click SalesApr tab | Open April's sales. | April's sales |
| april | go to A4, type the date, Tab | Type the date the customer paid you. | Date of the sale |
| april | type B4, Tab Tab | Then the customer and the job. | The customer and the job |
| april | type D4, Tab Tab | How they paid. Leave this blank if they still owe you. | How they paid |
| april | type F4, Enter | And the amount: £500. | Amount: £500 |
| april | row 5, one caption | A second job in April: a garden tidy for £300. | A second sale |
| april | point at F1 | The month's total updates as you type: £800. | April's sales: £800 |
| april | click PurchasesApr tab, row 5 | Now April's purchases: plants and compost for a job. | A purchase |
| april | type E5 | The expense letter sorts it. S is for stock and materials you use on jobs. | Letter S: materials |
| april | type G5, Enter | They cost £200. | Amount: £200 |
| may | SalesMay A4 row | May: a new border for £700. | A sale in May |
| may | PurchasesMay A5 row to E5 | And leaflets to find new customers. A is for advertising. | Letter A: advertising |
| may | type G5, Enter | They cost £100. | Amount: £100 |
| profit | click Profit & Loss Acc tab | The Profit & Loss sheet adds up every month for you. | The Profit & Loss sheet |
| profit | point at D24, E24 | £600 profit in April, and £600 in May. | £600 a month |
| profit | point at C24 | The year so far: £1,500 of sales, £300 of costs, £1,200 profit. | Net profit: £1,200 |

The last caption matches the diya-gl video's, so the two videos read as one lesson in two tools.

## What CI needs

The capture job runs in `mcr.microsoft.com/playwright:*-jammy`, which has no Docker. CODE runs as
a service container on the job's network instead, started only for this script:

```yaml
    services:
      collabora:
        image: ${{ needs.params.outputs.script == 'accounting-spreadsheet-profit' && 'collabora/code@sha256:4e983196eb9878f339cc506c38c21f1cc3473bca3d6de883c5de08f9c0cc3a6c' || '' }}
        env:
          aliasgroup1: http://.*:8099
          extra_params: --o:ssl.enable=false --o:ssl.termination=false --o:user_interface.mode=classic
        options: --cap-add MKNOD --cap-add SYS_ADMIN
```

An empty image string skips the service, so other scripts start nothing. The image is about
1.3GB. SYS_ADMIN lets CODE bind-mount each document's jail; without it every load copies the whole
office tree and the first load can pass a minute.

The scene script's `localApp` starts the host against that service. The browser and the host both
run in the job container, and CODE calls the host back on the job container's address:

```json
"localApp": {
  "command": "node scripts/collabora-sheet-host.js --package 'GB Accounts Basic Sole Trader 2027-04-05 (Apr27) Excel 2007' ${COLLABORA_URL:+--cool-url $COLLABORA_URL --wopi-base http://$(hostname -i | cut -d' ' -f1):8099}",
  "url": "http://localhost:8099",
  "readyPattern": "collabora sheet host ready",
  "readyTimeoutMs": 240000
}
```

The capture step sets `COLLABORA_URL: http://collabora:9980` for this script. Locally, with
`COLLABORA_URL` unset, the host starts the container itself through Docker.

## Build steps

1. Add the scene actions to `scripts/lib/video/actions.js` and `videos/scene-script.schema.json`,
   built on `scripts/lib/video/collabora.js`:
   - `sheetCell` `{ cell }`: `goToCell`, then `cellCursorRect`, then `overlay.pointTo` on its
     centre, and hand the rect to `ctx.onTargetRect` for headline placement.
   - `sheetType` `{ text, then: "Tab" | "Enter" }`: `typeIntoCell` at the script's `perCharMs`,
     then `pressKey`. An empty `text` presses the key only, to step over a column.
   - `sheetPoint` `{ cell }` points without moving on, for totals.
   Tabs use the existing `click` on `#spreadsheet-tab<n>`. Do not type through `page.keyboard`:
   it drops "/", ",", spaces and the first key after a jump, and an Enter can leave a cell in edit
   mode, which then commits into the next sheet visited.
2. Add a setup step, or fold it into `sheetCell`'s first use: `waitForWorkbook` and
   `prepareWorkbook`. It removes CODE's what's-new panel, hard-recalculates and turns spelling
   underlines off.
3. Zoom in off camera so the journals fill the frame (about 150% for the journals, 130% for the
   P&L). Check `cellCursorRect` under zoom with the spike's red box before recording.
4. Write `videos/accounting-spreadsheet-profit.json` from the outline above, with the `localApp`
   block.
5. In `.github/workflows/video-capture.yml`: add the script to the dispatch choices, the
   `collabora` service and `COLLABORA_URL` on the capture step. Confirm on the first run that the
   service reaches the host at `hostname -i`.
6. Add the entry to `videos/publish.json` and the video to `web/public/videos-accounting.html`,
   as for `accounting-diya-gl-profit`.
7. When the scene actions land, `scripts/collabora-sheet-spike.js` can go: the scene script
   replaces it as the proof.

To rerun the proof locally:

```bash
node scripts/collabora-sheet-host.js --package "GB Accounts Basic Sole Trader 2027-04-05 (Apr27) Excel 2007" &
node scripts/collabora-sheet-spike.js --out target/collabora-spike --scale 2
```

The spike exits non-zero unless the P&L reads a net profit of 1,200.
