// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/unit-tests/functions/alarmSmsForward.test.js

import { describe, test, expect, vi, beforeEach, afterEach } from "vitest";

const mockSsmSend = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send(...args) {
      return mockSsmSend(...args);
    }
  },
  GetParameterCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockSmsSend = vi.fn();
vi.mock("@aws-sdk/client-pinpoint-sms-voice-v2", () => ({
  PinpointSMSVoiceV2Client: class {
    send(...args) {
      return mockSmsSend(...args);
    }
  },
  SendTextMessageCommand: class {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  parseAlarmSnsRecord,
  formatAlarmStateWord,
  formatStateChangeTime,
  buildMessageBody,
  handler,
} from "@app/functions/ops/alarmSmsForward.js";

// GSM 03.38 default alphabet's basic character set: enough of it to prove this handler's fixed
// wording and alarm names never push a message into UCS-2, which would halve the 160-character
// single-part limit to 70.
const GSM7_BASIC_SET_PATTERN = /^[A-Za-z0-9 @£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà\n\r]*$/;

function snsAlarmEvent(records) {
  return {
    Records: records.map((notification) => ({
      EventSource: "aws:sns",
      Sns: { Message: JSON.stringify(notification) },
    })),
  };
}

function alarmNotification(overrides = {}) {
  return {
    AlarmName: "prod-a1b2c3d-ops-health-failed",
    NewStateValue: "ALARM",
    OldStateValue: "OK",
    StateChangeTime: "2026-09-26T02:15:32.123+0000",
    Region: "EU (London)",
    ...overrides,
  };
}

describe("functions/ops/alarmSmsForward", () => {
  beforeEach(() => {
    mockSsmSend.mockReset();
    mockSmsSend.mockReset();
    process.env.ENVIRONMENT_NAME = "prod";
    process.env.SMS_ORIGINATION_IDENTITY = "DIYACCT";
    process.env.OPERATOR_SMS_NUMBER_PARAMETER_NAME = "/submit/prod/operator-sms-number";
  });

  afterEach(() => {
    delete process.env.ENVIRONMENT_NAME;
    delete process.env.SMS_ORIGINATION_IDENTITY;
    delete process.env.OPERATOR_SMS_NUMBER_PARAMETER_NAME;
  });

  describe("parseAlarmSnsRecord", () => {
    test("extracts alarm name, new state and state-change time from the CloudWatch SNS shape", () => {
      const parsed = parseAlarmSnsRecord({ Sns: { Message: JSON.stringify(alarmNotification()) } });
      expect(parsed).toEqual({
        alarmName: "prod-a1b2c3d-ops-health-failed",
        newState: "ALARM",
        stateChangeTime: "2026-09-26T02:15:32.123+0000",
      });
    });

    test("returns null when the record carries no message", () => {
      expect(parseAlarmSnsRecord({ Sns: {} })).toBeNull();
      expect(parseAlarmSnsRecord({})).toBeNull();
    });
  });

  describe("formatAlarmStateWord", () => {
    test("ALARM reads as-is", () => {
      expect(formatAlarmStateWord("ALARM")).toBe("ALARM");
    });

    test("OK reads as a recovery", () => {
      expect(formatAlarmStateWord("OK")).toBe("OK (recovered)");
    });

    test("an unexpected state passes through unchanged", () => {
      expect(formatAlarmStateWord("INSUFFICIENT_DATA")).toBe("INSUFFICIENT_DATA");
    });
  });

  describe("formatStateChangeTime", () => {
    test("renders the UTC time as HH:MM UTC", () => {
      expect(formatStateChangeTime("2026-09-26T02:15:32.123+0000")).toBe("02:15 UTC");
    });

    test("throws on a state-change time that is not a valid date", () => {
      expect(() => formatStateChangeTime("not-a-date")).toThrow();
    });
  });

  describe("buildMessageBody", () => {
    test("builds the ALARM line", () => {
      const body = buildMessageBody({
        alarmName: "prod-a1b2c3d-ops-health-failed",
        newState: "ALARM",
        stateChangeTime: "2026-09-26T02:15:32.123+0000",
        environmentName: "prod",
      });
      expect(body).toBe("DIY Submit prod: prod-a1b2c3d-ops-health-failed ALARM at 02:15 UTC");
    });

    test("builds the OK (recovered) line", () => {
      const body = buildMessageBody({
        alarmName: "prod-a1b2c3d-ops-api-failed",
        newState: "OK",
        stateChangeTime: "2026-09-26T03:00:00.000+0000",
        environmentName: "prod",
      });
      expect(body).toBe("DIY Submit prod: prod-a1b2c3d-ops-api-failed OK (recovered) at 03:00 UTC");
    });

    test("stays within a single SMS part and GSM-7 for both alarm names this Lambda ever sees", () => {
      for (const alarmName of ["prod-a1b2c3d-ops-health-failed", "prod-a1b2c3d-ops-api-failed"]) {
        for (const newState of ["ALARM", "OK"]) {
          const body = buildMessageBody({
            alarmName,
            newState,
            stateChangeTime: "2026-09-26T02:15:32.123+0000",
            environmentName: "prod",
          });
          expect(body.length).toBeLessThanOrEqual(160);
          expect(body).toMatch(GSM7_BASIC_SET_PATTERN);
        }
      }
    });
  });

  describe("handler", () => {
    // Declared first among this describe block's tests deliberately: resolveOperatorNumber
    // caches the number in a module-level variable for the container's lifetime (see
    // alarmSmsForward.js), so this is the one test in the file that can observe the SSM call
    // happening at all. Every later test here inherits the warm cache instead of re-reading it,
    // the same per-container behaviour a real Lambda would show across invocations.
    test("reads the operator number from SSM once per container, then reuses it for a later alarm", async () => {
      mockSsmSend.mockResolvedValue({ Parameter: { Value: "+447700900000" } });
      mockSmsSend.mockResolvedValue({ MessageId: "msg-1" });

      await handler(snsAlarmEvent([alarmNotification()]));
      await handler(snsAlarmEvent([alarmNotification({ NewStateValue: "OK" })]));

      expect(mockSsmSend).toHaveBeenCalledTimes(1);
      const getParameterInput = mockSsmSend.mock.calls[0][0].input;
      expect(getParameterInput.Name).toBe("/submit/prod/operator-sms-number");
      expect(getParameterInput.WithDecryption).toBe(true);
      expect(mockSmsSend).toHaveBeenCalledTimes(2);
    });

    test("sends one text per alarm state-change record and returns the count sent", async () => {
      mockSmsSend.mockResolvedValue({ MessageId: "msg-1" });

      const event = snsAlarmEvent([alarmNotification()]);
      const result = await handler(event);

      expect(result.sent).toBe(1);
      expect(mockSmsSend).toHaveBeenCalledTimes(1);
    });

    test("sends from the configured origination identity as a TRANSACTIONAL message", async () => {
      mockSmsSend.mockResolvedValue({ MessageId: "msg-1" });

      await handler(snsAlarmEvent([alarmNotification()]));

      const sendInput = mockSmsSend.mock.calls[0][0].input;
      expect(sendInput.DestinationPhoneNumber).toBe("+447700900000");
      expect(sendInput.OriginationIdentity).toBe("DIYACCT");
      expect(sendInput.MessageType).toBe("TRANSACTIONAL");
      expect(sendInput.MessageBody).toBe("DIY Submit prod: prod-a1b2c3d-ops-health-failed ALARM at 02:15 UTC");
    });

    test("a send failure throws rather than being swallowed", async () => {
      mockSsmSend.mockResolvedValue({ Parameter: { Value: "+447700900000" } });
      mockSmsSend.mockRejectedValue(new Error("SendTextMessage failed"));

      await expect(handler(snsAlarmEvent([alarmNotification()]))).rejects.toThrow("SendTextMessage failed");
    });

    test("throws when ENVIRONMENT_NAME is not set", async () => {
      delete process.env.ENVIRONMENT_NAME;
      await expect(handler(snsAlarmEvent([alarmNotification()]))).rejects.toThrow(/ENVIRONMENT_NAME/);
    });

    test("throws when SMS_ORIGINATION_IDENTITY is not set", async () => {
      delete process.env.SMS_ORIGINATION_IDENTITY;
      await expect(handler(snsAlarmEvent([alarmNotification()]))).rejects.toThrow(/SMS_ORIGINATION_IDENTITY/);
    });

    test("no records produces an empty result without calling SSM or SMS", async () => {
      const result = await handler({ Records: [] });
      expect(result.sent).toBe(0);
      expect(mockSsmSend).not.toHaveBeenCalled();
      expect(mockSmsSend).not.toHaveBeenCalled();
    });
  });
});
