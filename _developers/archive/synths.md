<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

Pattern 3 and Pattern 1 can both be automated by an LLM agent with repo access. Below is a change plan that such an agent (Junie) can execute against branch rollrest of antonycc/submit.diyaccounting.co.uk. The plan assumes CDK in ./infra (Java), Playwright tests in ./behaviour-tests, and GitHub Actions deploy pipeline in .github/workflows/deploy.yml.

Section A covers Pattern 3 (Playwright runs in CI and feeds CloudWatch metrics and alarms).
Section B covers Pattern 1 skeleton (first real CloudWatch Synthetics canary that just loads the home page).

A. PATTERN 3: KEEP PLAYWRIGHT. PUBLISH METRICS TO CLOUDWATCH. ALARM IN CDK.

Goal
Run existing Playwright behaviour tests after deploy. Convert the overall pass/fail into a CloudWatch custom metric. Define a CloudWatch Alarm in CDK on that metric. Alarm fires if recent runs fail.

High level flow

1. GitHub Action job runs behaviour-tests with Playwright after deploy.
2. If tests fail, job still continues (so we always report).
3. Job publishes 1 for success or 0 for failure to CloudWatch put-metric-data.
4. CDK stack defines a Metric on that namespace/dimension and an Alarm.

Step A1. Add a post-deploy job stage to .github/workflows/deploy.yml

Add a new job after infra deploy (after the stacks are deployed and DNS etc is live). Name it behaviour-tests-and-publish.

This job must:

