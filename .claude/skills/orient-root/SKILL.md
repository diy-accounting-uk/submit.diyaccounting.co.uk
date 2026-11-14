---
name: orient-root
description: Read before any change, test, workflow or plan in ../root.diyaccounting.co.uk (Route53 DNS for diyaccounting.co.uk, diya-gl.co.uk and diya-gl.com, RootDnsStack, the apex holding page, deploy-holding.yml failover, the cross-account delegation role, the management AWS account): which of that repository's docs and skills to follow in place of this repository's CLAUDE.md.
---
<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# orient-root — work in the root repository by its own rules

`../root.diyaccounting.co.uk` manages the management AWS account (887764105431): the Route53 zones and alias records for every site, the apex holding page, and the cross-account role that lets the other accounts write DNS records.

The rules of that repository win over the rules of the repository you started in, wherever they differ.

## Read first, in order

1. `../root.diyaccounting.co.uk/CLAUDE.md`, sections "Quick Reference", "CDK Architecture", "Deployment", "Security Checklist".
2. `../root.diyaccounting.co.uk/RUNBOOK_HOLDING_FAILOVER.md` before any failover to the holding page or any restore.
3. `../root.diyaccounting.co.uk/NEXT.md`, the open work of that repository.
4. `../root.diyaccounting.co.uk/.claude/skills/`: `do-next`, `plain-prose`.

## Facts that trip a session from another repository

- `deploy.yml` runs by manual dispatch only; a push to main does not deploy DNS: CLAUDE.md "Deployment".
- `deploy.yml` refuses to run while a failover is live. Run `deploy-holding.yml` with `target: restore` first: same section.
- `deploy-holding.yml` moves live gateway aliases between two accounts. Read the runbook before you dispatch it.
- The delegation role `root-route53-record-delegate` is scoped to records in the hosted zone. Keep it that way: "Security Checklist".
- The other repositories reach this account only through that role, not through GitHub OIDC trust.
- The pre-push hook runs a secret scan only. `./mvnw clean verify` and `npm run cdk:synth` are the local checks: "Build Commands".
- Run `spotless:apply` only when asked: "Code Quality Rules".
- Ask before any AWS write, in particular to Route53; SSO profile `diya-management`: "AWS CLI Access".
- A hosted zone or DNS change affects every site at once. Print the change and wait for a yes.
