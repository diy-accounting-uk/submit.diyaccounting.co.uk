// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/ops/alarmSmsForward.js
//
// SNS-subscribed handler on OpsStack's alertTopic (prod only): texts the operator's mobile
// through AWS End User Messaging SMS whenever a loss-of-service canary alarm (health check or
// API check) changes state. CloudWatch publishes one notification per record to the topic on
// both the ALARM and OK transitions (see OpsStack.java's healthCheckAlarm/apiCheckAlarm, each
// wired with both addAlarmAction and addOkAction), so this Lambda sees exactly those two
// transitions and no others.
//
// `aws sns publish --phone-number` accepted messages that never arrived at the operator's
// handset; only pinpoint-sms-voice-v2's SendTextMessage, called with the registered sender ID,
// delivered (see .claude/skills/text-antony-submit-prod/SKILL.md), so this handler calls that
// API directly rather than publishing to a phone number.

import { PinpointSMSVoiceV2Client, SendTextMessageCommand } from "@aws-sdk/client-pinpoint-sms-voice-v2";
import { SSMClient, GetParameterCommand } from "@aws-sdk/client-ssm";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/ops/alarmSmsForward.js" });

const region = process.env.AWS_REGION || "eu-west-2";
const ssmClient = new SSMClient({ region });
const smsClient = new PinpointSMSVoiceV2Client({ region });

// Read once per container: the operator's number does not change within a container's
// lifetime, and re-reading it on every record would cost an SSM call per alarm transition for
// no benefit.
let cachedOperatorNumber = null;

async function resolveOperatorNumber() {
  if (cachedOperatorNumber) return cachedOperatorNumber;

  const parameterName = process.env.OPERATOR_SMS_NUMBER_PARAMETER_NAME;
  if (!parameterName) throw new Error("OPERATOR_SMS_NUMBER_PARAMETER_NAME environment variable is required");

  const result = await ssmClient.send(new GetParameterCommand({ Name: parameterName, WithDecryption: true }));
  const value = result.Parameter?.Value;
  if (!value) throw new Error(`Parameter ${parameterName} exists but has no value`);

  cachedOperatorNumber = value;
  return cachedOperatorNumber;
}

/**
 * Pull the fields this handler needs out of one SNS record carrying a CloudWatch alarm
 * notification (the standard CloudWatch-to-SNS shape: AlarmName, NewStateValue,
 * StateChangeTime at the top level of the JSON-encoded Message, not the EventBridge "detail"
 * shape other ops Lambdas in this directory parse). Returns null for a record with no message,
 * so a caller can filter with a plain truthiness check; a record whose message is present but
 * not valid JSON is a genuine platform anomaly and is left to throw.
 *
 * @param {{Sns?: {Message?: string}}} record
 * @returns {{alarmName: string, newState: string, stateChangeTime: string}|null}
 */
export function parseAlarmSnsRecord(record) {
  const sns = record?.Sns;
  if (!sns?.Message) return null;

  const notification = JSON.parse(sns.Message);
  return {
    alarmName: notification.AlarmName,
    newState: notification.NewStateValue,
    stateChangeTime: notification.StateChangeTime,
  };
}

/**
 * "ALARM" reads as-is; "OK" reads as a recovery so the operator does not have to infer that OK
 * means the outage just ended. Any other value (there should be none: the two alarms this topic
 * carries only ever fire their ALARM and OK actions) is passed through unchanged rather than
 * hidden behind a fallback label.
 *
 * @param {string} newState
 * @returns {string}
 */
export function formatAlarmStateWord(newState) {
  if (newState === "ALARM") return "ALARM";
  if (newState === "OK") return "OK (recovered)";
  return newState;
}

/**
 * StateChangeTime is CloudWatch's own ISO 8601 timestamp, always UTC. Rendered as "HH:MM UTC"
 * rather than the full timestamp, to keep the text short.
 *
 * @param {string} stateChangeTime
 * @returns {string}
 */
export function formatStateChangeTime(stateChangeTime) {
  const date = new Date(stateChangeTime);
  if (Number.isNaN(date.getTime())) throw new Error(`StateChangeTime is not a valid date: ${stateChangeTime}`);
  return `${date.toISOString().slice(11, 16)} UTC`;
}

/**
 * One line, GSM-7 only by construction (fixed ASCII wording around an alarm name that is itself
 * always ASCII: see SubmitSharedNames/OpsStack's resourceNamePrefix), well under the 160-character
 * single-part SMS limit for any realistic alarm name.
 *
 * @param {{alarmName: string, newState: string, stateChangeTime: string, environmentName: string}} alarm
 * @returns {string}
 */
export function buildMessageBody({ alarmName, newState, stateChangeTime, environmentName }) {
  return `DIY Submit ${environmentName}: ${alarmName} ${formatAlarmStateWord(newState)} at ${formatStateChangeTime(stateChangeTime)}`;
}

/**
 * SNS-subscribed handler. A send failure (from the SDK call itself) is left to throw, so it
 * shows up on the Lambda's own Errors metric rather than being swallowed here.
 */
export async function handler(event) {
  const environmentName = process.env.ENVIRONMENT_NAME;
  if (!environmentName) throw new Error("ENVIRONMENT_NAME environment variable is required");

  const originationIdentity = process.env.SMS_ORIGINATION_IDENTITY;
  if (!originationIdentity) throw new Error("SMS_ORIGINATION_IDENTITY environment variable is required");

  const alarms = (event.Records ?? []).map(parseAlarmSnsRecord).filter((alarm) => alarm !== null);

  for (const alarm of alarms) {
    const messageBody = buildMessageBody({ ...alarm, environmentName });
    const destinationPhoneNumber = await resolveOperatorNumber();

    const result = await smsClient.send(
      new SendTextMessageCommand({
        DestinationPhoneNumber: destinationPhoneNumber,
        OriginationIdentity: originationIdentity,
        MessageType: "TRANSACTIONAL",
        MessageBody: messageBody,
      }),
    );

    // Never log destinationPhoneNumber: the operator's number must never appear in logs.
    logger.info({
      message: "Sent operator SMS for loss-of-service alarm state change",
      alarmName: alarm.alarmName,
      newState: alarm.newState,
      messageId: result.MessageId,
    });
  }

  return { sent: alarms.length };
}
