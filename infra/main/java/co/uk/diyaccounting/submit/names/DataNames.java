/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;

public class DataNames {

    public String receiptsTableName;
    public String bundlesTableName;
    // TODO: Move async table names to LambdaNames
    public String bundlePostAsyncRequestsTableName;
    public String bundleDeleteAsyncRequestsTableName;
    public String hmrcVatReturnPostAsyncRequestsTableName;
    public String hmrcVatReturnGetAsyncRequestsTableName;
    public String hmrcVatObligationGetAsyncRequestsTableName;
    public String hmrcVatLiabilitiesGetAsyncRequestsTableName;
    public String hmrcVatPaymentsGetAsyncRequestsTableName;
    public String hmrcVatPenaltiesGetAsyncRequestsTableName;
    public String hmrcItsaBusinessDetailsGetAsyncRequestsTableName;
    public String hmrcItsaObligationsGetAsyncRequestsTableName;
    public String hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName;
    public String hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName;
    public String hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName;
    public String hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName;
    public String hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName;
    public String hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName;
    public String hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName;
    public String hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName;
    public String hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName;
    public String hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName;
    public String hmrcItsaForeignPropertyPeriodPostAsyncRequestsTableName;
    public String hmrcItsaForeignPropertyPeriodGetAsyncRequestsTableName;
    public String hmrcItsaForeignPropertyPeriodPutAsyncRequestsTableName;
    public String hmrcItsaForeignPropertyAnnualGetAsyncRequestsTableName;
    public String hmrcItsaForeignPropertyAnnualPutAsyncRequestsTableName;
    public String hmrcItsaForeignPropertyDetailsGetAsyncRequestsTableName;
    public String hmrcItsaForeignPropertyDetailsPostAsyncRequestsTableName;
    public String hmrcItsaForeignPropertyDetailsPutAsyncRequestsTableName;
    public String hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName;
    public String hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName;
    public String hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName;
    public String hmrcItsaStatusGetAsyncRequestsTableName;
    public String hmrcItsaBsasTriggerPostAsyncRequestsTableName;
    public String hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName;
    public String hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName;
    public String hmrcItsaBsasUkPropertyGetAsyncRequestsTableName;
    public String hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName;
    public String hmrcItsaBsasForeignPropertyGetAsyncRequestsTableName;
    public String hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTableName;
    public String hmrcItsaCalculationTriggerPostAsyncRequestsTableName;
    public String hmrcItsaCalculationGetAsyncRequestsTableName;
    public String hmrcItsaFinalDeclarationPostAsyncRequestsTableName;
    public String hmrcVatAssistReportPostAsyncRequestsTableName;
    public String hmrcVatAssistAcknowledgePostAsyncRequestsTableName;
    public String hmrcItsaAssistReportPostAsyncRequestsTableName;
    public String hmrcItsaAssistAcknowledgePostAsyncRequestsTableName;
    public String hmrcItsaLossesAndClaimsGetAsyncRequestsTableName;
    public String hmrcItsaLossesAndClaimsPutAsyncRequestsTableName;
    public String hmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName;
    public String hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName;
    public String hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName;
    public String hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName;
    public String companiesHouseAccountsAsyncRequestsTableName;
    public String hmrcApiRequestsTableName;
    public String passesTableName;
    public String bundleCapacityTableName;
    public String subscriptionsTableName;
    public String activityChargesTableName;
    public String practiceClientsTableName;
    public String commissionsTableName;
    public String securityStateTableName;
    public String alarmIssueLockTableName;
    public String mcpSessionsTableName;
    public String diyaGlBucketName;

