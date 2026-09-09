// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

import { describe, test, expect, vi, beforeEach } from "vitest";

const mockSsmSend = vi.fn();
vi.mock("@aws-sdk/client-ssm", () => ({
  SSMClient: class {
    send(...args) {
      return mockSsmSend(...args);
    }
  },
  GetParameterCommand: class GetParameterCommand {
    constructor(input) {
      this.input = input;
    }
  },
  PutParameterCommand: class PutParameterCommand {
    constructor(input) {
      this.input = input;
    }
  },
}));

const mockCloudWatchSend = vi.fn();
vi.mock("@aws-sdk/client-cloudwatch", () => ({
  CloudWatchClient: class {
    send(...args) {
      return mockCloudWatchSend(...args);
    }
  },
  DescribeAlarmsCommand: class DescribeAlarmsCommand {
    constructor(input) {
      this.input = input;
    }
  },
  DisableAlarmActionsCommand: class DisableAlarmActionsCommand {
    constructor(input) {
      this.input = input;
    }
  },
}));

import {
  SILENCE_TTL_HOURS,
  SILENCE_MAX_HOURS,
  silenceParameterName,
  silenceDeployment,
  isDeploymentSilenced,
} from "@app/lib/alarmSilence.js";

const ssmClient = { send: (...args) => mockSsmSend(...args) };
const cloudWatchClient = { send: (...args) => mockCloudWatchSend(...args) };

function parameterNotFound() {
  const error = new Error("Parameter not found");
  error.name = "ParameterNotFound";
  return error;
}

describe("silenceParameterName", () => {
  test("names the parameter under the env and deployment", () => {
    expect(silenceParameterName({ env: "prod", deployment: "a0f41c7" })).toBe(
      "/submit/prod/alarm-silence/a0f41c7",
    );
  });
});

describe("silenceDeployment", () => {
  beforeEach(() => {
    mockSsmSend.mockReset();
    mockCloudWatchSend.mockReset();
    mockCloudWatchSend.mockResolvedValue({ MetricAlarms: [], CompositeAlarms: [] });
  });

  test("a first silence writes both firstSilencedAt and expiresAt, 2 hours ahead", async () => {
    mockSsmSend.mockImplementation((command) => {
      if (command.constructor.name === "GetParameterCommand") return Promise.reject(parameterNotFound());
      return Promise.resolve({});
    });

    const now = new Date("2026-09-06T10:00:00.000Z");
    const result = await silenceDeployment({ ssmClient, cloudWatchClient, env: "ci", deployment: "claudeboa", now });

    expect(result.silenced).toBe(true);
    expect(result.expiresAt).toBe("2026-09-06T12:00:00.000Z");

    const putCall = mockSsmSend.mock.calls.find(([cmd]) => cmd.constructor.name === "PutParameterCommand");
    expect(putCall[0].input.Name).toBe("/submit/ci/alarm-silence/claudeboa");
    const written = JSON.parse(putCall[0].input.Value);
    expect(written.firstSilencedAt).toBe(now.toISOString());
    expect(written.expiresAt).toBe("2026-09-06T12:00:00.000Z");
  });

  test("a repeat silence keeps firstSilencedAt and extends expiresAt", async () => {
    mockSsmSend.mockImplementation((command) => {
      if (command.constructor.name === "GetParameterCommand") {
        return Promise.resolve({
          Parameter: {
            Value: JSON.stringify({
              firstSilencedAt: "2026-09-06T10:00:00.000Z",
              expiresAt: "2026-09-06T12:00:00.000Z",
            }),
          },
        });
      }
      return Promise.resolve({});
    });

    const now = new Date("2026-09-06T13:00:00.000Z");
    const result = await silenceDeployment({ ssmClient, cloudWatchClient, env: "ci", deployment: "claudeboa", now });

    expect(result.silenced).toBe(true);
    expect(result.expiresAt).toBe("2026-09-06T15:00:00.000Z");

    const putCall = mockSsmSend.mock.calls.find(([cmd]) => cmd.constructor.name === "PutParameterCommand");
    const written = JSON.parse(putCall[0].input.Value);
    expect(written.firstSilencedAt).toBe("2026-09-06T10:00:00.000Z");
  });

  test("a repeat past the 12 hour cap returns max-window-reached and writes nothing", async () => {
    mockSsmSend.mockImplementation((command) => {
      if (command.constructor.name === "GetParameterCommand") {
        return Promise.resolve({
          Parameter: {
            Value: JSON.stringify({
              firstSilencedAt: "2026-09-06T00:00:00.000Z",
              expiresAt: "2026-09-06T02:00:00.000Z",
            }),
          },
        });
      }
      return Promise.resolve({});
    });

    const now = new Date("2026-09-06T12:00:00.000Z");
    const result = await silenceDeployment({ ssmClient, cloudWatchClient, env: "ci", deployment: "claudeboa", now });

    expect(result).toEqual({ silenced: false, reason: "max-window-reached" });
    expect(mockSsmSend.mock.calls.some(([cmd]) => cmd.constructor.name === "PutParameterCommand")).toBe(false);
    expect(mockCloudWatchSend).not.toHaveBeenCalled();
  });

  test("caps expiresAt at firstSilencedAt + 12 hours when that is sooner than now + 2 hours", async () => {
    mockSsmSend.mockImplementation((command) => {
      if (command.constructor.name === "GetParameterCommand") {
        return Promise.resolve({
          Parameter: {
            Value: JSON.stringify({
              firstSilencedAt: "2026-09-06T00:00:00.000Z",
              expiresAt: "2026-09-06T02:00:00.000Z",
            }),
          },
        });
      }
      return Promise.resolve({});
    });

    const now = new Date("2026-09-06T10:30:00.000Z");
    const result = await silenceDeployment({ ssmClient, cloudWatchClient, env: "ci", deployment: "claudeboa", now });

    expect(result.silenced).toBe(true);
    expect(result.expiresAt).toBe("2026-09-06T12:00:00.000Z");
  });

  test("disables actions on every alarm and composite alarm found under the deployment and check- prefixes", async () => {
    mockSsmSend.mockImplementation((command) => {
      if (command.constructor.name === "GetParameterCommand") return Promise.reject(parameterNotFound());
      return Promise.resolve({});
    });
    mockCloudWatchSend.mockImplementation((command) => {
      if (command.constructor.name === "DescribeAlarmsCommand") {
        if (command.input.AlarmNamePrefix === "claudeboa-") {
          return Promise.resolve({ MetricAlarms: [{ AlarmName: "claudeboa-app-api-5xx" }], CompositeAlarms: [] });
        }
        if (command.input.AlarmNamePrefix === "check-claudeboa-") {
          return Promise.resolve({
            MetricAlarms: [{ AlarmName: "check-claudeboa-app-hmrc-vat-return-post-errors" }],
            CompositeAlarms: [{ AlarmName: "claudeboa-app-hmrc-stack-health" }],
          });
        }
        return Promise.resolve({ MetricAlarms: [], CompositeAlarms: [] });
      }
      return Promise.resolve({});
    });

    await silenceDeployment({
      ssmClient,
      cloudWatchClient,
      env: "ci",
      deployment: "claudeboa",
      now: new Date("2026-09-06T10:00:00.000Z"),
    });

    const disableCalls = mockCloudWatchSend.mock.calls
      .map(([cmd]) => cmd)
      .filter((cmd) => cmd.constructor.name === "DisableAlarmActionsCommand");
    const disabledNames = disableCalls.flatMap((cmd) => cmd.input.AlarmNames);
    expect(disabledNames.sort()).toEqual(
      ["check-claudeboa-app-hmrc-vat-return-post-errors", "claudeboa-app-api-5xx", "claudeboa-app-hmrc-stack-health"].sort(),
    );
  });

  test("never throws: it resolves with silenced false when SSM rejects", async () => {
    mockSsmSend.mockRejectedValue(new Error("SSM is unavailable"));

    const result = await silenceDeployment({
      ssmClient,
      cloudWatchClient,
      env: "ci",
      deployment: "claudeboa",
      now: new Date("2026-09-06T10:00:00.000Z"),
    });

    expect(result.silenced).toBe(false);
  });
});

