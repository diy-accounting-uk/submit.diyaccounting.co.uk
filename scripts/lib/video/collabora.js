// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// scripts/lib/video/collabora.js
//
// Drives a workbook open in Collabora Online (see scripts/collabora-sheet-host.js) from a
// Playwright page. Collabora draws the grid on a canvas, so a cell has no DOM element to locate:
// the cell cursor moves by the .uno:GoToCell command, text goes to the document over Collabora's
// own socket messages, and a cell's on-screen box comes from the cursor rectangle Collabora keeps
// in window.app.calc. Keyboard events from Playwright drop characters ("/", ",", space and the
// first key after a jump) and an Enter can leave the cell in edit mode, so this module never
// types through page.keyboard.

const KEY_CODES = {
  Enter: { char: 13, key: 1280 },
  Tab: { char: 9, key: 1282 },
};

// A scene script names a cell the way a spreadsheet user reads it: SalesApr!A4, or
// Profit & Loss Acc!C24 for a sheet name with spaces. Collabora's GoToCell wants LibreOffice's
// own form, $SalesApr.A4 and $'Profit & Loss Acc'.C24.
export function libreOfficeReference(ref) {
  const bang = ref.lastIndexOf("!");
  if (bang < 1) throw new Error(`cell reference "${ref}" needs a sheet and a cell, like SalesApr!A4`);
  const sheet = ref.slice(0, bang);
  const cell = ref.slice(bang + 1);
  if (!/^[A-Z]{1,3}[0-9]{1,7}$/.test(cell)) throw new Error(`cell reference "${ref}" has no cell like A4 after the "!"`);
  return `$${/^[A-Za-z0-9_]+$/.test(sheet) ? sheet : `'${sheet.replace(/'/g, "''")}'`}.${cell}`;
}

// Collabora zooms in fixed steps; zoomTo takes the step number. 100% is step 10.
const ZOOM_STEP_BY_PERCENT = {
  20: 1,
  25: 2,
  30: 3,
  35: 4,
  40: 5,
  50: 6,
  60: 7,
  70: 8,
  85: 9,
  100: 10,
  120: 11,
  150: 12,
  170: 13,
  200: 14,
  235: 15,
  280: 16,
  335: 17,
  400: 18,
};

export function zoomStepFor(percent) {
  const step = ZOOM_STEP_BY_PERCENT[percent];
  if (!step) throw new Error(`Collabora has no ${percent}% zoom; steps are ${Object.keys(ZOOM_STEP_BY_PERCENT).join(", ")}`);
  return step;
}

export async function setZoom(page, percent) {
  const step = zoomStepFor(percent);
  await page.evaluate((s) => window.app.zoomControl.zoomTo(s, undefined, true), step);
  await page.waitForFunction((s) => window.app.map.getZoom() === s, step, { timeout: 10000 });
  await page.waitForTimeout(1500);
}

export async function waitForWorkbook(page, { timeoutMs = 120000 } = {}) {
  await page.locator("#pos_window-input-address").waitFor({ state: "visible", timeout: timeoutMs });
  await page.waitForFunction(() => window.app?.socket && window.app?.calc?.cellCursorRectangle, null, { timeout: timeoutMs });
}

// Off camera, once per load: removes the "what's new" panel CODE shows on a first visit,
// recalculates every formula (LibreOffice keeps an xlsx's cached values on load, so the package's
// month headers and tax year label read the template's year until a hard recalculation), and
// turns off the spelling underline.
export async function prepareWorkbook(page) {
  await page.evaluate(() => document.querySelector(".iframe-welcome-wrap")?.remove());
  await page.evaluate(() => window.app.map.sendUnoCommand(".uno:CalculateHard"));
  await page.evaluate(() => window.app.map.sendUnoCommand(".uno:SpellOnline", { Enable: { type: "boolean", value: false } }));
  await page.waitForTimeout(1500);
}

// ref is LibreOffice's own form: $SalesApr.A4, or $'Profit & Loss Acc'.C24 for a name with spaces.
export async function goToCell(page, ref, { timeoutMs = 10000 } = {}) {
  const cell = ref.split(".").pop().replace(/\$/g, "");
  await page.evaluate((point) => window.app.map.sendUnoCommand(".uno:GoToCell", { ToPoint: { type: "string", value: point } }), ref);
  await page.waitForFunction((want) => document.querySelector("#pos_window-input-address")?.value === want, cell, {
    timeout: timeoutMs,
  });
}

// The cell cursor's box in page pixels. cellCursorRectangle is in document pixels; the document
// anchor (the corner below the column headers and right of the row numbers) and the scrolled
// view rectangle turn it into canvas pixels. A sheet with frozen panes or a split would need
// the layout's split offset as well; the Basic Sole Trader journals and P&L have neither.
export async function cellCursorRect(page) {
  return page.evaluate(() => {
    const cursor = window.app.calc.cellCursorRectangle;
    const [anchorX, anchorY] = window.app.sectionContainer.getDocumentAnchor();
    const view = window.app.activeDocument.activeLayout.viewedRectangle;
    const canvas = document.getElementById("document-canvas").getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    return {
      left: canvas.left + (anchorX + cursor.pX1 - view.pX1) / dpr,
      top: canvas.top + (anchorY + cursor.pY1 - view.pY1) / dpr,
      width: cursor.pWidth / dpr,
      height: cursor.pHeight / dpr,
    };
  });
}

// Sends text the way Collabora's own input layer does, one character at a time so the viewer
// sees it typed. LibreOffice parses the finished entry exactly as typed: 10/04/2026 becomes a
// date under the en-GB locale, 500 a number.
export async function typeIntoCell(page, text, { perCharMs = 90 } = {}) {
  for (const character of text) {
    await page.evaluate((c) => window.app.socket.sendMessage(`textinput id=0 text=${encodeURIComponent(c)}`), character);
    await page.waitForTimeout(perCharMs);
  }
}

export async function pressKey(page, name) {
  const code = KEY_CODES[name];
  if (!code) throw new Error(`pressKey: no key code for ${name}`);
  await page.evaluate(({ char, key }) => {
    window.app.socket.sendMessage(`key type=input char=${char} key=${key}`);
    window.app.socket.sendMessage(`key type=up char=0 key=${key}`);
  }, code);
}

// One row of a journal: the cells left to right from the cell the cursor is on, Tab between them
// and Enter after the last. An empty string skips a cell.
export async function enterRow(page, values, { perCharMs = 90, betweenCellsMs = 400 } = {}) {
  for (let i = 0; i < values.length; i++) {
    if (values[i]) await typeIntoCell(page, values[i], { perCharMs });
    await page.waitForTimeout(betweenCellsMs);
    await pressKey(page, i === values.length - 1 ? "Enter" : "Tab");
    await page.waitForTimeout(betweenCellsMs);
  }
}

// A numeric cell's value, read off the status bar's Sum after the cursor jumps to it: the canvas
// has no DOM text to read.
export async function readNumber(page, ref) {
  await goToCell(page, ref);
  await page.waitForTimeout(800);
  const status = await page.locator("#StateTableCell").textContent();
  const match = status.match(/Sum:\s*(-?[\d,.]+)/);
  return match ? Number(match[1].replace(/,/g, "")) : null;
}
