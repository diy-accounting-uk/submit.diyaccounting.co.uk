/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureGlobalSecondaryIndex;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureStream;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureTable;
import static co.uk.diyaccounting.submit.utils.KindCdk.ensureTimeToLive;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import java.util.List;
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
    public Bucket booksBucket;
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
    public ITable hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable;
    public ITable hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable;
    public ITable hmrcItsaCrystallisationObligationsGetAsyncRequestsTable;
    public ITable hmrcItsaStatusGetAsyncRequestsTable;
    public ITable hmrcItsaBsasTriggerPostAsyncRequestsTable;
    public ITable hmrcItsaBsasSelfEmploymentGetAsyncRequestsTable;
    public ITable hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable;
    public ITable hmrcItsaCalculationTriggerPostAsyncRequestsTable;
    public ITable hmrcItsaCalculationGetAsyncRequestsTable;
    public ITable hmrcItsaFinalDeclarationPostAsyncRequestsTable;
    public ITable companiesHouseAccountsAsyncRequestsTable;
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
        String receiptsStreamArn =
                ensureTableStream(props.resourceNamePrefix() + "-Receipts", props.sharedNames().receiptsTableName);
        ensureTimeToLive(
                this, props.resourceNamePrefix() + "-ReceiptsTTL", props.sharedNames().receiptsTableName, "ttl");
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
        // GSI for counting live allocations of a capped bundle without scanning the table.
        // Sparse: an item with no expiry carries no index entry, which matches the count the
        // capacity reconciliation needs. KEYS_ONLY because the query only ever asks for a count.
        ensureGlobalSecondaryIndex(
                this,
                props.resourceNamePrefix() + "-BundlesBundleIdExpiryGSI",
                props.sharedNames().bundlesTableName,
                "bundleId-expiry-index",
                "bundleId",
                "expiry",
                "KEYS_ONLY");
        infof("Ensured bundleId-expiry-index GSI on bundles table %s", props.sharedNames().bundlesTableName);
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

        // HMRC VAT Liabilities GET async request storage
        this.hmrcVatLiabilitiesGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatLiabilitiesGetAsyncRequestsTable",
                props.sharedNames().hmrcVatLiabilitiesGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatLiabilitiesGetAsyncTTL",
                props.sharedNames().hmrcVatLiabilitiesGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Liabilities GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcVatLiabilitiesGetAsyncRequestsTableName);

        // HMRC VAT Payments GET async request storage
        this.hmrcVatPaymentsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatPaymentsGetAsyncRequestsTable",
                props.sharedNames().hmrcVatPaymentsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatPaymentsGetAsyncTTL",
                props.sharedNames().hmrcVatPaymentsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Payments GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcVatPaymentsGetAsyncRequestsTableName);

        // HMRC VAT Penalties GET async request storage
        this.hmrcVatPenaltiesGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcVatPenaltiesGetAsyncRequestsTable",
                props.sharedNames().hmrcVatPenaltiesGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcVatPenaltiesGetAsyncTTL",
                props.sharedNames().hmrcVatPenaltiesGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC VAT Penalties GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcVatPenaltiesGetAsyncRequestsTableName);

        // HMRC ITSA Business Details GET async request storage
        this.hmrcItsaBusinessDetailsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBusinessDetailsGetAsyncRequestsTable",
                props.sharedNames().hmrcItsaBusinessDetailsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBusinessDetailsGetAsyncTTL",
                props.sharedNames().hmrcItsaBusinessDetailsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Business Details GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaBusinessDetailsGetAsyncRequestsTableName);

        // HMRC ITSA Obligations GET async request storage
        this.hmrcItsaObligationsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaObligationsGetAsyncRequestsTable",
                props.sharedNames().hmrcItsaObligationsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaObligationsGetAsyncTTL",
                props.sharedNames().hmrcItsaObligationsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Obligations GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaObligationsGetAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Period POST async request storage
        this.hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodPostAsyncRequestsTable",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodPostAsyncTTL",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Period POST async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Periods GET (list) async request storage
        this.hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTable",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodsGetAsyncTTL",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Periods GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Period GET (retrieve one) async request storage
        this.hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodGetAsyncRequestsTable",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodGetAsyncTTL",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Period GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Period PUT (amend) async request storage
        this.hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodPutAsyncRequestsTable",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentPeriodPutAsyncTTL",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Period PUT async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Annual GET (retrieve) async request storage
        this.hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentAnnualGetAsyncRequestsTable",
                props.sharedNames().hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentAnnualGetAsyncTTL",
                props.sharedNames().hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Annual GET async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName);

        // HMRC ITSA Self-Employment Annual PUT (create and amend) async request storage
        this.hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentAnnualPutAsyncRequestsTable",
                props.sharedNames().hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaSelfEmploymentAnnualPutAsyncTTL",
                props.sharedNames().hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA Self-Employment Annual PUT async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName);

        // HMRC ITSA final declaration (crystallisation) obligations async request storage
        this.hmrcItsaCrystallisationObligationsGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCrystallisationObligationsGetAsyncRequestsTable",
                props.sharedNames().hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCrystallisationObligationsGetAsyncTTL",
                props.sharedNames().hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA crystallisation obligations async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName);

        // HMRC ITSA status async request storage
        this.hmrcItsaStatusGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaStatusGetAsyncRequestsTable",
                props.sharedNames().hmrcItsaStatusGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaStatusGetAsyncTTL",
                props.sharedNames().hmrcItsaStatusGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA status async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaStatusGetAsyncRequestsTableName);

        // HMRC ITSA business source adjustable summary trigger async request storage
        this.hmrcItsaBsasTriggerPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasTriggerPostAsyncRequestsTable",
                props.sharedNames().hmrcItsaBsasTriggerPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasTriggerPostAsyncTTL",
                props.sharedNames().hmrcItsaBsasTriggerPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA BSAS trigger async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaBsasTriggerPostAsyncRequestsTableName);

        // HMRC ITSA business source adjustable summary (self-employment) retrieve async request storage
        this.hmrcItsaBsasSelfEmploymentGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasSelfEmploymentGetAsyncRequestsTable",
                props.sharedNames().hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasSelfEmploymentGetAsyncTTL",
                props.sharedNames().hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA BSAS self-employment retrieve async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName);

        // HMRC ITSA business source adjustable summary (self-employment) adjust async request storage
        this.hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTable",
                props.sharedNames().hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaBsasSelfEmploymentAdjustPostAsyncTTL",
                props.sharedNames().hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA BSAS self-employment adjust async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName);

        // HMRC ITSA tax calculation trigger async request storage
        this.hmrcItsaCalculationTriggerPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCalculationTriggerPostAsyncRequestsTable",
                props.sharedNames().hmrcItsaCalculationTriggerPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCalculationTriggerPostAsyncTTL",
                props.sharedNames().hmrcItsaCalculationTriggerPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA calculation trigger async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaCalculationTriggerPostAsyncRequestsTableName);

        // HMRC ITSA tax calculation retrieve async request storage
        this.hmrcItsaCalculationGetAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCalculationGetAsyncRequestsTable",
                props.sharedNames().hmrcItsaCalculationGetAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaCalculationGetAsyncTTL",
                props.sharedNames().hmrcItsaCalculationGetAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA calculation retrieve async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaCalculationGetAsyncRequestsTableName);

        // HMRC ITSA final declaration async request storage
        this.hmrcItsaFinalDeclarationPostAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-HmrcItsaFinalDeclarationPostAsyncRequestsTable",
                props.sharedNames().hmrcItsaFinalDeclarationPostAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-HmrcItsaFinalDeclarationPostAsyncTTL",
                props.sharedNames().hmrcItsaFinalDeclarationPostAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured HMRC ITSA final declaration async requests DynamoDB table with name %s",
                props.sharedNames().hmrcItsaFinalDeclarationPostAsyncRequestsTableName);

        // Companies House accounts filing async request storage - the submission-number counter
        // allocateSubmissionNumber() increments also lives here, keyed apart from any real
        // request id.
        this.companiesHouseAccountsAsyncRequestsTable = ensureTable(
                this,
                props.resourceNamePrefix() + "-CompaniesHouseAccountsAsyncRequestsTable",
                props.sharedNames().companiesHouseAccountsAsyncRequestsTableName,
                "hashedSub",
                "requestId");
        ensureTimeToLive(
                this,
                props.resourceNamePrefix() + "-CompaniesHouseAccountsAsyncTTL",
                props.sharedNames().companiesHouseAccountsAsyncRequestsTableName,
                "ttl");
        infof(
                "Ensured Companies House accounts async requests DynamoDB table with name %s",
                props.sharedNames().companiesHouseAccountsAsyncRequestsTableName);

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
                "createdAt",
                "ALL");
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

        // Books bucket: one zip-in-S3 store per environment for the paid diya-gl storage tier.
        // Versioned so AWS Backup for S3 can cover it and a bad metadata write has a prior version;
        // noncurrent versions expire after 30 days rather than being kept forever.
        this.booksBucket = Bucket.Builder.create(this, props.resourceNamePrefix() + "-Books")
                .bucketName(props.sharedNames().booksBucketName)
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
                                .build()))
                .build();
        infof("Ensured books bucket with name %s", props.sharedNames().booksBucketName);

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
                this,
                "HmrcItsaStatusGetAsyncRequestsTableArn",
                this.hmrcItsaStatusGetAsyncRequestsTable.getTableArn());
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
        cfnOutput(this, "SubscriptionsTableStreamArn", subscriptionsStreamArn);
        cfnOutput(this, "SecurityStateTableName", this.securityStateTable.getTableName());
        cfnOutput(this, "SecurityStateTableArn", this.securityStateTable.getTableArn());
        cfnOutput(this, "BooksBucketName", this.booksBucket.getBucketName());

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
