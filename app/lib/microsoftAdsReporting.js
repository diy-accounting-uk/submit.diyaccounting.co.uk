// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/microsoftAdsReporting.js
//
// The read-only Microsoft Advertising (Bing Ads API v13, REST) calls shared by the msads.js
// command line client and the nightly cost pull: the settings in msads.toml, the Google sign-in
// that gives an access token, the request headers, customer discovery and the campaign
// performance report (a summary over the range, or one row per campaign and day).

import zlib from "node:zlib";
import TOML from "@iarna/toml";
import { GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

export const POLL_INTERVAL_MS = 3000;
export const POLL_ATTEMPTS = 40;
export const CAMPAIGN_REPORT_COLUMNS = [
  "CampaignId",
  "CampaignName",
  "Impressions",
  "Clicks",
  "Ctr",
  "AverageCpc",
  "Spend",
  "Conversions",
  "Revenue",
];
export const REPORT_TIME_ZONE = "GreenwichMeanTimeDublinEdinburghLisbonLondon";

export function parseConfig(tomlString) {
  const parsed = TOML.parse(tomlString);
  const config = {
    accountId: parsed.account?.account_id,
    accountNumber: parsed.account?.account_number,
    oauthClientSecretName: parsed.secrets?.oauth_client,
    refreshTokenSecretName: parsed.secrets?.refresh_token,
    developerTokenSecretName: parsed.secrets?.developer_token,
    scope: parsed.oauth?.scope,
    identityProvider: parsed.oauth?.identity_provider,
    tokenUrl: parsed.oauth?.token_url,
    customerManagementUrl: parsed.api?.customer_management,
    campaignManagementUrl: parsed.api?.campaign_management,
    adInsightUrl: parsed.api?.ad_insight,
    reportingUrl: parsed.api?.reporting,
  };
  const missing = Object.entries(config)
    .filter(([, value]) => !value)
    .map(([key]) => key);
  if (missing.length > 0) throw new Error(`msads.toml is missing: ${missing.join(", ")}`);
  return config;
}

/** The developer token secret is a bare string or a JSON object holding it. */
export function parseDeveloperToken(secretString) {
  const trimmed = (secretString ?? "").trim();
  if (!trimmed.startsWith("{")) return trimmed;
  const parsed = JSON.parse(trimmed);
  const token = parsed.developer_token ?? parsed.DeveloperToken ?? parsed.token;
  if (!token) throw new Error("developer token secret is JSON without developer_token");
  return token;
}

export async function refreshAccessToken({ config, clientCredentials, refreshToken, fetchImpl = fetch }) {
  const body = new URLSearchParams({
    client_id: clientCredentials.client_id,
    client_secret: clientCredentials.client_secret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const response = await fetchImpl(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const parsed = await response.json();
  if (!response.ok || !parsed.access_token) {
    throw new Error(
      `Google token refresh failed (${response.status} ${parsed.error ?? ""}). Run --consent again to store a new refresh token.`,
    );
  }
  return parsed.access_token;
}

export function buildHeaders(session) {
  const headers = {
    "Authorization": `Bearer ${session.accessToken}`,
    "DeveloperToken": session.developerToken,
    "IdentityProvider": session.config.identityProvider,
    "Content-Type": "application/json",
  };
  if (session.customerId) headers.CustomerId = String(session.customerId);
  if (session.withAccount !== false) headers.CustomerAccountId = session.config.accountId;
  return headers;
}

export function redact(text, session) {
  let out = String(text);
  for (const secret of [session.accessToken, session.developerToken]) {
    if (secret) out = out.split(secret).join("[redacted]");
  }
  return out;
}

export async function callApi(session, baseUrl, operationPath, body, { method = "POST" } = {}) {
  const response = await session.fetchImpl(`${baseUrl}${operationPath}`, {
    method,
    headers: buildHeaders(session),
    body: JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${operationPath} failed (${response.status}): ${redact(text, session).slice(0, 600)}`);
  }
  return text ? JSON.parse(text) : {};
}

export function shapeAccount(account) {
  return {
    id: String(account.Id),
    number: account.Number,
    name: account.Name,
    currency: account.CurrencyCode,
    lifeCycleStatus: account.AccountLifeCycleStatus,
    financialStatus: account.AccountFinancialStatus,
    timeZone: account.TimeZone,
    timeStamp: account.TimeStamp,
    parentCustomerId: account.ParentCustomerId === undefined ? undefined : String(account.ParentCustomerId),
  };
}

export async function discoverCustomer(session) {
  const { config } = session;
  session.withAccount = false;
  session.customerId = undefined;
  const userBody = await callApi(session, config.customerManagementUrl, "/User/Query", { UserId: null });
  const accountsBody = await callApi(session, config.customerManagementUrl, "/Accounts/Search", {
    Predicates: [{ Field: "AccountId", Operator: "Equals", Value: config.accountId }],
    Ordering: null,
    PageInfo: { Index: 0, Size: 10 },
  });
  session.withAccount = true;
  const accounts = (accountsBody.Accounts ?? []).map(shapeAccount);
  const account = accounts.find((a) => a.id === config.accountId);
  if (!account) throw new Error(`Account ${config.accountId} is not visible to the signed-in user`);
  const customerId = account.parentCustomerId ?? (userBody.User?.CustomerId ? String(userBody.User.CustomerId) : undefined);
  if (!customerId) throw new Error("Could not read the customer id from the account or the user");
  session.customerId = customerId;
  return {
    user: { id: String(userBody.User?.Id), name: userBody.User?.UserName, customerId: String(userBody.User?.CustomerId ?? "") },
    roles: (userBody.CustomerRoles ?? []).map((r) => ({
      customerId: String(r.CustomerId),
      roleId: r.RoleId,
      accountIds: (r.AccountIds ?? []).map(String),
    })),
    customerId,
    account,
  };
}

export function dateObject(value) {
  if (!value) return null;
  if (typeof value === "object" && value.Year) return value;
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(value));
  return match ? { Year: Number(match[1]), Month: Number(match[2]), Day: Number(match[3]) } : null;
}

export function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(field);
      field = "";
      if (row.some((v) => v !== "")) rows.push(row);
      row = [];
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some((v) => v !== "")) rows.push(row);
  return rows;
}

/** Reads the first entry of a zip archive from its central directory. */
export function unzipFirstEntry(buffer) {
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("not a zip archive");
  const centralOffset = buffer.readUInt32LE(eocd + 16);
  if (buffer.readUInt32LE(centralOffset) !== 0x02014b50) throw new Error("zip central directory not found");
  const method = buffer.readUInt16LE(centralOffset + 10);
  const compressedSize = buffer.readUInt32LE(centralOffset + 20);
  const localOffset = buffer.readUInt32LE(centralOffset + 42);
  const nameLength = buffer.readUInt16LE(localOffset + 26);
  const extraLength = buffer.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLength + extraLength;
  const data = buffer.subarray(start, start + compressedSize);
  if (method === 0) return data;
  if (method === 8) return zlib.inflateRawSync(data);
  throw new Error(`unsupported zip method ${method}`);
}

export function parseDateArg(value, label) {
  const date = dateObject(value);
  if (!date) throw new Error(`${label} must be YYYY-MM-DD`);
  return date;
}

export function buildCampaignReportRequest({ accountId, from, to, aggregation = "Summary" }) {
  return {
    ReportRequest: {
      ExcludeColumnHeaders: false,
      ExcludeReportFooter: true,
      ExcludeReportHeader: true,
      Format: "Csv",
      FormatVersion: "2.0",
      ReportName: "msads-campaign-summary",
      ReturnOnlyCompleteData: false,
      Type: "CampaignPerformanceReportRequest",
      Aggregation: aggregation,
      Columns: aggregation === "Daily" ? ["TimePeriod", ...CAMPAIGN_REPORT_COLUMNS] : CAMPAIGN_REPORT_COLUMNS,
      Scope: { AccountIds: [accountId] },
      Time: {
        CustomDateRangeStart: parseDateArg(from, "from"),
        CustomDateRangeEnd: parseDateArg(to, "to"),
        ReportTimeZone: REPORT_TIME_ZONE,
      },
    },
  };
}

export function shapeReportRows(csvText) {
  const [header, ...rows] = parseCsv(csvText);
  if (!header) return [];
  const num = (v) => (v === undefined || v === "" || v === "--" ? 0 : Number(String(v).replace(/[%,]/g, "")));
  return rows.map((cells) => {
    const r = Object.fromEntries(header.map((name, i) => [name, cells[i]]));
    return {
      ...(r.TimePeriod ? { date: r.TimePeriod } : {}),
      campaignId: r.CampaignId,
      campaign: r.CampaignName,
      impressions: num(r.Impressions),
      clicks: num(r.Clicks),
      ctrPercent: num(r.Ctr),
      averageCpc: num(r.AverageCpc),
      spend: num(r.Spend),
      conversions: num(r.Conversions),
      revenue: num(r.Revenue),
    };
  });
}

export async function runCampaignReport(
  session,
  { from, to, aggregation, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) },
) {
  const { config } = session;
  const submit = await callApi(
    session,
    config.reportingUrl,
    "/GenerateReport/Submit",
    buildCampaignReportRequest({ accountId: config.accountId, from, to, aggregation }),
  );
  const reportRequestId = submit.ReportRequestId;
  if (!reportRequestId) throw new Error("Report submit returned no ReportRequestId");
  for (let attempt = 0; attempt < POLL_ATTEMPTS; attempt++) {
    const poll = await callApi(session, config.reportingUrl, "/GenerateReport/Poll", { ReportRequestId: reportRequestId });
    const status = poll.ReportRequestStatus?.Status;
    if (status === "Success") {
      const url = poll.ReportRequestStatus.ReportDownloadUrl;
      if (!url) return [];
      const download = await session.fetchImpl(url);
      if (!download.ok) throw new Error(`Report download failed (${download.status})`);
      const text = unzipFirstEntry(Buffer.from(await download.arrayBuffer())).toString("utf8");
      const csv = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
      return shapeReportRows(csv);
    }
    if (status === "Error") throw new Error("Report generation failed");
    await sleep(POLL_INTERVAL_MS);
  }
  throw new Error(`Report ${reportRequestId} was not ready after ${POLL_ATTEMPTS} polls`);
}

/**
 * A signed-in session: the stored Google refresh token and the developer token read from Secrets
 * Manager, and the access token Google's token endpoint returns for the refresh token.
 */
export async function openSession({ config, clientCredentials, smClient, fetchImpl = fetch }) {
  const readSecretString = async (secretId) => (await smClient.send(new GetSecretValueCommand({ SecretId: secretId }))).SecretString;
  let storedRefreshToken;
  try {
    storedRefreshToken = await readSecretString(config.refreshTokenSecretName);
  } catch (error) {
    if (error.name === "ResourceNotFoundException") {
      throw new Error(`No refresh token in ${config.refreshTokenSecretName}. Run: node infra/microsoft/ads/msads.js --consent`);
    }
    throw error;
  }
  const developerToken = parseDeveloperToken(await readSecretString(config.developerTokenSecretName));
  const accessToken = await refreshAccessToken({
    config,
    clientCredentials,
    refreshToken: JSON.parse(storedRefreshToken).refresh_token,
    fetchImpl,
  });
  return { config, accessToken, developerToken, fetchImpl, customerId: undefined };
}
