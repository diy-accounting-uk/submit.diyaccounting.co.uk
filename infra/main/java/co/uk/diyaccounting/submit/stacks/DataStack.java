/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureGlobalSecondaryIndex;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureTable;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureTimeToLive;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.kms.Key;
import software.constructs.Construct;

public class DataStack extends Stack {

    public ITable receiptsTable;
    public ITable bundlesTable;
    public ITable bundlePostAsyncRequestsTable;
    public ITable bundleDeleteAsyncRequestsTable;
    public ITable hmrcVatReturnPostAsyncRequestsTable;
    public ITable hmrcVatReturnGetAsyncRequestsTable;
    public ITable hmrcVatObligationGetAsyncRequestsTable;
    public ITable hmrcApiRequestsTable;
    public ITable passesTable;
    public ITable bundleCapacityTable;
    public ITable subscriptionsTable;
    public Key saltEncryptionKey;

    @Value.Immutable
    public interface DataStackProps extends StackProps, SubmitStackProps {

        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return null;
        }

        @Override
        String envName();

        @Override
        String deploymentName();

        @Override
        String resourceNamePrefix();

        @Override
        String cloudTrailEnabled();

        @Override
        SubmitSharedNames sharedNames();

        static ImmutableDataStackProps.Builder builder() {
            return ImmutableDataStackProps.builder();
        }
    }

    public DataStack(Construct scope, String id, DataStackProps props) {
        this(scope, id, null, props);
    }

    public DataStack(Construct scope, String id, StackProps stackProps, DataStackProps props) {
        super(scope, id, stackProps);

        // Tables use ensureTable() for idempotent creation - deployments succeed whether table exists or not.
        // ensureTable turns on point-in-time recovery for every table, including tables that already
        // exist, so data protection comes from a 35-day PITR window rather than CloudFormation RETAIN.

        // Receipts table for storing VAT submission receipts
        // CRITICAL: 7-year HMRC retention requirement
        this.receiptsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-ReceiptsTable",
                props.sharedNames().receiptsTableName,
                "hashedSub",
                "receiptId");
        infof("Ensured receipts DynamoDB table with name %s", props.sharedNames().receiptsTableName);

        // Bundles table for bundle storage
        // HIGH priority - contains user subscription data
        this.bundlesTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundlesTable",
                props.sharedNames().bundlesTableName,
                "hashedSub",
                "bundleId");
        ensureTimeToLive(this, props.resourceNamePrefix() + "-BundlesTTL", props.sharedNames().bundlesTableName, "ttl");
        infof("Ensured bundles DynamoDB table with name %s", props.sharedNames().bundlesTableName);

        // Async request tables — 1-hour TTL on "ttl" attribute

        // Bundle POST async request storage
        this.bundlePostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundlePostAsyncRequestsTable",
                props.sharedNames().bundlePostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-BundlePostAsyncTTL",
                props.sharedNames().bundlePostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured bundle POST async requests DynamoDB table with name %s",
                props.sharedNames().bundlePostAsyncRequestsTableName);

        // Bundle DELETE async request storage
        this.bundleDeleteAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundleDeleteAsyncRequestsTable",
                props.sharedNames().bundleDeleteAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-BundleDeleteAsyncTTL",
                props.sharedNames().bundleDeleteAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured bundle DELETE async requests DynamoDB table with name %s",
                props.sharedNames().bundleDeleteAsyncRequestsTableName);

        // HMRC VAT Return POST async request storage
        this.hmrcVatReturnPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatReturnPostAsyncRequestsTable",
                props.sharedNames().hmrcVatReturnPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatReturnPostAsyncTTL",
                props.sharedNames().hmrcVatReturnPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Return POST async requests DynamoDB table with name %s",
                props.sharedNames().hmrcVatReturnPostAsyncRequestsTableName);

        // HMRC VAT Return GET async request storage
        this.hmrcVatReturnGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatReturnGetAsyncRequestsTable",
                props.sharedNames().hmrcVatReturnGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatReturnGetAsyncTTL",
                props.sharedNames().hmrcVatReturnGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Return GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcVatReturnGetAsyncRequestsTableName);

        // HMRC VAT Obligation GET async request storage
        this.hmrcVatObligationGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatObligationGetAsyncRequestsTable",
                props.sharedNames().hmrcVatObligationGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatObligationGetAsyncTTL",
                props.sharedNames().hmrcVatObligationGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Obligation GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcVatObligationGetAsyncRequestsTableName);

        // HMRC API requests storage - audit trail for HMRC interactions
        // 28-day retention via TTL on "ttl" attribute
        this.hmrcApiRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcApiRequestsTable",
                props.sharedNames().hmrcApiRequestsTableName,
                "hashedSub",
                "id");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcApiRequestsTTL",
                props.sharedNames().hmrcApiRequestsTableName,
                "ttl");
        infof("Ensured HMRC API Requests DynamoDB table with name %s", props.sharedNames().hmrcApiRequestsTableName);

        // Passes table for storing invitation pass codes
        // Pass codes are four-word passphrases that grant bundle access when redeemed.
        // PK-only table (no sort key) - passes are looked up by code.
        this.passesTable = ensureTable(
                this, props.resourceNamePrefix() + "-PassesTable", props.sharedNames().passesTableName, "pk", null);
        infof("Ensured passes DynamoDB table with name %s", props.sharedNames().passesTableName);

        // GSI for querying passes by issuer (user-generated pass listing)
        ensureGlobalSecondaryIndex(
                this,
                props.resourceNamePrefix() + "-PassesIssuedByGSI",
                props.sharedNames().passesTableName,
                "issuedBy-index",
                "issuedBy",
                "createdAt");
        infof("Ensured issuedBy-index GSI on passes table %s", props.sharedNames().passesTableName);

        // Ensure the GSI custom resource waits for the table custom resource to complete.
        // Without this, on fresh stack creation the GSI UpdateTable call races the CreateTable call.
        var passesEnsureTable = this.getNode().tryFindChild(props.resourceNamePrefix() + "-PassesTable-EnsureTable");
        var passesEnsureGSI = this.getNode().tryFindChild(props.resourceNamePrefix() + "-PassesIssuedByGSI-EnsureGSI");
        if (passesEnsureTable != null && passesEnsureGSI != null) {
            passesEnsureGSI.getNode().addDependency(passesEnsureTable);
        }

        // Bundle capacity counter table for tracking global cap enforcement
        // PK-only table (no sort key) - counters are looked up by bundleId.
        // Reconciliation Lambda overwrites with correct count every 5 minutes, so the bundles table
        // is the source of truth if this one is ever lost.
        this.bundleCapacityTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundleCapacityTable",
                props.sharedNames().bundleCapacityTableName,
                "bundleId",
                null);
        infof("Ensured bundle capacity DynamoDB table with name %s", props.sharedNames().bundleCapacityTableName);

        // Subscriptions table (subscription data)
        this.subscriptionsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-SubscriptionsTable",
                props.sharedNames().subscriptionsTableName,
                "pk",
                null);
        infof("Ensured subscriptions DynamoDB table with name %s", props.sharedNames().subscriptionsTableName);

        cfnOutput(this, "ReceiptsTableName", this.receiptsTable.getTableName());
        cfnOutput(this, "ReceiptsTableArn", this.receiptsTable.getTableArn());
        cfnOutput(this, "BundlesTableName", this.bundlesTable.getTableName());
        cfnOutput(this, "BundlesTableArn", this.bundlesTable.getTableArn());
        cfnOutput(this, "BundlePostAsyncRequestsTableName", this.bundlePostAsyncRequestsTable.getTableName());
        cfnOutput(this, "BundlePostAsyncRequestsTableArn", this.bundlePostAsyncRequestsTable.getTableArn());
        cfnOutput(this, "BundleDeleteAsyncRequestsTableName", this.bundleDeleteAsyncRequestsTable.getTableName());
        cfnOutput(this, "BundleDeleteAsyncRequestsTableArn", this.bundleDeleteAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcVatReturnPostAsyncRequestsTableName",
                this.hmrcVatReturnPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this, "HmrcVatReturnPostAsyncRequestsTableArn", this.hmrcVatReturnPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this, "HmrcVatReturnGetAsyncRequestsTableName", this.hmrcVatReturnGetAsyncRequestsTable.getTableName());
        cfnOutput(this, "HmrcVatReturnGetAsyncRequestsTableArn", this.hmrcVatReturnGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcVatObligationGetAsyncRequestsTableName",
                this.hmrcVatObligationGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcVatObligationGetAsyncRequestsTableArn",
                this.hmrcVatObligationGetAsyncRequestsTable.getTableArn());
        cfnOutput(this, "HmrcApiRequestsTableName", this.hmrcApiRequestsTable.getTableName());
        cfnOutput(this, "HmrcApiRequestsArn", this.hmrcApiRequestsTable.getTableArn());
        cfnOutput(this, "PassesTableName", this.passesTable.getTableName());
        cfnOutput(this, "PassesTableArn", this.passesTable.getTableArn());
        cfnOutput(this, "BundleCapacityTableName", this.bundleCapacityTable.getTableName());
        cfnOutput(this, "BundleCapacityTableArn", this.bundleCapacityTable.getTableArn());
        cfnOutput(this, "SubscriptionsTableName", this.subscriptionsTable.getTableName());
        cfnOutput(this, "SubscriptionsTableArn", this.subscriptionsTable.getTableArn());

        // KMS key for encrypting salt backup stored in DynamoDB (Path 3 recovery).
        // Used by migration 003 to encrypt the passphrase salt as a system#config item.
        // Must move to submit-backup account during account separation (see PLAN_AWS_ACCOUNTS.md).
        this.saltEncryptionKey = Key.Builder.create(this, props.resourceNamePrefix() + "-SaltEncryptionKey")
                .alias("alias/" + props.resourceNamePrefix() + "-salt-encryption")
                .enableKeyRotation(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .pendingWindow(Duration.days(7))
                .description("KMS key for encrypting salt backup in DynamoDB - " + props.resourceNamePrefix())
                .build();

        cfnOutput(this, "SaltEncryptionKeyArn", this.saltEncryptionKey.getKeyArn());

        infof(
                "DataStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
