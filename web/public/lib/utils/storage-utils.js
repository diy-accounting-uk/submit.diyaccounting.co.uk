// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// Storage utility functions for localStorage and sessionStorage

/**
 * Safely get item from localStorage
 * @param {string} key - Storage key
 * @returns {string|null} Stored value or null
 */
export function getLocalStorageItem(key) {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to read ${key} from localStorage:`, error);
    return null;
  }
}

/**
 * Safely set item in localStorage
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} True if successful
 */
export function setLocalStorageItem(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to save ${key} to localStorage:`, error);
    return false;
  }
}

/**
 * Safely remove item from localStorage
 * @param {string} key - Storage key
 * @returns {boolean} True if successful
 */
export function removeLocalStorageItem(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Failed to remove ${key} from localStorage:`, error);
    return false;
  }
}

/**
 * Safely get item from sessionStorage
 * @param {string} key - Storage key
 * @returns {string|null} Stored value or null
 */
export function getSessionStorageItem(key) {
  try {
    return sessionStorage.getItem(key);
  } catch (error) {
    console.warn(`Failed to read ${key} from sessionStorage:`, error);
    return null;
  }
}

/**
 * Safely set item in sessionStorage
 * @param {string} key - Storage key
 * @param {string} value - Value to store
 * @returns {boolean} True if successful
 */
export function setSessionStorageItem(key, value) {
  try {
    sessionStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`Failed to save ${key} to sessionStorage:`, error);
    return false;
  }
}

/**
 * Safely remove item from sessionStorage
 * @param {string} key - Storage key
 * @returns {boolean} True if successful
 */
export function removeSessionStorageItem(key) {
  try {
    sessionStorage.removeItem(key);
    return true;
  } catch (error) {
    console.warn(`Failed to remove ${key} from sessionStorage:`, error);
    return false;
  }
}

/**
 * Get parsed JSON from localStorage
 * @param {string} key - Storage key
 * @param {*} defaultValue - Default value if not found or invalid
 * @returns {*} Parsed value or default
 */
export function getLocalStorageJson(key, defaultValue = null) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return defaultValue;
    return JSON.parse(raw);
  } catch (error) {
    console.warn(`Failed to parse ${key} from localStorage:`, error);
    return defaultValue;
  }
}

/**
 * Store JSON in localStorage
 * @param {string} key - Storage key
 * @param {*} value - Value to store (will be stringified)
 * @returns {boolean} True if successful
 */
export function setLocalStorageJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Failed to save ${key} to localStorage:`, error);
    return false;
  }
}

// Export on window for backward compatibility
if (typeof window !== "undefined") {
  window.getLocalStorageItem = getLocalStorageItem;
  window.setLocalStorageItem = setLocalStorageItem;
  window.removeLocalStorageItem = removeLocalStorageItem;
  window.getSessionStorageItem = getSessionStorageItem;
  window.setSessionStorageItem = setSessionStorageItem;
  window.removeSessionStorageItem = removeSessionStorageItem;
  window.getLocalStorageJson = getLocalStorageJson;
  window.setLocalStorageJson = setLocalStorageJson;
}
