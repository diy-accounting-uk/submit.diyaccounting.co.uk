# Silence a deployment's alarms before tearing it down

## The requirement

> the environments auto-destruct but I don't want a continual cycle of: release -> false positive
> -> alarm -> issue -> triage -> closed issue when instead we could find a better way not to have
> the alarm by detecting the scenario (e.g. we disable alarms as the first action of both
> self-destruct and the destroy job for a given deployment).

## Findings

43 issues carry the `alarm` label, all of them between 1 and 6 September 2026.

| Scenario | Count | Families |
|---|---|---|
| (a) fired while the deployment was being torn down | 3 | `ci-<dep>-app-self-destruct-stack-health` (#122, #127, #131) |
| (b) fired at creation or in the set's first minutes | 4 | `prod-<dep>-app-api-failed` (#133), `prod-<dep>-app-github-synthetic-failed` (#103, #109, #123) |
| (c) standing set, real signal | 21 | 11 env detection alarms, 3 `api-5xx`, 5 `cognito-token-post-log-errors`, `hmrc-stack-health`, #138 |
| (d) other | 15 | 14 from the per-deployment Telegram forwarder piling up across standing sets, 1 manual proof flip (#99) |

Two of these four are already fixed. `fe4eff98` (5 Sept) stopped ci alarms reaching the
GitHub-issue Lambda and set the canary alarms to `NOT_BREACHING`; with the `github-synthetic` to
`<env>-env-github-probe` rename before it, that clears (b). `6ab57b30` gives each environment one
Telegram forwarder instead of one per deployment, which clears (d). So the live problem is (a),
three issues, all from the ci self-destruct Lambda, plus the prod retire path, which has never
been silenced at all.

**#138 was real signal.** The composite `prod-0967fab-app-account-stack-health` was raised by its
child `check-prod-0967fab-app-bundle-capacity-reconcile-errors`. The new set's hourly reconcile
failed all three attempts (one invocation plus two async retries) at 07:11Z, failed all three
again at 08:11Z, failed one of three at 09:11Z, then ran clean at 10:11Z and 11:11Z. No other
prod set's reconcile errored in that window, and no reconcile code changed between `0967fab` and
the current `cfb43ee`. The set was deleted at 12:13Z, taking the log group with it, so the
exception text is gone. The fire stopped three hours before the teardown, so silencing alarms at
teardown would not have prevented #138.

**One stuck ci set produces alarm traffic for days.** `ci-claudeboa` raised
`self-destruct-stack-health` on 4 Sept at 23:14 and again on 5 Sept at 19:21, with an
`ops-stack-health` in between. A self-destruct that hits an error returns a 500 and leaves the
set standing, including its OpsStack routing rule. The schedule retries every few hours, logs
the same errors, and reopens or comments on the issue each time.

**Disabling alarm actions does not stop the issues.** Every check and composite alarm has
`AlarmActions: []`. Routing runs on the EventBridge rule `<deployment>-alarm-state-change` in
each deployment's OpsStack, which matches `CloudWatch Alarm State Change` events by alarm-name
prefix and targets the Telegram forwarder and the GitHub-issue Lambda. CloudWatch emits that
event on every state change whatever `ActionsEnabled` says, and a composite still transitions
when a child's actions are off. `DisableAlarmActions` only earns its place for the two canary
alarms that do carry an SNS action. The suppression that stops issues has to live where the
events are consumed.

## Design

One helper writes one marker. Three teardown paths call it and two routers read it.

**The marker.** An SSM parameter `/submit/<env>/alarm-silence/<deployment>`, holding JSON:
`{"firstSilencedAt": "<iso>", "expiresAt": "<iso>"}`. A teardown writes it before it deletes
anything. Both routers read it per alarm event and drop the event when the deployment is
silenced.

**The TTL and the failed-destroy case.** `expiresAt` is 2 hours ahead, which covers a full
destroy plus a retry round. A repeat teardown of the same deployment extends `expiresAt` but
keeps the original `firstSilencedAt`, and the helper refuses to extend past
`firstSilencedAt + 12 hours`. So a destroy that fails and leaves the set standing goes quiet for
at most 12 hours, then re-arms itself with no operator action. That is the answer for
`ci-claudeboa`: one quiet retry cycle, then the alarms come back and say the set is stuck.

**Scope.** Only deployment-scoped alarms carry a slug, and only they can be silenced. Names parse
as `(ci|prod)-<slug>-app-...` and `check-(ci|prod)-<slug>-app-...`, so a composite and its
children resolve to the same slug and one marker covers both. Environment alarms
(`<env>-env-...`) have no slug and are never silenced, so the 11 detection alarms in class (c)
keep working through every teardown.

**Ordering.** The marker is written before the first `DeleteStack` and each router reads it when
an event arrives, so nothing depends on the order the stacks go. SSM `GetParameter` is
eventually consistent, so an alarm firing a second or two after the write can still get through.
Teardown takes minutes, so the window is narrow.

**IAM.** The writer needs `ssm:PutParameter` and `ssm:GetParameter` on
`arn:aws:ssm:<region>:<account>:parameter/submit/<env>/alarm-silence/*`. The GitHub deploy roles
already write `/submit/<env>/last-known-good-deployment`, so the workflow path needs no new
grant. The self-destruct role has no SSM statement today and gains one for that prefix. Readers
need `ssm:GetParameter` on the same prefix. The `DisableAlarmActions` pass needs
`cloudwatch:DisableAlarmActions` on `arn:aws:cloudwatch:<region>:<account>:alarm:<deployment>-*`
and `...:alarm:check-<deployment>-*`, plus `cloudwatch:DescribeAlarms` on `*`, because
`DescribeAlarms` is a list operation and CloudWatch grants it no resource-level scoping.

## Build brief

### 1. `app/lib/alarmName.js`

Add `export function alarmDeploymentSlug(alarmName)`. Strip a leading `check-`, then match
`^(ci|prod)-([^-]+)-app-`. Return the slug, or `null` for a name with no slug. Keep the existing
exports untouched.

### 2. `app/lib/alarmSilence.js` (new)

```js
export const SILENCE_TTL_HOURS = 2;
export const SILENCE_MAX_HOURS = 12;
export function silenceParameterName({ env, deployment })          // /submit/<env>/alarm-silence/<deployment>
export async function silenceDeployment({ ssmClient, cloudWatchClient, env, deployment, now })
export async function isDeploymentSilenced({ ssmClient, env, deployment, now })
```

`silenceDeployment` reads any existing parameter, keeps `firstSilencedAt`, computes
`expiresAt = min(now + 2h, firstSilencedAt + 12h)`, and writes it back with `Overwrite: true`. It
returns `{ silenced: true, expiresAt }`, or `{ silenced: false, reason: "max-window-reached" }`
when the cap is already past. It then calls `DescribeAlarms` for the prefixes `<deployment>-` and
`check-<deployment>-` and `DisableAlarmActions` on every name it finds, in batches of 100. It
never throws: it catches, logs through `createLogger`, and returns, because teardown must go on
when silencing fails.

`isDeploymentSilenced` returns `false` for a null deployment, `false` on `ParameterNotFound`,
`false` when `expiresAt` is in the past or the value will not parse, and `true` otherwise.

### 3. Call sites

- `app/functions/infra/selfDestruct.js`: in `ingestHandler`, before `emptyBucket`, call
  `silenceDeployment` with `process.env.DEPLOYMENT_NAME` and the env parsed from that name. Log
  the result. Do not fail the handler on a silence error.
- `app/functions/ops/alarmToGithubIssue.js`: in `handler`, after the `alarm.state !== "ALARM"`
  guard, resolve the slug with `alarmDeploymentSlug(alarm.alarmName)` and return early when
  `isDeploymentSilenced` is true. Log at info with the alarm name and the slug.
- `app/functions/ops/activityTelegramForwarder.js`: the same guard in the branch that handles
  `CloudWatch Alarm State Change` events, before it synthesizes the activity event. Other event
  types are untouched.

### 4. `scripts/silence-deployment-alarms.mjs` (new)

CLI wrapper: `node scripts/silence-deployment-alarms.mjs --env <ci|prod> --deployment <name>`.
Builds the SDK clients, calls `silenceDeployment`, prints the result as JSON, exits 0 even when
silencing fails.

### 5. Workflows

Add a step `Silence the deployment's alarms` to the `destroy` job of both
`.github/workflows/destroy-ci.yml` and `.github/workflows/destroy-prod.yml`, after
`Node dependencies` and before `Build CDK`. In the prod workflow that also puts it after the
`Refuse to destroy the live or last known good deployment` guard. `deploy.yml` retires the
previous prod set through `destroy-previous`, which calls that same reusable workflow, so the
retire path is covered by this one step. Both steps run
`node scripts/silence-deployment-alarms.mjs --env <env> --deployment "${{ needs.names.outputs.deployment-name }}"`.

### 6. CDK

- `SelfDestructStack.java`: add a `PolicyStatement` for `ssm:PutParameter` and `ssm:GetParameter`
  scoped to `arn:aws:ssm:<region>:<account>:parameter/submit/<env>/alarm-silence/*`, and one for
  `cloudwatch:DisableAlarmActions` on the two alarm-name ARN patterns. `cloudwatch:*` on `*` is
  already in that role's inline policy, so `DescribeAlarms` needs nothing new here.
- `ActivityStack.java`: an `ssm:GetParameter` grant on the Telegram forwarder's role, same
  resource.
- `OpsStack.java`: the same `GetParameter` grant on `alarmToGithubIssueLambda`, next to the
  existing `ReadLastKnownGoodDeployment` statement.

### 7. Tests

- `app/unit-tests/lib/alarmName.test.js`: `alarmDeploymentSlug` for a composite, a `check-`
  child, an env alarm (null) and a malformed name (null).
- `app/unit-tests/lib/alarmSilence.test.js` (new): a first silence writes both timestamps; a
  repeat keeps `firstSilencedAt` and extends `expiresAt`; a repeat past the cap returns
  `max-window-reached` and writes nothing; `isDeploymentSilenced` handles missing, expired,
  unparseable and live markers; an SSM failure resolves rather than throws.
- `app/unit-tests/functions/alarmToGithubIssue.test.js`: a silenced deployment's ALARM event
  opens no issue and makes no GitHub call; an env alarm is never silenced.
- `app/unit-tests/functions/activityTelegramForwarder.test.js`: a silenced deployment's alarm
  event sends no Telegram message; other event types still send.
- `app/unit-tests/functions/selfDestruct.test.js`: the handler calls the silencer before the
  first `DeleteStack`, and still deletes stacks when the silencer rejects.
- `infra/test/java/.../stacks/SelfDestructStackTest.java` and `OpsStackTest.java`: each asserts
  the new SSM statement carries the `/submit/<env>/alarm-silence/*` resource and no wildcard.
  ActivityStack has no test class, so assert its grant in
  `infra/test/java/.../SubmitEnvironmentCdkResourceTest.java`.

### 8. Verification on a ci deploy

Deploy the branch to ci, then let the set self-destruct on its schedule. Check that
`aws --profile submit-ci ssm get-parameter --name /submit/ci/alarm-silence/<deployment>` returns
both timestamps, that no Telegram message names that deployment while the destroy runs, and that
`ci-env-*` alarm traffic still arrives. Then run `npm test` and `./mvnw clean verify`.
