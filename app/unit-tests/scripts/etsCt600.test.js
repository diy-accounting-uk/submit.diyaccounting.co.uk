// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, it, expect } from "vitest";
import { readEtsInputs, runEtsExchange } from "../../../scripts/lib/etsCt600.js";

const complete = {
  HMRC_CT_ETS_SENDER_ID: "sender",
  HMRC_CT_ETS_PASSWORD: "secret-password",
  HMRC_CT_ETS_UTR: "1234567890",
  HMRC_CT_VENDOR_ID: "9873",
};

describe("readEtsInputs", () => {
  it("returns the four inputs", () => {
    expect(readEtsInputs(complete)).toEqual({ senderId: "sender", password: "secret-password", utr: "1234567890", vendorId: "9873" });
  });

  it("names every missing variable", () => {
    expect(() => readEtsInputs({ HMRC_CT_ETS_UTR: "1234567890" })).toThrow(
      /HMRC_CT_ETS_SENDER_ID, HMRC_CT_ETS_PASSWORD, HMRC_CT_VENDOR_ID/,
    );
  });

  it("treats an empty value as missing", () => {
    expect(() => readEtsInputs({ ...complete, HMRC_CT_ETS_PASSWORD: " " })).toThrow(/HMRC_CT_ETS_PASSWORD/);
  });

  it("rejects a malformed UTR and vendor ID", () => {
    expect(() => readEtsInputs({ ...complete, HMRC_CT_ETS_UTR: "123", HMRC_CT_VENDOR_ID: "98" })).toThrow(
      /HMRC_CT_ETS_UTR must be 10 digits; HMRC_CT_VENDOR_ID must be 4 digits/,
    );
  });
});

const govTalk = (qualifier, extra = "") =>
  `<GovTalkMessage xmlns="http://www.govtalk.gov.uk/CM/envelope"><EnvelopeVersion>2.0</EnvelopeVersion><Header><MessageDetails><Class>HMRC-CT-CT600</Class><Qualifier>${qualifier}</Qualifier><Function>submit</Function><CorrelationID>ABC123</CorrelationID></MessageDetails></Header><GovTalkDetails><Keys/></GovTalkDetails><Body>${extra}</Body></GovTalkMessage>`;
const acknowledgement = govTalk("acknowledgement")
  .replace("<Body></Body>", "<Body></Body>")
  .replace("</MessageDetails>", '<ResponseEndPoint PollInterval="5">https://poll.example/poll</ResponseEndPoint></MessageDetails>');

describe("runEtsExchange", () => {
  it("posts, polls to the final response, deletes, and redacts credentials", async () => {
    const calls = [];
    const answers = [acknowledgement, acknowledgement, govTalk("response"), govTalk("response")];
    const waits = [];
    const submissionXml =
      "<GovTalkMessage><SenderID>sender</SenderID><Authentication><Method>clear</Method><Value>secret-password</Value></Authentication></GovTalkMessage>";
    const result = await runEtsExchange({
      submissionXml,
      post: async (url, xml) => {
        calls.push({ url, xml });
        return { status: 200, data: answers.shift() };
      },
      wait: async (milliseconds) => waits.push(milliseconds),
    });
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(4);
    expect(calls[0].url).toBe("https://test-transaction-engine.tax.service.gov.uk/submission");
    expect(calls[1].xml).toContain("<Qualifier>poll</Qualifier>");
    expect(calls[3].xml).toContain("<Function>delete</Function>");
    expect(waits).toEqual([5000, 5000]);
    expect(JSON.stringify(result.transcript)).not.toContain("secret-password");
    expect(result.transcript[0].xml).toContain("<SenderID>***</SenderID>");
  });

  it("stops at an error response and still deletes", async () => {
    const error = govTalk("error").replace(
      "<GovTalkDetails><Keys/></GovTalkDetails>",
      "<GovTalkDetails><Keys/><GovTalkErrors><Error><RaisedBy>Gateway</RaisedBy><Number>1046</Number><Type>fatal</Type><Text>Authentication failure</Text></Error></GovTalkErrors></GovTalkDetails>",
    );
    const answers = [error, govTalk("response")];
    const result = await runEtsExchange({
      submissionXml: "<GovTalkMessage/>",
      post: async () => ({ status: 200, data: answers.shift() }),
      wait: async () => {},
    });
    expect(result.ok).toBe(false);
    expect(result.final.errors[0].number).toBe("1046");
  });
});