describe("isDeploymentSilenced", () => {
  beforeEach(() => {
    mockSsmSend.mockReset();
  });

  test("returns false for a null deployment and makes no SSM call", async () => {
    const silenced = await isDeploymentSilenced({ ssmClient, env: "ci", deployment: null, now: new Date() });
    expect(silenced).toBe(false);
    expect(mockSsmSend).not.toHaveBeenCalled();
  });

  test("returns false when the parameter does not exist", async () => {
    mockSsmSend.mockRejectedValue(parameterNotFound());
    const silenced = await isDeploymentSilenced({
      ssmClient,
      env: "ci",
      deployment: "claudeboa",
      now: new Date("2026-09-06T10:00:00.000Z"),
    });
    expect(silenced).toBe(false);
  });

  test("returns false when the marker has expired", async () => {
    mockSsmSend.mockResolvedValue({
      Parameter: { Value: JSON.stringify({ firstSilencedAt: "2026-09-06T08:00:00.000Z", expiresAt: "2026-09-06T09:00:00.000Z" }) },
    });
    const silenced = await isDeploymentSilenced({
      ssmClient,
      env: "ci",
      deployment: "claudeboa",
      now: new Date("2026-09-06T10:00:00.000Z"),
    });
    expect(silenced).toBe(false);
  });

  test("returns false when the parameter value will not parse", async () => {
    mockSsmSend.mockResolvedValue({ Parameter: { Value: "not json" } });
    const silenced = await isDeploymentSilenced({
      ssmClient,
      env: "ci",
      deployment: "claudeboa",
      now: new Date("2026-09-06T10:00:00.000Z"),
    });
    expect(silenced).toBe(false);
  });

  test("returns true for a live marker", async () => {
    mockSsmSend.mockResolvedValue({
      Parameter: { Value: JSON.stringify({ firstSilencedAt: "2026-09-06T09:00:00.000Z", expiresAt: "2026-09-06T11:00:00.000Z" }) },
    });
    const silenced = await isDeploymentSilenced({
      ssmClient,
      env: "ci",
      deployment: "claudeboa",
      now: new Date("2026-09-06T10:00:00.000Z"),
    });
    expect(silenced).toBe(true);
  });

  test("resolves false rather than throwing when SSM rejects with an unrelated error", async () => {
    mockSsmSend.mockRejectedValue(new Error("throttled"));
    const silenced = await isDeploymentSilenced({
      ssmClient,
      env: "ci",
      deployment: "claudeboa",
      now: new Date("2026-09-06T10:00:00.000Z"),
    });
    expect(silenced).toBe(false);
  });
});

test("SILENCE_TTL_HOURS and SILENCE_MAX_HOURS carry the documented values", () => {
  expect(SILENCE_TTL_HOURS).toBe(2);
  expect(SILENCE_MAX_HOURS).toBe(12);
});
