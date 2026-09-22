<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# REPORT_DEPLOYMENT_ROLE_AUDIT

`submit-ci-deployment-role` holds one policy, the AWS managed
`arn:aws:iam::aws:policy/AdministratorAccess`, and no inline policies. Every GitHub Actions deploy
runs as that role. This report asked whether a scoped policy can replace it, and what should watch
the role given today's alarm setup. Section 4 records the decisions taken (O43, B30u).

- Audited: 2026-09-10, account `submit-ci` (367191799875)
- Method: `iam list-attached-role-policies` and `list-role-policies` for the read-only facts below;
  a CloudWatch Logs Insights query over the CDK CloudTrail log group
  (`/aws/cloudtrail/ci-env-cloud-trail`) for what the role and the role it assumes actually call;
  the CDK source and `.github/workflows/deploy*.yml` for what a deploy is built to do. Each claim
  below says which.

## 1. What the deploy actually needs

`iam list-attached-role-policies --role-name submit-ci-deployment-role` returns exactly
`AdministratorAccess`; `list-role-policies` returns no inline policies. GitHub Actions assumes
`submit-ci-github-actions-role` first (OIDC, an inline `AssumeDeploymentRole` policy and nothing
else), which then assumes `submit-ci-deployment-role` to run `npx cdk deploy`
(`.github/workflows/deploy.yml`, `deploy-environment.yml`).

`cdk deploy` does not execute stack changes as `submit-ci-deployment-role` directly. It assumes
`cdk-hnb659fds-cfn-exec-role-367191799875-eu-west-2`, the role CDK's own bootstrap creates for
CloudFormation to act through. That role also carries `AdministratorAccess`. Not by drift:
`scripts/aws-accounts/bootstrap-account.sh` bootstraps with
`--cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess` explicitly, which
is CDK's own default.

A CloudWatch Logs Insights query grouping the last 30 days of CloudTrail events by `eventSource`
gives two different pictures, one per role.

`submit-ci-deployment-role` makes the deploy's own direct calls: asset lookups, context queries,
diagnostics from deploy scripts. It touched 13 services: `ecr`, `sts`, `dynamodb`, `cognito-idp`,
`cloudformation`, `secretsmanager`, `kms`, `apigateway`, `logs`, `ssm`, `cloudfront`, `acm`,
`monitoring`.

`cdk-hnb659fds-cfn-exec-role` makes the actual resource changes CloudFormation performs on the
deploy's behalf. It touched 28 services: `kms`, `lambda`, `monitoring`, `ecr`, `logs`,
`apigateway`, `iam`, `s3`, `events`, `sqs`, `sns`, `ssm`, `synthetics`, `cloudfront`, `wafv2`,
`cloudtrail`, `firehose`, `bedrock`, `rum`, `cognito-idp`, `athena`, `backup`, `glue`, `sts`,
`secretsmanager`, `states`, `scheduler`, `cognito-identity`, `budgets`.

Between the two, the union covers essentially every AWS service this account uses, each with
several actions (create, put, delete, tag) rather than one. Sixteen CDK stack files in
`infra/main/java/co/uk/diyaccounting/submit/` construct IAM roles directly (`Role.Builder.create`
or `new Role(`), which a deploy must be able to create, attach policies to, and pass to other
services (`iam:PassRole`) for Lambda, Step Functions and the rest to run at all. Route53 did not
appear in this 30-day window because DNS records change rarely, but the CDK source shows the
deploy touches it too when a hosted zone record changes.

## 2. Can a scoped policy replace AdministratorAccess

No, not one that stays maintainable. Two separate constructs already need effectively-admin scope
by design, not by oversight.

- **The `cdk-hnb659fds-cfn-exec-role` already carries the same policy**, and that comes from CDK's
  own default bootstrap, chosen explicitly in this repo's own bootstrap script. Even a perfectly
  scoped `submit-ci-deployment-role` would sit in front of a CloudFormation execution role that can
  still do anything. CDK deploys work by handing CloudFormation a template and letting it
  reconcile; the deploying identity can't know in advance which of the 28+ services a given deploy
  will touch without re-deriving CDK's own capability list.
