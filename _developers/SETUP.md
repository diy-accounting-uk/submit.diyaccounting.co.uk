# DIY Accounting Submit - Developer Setup Guide

This project allows UK businesses to submit tax returns to HMRC under the Making Tax Digital (MTD) framework. It simplifies interactions through HMRC’s official APIs, providing streamlined VAT submissions initially via a straightforward web interface.

---

# Quick developer setup (current code paths)

This section reflects what actually happens with the current code and scripts. It provides a step‑by‑step guide to set up your own environment with a local TLS certificate, HMRC sandbox credentials, and test data. It also lists the steps to run the test suites up to npm run test:all, and how to deploy to AWS for your own domain based on prod settings.

1) Prerequisites
- Node.js 22+
- Java 21+ and Docker (for CDK build/synth)
- certbot, for the one-time local TLS certificate (see step 3)
- HMRC Developer Hub account for sandbox credentials

2) Clone and install
```bash
git clone git@github.com:diy-accounting-uk/submit.diyaccounting.co.uk.git
cd submit.diyaccounting.co.uk
npm install
npm run playwright:install
```

3) Configure local TLS
- `local.submit.diyaccounting.co.uk` already resolves to `127.0.0.1` in public DNS, so every
  developer's machine reaches its own loopback under that name.
- Ask the operator for the `certbot-local` AWS profile, then issue a certificate once:
```bash
pipx install certbot
pipx inject certbot certbot-dns-route53
AWS_PROFILE=certbot-local certbot certonly --dns-route53 \
  -d local.submit.diyaccounting.co.uk \
  --config-dir "$HOME/.local/share/diyaccounting-local-tls/config" \
  --work-dir "$HOME/.local/share/diyaccounting-local-tls/work" \
  --logs-dir "$HOME/.local/share/diyaccounting-local-tls/logs" \
  --non-interactive --agree-tos -m your-email@example.com
```
- The server reads the certificate straight from that lineage, so no cert paths need setting.
  Renew it before it expires with the same command, or `certbot renew`.

4) Configure local environment (implied secrets)
- Use .env.proxy as your base for local development. It already sets:
  - DIY_SUBMIT_BASE_URL=https://local.submit.diyaccounting.co.uk:3443/
  - TEST_SERVER_HTTP=run
  - TEST_SERVER_TLS=run
  - TEST_SERVER_HTTPS_PORT=3443
  - TEST_MOCK_OAUTH2=run
  - TEST_DYNAMODB=run
  - USER_SUB_HASH_SALT=local-development-salt-not-for-production (required for user ID hashing)
- Do NOT commit plaintext secrets. Run any proxy command through `scripts/proxy-secrets.sh`, which
  fetches the HMRC and Stripe secrets from AWS Secrets Manager over your SSO session and sets them
  in the child process's environment:
```bash
scripts/proxy-secrets.sh npm run test:submitVatBehaviour-proxy
```
  - Optional: GOOGLE_CLIENT_SECRET / DIY_SUBMIT_GOOGLE_CLIENT_ID, COGNITO_* if testing those paths
- DynamoDB table names for local tests (bundles, HMRC API requests, receipts) default sensibly; tables are created automatically by the behaviour test harness when TEST_DYNAMODB=run.
- User IDs are salted and hashed before storage (privacy feature). See `_developers/SALTED_HASH_IMPLEMENTATION.md` for details.

5) HMRC sandbox application
- In the HMRC Developer Hub (Sandbox), create an app and add your redirect URI:
  - https://local.submit.diyaccounting.co.uk:3443/activities/submitVatCallback.html
- Copy the client ID; the sandbox client secret comes from AWS Secrets Manager through
  `scripts/proxy-secrets.sh` (see step 4), so you don't need to store it locally.

6) Run locally
Pick one of the following options:
- All‑in‑one (starts mock OAuth2, dynalite, and the web server over HTTPS):
```bash
npm start
```
- Or run components individually:
```bash
npm run server                 # Serves at https://local.submit.diyaccounting.co.uk:3443
npm run auth                   # Starts mock OAuth2 server (optional)
```
Open https://local.submit.diyaccounting.co.uk:3443/

7) Run tests up to npm run test:all
- Unit + system tests (Vitest):
```bash
npm test
```
- Browser tests (Playwright):
```bash
npm run test:browser
```
- Behaviour tests (Playwright) — orchestrates the server, mock OAuth2, `stripe listen`, and local
  DynamoDB using .env.proxy:
