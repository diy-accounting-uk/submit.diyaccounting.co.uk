<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# AWS Multi-Account Troubleshooting Guide

Common issues and solutions for the DIY Accounting Submit multi-account architecture.

## Quick Reference

| Symptom | Likely Cause | Section |
|---------|--------------|---------|
| "Access Denied" in Console | Permission set not assigned | [Console Access](#console-access-issues) |
| GitHub Actions role assumption fails | OIDC misconfiguration | [GitHub Actions](#github-actions-issues) |
| Cross-account backup fails | Vault policy incorrect | [Backup Issues](#backup-issues) |
| CDK deployment fails | Bootstrap missing | [CDK Issues](#cdk-deployment-issues) |
| SSO login loop | Browser cookies | [IAM Identity Center](#iam-identity-center-issues) |

---

## Console Access Issues

### "You are not authorized to perform this operation"

**Symptoms:**
- Cannot access AWS Console after SSO login
- Permission denied when clicking on account/role

**Diagnosis:**
```bash
# Check your current identity
aws sts get-caller-identity --profile PROFILE

# List your permission set assignments
aws sso-admin list-account-assignments-for-principal \
  --instance-arn arn:aws:sso:::instance/ssoins-XXXX \
  --principal-id USER_ID \
  --principal-type USER
```

**Solutions:**
1. Verify permission set is assigned to your user for this account
2. Check permission set policies include required actions
3. Wait 1-2 minutes for propagation after assignment changes

### Cannot See Account in SSO Portal

**Cause:** User not assigned to account

**Solution:**
1. In management account, go to IAM Identity Center
2. AWS accounts > Select account > Assign users
3. Add user with appropriate permission set

### Wrong Region After Login

**Cause:** Region defaulting to us-east-1

**Solution:**
1. Bookmark direct region URLs: `https://eu-west-2.console.aws.amazon.com/`
2. Set default region in SSO CLI profile

---

## IAM Identity Center Issues

### SSO Login Loop

**Symptoms:**
- Redirected back to login page after authenticating
- "Session expired" immediately after login

**Solutions:**
1. Clear browser cookies for `*.awsapps.com` and `*.aws.amazon.com`
2. Try incognito/private window
3. Check system time is synchronized
4. Verify portal URL is correct (no typos)

### MFA Device Not Working

**Symptoms:**
- MFA codes rejected
- "Invalid code" error

**Solutions:**
1. Check device time is synchronized (within 30 seconds)
2. Wait for next code cycle
3. Use backup codes if available
4. Admin can reset MFA:
   ```bash
   # In management account
   aws identitystore delete-user-attribute \
     --identity-store-id d-9c67480c02 \
     --user-id USER_ID \
     --attribute-path mfaConfiguration
   ```

### User Cannot Be Created

**Error:** "User already exists"

**Solution:**
```bash
# Search for existing user
aws identitystore list-users \
  --identity-store-id d-9c67480c02 \
  --filters AttributePath=UserName,AttributeValue=username
```

Delete or modify existing user if found.

### Permission Set Changes Not Taking Effect

**Cause:** Propagation delay

**Solutions:**
1. Wait 1-2 minutes
2. Sign out and back in
3. Force reprovisioning:
   ```bash
   aws sso-admin provision-permission-set \
     --instance-arn arn:aws:sso:::instance/ssoins-XXXX \
     --permission-set-arn arn:aws:sso:::permissionSet/ssoins-XXXX/ps-XXXX \
     --target-id ACCOUNT_ID \
     --target-type AWS_ACCOUNT
   ```

---

## GitHub Actions Issues

### Role Assumption Fails

**Error:** "Could not assume role with OIDC"

**Diagnosis:**
```bash
# Check OIDC provider exists
aws iam list-open-id-connect-providers --profile submit-prod-admin

# Check role trust policy
aws iam get-role \
  --role-name github-actions-role \
  --profile submit-prod-admin \
  --query 'Role.AssumeRolePolicyDocument'
```

**Solutions:**

1. **OIDC Provider Missing:**
   ```bash
   ./scripts/aws-accounts/setup-oidc-roles.sh submit-prod 887764105431
   ```

2. **Trust Policy Incorrect:**

   Trust policy must include:
   ```json
   {
     "Effect": "Allow",
     "Principal": {
       "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
     },
     "Action": "sts:AssumeRoleWithWebIdentity",
     "Condition": {
       "StringEquals": {
         "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
       },
       "StringLike": {
         "token.actions.githubusercontent.com:sub": "repo:ORG/REPO:*"
       }
     }
   }
   ```

3. **Repository Name Mismatch:**
   - Check `sub` condition matches your repo exactly
   - Format: `repo:owner/repo:ref:refs/heads/branch`

### Deployment Role Assumption Fails

**Error:** "Access denied assuming deployment role"

**Cause:** Actions role cannot assume deployment role

**Solution:**
```bash
# Check deployment role trust policy allows actions role
aws iam get-role \
  --role-name github-deploy-role \
  --query 'Role.AssumeRolePolicyDocument'
```

Trust policy needs:
```json
{
  "Effect": "Allow",
  "Principal": {
    "AWS": "arn:aws:iam::ACCOUNT_ID:role/github-actions-role"
  },
  "Action": "sts:AssumeRole"
}
```

### Wrong Account Deployed To

**Symptoms:** Feature branch deployed to production

**Diagnosis:**
1. Check workflow file logic for environment detection
2. Verify GitHub secrets are set correctly

**Solution:**
1. Review `.github/workflows/deploy.yml`
2. Ensure branch conditions are correct:
   ```yaml
   jobs:
     deploy-ci:
       if: github.ref != 'refs/heads/main'
       # ...
     deploy-prod:
       if: github.ref == 'refs/heads/main'
   ```

---

## CDK Deployment Issues

### "CDK Bootstrap Required"

**Error:** "This stack uses assets, so the toolkit stack must be deployed"

**Solution:**
```bash
# Bootstrap the account
./scripts/aws-accounts/bootstrap-cdk.sh ACCOUNT_ID
```

### Cross-Account Deployment Fails

**Error:** "Access denied" during CDK deploy

**Diagnosis:**
```bash
# Check CDK bootstrap trust
aws cloudformation describe-stacks \
  --stack-name CDKToolkit \
  --query 'Stacks[0].Parameters'
```

**Solution:**
Rebootstrap with correct trust:
```bash
cdk bootstrap aws://ACCOUNT_ID/eu-west-2 \
  --trust MANAGEMENT_ACCOUNT_ID \
  --cloudformation-execution-policies arn:aws:iam::aws:policy/AdministratorAccess
```

### Stack Stuck in ROLLBACK_COMPLETE

**Symptoms:** Cannot update or delete stack

**Solution:**
```bash
# Delete and recreate
aws cloudformation delete-stack --stack-name STACK_NAME
aws cloudformation wait stack-delete-complete --stack-name STACK_NAME
# Then redeploy
npm run deploy:env
```

### Resource Limit Exceeded

**Error:** "Limit exceeded for resource"

**Solutions:**
1. Request limit increase via Service Quotas
2. Clean up unused resources
3. Consider if resource is needed

---

## Backup Issues

### Cross-Account Copy Fails

**Error:** "Access denied" in backup job

**Diagnosis:**
```bash
# Check vault access policy in backup account
aws backup get-backup-vault-access-policy \
  --backup-vault-name submit-cross-account-vault \
  --profile submit-backup-admin
```

**Solution:**
Update vault policy to allow source account:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::SOURCE_ACCOUNT_ID:root"
      },
      "Action": [
        "backup:CopyIntoBackupVault"
      ],
      "Resource": "*"
    }
  ]
}
```

### Backup Jobs Not Running

**Symptoms:** No recent backups in vault

**Diagnosis:**
```bash
# Check backup plan
aws backup list-backup-plans --profile submit-prod-admin

# Check backup selection
aws backup list-backup-selections \
  --backup-plan-id PLAN_ID \
  --profile submit-prod-admin
```

**Solutions:**
1. Verify backup plan schedule is correct
2. Check IAM role has required permissions
3. Verify resources are tagged correctly (if using tag-based selection)

### Cannot Restore from Backup

**Error:** "Access denied" during restore

**Solution:**
Ensure restore role has:
- `backup:StartRestoreJob`
- Service-specific permissions (e.g., `dynamodb:RestoreTableFromBackup`)

---

## Organization Issues

### Cannot Create Account

**Error:** "You have exceeded the maximum number of accounts"

**Solution:**
1. Request limit increase via AWS Support
2. Default limit is typically 10 accounts

### Account Not Appearing in Organization

**Cause:** Invitation pending acceptance

**Solution:**
```bash
# Check pending invitations
aws organizations list-handshakes-for-organization

# Check invitation status
aws organizations describe-handshake --handshake-id h-XXXX
```

Accept invitation from target account console.

### Cannot Move Account Between OUs

**Error:** "Account is not a member of this organization"

**Diagnosis:**
```bash
# Verify account membership
aws organizations describe-account --account-id ACCOUNT_ID
```

**Solution:**
Account must be fully joined (not pending) to be moved.

---

## Network/Connectivity Issues

### Lambda Cannot Reach External Services

**Symptoms:** Timeouts when calling HMRC APIs

**Diagnosis:**
1. Check security group outbound rules
2. Check NAT Gateway (if in VPC)
3. Check route tables

**Solution:**
Lambda functions outside VPC have internet access by default.
If in VPC, ensure NAT Gateway and routes are configured.

### CloudFront 403 Errors

**Symptoms:** Website returns 403 Forbidden

**Diagnosis:**
```bash
# Check S3 bucket policy
aws s3api get-bucket-policy --bucket BUCKET_NAME

# Check CloudFront OAI/OAC
aws cloudfront get-distribution --id DIST_ID
```

**Solutions:**
1. Update bucket policy to allow CloudFront OAI/OAC
2. Check CloudFront origin configuration
3. Invalidate CloudFront cache

---

## Logging and Debugging

### Enable Detailed Logging

```bash
# AWS CLI debug mode
aws --debug COMMAND

# CDK verbose output
cdk deploy --verbose

# GitHub Actions debug
# Set repository secret: ACTIONS_STEP_DEBUG = true
```

### Finding Logs

| Log Type | Location |
|----------|----------|
| Lambda execution | CloudWatch Logs: `/aws/lambda/function-name` |
| API Gateway | CloudWatch Logs: `API-Gateway-Execution-Logs_xxx` |
| CDK deployment | CloudFormation Events |
| GitHub Actions | Repository Actions tab |
| IAM Identity Center | CloudTrail |

### CloudTrail Investigation

```bash
# Recent IAM events
aws cloudtrail lookup-events \
  --lookup-attributes AttributeKey=EventSource,AttributeValue=iam.amazonaws.com \
  --start-time $(date -d '1 hour ago' --iso-8601=seconds) \
  --profile submit-prod-admin
```

---

## Getting Help

### AWS Support

If you have a support plan:
1. AWS Console > Support Center
2. Create case with relevant logs

### Community Resources

- AWS re:Post: https://repost.aws/
- Stack Overflow: [aws-organizations] tag
- GitHub Issues: For CDK-specific issues

### Escalation Path

1. Check this troubleshooting guide
2. Review AWS documentation
3. Search AWS re:Post
4. Open AWS Support case (if support plan)
5. Contact infrastructure owner

---

*Document Version: 1.0*
*Last Updated: 2026-01-15*
