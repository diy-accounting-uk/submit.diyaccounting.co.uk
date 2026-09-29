// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import fs from "node:fs";
import { describe, it, expect } from "vitest";
import { checkDownloadedClient, findDriveClient, writeClientId } from "../../../scripts/drive-client-record.js";

const DECLARED = {
  project_number: "670010122633",
  javascript_origins: ["https://submit.diyaccounting.co.uk", "https://diya-gl.co.uk"],
};
const CLIENT_ID = "670010122633-abc123.apps.googleusercontent.com";

function download(overrides = {}) {
  return {
    web: { client_id: CLIENT_ID, javascript_origins: ["https://diya-gl.co.uk", "https://submit.diyaccounting.co.uk"], ...overrides },
  };
}

describe("checkDownloadedClient", () => {
  it("returns the client id when type, project and origins match, whatever the origin order", () => {
    expect(checkDownloadedClient(download(), DECLARED)).toBe(CLIENT_ID);
  });
  it("refuses a desktop client", () => {
    expect(() => checkDownloadedClient({ installed: { client_id: CLIENT_ID } }, DECLARED)).toThrow(/type "installed"/);
  });
  it("refuses a client from another project", () => {
    expect(() => checkDownloadedClient(download({ client_id: "999-x.apps.googleusercontent.com" }), DECLARED)).toThrow(/project 999/);
  });
  it("refuses redirect URIs", () => {
    expect(() => checkDownloadedClient(download({ redirect_uris: ["https://x/cb"] }), DECLARED)).toThrow(/redirect URIs/);
  });
  it("names a missing and an extra origin", () => {
    const err = () =>
      checkDownloadedClient(download({ javascript_origins: ["https://submit.diyaccounting.co.uk", "https://evil.example"] }), DECLARED);
    expect(err).toThrow(/Missing: \[https:\/\/diya-gl\.co\.uk\]. Extra: \[https:\/\/evil\.example\]/);
  });
});

describe("writeClientId", () => {
  const toml = fs.readFileSync("infra/google/gcp/oauth.toml", "utf-8");
  it("sets only the drive_browser id line", () => {
    const updated = writeClientId(toml, CLIENT_ID);
    expect(findDriveClient(updated).id).toBe(CLIENT_ID);
    const before = toml.split("\n");
    const after = updated.split("\n");
    expect(after).toHaveLength(before.length);
    expect(after.filter((line, index) => line !== before[index])).toEqual([`id = "${CLIENT_ID}"`]);
  });
  it("leaves the sign-in id alone", () => {
    expect(updatedSignInId(writeClientId(toml, CLIENT_ID))).toBe(updatedSignInId(toml));
  });
  it("throws when there is no drive_browser entry", () => {
    expect(() => writeClientId('[[client]]\npurpose = "sign_in"\nid = "x"\n', CLIENT_ID)).toThrow(/drive_browser/);
  });
});

function updatedSignInId(tomlString) {
  return tomlString.match(/purpose = "sign_in"\nid = "([^"]+)"/)[1];
}
