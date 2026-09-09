<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# IAM Identity Center Setup Guide

This guide covers setting up AWS IAM Identity Center (formerly AWS SSO) for centralized access to all DIY Accounting Submit AWS accounts.

## Overview

IAM Identity Center provides:
- Single sign-on across all AWS accounts
- Centralized user management
- Role-based access via Permission Sets
- MFA enforcement
- Audit trail of all access

## Prerequisites

- AWS Organization created and enabled
- Access to management account (submit-management)
- Valid email address for user account

## Step 1: Enable IAM Identity Center

### 1.1 Navigate to IAM Identity Center

1. Sign into **submit-management** account
2. Go to **IAM Identity Center** service
3. Click **Enable**

### 1.2 Choose Identity Source

Select **Identity Center directory** (default) for simplicity:
- Built-in user management
- No external IdP needed
- Suitable for small teams

Alternative: Connect to external IdP (Google Workspace, Azure AD) if you have existing identity infrastructure.

### 1.3 Verify Region

IAM Identity Center should be enabled in **eu-west-2** (London).

The region is shown in the console. If incorrect:
1. Settings > **Identity source**
2. Note: Region cannot be changed after enabling - delete and recreate if wrong

## Step 2: Create Permission Sets

Permission Sets define what users can do in AWS accounts.

### 2.1 AdministratorAccess (Full Admin)

1. Go to **Permission sets** > **Create permission set**
2. Select **Predefined permission set**
3. Choose **AdministratorAccess**
4. Session duration: **8 hours**
5. Click **Create**

### 2.2 PowerUserAccess (Deploy Without IAM)

1. **Create permission set** > **Predefined permission set**
2. Choose **PowerUserAccess**
3. Session duration: **8 hours**
4. Click **Create**

### 2.3 ReadOnlyAccess (View Only)

1. **Create permission set** > **Predefined permission set**
2. Choose **ReadOnlyAccess**
3. Session duration: **4 hours**
4. Click **Create**

### 2.4 Custom Permission Set (Optional)

For specific use cases, create custom permission sets:

1. **Create permission set** > **Custom permission set**
2. Name: e.g., `BackupOperator`
3. Add AWS managed policies:
   - `AWSBackupOperatorAccess`
   - `AWSBackupServiceRolePolicyForBackup`
4. Add inline policy if needed
5. Click **Create**

## Step 3: Create Users

### 3.1 Create Primary User

1. Go to **Users** > **Add user**
2. Enter details:
   - Username: `antony`
   - Email: `antony@diyaccounting.co.uk`
   - First name: `Antony`
   - Last name: `[Your surname]`
3. Click **Next**
4. Skip group assignment (add directly to accounts)
5. Click **Add user**

### 3.2 Set Password

User will receive email to set password. If not received:
1. Go to user > **Reset password**
2. Choose **Generate one-time password**
3. Share password securely

### 3.3 Configure MFA

Recommended: Require MFA for all users

1. Go to **Settings** > **Authentication**
2. MFA settings: **Every time they sign in**
3. **If a user does not have a registered MFA device**: Require them to register

User will be prompted to set up MFA on first login.

## Step 4: Assign Access to Accounts

### 4.1 Assign User to All Accounts

1. Go to **AWS accounts** (in left navigation)
2. Select all accounts:
   - submit-management
   - submit-prod
   - submit-ci
   - submit-backup
3. Click **Assign users or groups**
4. Select user: `antony`
5. Click **Next**

### 4.2 Assign Permission Sets

1. Select permission sets for each account:

| Account | Permission Sets |
|---------|-----------------|
| submit-management | AdministratorAccess |
| submit-prod | AdministratorAccess, ReadOnlyAccess |
| submit-ci | AdministratorAccess, PowerUserAccess |
| submit-backup | AdministratorAccess, ReadOnlyAccess |

2. Click **Submit**

Wait for propagation (usually < 1 minute).

## Step 5: Access the AWS Portal

### 5.1 Get Portal URL

1. Go to **Settings** > **Identity source**
2. Copy the **AWS access portal URL**
   - URL: `https://d-9c67480c02.awsapps.com/start/`

Bookmark this URL - it's your single entry point to all accounts.

### 5.2 First Login

1. Navigate to the portal URL
2. Enter username and password
3. Set up MFA device (authenticator app)
4. You'll see all assigned accounts and roles

