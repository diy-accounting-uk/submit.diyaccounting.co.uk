// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// web/public/lib/google-drive-picker.js
// Opens a file from the customer's own Google Drive in the browser. Google Identity Services
// issues a drive.file token for this page, the Google Picker lets the customer choose the file,
// and the file is downloaded with that token. The token stays in this module's memory and goes
// nowhere but Google.

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.file";
const GIS_SRC = "https://accounts.google.com/gsi/client";
const PICKER_LOADER_SRC = "https://apis.google.com/js/api.js";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";
const TOKEN_EXPIRY_MARGIN_MS = 60000;

const XLSX_MIME_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const GOOGLE_SHEET_MIME_TYPE = "application/vnd.google-apps.spreadsheet";
const PICKER_MIME_TYPES = ["application/zip", XLSX_MIME_TYPE, "application/json", GOOGLE_SHEET_MIME_TYPE].join(",");

let gisLoad = null;
let pickerLoad = null;
let held = null;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`${src} could not be loaded`));
    document.head.appendChild(script);
  });
}

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  if (!gisLoad) {
    gisLoad = loadScript(GIS_SRC).catch((error) => {
      gisLoad = null;
      throw new Error(`Google sign-in could not be loaded (${error.message})`);
    });
  }
  return gisLoad;
}

function loadPicker() {
  if (window.google?.picker) return Promise.resolve();
  if (!pickerLoad) {
    const loadModule = () =>
      new Promise((resolve, reject) => {
        window.gapi.load("picker", { callback: resolve, onerror: () => reject(new Error("the Picker module did not load")) });
      });
    const loaderReady = typeof window.gapi?.load === "function" ? Promise.resolve() : loadScript(PICKER_LOADER_SRC);
    pickerLoad = loaderReady.then(loadModule).catch((error) => {
      pickerLoad = null;
      throw new Error(`The Google Picker could not be loaded (${error.message})`);
    });
  }
  return pickerLoad;
}

// The configuration the page's environment carries, or null when Drive is not offered here:
// both values present and the page served over https (or from localhost).
export function driveConfig(env) {
  const clientId = env?.GOOGLE_DRIVE_CLIENT_ID;
  const pickerApiKey = env?.GOOGLE_DRIVE_PICKER_API_KEY;
  if (!clientId || !pickerApiKey) return null;
  const local = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";
  if (window.location.protocol !== "https:" && !local) return null;
  return { clientId, pickerApiKey };
}

// Starts loading the Google scripts so the click that follows can reach the consent window
// while the browser still counts it as a user action.
export function preload() {
  return loadGis().catch(() => {});
}

function requestToken(config, prompt) {
  return loadGis().then(
    () =>
      new Promise((resolve, reject) => {
        const client = window.google.accounts.oauth2.initTokenClient({
          client_id: config.clientId,
          scope: DRIVE_SCOPE,
          callback: (response) => {
            if (!response || response.error) {
              reject(new Error((response && response.error) || "consent was not granted"));
              return;
            }
            if (
              typeof window.google.accounts.oauth2.hasGrantedAllScopes === "function" &&
              !window.google.accounts.oauth2.hasGrantedAllScopes(response, DRIVE_SCOPE)
            ) {
              reject(new Error("Google Drive access was not fully granted"));
              return;
            }
            held = { token: response.access_token, expiresAt: Date.now() + response.expires_in * 1000 };
            resolve(held.token);
          },
          error_callback: (failure) => reject(new Error((failure && (failure.type || failure.message)) || "the consent window was closed")),
        });
        client.requestAccessToken({ prompt });
      }),
  );
}

// Resolves with a drive.file access token, asking for consent on the first call and re-using or
// silently renewing the token after that. Call it from a click handler.
export function connect(config) {
  if (held && Date.now() < held.expiresAt - TOKEN_EXPIRY_MARGIN_MS) return Promise.resolve(held.token);
  return requestToken(config, held ? "" : "consent");
}

// Opens the Picker over the customer's Drive. The project number, which is the client id's
// leading digits, is the Picker's app id and attaches the grant for the chosen file to this
// project. Resolves with { id, name, mimeType }, or null when the Picker is closed unchosen.
export function pick(config, token) {
  return loadPicker().then(
    () =>
      new Promise((resolve) => {
        const picker = window.google.picker;
        const view = new picker.DocsView(picker.ViewId.DOCS).setMimeTypes(PICKER_MIME_TYPES);
        new picker.PickerBuilder()
          .addView(view)
          .setOAuthToken(token)
          .setDeveloperKey(config.pickerApiKey)
          .setAppId(config.clientId.split("-")[0])
          .setCallback((data) => {
            const action = data[picker.Response.ACTION];
            if (action === picker.Action.PICKED) {
              const document = data[picker.Response.DOCUMENTS][0];
              resolve({
                id: document[picker.Document.ID],
                name: document[picker.Document.NAME],
                mimeType: document[picker.Document.MIME_TYPE],
              });
            } else if (action === picker.Action.CANCEL) {
              resolve(null);
            }
          })
          .build()
          .setVisible(true);
      }),
  );
}

// The picked file's bytes as a File, the same shape a file dialog hands the reader.
export async function download(picked, token) {
  const response = await fetch(`${DRIVE_FILES_URL}/${encodeURIComponent(picked.id)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Google Drive answered ${response.status}`);
  const blob = await response.blob();
  return new File([blob], picked.name, { type: picked.mimeType || blob.type });
}
