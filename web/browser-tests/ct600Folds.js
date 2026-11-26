// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/browser-tests/ct600Folds.js
// The Company Tax Return page folds the blocks most returns leave at 0. A person opens a fold,
// outermost first, before typing into a box inside it; so do the tests.

/** Open each closed fold around the element with this id, by its summary. */
export async function openFoldsAround(page, id) {
  const closed = await page.locator(`#${id}`).evaluate((node) => {
    const folds = [];
    for (let fold = node.closest("details.form-fold"); fold; fold = fold.parentElement?.closest("details.form-fold")) {
      if (!fold.open) folds.unshift(fold.id);
    }
    return folds;
  });
  for (const foldId of closed) await page.locator(`#${foldId} > summary`).click();
}
