/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

// spotless:off
// @capability OPS-113 Provision the DynamoDB and S3 data stack
// - **Use when:** the application's DynamoDB tables and S3 buckets need synthesizing with encryption, PITR and TTL policies.
// - **Does:** DataStack creates the application's DynamoDB tables, such as bundles, passes, clients and operators, and S3 buckets with encryption, PITR and TTL policies.
// - **Run:** `npm run cdk:synth-environment`
// - **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java`
// - **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/DataStackTest.java
// - **Keywords:** dynamodb tables, s3 buckets, pitr, ttl policy, encryption, data stack
// - **Related:** OPS-112
// @end-capability
// spotless:on

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureGlobalSecondaryIndex;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureStream;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureTable;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureTimeToLive;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.kms.Key;
import software.amazon.awscdk.services.s3.BlockPublicAccess;
import software.amazon.awscdk.services.s3.Bucket;
import software.amazon.awscdk.services.s3.BucketEncryption;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.constructs.Construct;

public class DataStack extends Stack {

    public ITable receiptsTable;
    public Bucket diyaGlBucket;
    public ITable bundlesTable;
    public ITable bundlePostAsyncRequestsTable;
    public ITable bundleDeleteAsyncRequestsTable;
    public ITable hmrcVatReturnPostAsyncRequestsTable;
    public ITable hmrcVatReturnGetAsyncRequestsTable;
    public ITable hmrcVatObligationGetAsyncRequestsTable;
    public ITable hmrcVatLiabilitiesGetAsyncRequestsTable;
    public ITable hmrcVatPaymentsGetAsyncRequestsTable;
    public ITable hmrcVatPenaltiesGetAsyncRequestsTable;
    public ITable hmrcItsaBusinessDetailsGetAsyncRequestsTable;
    public ITable hmrcItsaObligationsGetAsyncRequestsTable;
    public ITable hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable;
    public ITable hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable;
    public ITable hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable;
    public ITable hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable;
    public ITable hmrcItsaUkPropertyPeriodPostAsyncRequestsTable;
    public ITable hmrcItsaUkPropertyPeriodsGetAsyncRequestsTable;
    public ITable hmrcItsaUkPropertyPeriodGetAsyncRequestsTable;
    public ITable hmrcItsaUkPropertyPeriodPutAsyncRequestsTable;
    public ITable hmrcItsaUkPropertyAnnualGetAsyncRequestsTable;
    public ITable hmrcItsaUkPropertyAnnualPutAsyncRequestsTable;
    public ITable hmrcItsaForeignPropertyPeriodPostAsyncRequestsTable;
    public ITable hmrcItsaForeignPropertyPeriodGetAsyncRequestsTable;
    public ITable hmrcItsaForeignPropertyPeriodPutAsyncRequestsTable;
    public ITable hmrcItsaForeignPropertyAnnualGetAsyncRequestsTable;
    public ITable hmrcItsaForeignPropertyAnnualPutAsyncRequestsTable;
    public ITable hmrcItsaForeignPropertyDetailsGetAsyncRequestsTable;
    public ITable hmrcItsaForeignPropertyDetailsPostAsyncRequestsTable;
    public ITable hmrcItsaForeignPropertyDetailsPutAsyncRequestsTable;
    public ITable hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable;
    public ITable hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable;
    public ITable hmrcItsaCrystallisationObligationsGetAsyncRequestsTable;
    public ITable hmrcItsaStatusGetAsyncRequestsTable;
    public ITable hmrcItsaBsasTriggerPostAsyncRequestsTable;
    public ITable hmrcItsaBsasSelfEmploymentGetAsyncRequestsTable;
    public ITable hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable;
    public ITable hmrcItsaBsasUkPropertyGetAsyncRequestsTable;
    public ITable hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable;
    public ITable hmrcItsaBsasForeignPropertyGetAsyncRequestsTable;
    public ITable hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTable;
    public ITable hmrcItsaCalculationTriggerPostAsyncRequestsTable;
    public ITable hmrcItsaCalculationGetAsyncRequestsTable;
    public ITable hmrcItsaFinalDeclarationPostAsyncRequestsTable;
    public ITable hmrcVatAssistReportPostAsyncRequestsTable;
    public ITable hmrcVatAssistAcknowledgePostAsyncRequestsTable;
    public ITable hmrcItsaAssistReportPostAsyncRequestsTable;
    public ITable hmrcItsaAssistAcknowledgePostAsyncRequestsTable;
    public ITable hmrcItsaLossesAndClaimsGetAsyncRequestsTable;
    public ITable hmrcItsaLossesAndClaimsPutAsyncRequestsTable;
    public ITable hmrcItsaLossesAndClaimsDeleteAsyncRequestsTable;
    public ITable hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable;
    public ITable hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable;
    public ITable hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable;
    public ITable companiesHouseAccountsAsyncRequestsTable;
    public ITable hmrcApiRequestsTable;
    public ITable passesTable;
    public ITable bundleCapacityTable;
    public ITable subscriptionsTable;
    public ITable activityChargesTable;
    public ITable practiceClientsTable;
    public ITable commissionsTable;
    public ITable securityStateTable;
    public ITable alarmIssueLockTable;
    public ITable mcpSessionsTable;
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
     * Turns on a stream on one of the five tables usage analytics reads from.
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
                props.sharedNames().data.receiptsTableName,
                "hashedSub",
                "receiptId");
        String receiptsStreamArn =
                ensureTableStream(props.resourceNamePrefix() + "-Receipts", props.sharedNames().data.receiptsTableName);
        ensureTimeToLive(
                this, props.resourceNamePrefix() + "-ReceiptsTTL", props.sharedNames().data.receiptsTableName, "ttl");
        infof("Ensured receipts DynamoDB table with name %s", props.sharedNames().data.receiptsTableName);

        // Bundles table for bundle storage
        // HIGH priority - contains user subscription data
        this.bundlesTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundlesTable",
                props.sharedNames().data.bundlesTableName,
                "hashedSub",
                "bundleId");
        ensureTimeToLive(
                this, props.resourceNamePrefix() + "-BundlesTTL", props.sharedNames().data.bundlesTableName, "ttl");
        // GSI for counting live allocations of a capped bundle without scanning the table.
        // Sparse: an item with no expiry carries no index entry, which matches the count the
        // capacity reconciliation needs. KEYS_ONLY because the query only ever asks for a count.
        ensureGlobalSecondaryIndex(
                this,
                props.resourceNamePrefix() + "-BundlesBundleIdExpiryGSI",
                props.sharedNames().data.bundlesTableName,
                "bundleId-expiry-index",
                "bundleId",
                "expiry",
                "KEYS_ONLY");
        infof("Ensured bundleId-expiry-index GSI on bundles table %s", props.sharedNames().data.bundlesTableName);
        String bundlesStreamArn =
                ensureTableStream(props.resourceNamePrefix() + "-Bundles", props.sharedNames().data.bundlesTableName);
        infof("Ensured bundles DynamoDB table with name %s", props.sharedNames().data.bundlesTableName);

        // Async request tables — 1-hour TTL on "ttl" attribute

        // Bundle POST async request storage
        this.bundlePostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundlePostAsyncRequestsTable",
                props.sharedNames().data.bundlePostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-BundlePostAsyncTTL",
                props.sharedNames().data.bundlePostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured bundle POST async requests DynamoDB table with name %s",
                props.sharedNames().data.bundlePostAsyncRequestsTableName);

        // Bundle DELETE async request storage
        this.bundleDeleteAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundleDeleteAsyncRequestsTable",
                props.sharedNames().data.bundleDeleteAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-BundleDeleteAsyncTTL",
                props.sharedNames().data.bundleDeleteAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured bundle DELETE async requests DynamoDB table with name %s",
                props.sharedNames().data.bundleDeleteAsyncRequestsTableName);

        // HMRC VAT Return POST async request storage
        this.hmrcVatReturnPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatReturnPostAsyncRequestsTable",
                props.sharedNames().data.hmrcVatReturnPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatReturnPostAsyncTTL",
                props.sharedNames().data.hmrcVatReturnPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Return POST async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcVatReturnPostAsyncRequestsTableName);

        // HMRC VAT Return GET async request storage
        this.hmrcVatReturnGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatReturnGetAsyncRequestsTable",
                props.sharedNames().data.hmrcVatReturnGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatReturnGetAsyncTTL",
                props.sharedNames().data.hmrcVatReturnGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Return GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcVatReturnGetAsyncRequestsTableName);

        // HMRC VAT Obligation GET async request storage
        this.hmrcVatObligationGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatObligationGetAsyncRequestsTable",
                props.sharedNames().data.hmrcVatObligationGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatObligationGetAsyncTTL",
                props.sharedNames().data.hmrcVatObligationGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Obligation GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcVatObligationGetAsyncRequestsTableName);

        // HMRC VAT Liabilities GET async request storage
        this.hmrcVatLiabilitiesGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatLiabilitiesGetAsyncRequestsTable",
                props.sharedNames().data.hmrcVatLiabilitiesGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatLiabilitiesGetAsyncTTL",
                props.sharedNames().data.hmrcVatLiabilitiesGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Liabilities GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcVatLiabilitiesGetAsyncRequestsTableName);

        // HMRC VAT Payments GET async request storage
        this.hmrcVatPaymentsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatPaymentsGetAsyncRequestsTable",
                props.sharedNames().data.hmrcVatPaymentsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatPaymentsGetAsyncTTL",
                props.sharedNames().data.hmrcVatPaymentsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Payments GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcVatPaymentsGetAsyncRequestsTableName);

        // HMRC VAT Penalties GET async request storage
        this.hmrcVatPenaltiesGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatPenaltiesGetAsyncRequestsTable",
                props.sharedNames().data.hmrcVatPenaltiesGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatPenaltiesGetAsyncTTL",
                props.sharedNames().data.hmrcVatPenaltiesGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Penalties GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcVatPenaltiesGetAsyncRequestsTableName);

        // HMRC ITSA Business Details GET async request storage
        this.hmrcItsaBusinessDetailsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBusinessDetailsGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaBusinessDetailsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBusinessDetailsGetAsyncTTL",
                props.sharedNames().data.hmrcItsaBusinessDetailsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Business Details GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaBusinessDetailsGetAsyncRequestsTableName);

        // HMRC ITSA Obligations GET async request storage
        this.hmrcItsaObligationsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaObligationsGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaObligationsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaObligationsGetAsyncTTL",
                props.sharedNames().data.hmrcItsaObligationsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Obligations GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaObligationsGetAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Period POST async request storage
        this.hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodPostAsyncTTL",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Period POST async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Periods GET (list) async request storage
        this.hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodsGetAsyncTTL",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Periods GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Period GET (retrieve one) async request storage
        this.hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodGetAsyncTTL",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Period GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Period PUT (amend) async request storage
        this.hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodPutAsyncTTL",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Period PUT async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName);

        // HMRC ITSA UK Property Period POST async request storage
        this.hmrcItsaUkPropertyPeriodPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyPeriodPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyPeriodPostAsyncTTL",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA UK Property Period POST async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName);

        // HMRC ITSA UK Property Periods GET (list) async request storage
        this.hmrcItsaUkPropertyPeriodsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyPeriodsGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyPeriodsGetAsyncTTL",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA UK Property Periods GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName);

        // HMRC ITSA UK Property Period GET (retrieve one) async request storage
        this.hmrcItsaUkPropertyPeriodGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyPeriodGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyPeriodGetAsyncTTL",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA UK Property Period GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName);

        // HMRC ITSA UK Property Period PUT (amend) async request storage
        this.hmrcItsaUkPropertyPeriodPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyPeriodPutAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyPeriodPutAsyncTTL",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA UK Property Period PUT async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName);

        // HMRC ITSA UK Property Annual GET (retrieve) async request storage
        this.hmrcItsaUkPropertyAnnualGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyAnnualGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyAnnualGetAsyncTTL",
                props.sharedNames().data.hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA UK Property Annual GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName);

        // HMRC ITSA UK Property Annual PUT (create and amend) async request storage
        this.hmrcItsaUkPropertyAnnualPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyAnnualPutAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaUkPropertyAnnualPutAsyncTTL",
                props.sharedNames().data.hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA UK Property Annual PUT async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName);

        // HMRC ITSA Foreign Property Period POST async request storage
        this.hmrcItsaForeignPropertyPeriodPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyPeriodPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyPeriodPostAsyncTTL",
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Foreign Property Period POST async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodPostAsyncRequestsTableName);

        // HMRC ITSA Foreign Property Period GET (retrieve one) async request storage
        this.hmrcItsaForeignPropertyPeriodGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyPeriodGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyPeriodGetAsyncTTL",
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Foreign Property Period GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodGetAsyncRequestsTableName);

        // HMRC ITSA Foreign Property Period PUT (amend) async request storage
        this.hmrcItsaForeignPropertyPeriodPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyPeriodPutAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyPeriodPutAsyncTTL",
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Foreign Property Period PUT async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaForeignPropertyPeriodPutAsyncRequestsTableName);

        // HMRC ITSA Foreign Property Annual GET (retrieve) async request storage
        this.hmrcItsaForeignPropertyAnnualGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyAnnualGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaForeignPropertyAnnualGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyAnnualGetAsyncTTL",
                props.sharedNames().data.hmrcItsaForeignPropertyAnnualGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Foreign Property Annual GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaForeignPropertyAnnualGetAsyncRequestsTableName);

        // HMRC ITSA Foreign Property Annual PUT (create and amend) async request storage
        this.hmrcItsaForeignPropertyAnnualPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyAnnualPutAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaForeignPropertyAnnualPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyAnnualPutAsyncTTL",
                props.sharedNames().data.hmrcItsaForeignPropertyAnnualPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Foreign Property Annual PUT async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaForeignPropertyAnnualPutAsyncRequestsTableName);

        // HMRC ITSA Foreign Property Details GET async request storage
        this.hmrcItsaForeignPropertyDetailsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyDetailsGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyDetailsGetAsyncTTL",
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Foreign Property Details GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsGetAsyncRequestsTableName);

        // HMRC ITSA Foreign Property Details POST async request storage
        this.hmrcItsaForeignPropertyDetailsPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyDetailsPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyDetailsPostAsyncTTL",
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Foreign Property Details POST async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsPostAsyncRequestsTableName);

        // HMRC ITSA Foreign Property Details PUT async request storage
        this.hmrcItsaForeignPropertyDetailsPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyDetailsPutAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaForeignPropertyDetailsPutAsyncTTL",
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Foreign Property Details PUT async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaForeignPropertyDetailsPutAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Annual GET (retrieve) async request storage
        this.hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentAnnualGetAsyncTTL",
                props.sharedNames().data.hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Annual GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Annual PUT (create and amend) async request storage
        this.hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentAnnualPutAsyncTTL",
                props.sharedNames().data.hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Annual PUT async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName);

        // HMRC ITSA final declaration (crystallisation) obligations async request storage
        this.hmrcItsaCrystallisationObligationsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCrystallisationObligationsGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCrystallisationObligationsGetAsyncTTL",
                props.sharedNames().data.hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA crystallisation obligations async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName);

        // HMRC ITSA status async request storage
        this.hmrcItsaStatusGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaStatusGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaStatusGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaStatusGetAsyncTTL",
                props.sharedNames().data.hmrcItsaStatusGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA status async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaStatusGetAsyncRequestsTableName);

        // HMRC ITSA business source adjustable summary trigger async request storage
        this.hmrcItsaBsasTriggerPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasTriggerPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaBsasTriggerPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasTriggerPostAsyncTTL",
                props.sharedNames().data.hmrcItsaBsasTriggerPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA BSAS trigger async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaBsasTriggerPostAsyncRequestsTableName);

        // HMRC ITSA business source adjustable summary (self-employment) retrieve async request storage
        this.hmrcItsaBsasSelfEmploymentGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasSelfEmploymentGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasSelfEmploymentGetAsyncTTL",
                props.sharedNames().data.hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA BSAS self-employment retrieve async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName);

        // HMRC ITSA business source adjustable summary (self-employment) adjust async request storage
        this.hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasSelfEmploymentAdjustPostAsyncTTL",
                props.sharedNames().data.hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA BSAS self-employment adjust async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName);

        // HMRC ITSA business source adjustable summary (UK property) retrieve async request storage
        this.hmrcItsaBsasUkPropertyGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasUkPropertyGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaBsasUkPropertyGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasUkPropertyGetAsyncTTL",
                props.sharedNames().data.hmrcItsaBsasUkPropertyGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA BSAS UK property retrieve async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaBsasUkPropertyGetAsyncRequestsTableName);

        // HMRC ITSA business source adjustable summary (UK property) adjust async request storage
        this.hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasUkPropertyAdjustPostAsyncTTL",
                props.sharedNames().data.hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA BSAS UK property adjust async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName);

        // HMRC ITSA business source adjustable summary (foreign property) retrieve async request storage
        this.hmrcItsaBsasForeignPropertyGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasForeignPropertyGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaBsasForeignPropertyGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasForeignPropertyGetAsyncTTL",
                props.sharedNames().data.hmrcItsaBsasForeignPropertyGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA BSAS foreign property retrieve async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaBsasForeignPropertyGetAsyncRequestsTableName);

        // HMRC ITSA business source adjustable summary (foreign property) adjust async request storage
        this.hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasForeignPropertyAdjustPostAsyncTTL",
                props.sharedNames().data.hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA BSAS foreign property adjust async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTableName);

        // HMRC ITSA tax calculation trigger async request storage
        this.hmrcItsaCalculationTriggerPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCalculationTriggerPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaCalculationTriggerPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCalculationTriggerPostAsyncTTL",
                props.sharedNames().data.hmrcItsaCalculationTriggerPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA calculation trigger async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaCalculationTriggerPostAsyncRequestsTableName);

        // HMRC ITSA tax calculation retrieve async request storage
        this.hmrcItsaCalculationGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCalculationGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaCalculationGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCalculationGetAsyncTTL",
                props.sharedNames().data.hmrcItsaCalculationGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA calculation retrieve async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaCalculationGetAsyncRequestsTableName);

        // HMRC ITSA final declaration async request storage
        this.hmrcItsaFinalDeclarationPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaFinalDeclarationPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaFinalDeclarationPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaFinalDeclarationPostAsyncTTL",
                props.sharedNames().data.hmrcItsaFinalDeclarationPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA final declaration async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaFinalDeclarationPostAsyncRequestsTableName);

        // HMRC VAT Assist report async request storage
        this.hmrcVatAssistReportPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatAssistReportPostAsyncRequestsTable",
                props.sharedNames().data.hmrcVatAssistReportPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatAssistReportPostAsyncTTL",
                props.sharedNames().data.hmrcVatAssistReportPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Assist report async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcVatAssistReportPostAsyncRequestsTableName);

        // HMRC VAT Assist acknowledge async request storage
        this.hmrcVatAssistAcknowledgePostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatAssistAcknowledgePostAsyncRequestsTable",
                props.sharedNames().data.hmrcVatAssistAcknowledgePostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatAssistAcknowledgePostAsyncTTL",
                props.sharedNames().data.hmrcVatAssistAcknowledgePostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Assist acknowledge async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcVatAssistAcknowledgePostAsyncRequestsTableName);

        // HMRC ITSA Assist report async request storage
        this.hmrcItsaAssistReportPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaAssistReportPostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaAssistReportPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaAssistReportPostAsyncTTL",
                props.sharedNames().data.hmrcItsaAssistReportPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Assist report async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaAssistReportPostAsyncRequestsTableName);

        // HMRC ITSA Assist acknowledge async request storage
        this.hmrcItsaAssistAcknowledgePostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaAssistAcknowledgePostAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaAssistAcknowledgePostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaAssistAcknowledgePostAsyncTTL",
                props.sharedNames().data.hmrcItsaAssistAcknowledgePostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Assist acknowledge async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaAssistAcknowledgePostAsyncRequestsTableName);

        // HMRC ITSA losses and claims GET (retrieve) async request storage
        this.hmrcItsaLossesAndClaimsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaLossesAndClaimsGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaLossesAndClaimsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaLossesAndClaimsGetAsyncTTL",
                props.sharedNames().data.hmrcItsaLossesAndClaimsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA losses and claims GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaLossesAndClaimsGetAsyncRequestsTableName);

        // HMRC ITSA losses and claims PUT (create and amend) async request storage
        this.hmrcItsaLossesAndClaimsPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaLossesAndClaimsPutAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaLossesAndClaimsPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaLossesAndClaimsPutAsyncTTL",
                props.sharedNames().data.hmrcItsaLossesAndClaimsPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA losses and claims PUT async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaLossesAndClaimsPutAsyncRequestsTableName);

        // HMRC ITSA losses and claims DELETE async request storage
        this.hmrcItsaLossesAndClaimsDeleteAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaLossesAndClaimsDeleteAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaLossesAndClaimsDeleteAsyncTTL",
                props.sharedNames().data.hmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA losses and claims DELETE async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName);

        // HMRC ITSA tax liability adjustments GET (retrieve) async request storage
        this.hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaTaxLiabilityAdjustmentsGetAsyncTTL",
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA tax liability adjustments GET async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName);

        // HMRC ITSA tax liability adjustments PUT (create and amend) async request storage
        this.hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaTaxLiabilityAdjustmentsPutAsyncTTL",
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA tax liability adjustments PUT async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName);

        // HMRC ITSA tax liability adjustments DELETE async request storage
        this.hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable",
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaTaxLiabilityAdjustmentsDeleteAsyncTTL",
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA tax liability adjustments DELETE async requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName);

        // Companies House accounts filing async request storage - the submission-number counter
        // allocateSubmissionNumber() increments also lives here, keyed apart from any real
        // request id.
        this.companiesHouseAccountsAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-CompaniesHouseAccountsAsyncRequestsTable",
                props.sharedNames().data.companiesHouseAccountsAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-CompaniesHouseAccountsAsyncTTL",
                props.sharedNames().data.companiesHouseAccountsAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured Companies House accounts async requests DynamoDB table with name %s",
                props.sharedNames().data.companiesHouseAccountsAsyncRequestsTableName);

        // HMRC API requests storage - audit trail for HMRC interactions
        // 28-day retention via TTL on "ttl" attribute
        this.hmrcApiRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcApiRequestsTable",
                props.sharedNames().data.hmrcApiRequestsTableName,
                "hashedSub",
                "id");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcApiRequestsTTL",
                props.sharedNames().data.hmrcApiRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC API Requests DynamoDB table with name %s",
                props.sharedNames().data.hmrcApiRequestsTableName);

        // Passes table for storing invitation pass codes
        // Pass codes are four-word passphrases that grant bundle access when redeemed.
        // PK-only table (no sort key) - passes are looked up by code.
        this.passesTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-PassesTable",
                props.sharedNames().data.passesTableName,
                "pk",
                null);
        infof("Ensured passes DynamoDB table with name %s", props.sharedNames().data.passesTableName);

        // GSI for querying passes by issuer (user-generated pass listing)
        ensureGlobalSecondaryIndex(
                this,
                props.resourceNamePrefix() + "-PassesIssuedByGSI",
                props.sharedNames().data.passesTableName,
                "issuedBy-index",
                "issuedBy",
                "createdAt",
                "ALL");
        infof("Ensured issuedBy-index GSI on passes table %s", props.sharedNames().data.passesTableName);

        String passesStreamArn =
                ensureTableStream(props.resourceNamePrefix() + "-Passes", props.sharedNames().data.passesTableName);

        // Bundle capacity counter table for tracking global cap enforcement
        // PK-only table (no sort key) - counters are looked up by bundleId.
        // Reconciliation Lambda overwrites with correct count every 5 minutes, so the bundles table
        // is the source of truth if this one is ever lost.
        this.bundleCapacityTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-BundleCapacityTable",
                props.sharedNames().data.bundleCapacityTableName,
                "bundleId",
                null);
        infof("Ensured bundle capacity DynamoDB table with name %s", props.sharedNames().data.bundleCapacityTableName);

        // Subscriptions table (subscription data)
        this.subscriptionsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-SubscriptionsTable",
                props.sharedNames().data.subscriptionsTableName,
                "pk",
                null);
        String subscriptionsStreamArn = ensureTableStream(
                props.resourceNamePrefix() + "-Subscriptions", props.sharedNames().data.subscriptionsTableName);
        infof("Ensured subscriptions DynamoDB table with name %s", props.sharedNames().data.subscriptionsTableName);

        // Activity charges table: one payment covers one filing. Partition key is the user's
        // hashed sub, sort key is "charge#{activityId}#{subjectKey}" (e.g. the confirmation
        // statement's company number and review date joined into one string). Kept separate from
        // the bundles table rather than a sort-key-prefixed row there: a charge is a different item
        // shape (no bundleId, no tokensGranted) and the bundles table's bundleId-expiry-index GSI
        // and getUserBundles() both assume every item under a hashedSub is a bundle.
        this.activityChargesTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-ActivityChargesTable",
                props.sharedNames().data.activityChargesTableName,
                "hashedSub",
                "chargeKey");
        infof(
                "Ensured activity charges DynamoDB table with name %s",
                props.sharedNames().data.activityChargesTableName);

        // Practice clients table: partition key is the practice's hashed sub, sort key is the
        // client's ULID. No index reads clientId on its own, so a client is reachable only
        // through the practice that owns it.
        this.practiceClientsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-PracticeClientsTable",
                props.sharedNames().data.practiceClientsTableName,
                "hashedSub",
                "clientId");
        infof(
                "Ensured practice clients DynamoDB table with name %s",
                props.sharedNames().data.practiceClientsTableName);

        // Commissions table: partition key names the owner of the item (commission#<referrerHash>,
        // held, charge#<chargeId>, card#<fingerprint>), sort key names the item within it. Pointer
        // items do the work of indexes, so the table has no secondary index.
        this.commissionsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-CommissionsTable",
                props.sharedNames().data.commissionsTableName,
                "pk",
                "sk");
        String commissionsStreamArn = ensureTableStream(
                props.resourceNamePrefix() + "-Commissions", props.sharedNames().data.commissionsTableName);
        infof("Ensured commissions DynamoDB table with name %s", props.sharedNames().data.commissionsTableName);

        // Security state table for issue #10 data-theft detection: bundle-endpoint burst
        // counters (rate#{hashedSub}#{minute}) and mid-session country-change state
        // (geo#{hashedSub}). PK-only table (no sort key) - both item shapes are looked up by
        // stateKey. Every item expires within an hour and none of it is customer data; ensureTable
        // still turns PITR on for it like every table.
        this.securityStateTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-SecurityStateTable",
                props.sharedNames().data.securityStateTableName,
                "stateKey",
                null);
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-SecurityStateTTL",
                props.sharedNames().data.securityStateTableName,
                "ttl");
        infof("Ensured security state DynamoDB table with name %s", props.sharedNames().data.securityStateTableName);

        // Alarm-issue lock table: one item per CloudWatch alarm state-change transition
        // (dedupeKey = "{alarmName}#{timestamp}"), written with a conditional put before
        // alarmToGithubIssue.js raises or comments on a GitHub issue. Env-scoped, shared by
        // every live deployment's alarm-to-GitHub-issue Lambda, so two deployments whose own
        // AlarmStateChangeRule both match the same environment-scoped alarm (see
        // AlarmStateChangeDelivery's javadoc) race on the same conditional write instead of
        // each raising its own issue. PK-only; every item expires within days and none of it
        // is customer data, though ensureTable still turns PITR on for it like every table.
        this.alarmIssueLockTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-AlarmIssueLockTable",
                props.sharedNames().data.alarmIssueLockTableName,
                "dedupeKey",
                null);
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-AlarmIssueLockTTL",
                props.sharedNames().data.alarmIssueLockTableName,
                "ttl");
        infof("Ensured alarm-issue lock DynamoDB table with name %s", props.sharedNames().data.alarmIssueLockTableName);

        // Hosted MCP sessions: one item per Mcp-Session-Id holding the owner's hashedSub and the
        // open cloud book pointer. PK-only; items expire 24 hours after their last write.
        this.mcpSessionsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-McpSessionsTable",
                props.sharedNames().data.mcpSessionsTableName,
                "sessionId",
                null);
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-McpSessionsTTL",
                props.sharedNames().data.mcpSessionsTableName,
                "ttl");
        infof("Ensured MCP sessions DynamoDB table with name %s", props.sharedNames().data.mcpSessionsTableName);

        // DIYA-GL bucket: one zip-in-S3 store per environment for the paid diya-gl storage tier.
        // Versioned so AWS Backup for S3 can cover it and a bad metadata write has a prior version;
        // noncurrent versions expire after 30 days rather than being kept forever.
        this.diyaGlBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-DiyaGl")
                .bucketName(props.sharedNames().data.diyaGlBucketName)
                .encryption(BucketEncryption.S3_MANAGED)
                .blockPublicAccess(BlockPublicAccess.BLOCK_ALL)
                .enforceSsl(true)
                .versioned(true)
                .removalPolicy(RemovalPolicy.DESTROY)
                .autoDeleteObjects(true)
                .lifecycleRules(List.of(
                        LifecycleRule.builder()
                                .id("abort-incomplete-uploads")
                                .abortIncompleteMultipartUploadAfter(Duration.days(1))
                                .build(),
                        LifecycleRule.builder()
                                .id("expire-noncurrent-versions")
                                .noncurrentVersionExpiration(Duration.days(30))
                                .build(),
                        LifecycleRule.builder()
                                .id("expire-sandbox")
                                .tagFilters(Map.of("retention", "sandbox"))
                                .expiration(Duration.days(37))
                                .noncurrentVersionExpiration(Duration.days(1))
                                .build()))
                .build();
        infof("Ensured diya-gl bucket with name %s", props.sharedNames().data.diyaGlBucketName);

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
        cfnOutput(
                this,
                "HmrcVatLiabilitiesGetAsyncRequestsTableName",
                this.hmrcVatLiabilitiesGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcVatLiabilitiesGetAsyncRequestsTableArn",
                this.hmrcVatLiabilitiesGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcVatPaymentsGetAsyncRequestsTableName",
                this.hmrcVatPaymentsGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcVatPaymentsGetAsyncRequestsTableArn",
                this.hmrcVatPaymentsGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcVatPenaltiesGetAsyncRequestsTableName",
                this.hmrcVatPenaltiesGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcVatPenaltiesGetAsyncRequestsTableArn",
                this.hmrcVatPenaltiesGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaBusinessDetailsGetAsyncRequestsTableName",
                this.hmrcItsaBusinessDetailsGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaBusinessDetailsGetAsyncRequestsTableArn",
                this.hmrcItsaBusinessDetailsGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaObligationsGetAsyncRequestsTableName",
                this.hmrcItsaObligationsGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaObligationsGetAsyncRequestsTableArn",
                this.hmrcItsaObligationsGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName",
                this.hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableArn",
                this.hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName",
                this.hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableArn",
                this.hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName",
                this.hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableArn",
                this.hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName",
                this.hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableArn",
                this.hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyPeriodPostAsyncRequestsTableName",
                this.hmrcItsaUkPropertyPeriodPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyPeriodPostAsyncRequestsTableArn",
                this.hmrcItsaUkPropertyPeriodPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName",
                this.hmrcItsaUkPropertyPeriodsGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyPeriodsGetAsyncRequestsTableArn",
                this.hmrcItsaUkPropertyPeriodsGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyPeriodGetAsyncRequestsTableName",
                this.hmrcItsaUkPropertyPeriodGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyPeriodGetAsyncRequestsTableArn",
                this.hmrcItsaUkPropertyPeriodGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyPeriodPutAsyncRequestsTableName",
                this.hmrcItsaUkPropertyPeriodPutAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyPeriodPutAsyncRequestsTableArn",
                this.hmrcItsaUkPropertyPeriodPutAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyAnnualGetAsyncRequestsTableName",
                this.hmrcItsaUkPropertyAnnualGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyAnnualGetAsyncRequestsTableArn",
                this.hmrcItsaUkPropertyAnnualGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyAnnualPutAsyncRequestsTableName",
                this.hmrcItsaUkPropertyAnnualPutAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaUkPropertyAnnualPutAsyncRequestsTableArn",
                this.hmrcItsaUkPropertyAnnualPutAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyPeriodPostAsyncRequestsTableName",
                this.hmrcItsaForeignPropertyPeriodPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyPeriodPostAsyncRequestsTableArn",
                this.hmrcItsaForeignPropertyPeriodPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyPeriodGetAsyncRequestsTableName",
                this.hmrcItsaForeignPropertyPeriodGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyPeriodGetAsyncRequestsTableArn",
                this.hmrcItsaForeignPropertyPeriodGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyPeriodPutAsyncRequestsTableName",
                this.hmrcItsaForeignPropertyPeriodPutAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyPeriodPutAsyncRequestsTableArn",
                this.hmrcItsaForeignPropertyPeriodPutAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyAnnualGetAsyncRequestsTableName",
                this.hmrcItsaForeignPropertyAnnualGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyAnnualGetAsyncRequestsTableArn",
                this.hmrcItsaForeignPropertyAnnualGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyAnnualPutAsyncRequestsTableName",
                this.hmrcItsaForeignPropertyAnnualPutAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyAnnualPutAsyncRequestsTableArn",
                this.hmrcItsaForeignPropertyAnnualPutAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyDetailsGetAsyncRequestsTableName",
                this.hmrcItsaForeignPropertyDetailsGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyDetailsGetAsyncRequestsTableArn",
                this.hmrcItsaForeignPropertyDetailsGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyDetailsPostAsyncRequestsTableName",
                this.hmrcItsaForeignPropertyDetailsPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyDetailsPostAsyncRequestsTableArn",
                this.hmrcItsaForeignPropertyDetailsPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyDetailsPutAsyncRequestsTableName",
                this.hmrcItsaForeignPropertyDetailsPutAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaForeignPropertyDetailsPutAsyncRequestsTableArn",
                this.hmrcItsaForeignPropertyDetailsPutAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName",
                this.hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableArn",
                this.hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName",
                this.hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableArn",
                this.hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaCrystallisationObligationsGetAsyncRequestsTableName",
                this.hmrcItsaCrystallisationObligationsGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaCrystallisationObligationsGetAsyncRequestsTableArn",
                this.hmrcItsaCrystallisationObligationsGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaStatusGetAsyncRequestsTableName",
                this.hmrcItsaStatusGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this, "HmrcItsaStatusGetAsyncRequestsTableArn", this.hmrcItsaStatusGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaBsasTriggerPostAsyncRequestsTableName",
                this.hmrcItsaBsasTriggerPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaBsasTriggerPostAsyncRequestsTableArn",
                this.hmrcItsaBsasTriggerPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName",
                this.hmrcItsaBsasSelfEmploymentGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaBsasSelfEmploymentGetAsyncRequestsTableArn",
                this.hmrcItsaBsasSelfEmploymentGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName",
                this.hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableArn",
                this.hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaBsasUkPropertyGetAsyncRequestsTableName",
                this.hmrcItsaBsasUkPropertyGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaBsasUkPropertyGetAsyncRequestsTableArn",
                this.hmrcItsaBsasUkPropertyGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName",
                this.hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableArn",
                this.hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaBsasForeignPropertyGetAsyncRequestsTableName",
                this.hmrcItsaBsasForeignPropertyGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaBsasForeignPropertyGetAsyncRequestsTableArn",
                this.hmrcItsaBsasForeignPropertyGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTableName",
                this.hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTableArn",
                this.hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaCalculationTriggerPostAsyncRequestsTableName",
                this.hmrcItsaCalculationTriggerPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaCalculationTriggerPostAsyncRequestsTableArn",
                this.hmrcItsaCalculationTriggerPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaCalculationGetAsyncRequestsTableName",
                this.hmrcItsaCalculationGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaCalculationGetAsyncRequestsTableArn",
                this.hmrcItsaCalculationGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaFinalDeclarationPostAsyncRequestsTableName",
                this.hmrcItsaFinalDeclarationPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaFinalDeclarationPostAsyncRequestsTableArn",
                this.hmrcItsaFinalDeclarationPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcVatAssistReportPostAsyncRequestsTableName",
                this.hmrcVatAssistReportPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcVatAssistReportPostAsyncRequestsTableArn",
                this.hmrcVatAssistReportPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcVatAssistAcknowledgePostAsyncRequestsTableName",
                this.hmrcVatAssistAcknowledgePostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcVatAssistAcknowledgePostAsyncRequestsTableArn",
                this.hmrcVatAssistAcknowledgePostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaAssistReportPostAsyncRequestsTableName",
                this.hmrcItsaAssistReportPostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaAssistReportPostAsyncRequestsTableArn",
                this.hmrcItsaAssistReportPostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaAssistAcknowledgePostAsyncRequestsTableName",
                this.hmrcItsaAssistAcknowledgePostAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaAssistAcknowledgePostAsyncRequestsTableArn",
                this.hmrcItsaAssistAcknowledgePostAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaLossesAndClaimsGetAsyncRequestsTableName",
                this.hmrcItsaLossesAndClaimsGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaLossesAndClaimsGetAsyncRequestsTableArn",
                this.hmrcItsaLossesAndClaimsGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaLossesAndClaimsPutAsyncRequestsTableName",
                this.hmrcItsaLossesAndClaimsPutAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaLossesAndClaimsPutAsyncRequestsTableArn",
                this.hmrcItsaLossesAndClaimsPutAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName",
                this.hmrcItsaLossesAndClaimsDeleteAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaLossesAndClaimsDeleteAsyncRequestsTableArn",
                this.hmrcItsaLossesAndClaimsDeleteAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName",
                this.hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableArn",
                this.hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName",
                this.hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableArn",
                this.hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "HmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName",
                this.hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "HmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableArn",
                this.hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTable.getTableArn());
        cfnOutput(
                this,
                "CompaniesHouseAccountsAsyncRequestsTableName",
                this.companiesHouseAccountsAsyncRequestsTable.getTableName());
        cfnOutput(
                this,
                "CompaniesHouseAccountsAsyncRequestsTableArn",
                this.companiesHouseAccountsAsyncRequestsTable.getTableArn());
        cfnOutput(this, "HmrcApiRequestsTableName", this.hmrcApiRequestsTable.getTableName());
        cfnOutput(this, "HmrcApiRequestsArn", this.hmrcApiRequestsTable.getTableArn());
        cfnOutput(this, "PassesTableName", this.passesTable.getTableName());
        cfnOutput(this, "PassesTableArn", this.passesTable.getTableArn());
        cfnOutput(this, "PassesTableStreamArn", passesStreamArn);
        cfnOutput(this, "BundleCapacityTableName", this.bundleCapacityTable.getTableName());
        cfnOutput(this, "BundleCapacityTableArn", this.bundleCapacityTable.getTableArn());
        cfnOutput(this, "SubscriptionsTableName", this.subscriptionsTable.getTableName());
        cfnOutput(this, "SubscriptionsTableArn", this.subscriptionsTable.getTableArn());
        cfnOutput(this, "PracticeClientsTableName", this.practiceClientsTable.getTableName());
        cfnOutput(this, "PracticeClientsTableArn", this.practiceClientsTable.getTableArn());
        cfnOutput(this, "CommissionsTableName", this.commissionsTable.getTableName());
        cfnOutput(this, "CommissionsTableArn", this.commissionsTable.getTableArn());
        cfnOutput(this, "CommissionsTableStreamArn", commissionsStreamArn);
        cfnOutput(this, "SubscriptionsTableStreamArn", subscriptionsStreamArn);
        cfnOutput(this, "ActivityChargesTableName", this.activityChargesTable.getTableName());
        cfnOutput(this, "ActivityChargesTableArn", this.activityChargesTable.getTableArn());
        cfnOutput(this, "SecurityStateTableName", this.securityStateTable.getTableName());
        cfnOutput(this, "SecurityStateTableArn", this.securityStateTable.getTableArn());
        cfnOutput(this, "AlarmIssueLockTableName", this.alarmIssueLockTable.getTableName());
        cfnOutput(this, "AlarmIssueLockTableArn", this.alarmIssueLockTable.getTableArn());
        cfnOutput(this, "McpSessionsTableName", this.mcpSessionsTable.getTableName());
        cfnOutput(this, "McpSessionsTableArn", this.mcpSessionsTable.getTableArn());
        cfnOutput(this, "DiyaGlBucketName", this.diyaGlBucket.getBucketName());

        // KMS key for encrypting salt backup stored in DynamoDB (Path 3 recovery).
        // Used by migration 003 to encrypt the passphrase salt as a system#config item.
        // Must move to submit-backup account during account separation.
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
