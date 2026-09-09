#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
# Copyright (C) 2006-2026 DIY Accounting Limited

# scripts/aws-unset-iam-session.sh
# Usage: ./scripts/aws-unset-iam-session.sh
unset AWS_ACCESS_KEY_ID
unset AWS_SECRET_ACCESS_KEY
unset AWS_SESSION_TOKEN
echo "Assumed role unset, identity is now:"
aws sts get-caller-identity
