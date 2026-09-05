---
name: vat-submission-failure-alarm-user-lookup
description: From a prod-env-hmrc-submission-failure alarm (or its [ALARM] issue), find the customer behind the failed VAT submission, what HMRC answered, and whether they wrote to support, without scanning a customer table or posting personal data anywhere public. Invoke when the operator asks who a submission-failure alarm was, what we know about that customer, or whether they need a reply.
---

# vat-submission-failure-alarm-user-lookup

Everything here is read-only AWS through the `submit-prod` SSO profile
(`aws sso login --sso-session diyaccounting` first). The customer tables are keyed by
`hashedSub`, and a `Scan` on any of them is exactly what the
`prod-env-dynamodb-customer-table-scan` detector counts, so this skill only ever runs `Query`
with a known key. Every store below outlives the deployment that wrote it; the per-deployment
Lambda log groups do not, so do not go looking for them.

Personal data (email, name, VRN, IP, device id) goes to the operator in chat and nowhere else.
Alarm issues are public: on the issue write only the request ids and the HMRC message.

## 1. Pin the window from the alarm

The issue body (`[ALARM] prod-env-hmrc-submission-failure`) carries the datapoint time, e.g.
`1 datapoint [1.0 (03/09/26 21:30:00)]`. The metric is `Submit/Business VatSubmissionFailure`,
emitted by `app/functions/hmrc/hmrcVatReturnPost.js`, and its period is long, so take the
datapoint minute as the start and look at the following 30 minutes.

## 2. Activity events: who, what, and the request ids

The activity bus lands in the analytics lake as Parquet, queryable with Athena (workgroup
`prod-env-analytics`, database `prod_env_analytics`, table `activity_events`; partitions
`year`, `month`, `day` are integers; `event_ts` is a timestamp):

```
SELECT CAST(event_ts AS varchar) AS event_ts, event, actor, flow, outcome, failure,
       hashed_sub, bundle_id, hmrc_status, request_id, summary
FROM prod_env_analytics.activity_events
WHERE year=2026 AND month=9 AND day=3
  AND event_ts BETWEEN TIMESTAMP '2026-09-03 21:15:00' AND TIMESTAMP '2026-09-03 21:55:00'
ORDER BY event_ts
```

Start it with `aws athena start-query-execution --work-group prod-env-analytics
--query-string "..."`, poll `get-query-execution` until it leaves RUNNING, then
`get-query-results`. Rows with `actor = test-user` are the probe suites; ignore them. The
customer's rows give the `hashed_sub`, the login summary (`Login via Google: n***@gmail.com`),
the bundle granted, and one `vat-return-failed` row per attempt with `failure`
(`obligation-lookup-failed` when the return was blocked before submission), `hmrc_status` and
the `request_id`. A second query on `hashed_sub` alone, over the month, shows whether they came
back.

## 3. The HMRC exchanges: what HMRC said and the fraud headers

Query, never scan, `prod-env-hmrc-api-requests` by the hashed sub:

```
aws --profile submit-prod dynamodb query --table-name prod-env-hmrc-api-requests \
  --key-condition-expression "hashedSub = :h" \
  --expression-attribute-values '{":h":{"S":"<hashed_sub>"}}' --output json
```

Each item has top-level `url` and `method` (the VRN is in the obligations path), `createdAt`,
`requestId`, and a masked `httpResponse.body` (HMRC's `message` survives masking, the `code`
does not). The `httpRequest.headers` hold the fraud-prevention headers, which is where the
customer's device lives: `Gov-Client-Public-IP`, `Gov-Client-Timezone`,
`Gov-Client-Browser-JS-User-Agent`, `Gov-Client-Screens`, `Gov-Client-Device-ID`, and
`Gov-Client-User-IDs` as `cognito=<sub>`. That last one is the raw Cognito sub.

## 4. The account: Cognito by sub

```
aws --profile submit-prod cognito-idp list-users --user-pool-id eu-west-2_Geo7Efbet \
  --filter 'sub = "<sub>"' \
  --query "Users[].[Username,UserStatus,UserCreateDate,Attributes[?Name=='email'].Value | [0],Attributes[?Name=='identities'].Value | [0]]" \
  --output text
```

The pool id comes from `cognito-idp list-user-pools` if it has changed. The username shows the
identity provider (`Google_<id>` for a Google sign-in), and `UserCreateDate` says whether this
was a first visit.

## 5. Entitlement: bundles by hashed sub

```
aws --profile submit-prod dynamodb query --table-name prod-env-bundles \
  --key-condition-expression "hashedSub = :h" \
  --expression-attribute-values '{":h":{"S":"<hashed_sub>"}}'
```

`day-guest` with `tokensConsumed: 0` means a free trial that never got as far as a submission.
`prod-env-receipts` uses the same key and says whether any return ever went through.
`prod-env-passes` and `prod-env-subscriptions` are keyed by `pk`, not `hashedSub`; leave them
unless a subscription id appears in the activity events.

## 6. The browser session and network

Two access logs cover the window. The API Gateway access log
(`/aws/apigw/prod-env/access`, 3-day retention) lists route, status and time only. CloudFront's
log is in the lake, table `cloudfront_requests`, and carries the client IP, user agent, referer
and query string. The `distribution_id` partition must be a static equality (the submit apex is
`E27PSIJWZTT6Z`), and `time` is a time type:

```
SELECT CAST(time AS varchar) AS time, c_ip, cs_method, cs_uri_stem, cs_uri_query, sc_status,
       cs_user_agent, cs_referer
FROM prod_env_analytics.cloudfront_requests
WHERE distribution_id='E27PSIJWZTT6Z' AND year=2026 AND month=9 AND day=3
  AND CAST(time AS varchar) BETWEEN '21:15:00' AND '21:55:00'
ORDER BY time
```

Group by `c_ip`; the customer's IPs are the ones whose `/api/` calls line up with the activity
events, and `whois <ip>` names the network (a mobile carrier says they were on a phone).

## 7. Did they write in?

Search both mailboxes for the email address before deciding on a reply:
`corpus-loom` `search` with `sources: ["mail-support","mail-antony"]`, `mode: lexical`, the
address as the query. No hit means no enquiry yet.

## 8. Reading a 403 "The client and/or agent is not authorised"

That message is HMRC's, returned on the obligations lookup before any return is sent. It means
the Government Gateway account the customer signed in with is not enrolled for MTD VAT for that
VRN, or has not authorised DIY Accounting Submit, or the VRN they typed is not the one on that
account. Nothing in our code produces it. The reply to the customer is the enrolment and
authority steps; the note on the alarm issue is the request ids and that message, nothing else.
