---
name: text-antony-submit-prod
description: Send the operator a text message (SMS) from the submit-prod AWS account through Amazon SNS. Invoke when the operator says "text me", "send me a text", "SMS me", or asks to be told by text when something finishes or breaks.
---

<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# text-antony-submit-prod

Sends one SMS to the operator's mobile from `submit-prod` (972912397388), eu-west-2, through
AWS End User Messaging SMS from the sender ID `DIYACCT`. The number lives in the SecureString parameter `/submit/prod/operator-sms-number`,
never in this repository, which is public.

Invoking this skill is the operator's go for the send. A send the session decides on by itself
(a finished run, a red build) needs the operator to have asked for texts in this session first.

## The message

- One line, 160 characters or fewer, so it arrives as one part. Lead with what the operator would
  act on: `prod deploy failed: 2 probe suites red` beats `update`.
- No customer data, no secrets, no URLs with tokens. A run id or PR number is fine.
- Plain ASCII: a character outside GSM-7 (an emoji, a curly quote, `£`) switches the message to
  UCS-2 and halves the length to 70 characters.

## Send

```bash
export AWS_PROFILE=submit-prod AWS_REGION=eu-west-2
number=$(aws ssm get-parameter --name /submit/prod/operator-sms-number --with-decryption \
  --query Parameter.Value --output text)
aws pinpoint-sms-voice-v2 send-text-message --destination-phone-number "$number" \
  --origination-identity DIYACCT --message-type TRANSACTIONAL \
  --message-body "<message>" --query MessageId --output text
```

A `MessageId` back means the service accepted it, not that the phone received it; the operator's
reply confirms delivery. `aws sns publish --phone-number` is not the path: on 2026-09-26 it
returned message ids for two texts that never arrived, while this call arrived first time.

## When it fails

| Error | Cause | Fix |
|---|---|---|
| `ParameterNotFound` | The number was never stored | The operator runs the setup below |
| `ValidationException` or `AccessDeniedException` on send | The account is in the SMS sandbox and the number is not verified, or the number opted out | Setup step 3; `aws pinpoint-sms-voice-v2 describe-opted-out-numbers --opt-out-list-name Default` |
| `ServiceQuotaExceededException` / nothing arrives | The 1 USD monthly text spend limit reached | `aws pinpoint-sms-voice-v2 describe-spend-limits`; raising it is a support request while the account tier is `SANDBOX` |

## Setup (once, the operator's AWS writes; done 2026-09-26)

1. Store the number: `aws ssm put-parameter --name /submit/prod/operator-sms-number --type SecureString --value '+44…'`.
2. Own a sender identity. SNS cannot text anything, verification codes included, until the account
   holds one in AWS End User Messaging SMS ("No origination entities available to send"). A GB
   alphanumeric sender ID needs no registration:
   `aws pinpoint-sms-voice-v2 request-sender-id --sender-id DIYAcct --iso-country-code GB --message-types TRANSACTIONAL`
   (stored upper-case as `DIYACCT`).
3. While `aws sns get-sms-sandbox-account-status` says `IsInSandbox: true`, verify the number
   through End User Messaging, naming the sender:
   `aws pinpoint-sms-voice-v2 create-verified-destination-number --destination-phone-number '+44…'`, then
   `aws pinpoint-sms-voice-v2 send-destination-number-verification-code --verified-destination-number-id <vdn-id> --verification-channel TEXT --origination-identity DIYACCT`, then
   `aws pinpoint-sms-voice-v2 verify-destination-number --verified-destination-number-id <vdn-id> --verification-code <code>`.
4. Default the account to transactional texts:
   `aws sns set-sms-attributes --attributes DefaultSMSType=Transactional,DefaultSenderID=DIYAcct`.