```bash
scripts/proxy-secrets.sh npm run test:allBehaviour
```
- Full suite:
```bash
npm run test:all
```
Troubleshooting: if you suddenly get a large batch of test failures, clear the local test artifacts:
```bash
rm -rf target
```

8) Deploy to AWS (based on prod, for your own domain)
- What you need:
  - Route53 hosted zone for your domain (e.g. submit.example.org)
  - ACM certificate in us-east-1 for submit.example.org and *.submit.example.org (used by CloudFront)
  - GitHub Actions OIDC provider + two roles (Actions role and deployment role)
  - Repository variables/secrets set for your account and domain: AWS_ACCOUNT_ID, AWS_REGION, AWS_HOSTED_ZONE_ID, AWS_HOSTED_ZONE_NAME, AWS_CERTIFICATE_ARN
- Create an environment file for your domain by copying .env.prod to .env.myprod and set:
  - ENVIRONMENT_NAME=myprod, DEPLOYMENT_NAME=myprod
  - DIY_SUBMIT_BASE_URL=https://submit.example.org/
  - HMRC_BASE_URI / HMRC_SANDBOX_BASE_URI as needed
  - HMRC_CLIENT_SECRET_ARN / HMRC_SANDBOX_CLIENT_SECRET_ARN (Secrets Manager)
- Optional pre-check (local synth):
```bash
./mvnw clean verify -DskipTests
ENVIRONMENT_NAME=myprod npm run cdk:synth-environment
ENVIRONMENT_NAME=myprod npm run cdk:synth-application
```
- Deploy via GitHub Actions: push to main or run the deploy workflow and select your environment name.

# Build and run locally

## Java code formatting (Maven Spotless + Palantir Java Format)

CLI (applies exactly what the IDE should do):
- ./mvnw spotless:apply  # formats code
- ./mvnw spotless:check  # verifies formatting (CI-safe)

Spotless is configured in pom.xml to use palantir-java-format (pinned). This is a Google Java Format fork with a fixed 100-column wrap.

### Eclipse setup to follow Maven (Palantir Java Format)
1) Install the Palantir Java Format plugin for Eclipse:
   - Eclipse Marketplace: search for "palantir-java-format" and install; or
   - Update site: https://palantir.github.io/palantir-java-format/eclipse/update/ (Help → Install New Software... → Add...)
2) Enable Palantir formatter in Eclipse:
   - Preferences → Java → Code Style → Formatter:
     - Select "palantir-java-format" as the active formatter profile.
     - Optionally disable other custom profiles.
3) Configure Save Actions to format on save:
   - Preferences → Java → Editor → Save Actions:
     - Check "Perform the selected actions on save"
     - Check "Format source code" (All lines)
     - Check "Organize imports" (Spotless also removes unused imports; duplication is harmless)
4) Right margin guide at 100 columns (visual aid only):
   - Preferences → General → Editors → Text Editors → Show print margin, set to 100.
   - The repo .editorconfig also sets this for IDEs that honor it.

Notes:
- Palantir formatter is deterministic and ignores most Eclipse code style settings; it enforces ~Google style with 100 columns.
- If you have the Google Java Format plugin instead, it will also use 100 columns but may differ subtly from Palantir on some constructs. Prefer the Palantir plugin to match Maven exactly.

### IntelliJ IDEA setup (optional)
- Install the "Palantir Java Format" plugin or "Google Java Format" with the Palantir fork if available. Then enable it under Settings → Tools → Palantir/Google Java Format.
- Set Right Margin to 100 (Editor → Code Style → Java) or rely on .editorconfig.

## Clone the Repository

```bash

git clone git@github.com:diy-accounting-uk/submit.diyaccounting.co.uk.git
cd submit.diyaccounting.co.uk
```

## Install Node.js dependencies and test

```bash

npm install
npm test
```

## Build and test the Java Application

```bash
./mvnw clean package
```

## Synthesise the CDK (current scripts)

Recommended top-level script that validates and synthesises all stacks for the prod environment:
```bash
npm run cdk
```
Or run individual synths (example for a custom environment):
```bash
ENVIRONMENT_NAME=ci npm run cdk:synth-environment
ENVIRONMENT_NAME=ci npm run cdk:synth-application
```

## Run the website locally

```bash
npm run server
```

Webserver output:
```log

> web-submit-diyaccounting-co-uk@1.0.0 start
> node app/bin/server.js

Listening at http://127.0.0.1:3000 for https://test-api.service.hmrc.gov.uk

```

