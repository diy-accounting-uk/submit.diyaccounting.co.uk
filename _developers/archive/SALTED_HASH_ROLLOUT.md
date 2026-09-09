<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Salted User Sub Hash - Rollout Steps

## Prerequisites

- [ ] No live user data exists (clean break - confirmed)
- [ ] Unit tests pass locally: `npm test`

## Deployment Sequence

Deployments are handled automatically by GitHub Actions. The standard deployment workflow handles everything:

### Step 1: Deploy to CI Environment

1. **Push the branch:**
   ```bash
   git push origin <branch-name>
   ```

2. **GitHub Actions will automatically:**
   - Run the `deploy-environment` workflow (creates salt secret if not exists)
   - Run the `deploy-application` workflow (deploys CDK stacks with Lambda IAM permissions)

3. **Verify deployment succeeded:**
   - Check GitHub Actions workflow completed successfully
   - Optionally verify salt secret exists:
     ```bash
     aws secretsmanager describe-secret \
       --secret-id "ci/submit/user-sub-hash-salt" \
       --region eu-west-2
     ```

### Step 2: Run Tests Against CI

```bash
npm run test:behaviour-proxy
```

Check CloudWatch logs for "Salt successfully fetched and cached" messages.

### Step 3: Deploy to Production

1. **Merge to main:**
   ```bash
   git checkout main
   git merge <branch-name>
   git push origin main
   ```

2. **GitHub Actions will automatically:**
   - Run the `deploy-environment` workflow (creates prod salt secret if not exists)
   - Run the `deploy-application` workflow (deploys CDK stacks)

3. **Verify prod deployment:**
   - Check GitHub Actions workflow completed successfully
   - Verify salt secret exists:
     ```bash
     aws secretsmanager describe-secret \
       --secret-id "prod/submit/user-sub-hash-salt" \
       --region eu-west-2
     ```

### Step 4: Create Salt Backup

After first successful deployment to each environment:

```bash
./scripts/backup-salts.sh
```

Store the output file securely (1Password or similar). **Do not commit to Git.**

## Verification Checklist

- [ ] CI environment deployment successful
- [ ] CI salt secret created with correct tags
- [ ] CI behaviour tests pass
- [ ] Prod environment deployment successful
- [ ] Prod salt secret created with correct tags
- [ ] Salt backup created and stored securely

## Rollback

If issues occur after deployment:

```bash
git revert <commit-hash>
git push origin main
```

This reverts code to unsalted hash. Salt secrets remain in AWS (harmless). Any users created during the salted period would become inaccessible, but since there's no live data, this is acceptable.

## Post-Deployment

- Schedule quarterly salt backups: `./scripts/backup-salts.sh`
- Monitor CloudWatch for any salt-related errors
- Delete this rollout document once stable (keep SALTED_HASH_IMPLEMENTATION.md for reference)
