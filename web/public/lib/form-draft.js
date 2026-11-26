// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/form-draft.js
// A form's answers saved in this browser as the person types, so a closed tab, a reload or an
// ended sign-in loses nothing. A record is kept per journey, per signed-in user (their sub) and per
// company, with the period it covers, the time it was saved and the time it expires. The person
// chooses how long records are kept, or that none are; a record past its expiry is deleted the next
// time a page loads this module. Nothing here leaves the browser.

export const DRAFT_KEY_PREFIX = "formDraft.";
export const KEEP_DAYS_KEY = "formDraft.keepDays";
export const KEEP_DAYS_CHOICES = [7, 28, 90, 0];
export const DEFAULT_KEEP_DAYS = 28;
export const SAVE_DELAY_MS = 1000;

// The sign-in and filing secrets a page holds outside its form. A record never holds them, even if
// a form one day reads them.
export const NEVER_SAVED_FIELDS = ["gatewayUserId", "gatewayPassword", "companyAuthCode"];

const DAY_MS = 86_400_000;

// A record whose expiry is missing or unreadable counts as expired. A record also expires when the
// person's current choice, counted from when it was saved, has passed, so a shorter choice shortens
// the records already kept.
function isLive(record, now, days) {
  const expiresAt = Date.parse(record.expiresAt);
  const savedAt = Date.parse(record.savedAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return false;
  return Number.isFinite(savedAt) && savedAt + days * DAY_MS > now;
}

function storageKeys(storage) {
  const keys = [];
  try {
    for (let index = 0; index < storage.length; index++) keys.push(storage.key(index));
  } catch {
    return [];
  }
  return keys.filter((key) => typeof key === "string");
}

function readRecord(storage, key) {
  try {
    const record = JSON.parse(storage.getItem(key));
    return record && typeof record === "object" && record.values ? record : null;
  } catch {
    return null;
  }
}

function removeKey(storage, key) {
  try {
    storage.removeItem(key);
  } catch {
    // Storage can be unavailable; there is then nothing to remove.
  }
}

/** The key of one record: the journey, the user's sub and the company number. */
export function draftKey({ journey, sub, companyNumber }) {
  return `${DRAFT_KEY_PREFIX}${journey}.${sub}.${companyNumber}`;
}

/** How many days the person keeps their answers in this browser; 0 is "do not keep". */
export function keepDays(storage) {
  try {
    const stored = Number(storage.getItem(KEEP_DAYS_KEY));
    if (storage.getItem(KEEP_DAYS_KEY) !== null && KEEP_DAYS_CHOICES.includes(stored)) return stored;
  } catch {
    // Storage can be unavailable; the default stands.
  }
  return DEFAULT_KEEP_DAYS;
}

/** Records the person's choice; "do not keep" deletes every record of theirs at once. */
export function setKeepDays(storage, days, { sub } = {}) {
  if (!KEEP_DAYS_CHOICES.includes(days)) throw new Error(`Keep days must be one of ${KEEP_DAYS_CHOICES.join(", ")}`);
  try {
    storage.setItem(KEEP_DAYS_KEY, String(days));
  } catch {
    // Storage can be unavailable; nothing is kept then.
  }
  if (days === 0 && sub) deleteAllDrafts(storage, sub);
}

/**
 * Saves the answers, without the secrets, and returns the record; returns null and keeps nothing
 * when the person chose "do not keep" or no one is signed in.
 */
export function saveDraft(storage, { journey, sub, companyNumber, period, values }, now = Date.now()) {
  const days = keepDays(storage);
  if (!sub || !companyNumber || days === 0) return null;
  const kept = { ...values };
  for (const field of NEVER_SAVED_FIELDS) delete kept[field];
  const record = {
    journey,
    companyNumber,
    period: { periodStart: period?.periodStart || "", periodEnd: period?.periodEnd || "" },
    values: kept,
    savedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + days * DAY_MS).toISOString(),
  };
  try {
    storage.setItem(draftKey({ journey, sub, companyNumber }), JSON.stringify(record));
  } catch {
    return null;
  }
  return record;
}

/** The person's record for this journey and company, or null; an expired record is deleted. */
export function loadDraft(storage, { journey, sub, companyNumber }, now = Date.now()) {
  if (!sub || !companyNumber) return null;
  const key = draftKey({ journey, sub, companyNumber });
  const record = readRecord(storage, key);
  if (!record) return null;
  if (!isLive(record, now, keepDays(storage))) {
    removeKey(storage, key);
    return null;
  }
  return record;
}

/** Deletes the person's record for this journey and company. */
export function deleteDraft(storage, { journey, sub, companyNumber }) {
  if (!sub || !companyNumber) return;
  removeKey(storage, draftKey({ journey, sub, companyNumber }));
}

/** Deletes every record of the person in this browser, of every journey; returns how many. */
export function deleteAllDrafts(storage, sub) {
  if (!sub) return 0;
  const owned = storageKeys(storage).filter(
    (key) => key.startsWith(DRAFT_KEY_PREFIX) && key !== KEEP_DAYS_KEY && key.split(".")[2] === sub,
  );
  for (const key of owned) removeKey(storage, key);
  return owned.length;
}

/** Deletes every record past its expiry, whoever saved it; returns how many. */
export function deleteExpiredDrafts(storage, now = Date.now()) {
  const days = keepDays(storage);
  const expired = storageKeys(storage).filter((key) => {
    if (!key.startsWith(DRAFT_KEY_PREFIX) || key === KEEP_DAYS_KEY) return false;
    const record = readRecord(storage, key);
    return !record || !isLive(record, now, days);
  });
  for (const key of expired) removeKey(storage, key);
  return expired.length;
}

/** Runs save one delay after the last call to schedule; cancel stops a save that has not run. */
export function draftSaver(save, delayMs = SAVE_DELAY_MS) {
  let timer = null;
  return {
    schedule() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        save();
      }, delayMs);
    },
    cancel() {
      clearTimeout(timer);
      timer = null;
    },
  };
}

if (typeof window !== "undefined") {
  try {
    if (window.localStorage) deleteExpiredDrafts(window.localStorage);
  } catch {
    // Storage can be unavailable; there is then nothing to delete.
  }
}