    public DataNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {

        this.receiptsTableName = "%s-receipts".formatted(root.envResourceNamePrefix);
        this.bundlesTableName = "%s-bundles".formatted(root.envResourceNamePrefix);
        this.bundlePostAsyncRequestsTableName = "%s-bundle-post-async-requests".formatted(root.envResourceNamePrefix);
        this.bundleDeleteAsyncRequestsTableName =
                "%s-bundle-delete-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcVatReturnPostAsyncRequestsTableName =
                "%s-hmrc-vat-return-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcVatReturnGetAsyncRequestsTableName =
                "%s-hmrc-vat-return-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcVatObligationGetAsyncRequestsTableName =
                "%s-hmrc-vat-obligation-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcVatLiabilitiesGetAsyncRequestsTableName =
                "%s-hmrc-vat-liabilities-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcVatPaymentsGetAsyncRequestsTableName =
                "%s-hmrc-vat-payments-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcVatPenaltiesGetAsyncRequestsTableName =
                "%s-hmrc-vat-penalties-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaBusinessDetailsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-business-details-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaObligationsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-obligations-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-period-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-periods-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-period-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-period-put-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-period-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-periods-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-period-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-period-put-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-annual-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-annual-put-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaForeignPropertyPeriodPostAsyncRequestsTableName =
                "%s-hmrc-itsa-foreign-property-period-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaForeignPropertyPeriodGetAsyncRequestsTableName =
                "%s-hmrc-itsa-foreign-property-period-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaForeignPropertyPeriodPutAsyncRequestsTableName =
                "%s-hmrc-itsa-foreign-property-period-put-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaForeignPropertyAnnualGetAsyncRequestsTableName =
                "%s-hmrc-itsa-foreign-property-annual-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaForeignPropertyAnnualPutAsyncRequestsTableName =
                "%s-hmrc-itsa-foreign-property-annual-put-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaForeignPropertyDetailsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-foreign-property-details-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaForeignPropertyDetailsPostAsyncRequestsTableName =
                "%s-hmrc-itsa-foreign-property-details-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaForeignPropertyDetailsPutAsyncRequestsTableName =
                "%s-hmrc-itsa-foreign-property-details-put-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-annual-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-annual-put-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-crystallisation-obligations-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaStatusGetAsyncRequestsTableName =
                "%s-hmrc-itsa-status-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaBsasTriggerPostAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-trigger-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-self-employment-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-self-employment-adjust-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaBsasUkPropertyGetAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-uk-property-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-uk-property-adjust-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaBsasForeignPropertyGetAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-foreign-property-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-foreign-property-adjust-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaCalculationTriggerPostAsyncRequestsTableName =
                "%s-hmrc-itsa-calculation-trigger-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaCalculationGetAsyncRequestsTableName =
                "%s-hmrc-itsa-calculation-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaFinalDeclarationPostAsyncRequestsTableName =
                "%s-hmrc-itsa-final-declaration-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcVatAssistReportPostAsyncRequestsTableName =
                "%s-hmrc-vat-assist-report-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcVatAssistAcknowledgePostAsyncRequestsTableName =
                "%s-hmrc-vat-assist-acknowledge-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaAssistReportPostAsyncRequestsTableName =
                "%s-hmrc-itsa-assist-report-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaAssistAcknowledgePostAsyncRequestsTableName =
                "%s-hmrc-itsa-assist-acknowledge-post-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaLossesAndClaimsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-losses-and-claims-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaLossesAndClaimsPutAsyncRequestsTableName =
                "%s-hmrc-itsa-losses-and-claims-put-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaLossesAndClaimsDeleteAsyncRequestsTableName =
                "%s-hmrc-itsa-losses-and-claims-delete-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaTaxLiabilityAdjustmentsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-tax-liability-adjustments-get-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaTaxLiabilityAdjustmentsPutAsyncRequestsTableName =
                "%s-hmrc-itsa-tax-liability-adjustments-put-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcItsaTaxLiabilityAdjustmentsDeleteAsyncRequestsTableName =
                "%s-hmrc-itsa-tax-liability-adjustments-delete-async-requests".formatted(root.envResourceNamePrefix);
        this.companiesHouseAccountsAsyncRequestsTableName =
                "%s-companies-house-accounts-async-requests".formatted(root.envResourceNamePrefix);
        this.hmrcApiRequestsTableName = "%s-hmrc-api-requests".formatted(root.envResourceNamePrefix);
        this.passesTableName = "%s-passes".formatted(root.envResourceNamePrefix);
        this.bundleCapacityTableName = "%s-bundle-capacity".formatted(root.envResourceNamePrefix);
        this.subscriptionsTableName = "%s-subscriptions".formatted(root.envResourceNamePrefix);
        this.activityChargesTableName = "%s-activity-charges".formatted(root.envResourceNamePrefix);
        this.practiceClientsTableName = "%s-practice-clients".formatted(root.envResourceNamePrefix);
        this.commissionsTableName = "%s-commissions".formatted(root.envResourceNamePrefix);
        this.securityStateTableName = "%s-security-state".formatted(root.envResourceNamePrefix);
        this.alarmIssueLockTableName = "%s-alarm-issue-locks".formatted(root.envResourceNamePrefix);
        this.mcpSessionsTableName = "%s-mcp-sessions".formatted(root.envResourceNamePrefix);
        this.diyaGlBucketName = "%s-diya-gl-%s".formatted(root.envResourceNamePrefix, props.awsAccount);
    }
}