* Have AWS creds for the target environment (ci vs prod). Use the same OIDC role / env vars already used for deploy in this workflow.
* Know the base URL the tests should hit (ci.submit.diyaccounting.co.uk etc).
* Install Node 22
* Install Playwright deps
* Run the behaviour-tests/*.behaviour.test.js tests
* Capture final status
* Publish CloudWatch metric SubmitBehaviour / BehaviourSuiteSuccess with dimensions env=<ci|prod> test=fullSuite

Example YAML to add to deploy.yml (pseudocode that Junie should adapt to match the repo’s existing deploy workflow conventions and environment wiring):

```yaml
  behaviour-tests-and-publish:
    name: run behaviour tests and publish cw metric
    needs:
      - deploy-infra       # adjust to depend on the job that finished CDK deploy
    runs-on: ubuntu-24.04
    permissions:
      id-token: write
      contents: read
      actions: read
    env:
      ENVIRONMENT_NAME: ${{ needs.names.outputs.environment-name }} # 'ci' or 'prod'
      BASE_URL: ${{ needs.names.outputs.environment-base-url }}     # Junie must expose this from existing job outputs (for example https://submit.diyaccounting.co.uk)
    steps:
      - name: checkout
        uses: actions/checkout@v4
        with:
          ref: ${{ github.ref }}

      - name: setup node
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: install deps
        run: |
          corepack enable
          pnpm install
          # or npm ci if repo uses npm. Junie must match the repo's actual JS package manager.

      - name: run behaviour tests
        id: run-tests
        continue-on-error: true
        env:
          PLAYWRIGHT_BASE_URL: ${{ env.BASE_URL }}
          # include any login creds or API keys needed by behaviour-tests.
          # these should come from GitHub Actions secrets or environment variables already set for ci/prod.
        run: |
          npx playwright test behaviour-tests --reporter=list

      - name: set status env var
        id: status
        run: |
          if [ "${{ steps.run-tests.outcome }}" = "success" ]; then
            echo "RESULT=1" >> $GITHUB_ENV
          else
            echo "RESULT=0" >> $GITHUB_ENV
          fi

      - name: configure aws creds for env
        # Junie must mirror the same aws-actions/configure-aws-credentials step
        # that deploy.yml already uses for CDK deploy for this environment.
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::<account>:role/<role>   # reuse role from deploy job
          aws-region: eu-west-2

      - name: publish cloudwatch metric
        run: |
          aws cloudwatch put-metric-data \
            --namespace "SubmitBehaviour" \
            --metric-name "BehaviourSuiteSuccess" \
            --dimensions env=${{ env.ENVIRONMENT_NAME }},test=fullSuite \
            --value $RESULT \
            --region eu-west-2
```

Actions for Junie in this step:

* Identify deploy job name(s) and outputs in deploy.yml.
* Add needs: so ordering is after infra has gone live and URLs resolve.
* Surface the environment URL to this job. If that URL is not already an output, Junie must update the earlier job that knows the domain (likely the stack synthesis or set-origins step) to echo something like:
  echo "environment-base-url=[https://ci-submit.diyaccounting.co.uk](https://ci-submit.diyaccounting.co.uk)" >> $GITHUB_OUTPUT
  and then expose it from that job's outputs so behaviour-tests-and-publish can consume it.

Step A2. Add a new CDK stack or extend an existing ops/monitoring stack in ./infra to define an Alarm on that metric

Goal
For each environment create:

* CloudWatch Metric looking at SubmitBehaviour / BehaviourSuiteSuccess for (env=<env>, test=fullSuite)
* Alarm that fires if Minimum < 1 over the last period (meaning last report was 0)

Junie tasks in ./infra:

1. Create a new stack class, for example co.uk.diyaccounting.submit.stacks.BehaviourMonitoringStack.
2. Wire it into the app so it synthesizes and deploys for each environment just like ApexStack / EdgeStack etc.
3. Produce outputs if needed.

Java CDK v2 sketch:

```java
package co.uk.diyaccounting.submit.stacks;

import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.constructs.Construct;
import software.amazon.awscdk.services.cloudwatch.Alarm;
import software.amazon.awscdk.services.cloudwatch.ComparisonOperator;
import software.amazon.awscdk.services.cloudwatch.Metric;
import software.amazon.awscdk.services.cloudwatch.Statistic;
import software.amazon.awscdk.services.cloudwatch.TreatMissingData;
import software.amazon.awscdk.services.sns.Topic;
import software.amazon.awscdk.services.cloudwatch.actions.SnsAction;

@Value.Immutable
public abstract class BehaviourMonitoringStackProps {
    public abstract Environment env();
    public abstract String environmentName(); // 'ci' or 'prod'
    // Add e.g. notificationEmail or reuse an existing SNS Topic ARN if one already exists
}

public class BehaviourMonitoringStack extends Stack {

    public BehaviourMonitoringStack(final Construct scope,
                                    final String id,
                                    final BehaviourMonitoringStackProps props) {
        super(scope, id, StackProps.builder()
                .env(props.env())
                .build());

        // Metric from Pattern 3 publisher
        Metric behaviourMetric = Metric.Builder.create()
            .namespace("SubmitBehaviour")
            .metricName("BehaviourSuiteSuccess")
            .dimensionsMap(Map.of(
                    "env", props.environmentName(),
                    "test", "fullSuite"))
            .statistic(Statistic.MINIMUM.toString())
            .period(Duration.minutes(10))
            .build();

        Topic alarmTopic = Topic.Builder.create(this, "BehaviourFailuresTopic")
            .topicName("submit-behaviour-failures-" + props.environmentName())
            .build();

        Alarm alarm = Alarm.Builder.create(this, "BehaviourSuiteAlarm")
            .alarmName("submit-behaviour-suite-failed-" + props.environmentName())
            .metric(behaviourMetric)
            .threshold(1)
            .evaluationPeriods(1)
            .comparisonOperator(ComparisonOperator.LESS_THAN_THRESHOLD)
            .treatMissingData(TreatMissingData.BREACHING)
            .alarmDescription("Behaviour suite failed in " + props.environmentName())
            .build();

        alarm.addAlarmAction(new SnsAction(alarmTopic));

        // Optional: output topic ARN so ops can subscribe email/SMS externally
    }
}
```

Junie must:

* Place this class under infra/main/java/.../stacks with package naming consistent with the rest of infra.
* Add this new stack into the CDK app entry point where other stacks are instantiated for each environment. Use the same Environment object (account / region eu-west-2).
* Export the SNS topic ARN via CfnOutput if existing tooling expects that.

Step A3. Ensure deploy.yml deploys the new BehaviourMonitoringStack for each environment

In the job that runs CDK deploy (currently deploying EdgeStack, ApexStack, etc) add BehaviourMonitoringStack to the list of stacks passed to cdk deploy. The stack name must match the logical ID used in the app (for example Submit-BehaviourMonitoring-ci). Junie must inspect infra/App class (whatever currently builds stacks per env) and follow the naming scheme.

Result of Pattern 3 after Junie completes:

* After every deploy we get:

    * Behaviour tests executed with real browser in GH Actions
    * A CloudWatch metric for last run success/fail
    * A CloudWatch alarm in AWS per environment that can notify via SNS
* No rewrite of tests
* Alarming lives in AWS as required

B. PATTERN 1 SKELETON: FIRST SYNTHETICS CANARY (HOMEPAGE PING)

Goal
Prove out CloudWatch Synthetics deployment via CDK. One canary. It only GETs the homepage and asserts 200. This is a template for future per-behaviour canaries.

Step B1. Add a new folder for canary source code

Create infra/synthetics/homepage-canary/index.js in the repo with the following minimal script. This script assumes AWS Synthetics Node.js + Puppeteer runtime. It loads the BASE_URL from env and fails if navigation throws.

```js
const synthetics = require('Synthetics');
const log = require('SyntheticsLogger');

const BASE_URL = process.env.BASE_URL;

exports.handler = async () => {
  const page = await synthetics.getPage();

  const url = BASE_URL || 'https://example.com';
  log.info(`Going to ${url}`);

  const response = await page.goto(url, { waitUntil: 'networkidle0' });

  const status = response && response.status ? response.status() : 0;
  if (status < 200 || status > 299) {
    throw new Error(`Non-2xx status: ${status}`);
  }

  // simple text assertion on page
  const titleText = await page.title();
  log.info(`Page title: ${titleText}`);
};
```

Step B2. Create a CDK construct/stack to deploy the canary

Add a new stack class CanaryStack to ./infra similar to:

```java
package co.uk.diyaccounting.submit.stacks;

import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.constructs.Construct;
import software.amazon.awscdk.services.synthetics.Canary;
import software.amazon.awscdk.services.synthetics.Code;
import software.amazon.awscdk.services.synthetics.Runtime;
import software.amazon.awscdk.services.synthetics.Schedule;

@Value.Immutable
public abstract class CanaryStackProps {
    public abstract Environment env();
    public abstract String environmentName(); // 'ci' or 'prod'
    public abstract String baseUrl();         // e.g. https://submit.diyaccounting.co.uk
}

public class CanaryStack extends Stack {

    public CanaryStack(final Construct scope,
                       final String id,
                       final CanaryStackProps props) {
        super(scope, id, StackProps.builder()
                .env(props.env())
                .build());

        Canary.Builder.create(this, "HomepageCanary")
            .canaryName(("submit-home-" + props.environmentName()).toLowerCase())
            .runtime(Runtime.SYN_NODEJS_PUPPETEER_6_2)
            .handler("index.handler")
            .code(Code.fromAsset("infra/synthetics/homepage-canary"))
            .schedule(Schedule.rate(Duration.minutes(5)))
            .environmentVariables(Map.of(
                "BASE_URL", props.baseUrl()
            ))
            .startAfterCreation(true)
            .build();
    }
}
```

Notes for Junie:

* runtime: must match a runtime string that exists in software.amazon.awscdk.services.synthetics.Runtime in the version of CDK in this repo. Pick the latest Puppeteer runtime constant present. If SYN_NODEJS_PUPPETEER_6_2 does not exist in this repo’s CDK version use whatever Runtime enum values are available and choose the latest Node 18+ Puppeteer runtime.
* canaryName must be <= 21 chars lowercase alphanum and hyphen. Truncate if env name etc would exceed.
* Code.fromAsset path must match the new index.js location.
* Schedule can be 5 minutes, 1 minute, etc. 5 minutes is standard.

Step B3. Integrate CanaryStack into the CDK app

Junie must:

* Open the CDK app entry point (the code that currently instantiates EdgeStack, ApexStack, etc for ci/prod).
* Instantiate CanaryStack for each environment and pass:

    * env(): same Environment(account, region) as other stacks
    * environmentName(): 'ci' or 'prod'
    * baseUrl(): the external URL for that environment, same one used by the behaviour tests

Example pseudo:

```java
var ciEnv = Environment.builder()
    .account("123456789012")
    .region("eu-west-2")
    .build();

new CanaryStack(app,
    "Submit-Canary-ci",
    ImmutableCanaryStackProps.builder()
        .env(ciEnv)
        .environmentName("ci")
        .baseUrl("https://ci-submit.diyaccounting.co.uk")
        .build());

new BehaviourMonitoringStack(app,
    "Submit-BehaviourMonitoring-ci",
    ImmutableBehaviourMonitoringStackProps.builder()
        .env(ciEnv)
        .environmentName("ci")
        .build());
```

Repeat for prod.

Step B4. Update deploy.yml so CDK deploy includes CanaryStack

In the job that already runs cdk deploy:

* Append the new stacks (Submit-Canary-ci / Submit-Canary-prod etc) to the deploy command.
* Ensure the IAM role used by that job has iam:CreateRole, synthetics:CreateCanary, synthetics:UpdateCanary, synthetics:StartCanary, iam:PassRole, logs:CreateLogGroup, s3:CreateBucket, etc. If deploy already has admin-type infra role this is already satisfied. If not Junie must extend the infra deploy role policy to allow CloudWatch Synthetics.

Result of Pattern 1 skeleton after Junie completes:

* A real CloudWatch Synthetics Canary is live
* It hits the home page every 5 minutes
* You can see pass/fail, screenshots, HAR, and latency in the CloudWatch Synthetics console
* This establishes the pattern for migrating each behaviour test to a first-class Canary later

Summary for Junie

Deliverables Junie must add to branch rollrest:

1. GitHub Actions

    * Add behaviour-tests-and-publish job to .github/workflows/deploy.yml
    * Ensure deploy job outputs ENVIRONMENT_NAME and BASE_URL so the new job can consume them
    * After running Playwright tests, publish CloudWatch metric SubmitBehaviour / BehaviourSuiteSuccess with dimensions env=<ci|prod> test=fullSuite and value 1 or 0

2. infra changes (Java CDK)

    * Add BehaviourMonitoringStack (plus ImmutableBehaviourMonitoringStackProps) under infra/main/java/.../stacks
    * Alarm on Metric(namespace='SubmitBehaviour', metricName='BehaviourSuiteSuccess', dimensions env=<env>, test='fullSuite') with SNS topic
    * Add CanaryStack (plus ImmutableCanaryStackProps) under infra/main/java/.../stacks
    * Add infra/synthetics/homepage-canary/index.js with a basic Puppeteer-based canary script
    * Update the CDK app entry point to instantiate CanaryStack and BehaviourMonitoringStack for each environment and include them in cdk deploy

3. IAM / permissions

    * Confirm the GitHub deploy role already used by deploy.yml can:

        * publish CloudWatch metrics (cloudwatch:PutMetricData) for Pattern 3
        * create and update synthetics canaries for Pattern 1 skeleton
    * If not, extend that role’s inline policy in infra so that CDK grants these actions, and make sure deploy.yml is still assuming that role

After Junie completes these changes:

* Pattern 3 is active: full behaviour suite gates deploy observability and alarms in CloudWatch
* Pattern 1 skeleton is active: first Synthetics Canary runs against home page and proves infra wiring for future per-test canaries