- **A CDK deploy creates IAM roles and calls `iam:PassRole`.** A policy that can create a role,
  attach a policy to it, and pass it to a Lambda or Step Function is a privilege-escalation path
  regardless of how the rest of the policy is scoped: it can create a new role with broader rights
  than its own and use it. Scoping this safely needs permission boundaries on every role the
  pipeline creates, which is a second design, and a second thing to keep in sync with every new
  CDK construct, not a policy edit.

An enumerated policy across 28+ services, kept in sync with every new CDK construct, is the same
maintenance shape that produced this session's other IAM finding: a filter or policy someone has
to remember to touch every time a stack changes, with no test catching the day they forget. This
repository lost a route table filter and a route-based alarm exclusion to exactly that shape of
drift today (B30t). That is the real cost of an enumerated policy, not a hedge.

**AdministratorAccess stays on both roles.** What should change is what watches them, covered
below and in section 3.

## 3. The alarm interaction

`SecurityDetectionStack` runs fourteen CIS AWS Foundations Benchmark CloudWatch alarms. Eight of
them (`UnauthorizedApiCalls`, `IamPolicyChanges`, `S3BucketPolicyChanges`, `SecurityGroupChanges`,
`NaclChanges`, `NetworkGatewayChanges`, `RouteTableChanges`, `VpcChanges`) carry a deploy-role
exclusion clause: it excludes any `AssumedRole` session whose `sessionIssuer.userName` exactly
matches `cdk-hnb659fds-*` (CDK's bootstrap roles), `submit-<env>-deployment-role`, or
`submit-<env>-github-actions-role`. That exclusion is what keeps the deployment pipeline's routine
activity off these eight alarms. That pipeline runs with AdministratorAccess, so matching it by
name is close to matching "any action in the account."

B30t added a wildcard, `<env>-*`, to the same shared clause, to stop CDK-generated per-stack
helper roles (`ci-env-DataStack-CustomS3AutoDeleteObjects-<random>`, a new name every deploy) from
tripping `route-table-changes` and `s3-bucket-policy-changes` on ordinary deploys. Because the
clause was shared across all eight controls, the wildcard silently widened all eight, not just the
two it was written for. B30u confines the wildcard to `RouteTableChanges` and
`S3BucketPolicyChanges`, the two controls it actually fixes. The other six
(`UnauthorizedApiCalls`, `IamPolicyChanges`, `SecurityGroupChanges`, `NaclChanges`,
`NetworkGatewayChanges`, `VpcChanges`) go back to the three exact deploy-role patterns only.

`cis-iam-policy-changes` not carrying the wildcard is what makes it a credible compensating
control for O43 below: it is the alarm that catches the `AttachRolePolicy` call in
`bootstrap-account.sh` that puts `AdministratorAccess` on the deployment role in the first place.
That call runs under an operator's own SSO session, which matches none of the exclusion patterns
(exact or wildcard), so it fires regardless. The exclusion hides a *use* of power already granted:
a route table, security group, VPC, or bucket policy change made while assuming one of the
excluded roles. It does not hide the grant itself.

## 4. Decisions taken

1. **O43: `AdministratorAccess` stays on `submit-ci-deployment-role` and
   `cdk-hnb659fds-cfn-exec-role`**, compensated by `cis-iam-policy-changes` on the grant itself and
   the other CIS controls on everything else the pipeline's credentials could be used for that
   isn't excluded. The alternative, a permission-boundary design scoping every role the pipeline
   creates, is real and separate work with no existing owner; BACKLOG row 33 carries the
   equivalent question for `submit-backup`.
2. **B30u: the `<env>-*` wildcard is confined to `RouteTableChanges` and `S3BucketPolicyChanges`**,
   the two controls it was written to fix. The other six `deployChangedControls`, `IamPolicyChanges`
   included, keep the three exact deploy-role patterns only, so O43's compensating control keeps
   its full sensitivity.