### 5.3 Accessing an Account

1. Click on account name (e.g., submit-prod)
2. Click on role name (e.g., AdministratorAccess)
3. Choose:
   - **Management console** - opens AWS Console
   - **Command line or programmatic access** - shows temp credentials

## Step 6: Configure AWS CLI for SSO

### 6.1 Configure SSO Profile

```bash
aws configure sso
```

Enter when prompted:
- SSO session name: `diyaccounting`
- SSO start URL: `https://d-9c67480c02.awsapps.com/start/`
- SSO Region: `eu-west-2`
- SSO registration scopes: (leave default)

Browser will open for authentication.

### 6.2 Select Account and Role

After authentication, select:
- Account: choose account
- Role: choose role
- CLI default region: `eu-west-2`
- CLI default output format: `json`
- Profile name: e.g., `submit-prod`

### 6.3 Create Profiles for Each Account

Add to `~/.aws/config`:

```ini
[sso-session diyaccounting]
sso_start_url = https://d-9c67480c02.awsapps.com/start/
sso_region = eu-west-2
sso_registration_scopes = sso:account:access

[profile management]
sso_session = diyaccounting
sso_account_id = 887764105431
sso_role_name = AdministratorAccess
region = eu-west-2

[profile gateway]
sso_session = diyaccounting
sso_account_id = 283165661847
sso_role_name = AdministratorAccess
region = eu-west-2

[profile spreadsheets]
sso_session = diyaccounting
sso_account_id = 064390746177
sso_role_name = AdministratorAccess
region = eu-west-2

[profile submit-ci]
sso_session = diyaccounting
sso_account_id = 367191799875
sso_role_name = AdministratorAccess
region = eu-west-2

[profile submit-prod]
sso_session = diyaccounting
sso_account_id = 972912397388
sso_role_name = AdministratorAccess
region = eu-west-2

[profile submit-backup]
sso_session = diyaccounting
sso_account_id = 914216784828
sso_role_name = AdministratorAccess
region = eu-west-2
```

### 6.4 Using SSO Profiles

```bash
# Login (opens browser)
aws sso login --profile submit-prod-admin

# Use profile
aws s3 ls --profile submit-prod-admin

# Or set default profile
export AWS_PROFILE=submit-prod-admin
aws s3 ls
```

## Step 7: Break-Glass Procedures

For emergency access if SSO is unavailable:

### 7.1 Root Account Access

Each account has root credentials. Store securely:
- Root email/password in password manager
- MFA device separate from daily-use device
- Document recovery procedures

### 7.2 Emergency IAM User (Optional)

Create break-glass IAM user in management account:

```bash
aws iam create-user --user-name break-glass
aws iam attach-user-policy \
  --user-name break-glass \
  --policy-arn arn:aws:iam::aws:policy/AdministratorAccess
aws iam create-access-key --user-name break-glass
```

Store credentials in secure location (not regular password manager).

## Verification Checklist

- [ ] IAM Identity Center enabled in management account
- [ ] Permission sets created (Admin, PowerUser, ReadOnly)
- [ ] User created with MFA configured
- [ ] User assigned to all accounts with appropriate roles
- [ ] Portal URL bookmarked
- [ ] AWS CLI SSO profiles configured
- [ ] Can access console for all accounts
- [ ] Can use CLI for all accounts
- [ ] Break-glass procedures documented

## Troubleshooting

### "Access Denied" in Console

1. Verify permission set assignment
2. Check permission set policies
3. Verify organization membership

### SSO Login Loop

1. Clear browser cookies for awsapps.com
2. Try incognito window
3. Verify portal URL is correct

### CLI "Token Expired"

```bash
aws sso login --profile PROFILE_NAME
```

Re-authenticate when token expires.

### MFA Issues

1. Check device time synchronization
2. Use authenticator app backup codes
3. Contact admin to reset MFA

## Security Best Practices

1. **Require MFA** - Enforced at Identity Center level
2. **Use least privilege** - Assign minimum required permission sets
3. **Review access regularly** - Quarterly access reviews
4. **Monitor usage** - CloudTrail logs all Identity Center events
5. **Session duration** - Keep sessions short (4-8 hours)
6. **Disable unused accounts** - Remove access promptly when not needed

---

*Document Version: 1.0*
*Last Updated: 2026-01-15*
