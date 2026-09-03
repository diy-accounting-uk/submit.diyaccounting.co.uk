/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureGlobalSecondaryIndex;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureStream;
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
    public ITable securityStateTable;
    public Key saltEncryptionKey;

    // Stream view type shared by every streamed table. NEW_AND_OLD_IMAGES rather than NEW_IMAGE
    // because deletes and expiries carry their meaning in the old image only.
    private static final String STREAM_VIEW_TYPE = "NEW_AND_OLD_IMAGES";

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

    /**
     * Turns on a stream on one of the four tables usage analytics reads from.
     *
     * @param tableConstructIdPrefix The construct ID prefix passed to ensureTable for this table,
     *     e.g. "{resourceNamePrefix}-Receipts" for a table created with id "{prefix}-ReceiptsTable"
     * @param tableName The DynamoDB table name
     * @return The table's latest stream ARN
     */
    private String ensureTableStream(String tableConstructIdPrefix, String tableName) {
        return ensureStream(this, tableConstructIdPrefix + "Stream", tableName, STREAM_VIEW_TYPE);
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
        ensureTimeToLive(
                this, props.resourceNamePrefix() + "-ReceiptsTTL", props.sharedNames().receiptsTableName, "ttl");
        String receiptsStreamArn =
                ensureTableStream(props.resourceNamePrefix() + "-Receipts", props.sharedNames().receiptsTableName);
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
        String bundlesStreamArn =
                ensureTableStream(props.resourceNamePrefix() + "-Bundles", props.sharedNames().bundlesTableName);
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

        String passesStreamArn =
                ensureTableStream(props.resourceNamePrefix() + "-Passes", props.sharedNames().passesTableName);

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
        String subscriptionsStreamArn = ensureTableStream(
                props.resourceNamePrefix() + "-Subscriptions", props.sharedNames().subscriptionsTableName);
        infof("Ensured subscriptions DynamoDB table with name %s", props.sharedNames().subscriptionsTableName);

        // Security state table for issue #10 data-theft detection: bundle-endpoint burst
        // counters (rate#{hashedSub}#{minute}) and mid-session country-change state
        // (geo#{hashedSub}). PK-only table (no sort key) - both item shapes are looked up by
        // stateKey. No PITR: every item expires within an hour and none of it is customer data.
        this.securityStateTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-SecurityStateTable",
                props.sharedNames().securityStateTableName,
                "stateKey",
                null);
        ensureTimeToLive(
                this, props.resourceNamePrefix() + "-SecurityStateTTL", props.sharedNames().securityStateTableName, "ttl");
        infof("Ensured security state DynamoDB table with name %s", props.sharedNames().securityStateTableName);

        cfnOutput(this, "ReceiptsTableName", this.receiptsTable.getTableName());
        cfnOutput(this, "ReceiptsTableArn", this.receiptsTable.getTableArn());
        cfnOutput(this, "ReceiptsTableStreamArn", receiptsStreamArn);
        cfnOutput(this, "BundlesTableName", this.bundlesTable.getTableName());
        cfnOutput(this, "BundlesTableArn", this.bundlesTable.getTableArn());
        cfnOutput(this, "BundlesTableStreamArn", bundlesStreamArn);
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
        cfnOutput(this, "PassesTableStreamArn", passesStreamArn);
        cfnOutput(this, "BundleCapacityTableName", this.bundleCapacityTable.getTableName());
        cfnOutput(this, "BundleCapacityTableArn", this.bundleCapacityTable.getTableArn());
        cfnOutput(this, "SubscriptionsTableName", this.subscriptionsTable.getTableName());
        cfnOutput(this, "SubscriptionsTableArn", this.subscriptionsTable.getTableArn());
        cfnOutput(this, "SubscriptionsTableStreamArn", subscriptionsStreamArn);
        cfnOutput(this, "SecurityStateTableName", this.securityStateTable.getTableName());
        cfnOutput(this, "SecurityStateTableArn", this.securityStateTable.getTableArn());

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