Access via [http://127.0.0.1:3000](http://127.0.0.1:3000), or serve HTTPS natively on the local
hostname once you have the certificate from step 3:

```bash
# .env.proxy already sets these; TEST_SERVER_TLS=run switches server.js to the HTTPS branch
export TEST_SERVER_TLS=run
export TEST_SERVER_HTTPS_PORT=3443

npm run server
```

The server reads the certificate from the certbot lineage under
`$HOME/.local/share/diyaccounting-local-tls/`, so no cert path configuration is needed. Open
`https://local.submit.diyaccounting.co.uk:3443` in a browser of your choice.

# Local usage with HMRC

Register `https://local.submit.diyaccounting.co.uk:3443/activities/submitVatCallback.html` as a
redirect URI on the HMRC sandbox application.
Start at `https://local.submit.diyaccounting.co.uk:3443`.
Enter your VAT number, Period Key, and VAT Due in the form and click "Submit VAT Return".
Log in to HMRC...

---

# Deployment to AWS

## Repository set-up

Add the following repository variables to your GitHub repository settings under "Settings":

NEEDS UPDATING

```
Skip to content
diy-accounting-uk
submit.diyaccounting.co.uk
Repository navigation
Code
Issues
19
 (19)
Pull requests
Agents
Discussions
Actions
Projects
Wiki
Security
46
 (46)
Insights
Settings
Settings: diy-accounting-uk/submit.diyaccounting.co.uk
Access
Code and automation
Security
Integrations
Actions secrets and variables
Secrets and variables allow you to manage reusable configuration data. Secrets are encrypted and are used for sensitive data. Learn more about encrypted secrets. Variables are shown as plain text and are used for non-sensitive data. Learn more about variables.

Anyone with collaborator access to this repository can use these secrets and variables for actions. They are not passed to workflows that are triggered by a pull request from a fork.

Secrets
Variables
Variables
Environment variables
Name
Valuesort ascending
Environmentsort ascending

Last updated
sort ascending
SUBMIT_ACCOUNT_ID
887764105431
prod
21 minutes ago
SUBMIT_ACCOUNT_ID
367191799875
ci
21 minutes ago
SUBMIT_ACTIONS_ROLE_ARN
arn:aws:iam::887764105431:role/submit-github-actions-role
prod
20 minutes ago
SUBMIT_ACTIONS_ROLE_ARN
arn:aws:iam::367191799875:role/submit-ci-github-actions-role
ci
21 minutes ago
SUBMIT_CERTIFICATE_ARN
arn:aws:acm:us-east-1:887764105431:certificate/d340de40-96ca-4f5b-ae4c-f66a776e5a75
prod
15 minutes ago
SUBMIT_CERTIFICATE_ARN
arn:aws:acm:us-east-1:367191799875:certificate/bd4b7bf4-5c93-4003-b217-5d1dc80d5e38
ci
16 minutes ago
SUBMIT_DEPLOY_ROLE_ARN
arn:aws:iam::887764105431:role/submit-deployment-role
prod
20 minutes ago
SUBMIT_DEPLOY_ROLE_ARN
arn:aws:iam::367191799875:role/submit-ci-deployment-role
ci
21 minutes ago
SUBMIT_REGIONAL_CERTIFICATE_ARN
arn:aws:acm:eu-west-2:887764105431:certificate/1f9c9a57-5834-41d3-822d-4aae7e32d633
prod
15 minutes ago
SUBMIT_REGIONAL_CERTIFICATE_ARN
arn:aws:acm:eu-west-2:367191799875:certificate/de2a24a1-6034-440c-b98f-a8b2942dc083
ci
16 minutes ago
Repository variables
Name
Valuesort ascending

Last updated
sort ascending
Actions
COPILOT_AGENT_FIREWALL_ALLOW_LIST_ADDITIONS
6 months ago
COPILOT_AGENT_FIREWALL_ENABLED
false
6 months ago
GATEWAY_ACCOUNT_ID
283165661847
5 hours ago
GATEWAY_ACTIONS_ROLE_ARN
arn:aws:iam::283165661847:role/gateway-github-actions-role
5 hours ago
GATEWAY_CERTIFICATE_ARN
arn:aws:acm:us-east-1:283165661847:certificate/18008e08-0475-4ba0-8516-834fd5f447d9
5 hours ago
GATEWAY_DEPLOY_ROLE_ARN
arn:aws:iam::283165661847:role/gateway-deployment-role
5 hours ago
ROOT_ACCOUNT_ID
887764105431
12 minutes ago
ROOT_ACTIONS_ROLE_ARN
arn:aws:iam::887764105431:role/submit-github-actions-role
11 minutes ago
ROOT_DEPLOY_ROLE_ARN
arn:aws:iam::887764105431:role/submit-deployment-role
10 minutes ago
ROOT_HOSTED_ZONE_ID
Z0315522208PWZSSBI9AL
4 minutes ago
SPREADSHEETS_ACCOUNT_ID
064390746177
2 hours ago
SPREADSHEETS_ACTIONS_ROLE_ARN
arn:aws:iam::064390746177:role/spreadsheets-github-actions-role
2 hours ago
SPREADSHEETS_CERTIFICATE_ARN
arn:aws:acm:us-east-1:064390746177:certificate/bc67c01c-ea52-4b11-8958-68e24bf23727
1 hour ago
SPREADSHEETS_DEPLOY_ROLE_ARN
arn:aws:iam::064390746177:role/spreadsheets-deployment-role
2 hours ago
STRIPE_PRICE_ID
price_1SzkPBCD0Ld2ukzIqbEweRSk
last week
STRIPE_TEST_PRICE_ID
price_1Szjt0FdFHdRoTOjHDXcuuq8
last week
TELEGRAM_CHAT_IDS
{"ci-test":"-5250521947","ci-live":"-5278650420","prod-test":"-5144319944","prod-live":"-5177256260"}
last week
Footer
© 2026 GitHub, Inc.
Footer navigation
Terms
Privacy
Security
Status
Community
Docs
Contact
Manage cookies
Do not share my personal information

```

```
Skip to content
diy-accounting-uk
submit.diyaccounting.co.uk
Repository navigation
Code
Issues
19
 (19)
Pull requests
Agents
Discussions
Actions
Projects
Wiki
Security
46
 (46)
Insights
Settings
Settings: diy-accounting-uk/submit.diyaccounting.co.uk
Access
Code and automation
Security
Integrations
Actions secrets and variables
Secrets and variables allow you to manage reusable configuration data. Secrets are encrypted and are used for sensitive data. Learn more about encrypted secrets. Variables are shown as plain text and are used for non-sensitive data. Learn more about variables.

Anyone with collaborator access to this repository can use these secrets and variables for actions. They are not passed to workflows that are triggered by a pull request from a fork.

Secrets
Variables
Secrets
Environment secrets
Name
Environmentsort ascending

Last updated
sort ascending
STRIPE_TEST_WEBHOOK_SECRET
prod
3 days ago
STRIPE_TEST_WEBHOOK_SECRET
ci
3 days ago
STRIPE_WEBHOOK_SECRET
prod
3 days ago
STRIPE_WEBHOOK_SECRET
ci
3 days ago
Repository secrets
Name

Last updated
sort ascending
Actions
GOOGLE_CLIENT_SECRET
last month
HMRC_CLIENT_SECRET
7 months ago
HMRC_SANDBOX_CLIENT_SECRET
3 weeks ago
PERSONAL_ACCESS_TOKEN
last week
RELEASE_PAT
last month
STRIPE_SECRET_KEY
last week
STRIPE_TEST_SECRET_KEY
last week
STRIPE_TEST_WEBHOOK_SECRET
last week
SUPPORT_ISSUE_PAT
last month
TELEGRAM_BOT_TOKEN
last week
Footer
© 2026 GitHub, Inc.
Footer navigation
Terms
Privacy
Security
Status
Community
Docs
Contact
Manage cookies
Do not share my personal information

```


| Variable                  | Description                              | Level        | Type     | Example                         |
|---------------------------|------------------------------------------|--------------|----------|---------------------------------|
| `AWS_HOSTED_ZONE_ID`      | The AWS hosted zone ID for the domain.   | Repository   | String   | `Z0315522208PWZSSBI9AL`         |
| `AWS_HOSTED_ZONE_NAME`    | The AWS hosted zone name for the domain. | Repository   | String   | `submit.diyaccounting.co.uk`             |
| `AWS_CERTIFICATE_ARN`      | The AWS certificate ID for the domain.   | Environment  | String   | `arn:aws:acm:us-east-1:887764105431:certificate/d340de40-96ca-4f5b-ae4c-f66a776e5a75`          |
| `AWS_CLOUD_TRAIL_ENABLED` | Enable CloudTrail logging.               | Environment  | Boolean  | `true`                          |

To use a repository level variable certificate should be able to cover the domain `submit.diyaccounting.co.uk` and
`*.submit.diyaccounting.co.uk`. If a more specific certificate is required, then the `AWS_CERTIFICATE_ARN` variable can
be set at the environment level. Similarly, zone files can be per environment.

## OIDC Set-up

Add an OIDC identity provider to your AWS account to allow GitHub Actions to assume roles in your AWS account.
In this document it assumed that the identity provider is: `arn:aws:iam::887764105431:oidc-provider/token.actions.githubusercontent.com`.

See setting up an OIDC identity provider in the GitHub documentation: [Configuring OpenID Connect in Amazon Web Services](https://docs.github.com/en/actions/how-tos/security-for-github-actions/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services).

## GitHub Actions role creation

The GitHub Actions role authenticates with AWS but does not have permissions to deploy the application.
These permissions are granted to the `submit-deployment-role` which is assumed by the GitHub Actions role.

The `submit-github-actions-role` needs the following trust entity to allow GitHub Actions to assume the role:
```bash

cat <<'EOF' > submit-github-actions-trust-policy.json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Principal": {
                "Federated": "arn:aws:iam::887764105431:oidc-provider/token.actions.githubusercontent.com"
            },
            "Action": "sts:AssumeRoleWithWebIdentity",
            "Condition": {
                "StringEquals": {
                    "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
                },
                "StringLike": {
                    "token.actions.githubusercontent.com:sub": "repo:diy-accounting-uk/submit.diyaccounting.co.uk:*"
                }
            }
        }
    ]
}
EOF
```

Create the submit-github-actions-role:
```bash
aws iam create-role \
  --role-name submit-github-actions-role \
  --assume-role-policy-document file://submit-github-actions-trust-policy.json
```

Add the necessary permissions to deploy `submit.diyaccounting.co.uk`:
```bash

cat <<'EOF' > submit-assume-deployment-role-permissions-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
        "Sid": "Statement1",
        "Effect": "Allow",
        "Action": [
            "sts:AssumeRole",
            "sts:TagSession"
        ],
        "Resource": [
            "arn:aws:iam::887764105431:role/submit-deployment-role"
        ]
    }
  ]
}
EOF
aws iam put-role-policy \
  --role-name submit-github-actions-role \
  --policy-name assume-deployment-role-permissions-policy \
  --policy-document file://submit-assume-deployment-role-permissions-policy.json
```

An example of the GitHub Actions role being assumed in a GitHub Actions Workflow:
```yaml
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::887764105431:role/submit-github-actions-role
          role-chaining: false
          aws-region: eu-west-2
          audience: sts.amazonaws.com
          role-skip-session-tagging: true
          output-credentials: true
          retry-max-attempts: 3
      - run: aws sts get-caller-identity
```

## Deployment role creation

Create the IAM role with the necessary permissions be assumed from the authenticated users:
(Assumes these roles exist: `antony-local-user` and `submit-github-actions-role`.)
```bash

cat <<'EOF' > submit-deployment-trust-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": [
          "arn:aws:iam::541134664601:user/antony-local-user",
          "arn:aws:iam::887764105431:role/submit-github-actions-role"
        ]
      },
      "Action": "sts:AssumeRole"
    }
  ]
}
EOF
aws iam create-role \
  --role-name submit-deployment-role \
  --assume-role-policy-document file://submit-deployment-trust-policy.json
```

Add the necessary permissions to deploy `submit.diyaccounting.co.uk`:
```bash

cat <<'EOF' > submit-deployment-permissions-policy.json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudformation:*",
        "iam:*",
        "s3:*",
        "cloudtrail:*",
        "logs:*",
        "events:*",
        "lambda:*",
        "dynamodb:*",
        "sqs:*",
        "ecr:*",
        "ssm:*",
        "sts:AssumeRole"
      ],
      "Resource": "*"
    }
  ]
}
EOF
aws iam put-role-policy \
  --role-name submit-deployment-role \
  --policy-name submit-deployment-permissions-policy \
  --policy-document file://submit-deployment-permissions-policy.json
```

An example of the Deployment role being assumed in a GitHub Actions Workflow:
```yaml
      - name: Configure AWS Credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::887764105431:role/submit-deployment-role
          role-chaining: true
          aws-region: eu-west-2
          audience: sts.amazonaws.com
          role-skip-session-tagging: true
          output-credentials: true
          retry-max-attempts: 3
      - run: aws sts get-caller-identity
```

## Deployment role trust relationships

For this example, user `antony-local-user` has the following
trust policy so that they can assume the role: `submit-deployment-role`:
```json
{
	"Version": "2012-10-17",
	"Statement": [
		{
			"Sid": "Statement1",
			"Effect": "Allow",
			"Action": ["sts:AssumeRole", "sts:TagSession"],
			"Resource": ["arn:aws:iam::887764105431:role/submit-deployment-role"]
		}
	]
}
```

Assume the deployment role from the command line starting as `antony-local-user`:
```bash

ROLE_ARN="arn:aws:iam::887764105431:role/submit-deployment-role"
SESSION_NAME="submit-deployment-session-local"
ASSUME_ROLE_OUTPUT=$(aws sts assume-role --role-arn "$ROLE_ARN" --role-session-name "$SESSION_NAME" --output json)
if [ $? -ne 0 ]; then
  echo "Error: Failed to assume role."
  exit 1
fi
export AWS_ACCESS_KEY_ID=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.AccessKeyId')
export AWS_SECRET_ACCESS_KEY=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.SecretAccessKey')
export AWS_SESSION_TOKEN=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.SessionToken')
EXPIRATION=$(echo "$ASSUME_ROLE_OUTPUT" | jq -r '.Credentials.Expiration')
echo "Assumed role successfully. Credentials valid until: $EXPIRATION"
```
Output:
```log
Assumed role successfully. Credentials valid until: 2025-03-25T02:27:18+00:00
```

Check the session:
```bash

aws sts get-caller-identity
```

Output:
```json
{
  "UserId": "AROA45MW5HDLYEIKWFG6F:submit-deployment-session-local",
  "Account": "887764105431",
  "Arn": "arn:aws:sts::887764105431:assumed-role/submit-deployment-role/submit-deployment-session-local"
}
```

Check the permissions of the role:
```bash

aws iam list-role-policies \
  --role-name submit-deployment-role
```
Output (the policy we created above):
```json
{
  "PolicyNames": [
    "submit-deployment-permissions-policy"
  ]
}
```

## Deployment from local to AWS

### CDK Bootstrap

You'll need to have run `npx cdk bootstrap` to set up the environment for the CDK. This is a one-time setup per AWS account and region.

Assume deployment role:
```bash

. ./scripts/aws-assume-submit-deployment-role.sh
```

Output:
```log
Assumed arn:aws:iam::541134664601:role/submit-deployment-role successfully, expires: 2025-05-14T02:19:16+00:00. Identity is now:
{
"UserId": "AROAX37RDWOMSMQUIZOI4:agentic-lib-deployment-session-local",
"Account": "541134664601",
"Arn": "arn:aws:sts::541134664601:assumed-role/submit-deployment-role/agentic-lib-deployment-session-local"
}
```~/projects/submit.diyaccounting.co.uk %
```

The role `submit-deployment-role` has sufficient permissions to bootstrap the CDK environment and deploy the stack.
```bash

npx cdk bootstrap aws://887764105431/eu-west-2
```

```log

~/projects/submit.diyaccounting.co.uk % npx cdk bootstrap aws://887764105431/eu-west-2
[INFO] Scanning for projects...
[INFO]
[INFO] -------------------< submit.diyaccounting.co.uk:web >-------------------
[INFO] Building web 0.0.1
[INFO]   from pom.xml
[INFO] --------------------------------[ jar ]---------------------------------
[INFO]
[INFO] --- exec:3.5.1:java (default-cli) @ web ---
[WARNING] aws-cdk-lib.aws_cloudfront_origins.S3Origin is deprecated.
  Use `S3BucketOrigin` or `S3StaticWebsiteOrigin` instead.
  This API will be removed in the next major release.
[WARNING] aws-cdk-lib.aws_cloudfront_origins.S3Origin#bind is deprecated.
  Use `S3BucketOrigin` or `S3StaticWebsiteOrigin` instead.
  This API will be removed in the next major release.
[WARNING] aws-cdk-lib.aws_lambda.FunctionOptions#logRetention is deprecated.
  use `logGroup` instead
  This API will be removed in the next major release.
[WARNING] aws-cdk-lib.aws_lambda.FunctionOptions#logRetention is deprecated.
  use `logGroup` instead
  This API will be removed in the next major release.
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS
[INFO] ------------------------------------------------------------------------
[INFO] Total time:  3.585 s
[INFO] Finished at: 2025-07-13T20:03:56+01:00
[INFO] ------------------------------------------------------------------------
 ⏳  Bootstrapping environment aws://887764105431/eu-west-2...
Trusted accounts for deployment: (none)
Trusted accounts for lookup: (none)
Using default execution policy of 'arn:aws:iam::aws:policy/AdministratorAccess'. Pass '--cloudformation-execution-policies' to customize.
CDKToolkit: creating CloudFormation changeset...
 ✅  Environment aws://887764105431/eu-west-2 bootstrapped.

NOTICES         (What's this? https://github.com/aws/aws-cdk/wiki/CLI-Notices)

34892   CDK CLI will collect telemetry data on command usage starting at version 2.1100.0 (unless opted out)

        Overview: We do not collect customer content and we anonymize the
                  telemetry we do collect. See the attached issue for more
                  information on what data is collected, why, and how to
                  opt-out. Telemetry will NOT be collected for any CDK CLI
                  version prior to version 2.1100.0 - regardless of
                  opt-in/out.

        Affected versions: cli: ^2.0.0

        More information at: https://github.com/aws/aws-cdk/issues/34892


If you don’t want to see a notice anymore, use "cdk acknowledge <id>". For example, "cdk acknowledge 34892".
~/projects/submit.diyaccounting.co.uk %
```

Package the CDK, deploy the CDK stack which rebuilds the Docker image, and deploy the AWS infrastructure:
```bash

./mvnw clean package
```

Maven build output:
```log
...truncated...
[INFO] Replacing original artifact with shaded artifact.
[INFO] Replacing /Users/antony/projects/submit.diyaccounting.co.uk/target/web-0.0.1.jar with /Users/antony/projects/submit.diyaccounting.co.uk/target/web-0.0.1-shaded.jar
[INFO] ------------------------------------------------------------------------
[INFO] BUILD SUCCESS
[INFO] ------------------------------------------------------------------------
[INFO] Total time:  15.522 s
[INFO] Finished at: 2025-05-14T03:16:19+02:00
[INFO] ------------------------------------------------------------------------
```

Assume deployment role:
```bash

. ./scripts/aws-assume-submit-deployment-role.sh
```

Output:
```log
Assumed arn:aws:iam::541134664601:role/submit-deployment-role successfully, expires: 2025-05-14T02:19:16+00:00. Identity is now:
{
"UserId": "AROAX37RDWOMSMQUIZOI4:agentic-lib-deployment-session-local",
"Account": "541134664601",
"Arn": "arn:aws:sts::541134664601:assumed-role/submit-deployment-role/agentic-lib-deployment-session-local"
}
~/projects/submit.diyaccounting.co.uk %
```

Synthesise the CDK:
```bash
npx cdk synth
```

Compute a diff of the AWS infrastructure:
```bash

npx cdk diff
```

Deploy the AWS infrastructure:
```bash

npx cdk deploy
```

Example output:
```log
WebStack | 4/8 | 3:20:29 AM | UPDATE_COMPLETE      | AWS::CloudFormation::Stack                      | WebStack
[03:20:34] Stack WebStack has completed updating

 ✅  WebStack

✨  Deployment time: 46.85s

Outputs:
WebStack.ARecord = dev.submit.diyaccounting.co.uk
WebStack.AaaaRecord = dev.submit.diyaccounting.co.uk
WebStack.CertificateArn = arn:aws:acm:us-east-1:541134664601:certificate/73421403-bd8c-493c-888c-e3e08eec1c41
WebStack.DistributionAccessLogBucketArn = arn:aws:s3:::dev-web-intention-com-dist-access-logs
WebStack.DistributionId = E24DIA1LSWOHYI
WebStack.HostedZoneId = Z09934692CHZL2KPE9Q9F
WebStack.OriginAccessLogBucketArn = arn:aws:s3:::dev-web-intention-com-origin-access-logs
WebStack.OriginBucketArn = arn:aws:s3:::dev-web-intention-com
WebStack.accessLogGroupRetentionPeriodDays = 30 (Source: CDK context.)
WebStack.certificateArn = 73421403-bd8c-493c-888c-e3e08eec1c41 (Source: CDK context.)
WebStack.cloudTrailEnabled = true (Source: CDK context.)
WebStack.cloudTrailEventSelectorPrefix = none (Source: CDK context.)
WebStack.cloudTrailLogGroupPrefix = /aws/s3/ (Source: CDK context.)
WebStack.cloudTrailLogGroupRetentionPeriodDays = 3 (Source: CDK context.)
WebStack.defaultDocumentAtOrigin = index.html (Source: CDK context.)
WebStack.docRootPath = public (Source: CDK context.)
WebStack.env = dev (Source: CDK context.)
WebStack.error404NotFoundAtDistribution = errors/404-error-distribution.html (Source: CDK context.)
WebStack.hostedZoneId = Z09934692CHZL2KPE9Q9F (Source: CDK context.)
WebStack.hostedZoneName = diyaccounting.co.uk (Source: CDK context.)
WebStack.s3RetainOriginBucket = false (Source: CDK context.)
WebStack.s3RetainReceiptsBucket = false (Source: CDK context.)
WebStack.s3UseExistingBucket = false (Source: CDK context.)
WebStack.subDomainName = web (Source: CDK context.)
WebStack.useExistingCertificate = true (Source: CDK context.)
WebStack.useExistingHostedZone = true (Source: CDK context.)
Stack ARN:
arn:aws:cloudformation:eu-west-2:541134664601:stack/WebStack/b49af1d0-2f5e-11f0-a683-063fb0a54f1d

✨  Total time: 52.69s

```

## Troubleshooting - destroying the stack and cleaning up log groups

Destroy a previous stack and delete related log groups:
```bash

npx cdk destroy
```

Force delete the buckets:
```bash

aws s3 rm 's3://dev-submit-diyaccounting-co-uk-origin-access-logs' --recursive
aws s3 rb 's3://dev-submit-diyaccounting-co-uk-origin-access-logs' --force
```

Manually delete the log groups:
```bash

aws logs delete-log-group \
  --log-group-name '/aws/lambda/dev-submit-diyaccounting-co-uk-origin-access-log-forwarder'
aws logs delete-log-group \
  --log-group-name '/aws/lambda/dev-submit-diyaccounting-co-uk-dist-access-log-forwarder'
```

## 🎯 MVP (Initial Release)

### Features:

* Basic HTML form to submit VAT returns.
* No persistent identity—OAuth performed per submission.
* Submission status and receipts stored securely in AWS S3.

### Tech Stack:

* **Frontend:** HTML5, JavaScript
* **Backend:** Node.js (Express.js), AWS Lambda
* **Infrastructure:** AWS CDK (Java), AWS S3, AWS SQS
* **Authentication:** HMRC OAuth 2.0 (Authorization Code Grant)

### Frontend (HTML form):

```html
<form action="/submit" method="post">
  <input name="vatNumber" placeholder="VAT Number">
  <input name="periodKey" placeholder="Period Key">
  <input name="vatDue" placeholder="VAT Due">
  <button type="submit">Submit VAT Return</button>
</form>
```

### OAuth Handler (JavaScript):

```javascript
app.get('/auth/hmrc', (req, res) => {
  const authUrl = `https://test-api.service.hmrc.gov.uk/oauth/authorize?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=write:vat`;
  res.redirect(authUrl);
});

app.get('/callback', async (req, res) => {
  const code = req.query.code;
  const tokenResponse = await axios.post('https://test-api.service.hmrc.gov.uk/oauth/token', {
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
    redirect_uri: REDIRECT_URI,
    grant_type: 'authorization_code',
    code: code
  });
  const accessToken = tokenResponse.data.access_token;
  // Queue submission task with SQS
});
```

### Lambda Task Example (JavaScript):

```javascript
exports.handler = async (event) => {
  const { accessToken, vatNumber, periodKey, vatDue } = event;
  await axios.post(`https://test-api.service.hmrc.gov.uk/organisations/vat/${vatNumber}/returns`, {
    periodKey, vatDueSales: vatDue, totalVatDue: vatDue
  }, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
};
```

### Infrastructure Setup (AWS CDK - Java):

```java
import software.amazon.awscdk.*;
import software.amazon.awscdk.services.lambda.*;
import software.amazon.awscdk.services.sqs.*;
import software.amazon.awscdk.services.s3.*;
import software.amazon.awscdk.services.logs.*;

public class MtdStack extends Stack {
  public MtdStack(final Construct scope, final String id) {
    super(scope, id);

    Bucket submissionBucket = Bucket.Builder.create(this, "SubmissionBucket")
      .versioned(true)
      .build();

    Queue submissionQueue = Queue.Builder.create(this, "SubmissionQueue").build();

    LogGroup handlerLogGroup = LogGroup.Builder.create(this, "VatSubmissionHandlerLogGroup")
      .logGroupName("/aws/lambda/VatSubmissionHandler")
      .retention(RetentionDays.DAYS_7)
      .removalPolicy(RemovalPolicy.DESTROY)
      .build();

    Function handler = Function.Builder.create(this, "VatSubmissionHandler")
      .runtime(Runtime.NODEJS_22_X)
      .handler("index.handler")
      .code(Code.fromAsset("lambda"))
      .logGroup(handlerLogGroup)
      .environment(Map.of(
        "BUCKET_NAME", submissionBucket.getBucketName()
      ))
      .build();

    submissionBucket.grantReadWrite(handler);
    submissionQueue.grantConsumeMessages(handler);
  }
}
```
