/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.SubmitSharedNames.ApiParameter;
import co.uk.diyaccounting.submit.SubmitSharedNames.PublishedLambda;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import java.util.List;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public class HmrcNames {

    public String hmrcTokenPostIngestLambdaHandler;
    public String hmrcTokenPostIngestLambdaFunctionName;
    public String hmrcTokenPostIngestLambdaArn;
    public String hmrcTokenPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod hmrcTokenPostLambdaHttpMethod;
    public String hmrcTokenPostLambdaUrlPath;
    public boolean hmrcTokenPostLambdaJwtAuthorizer;
    public boolean hmrcTokenPostLambdaCustomAuthorizer;

    public String hmrcVatReturnPostIngestLambdaHandler;
    public String hmrcVatReturnPostIngestLambdaFunctionName;
    public String hmrcVatReturnPostIngestLambdaArn;
    public String hmrcVatReturnPostIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatReturnPostWorkerLambdaHandler;
    public String hmrcVatReturnPostWorkerLambdaFunctionName;
    public String hmrcVatReturnPostWorkerLambdaArn;
    public String hmrcVatReturnPostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatReturnPostLambdaQueueName;
    public String hmrcVatReturnPostLambdaDeadLetterQueueName;
    public HttpMethod hmrcVatReturnPostLambdaHttpMethod;
    public String hmrcVatReturnPostLambdaUrlPath;
    public boolean hmrcVatReturnPostLambdaJwtAuthorizer;
    public boolean hmrcVatReturnPostLambdaCustomAuthorizer;

    public String hmrcVatObligationGetIngestLambdaHandler;
    public String hmrcVatObligationGetIngestLambdaFunctionName;
    public String hmrcVatObligationGetIngestLambdaArn;
    public String hmrcVatObligationGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatObligationGetWorkerLambdaHandler;
    public String hmrcVatObligationGetWorkerLambdaFunctionName;
    public String hmrcVatObligationGetWorkerLambdaArn;
    public String hmrcVatObligationGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatObligationGetLambdaQueueName;
    public String hmrcVatObligationGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcVatObligationGetLambdaHttpMethod;
    public String hmrcVatObligationGetLambdaUrlPath;
    public boolean hmrcVatObligationGetLambdaJwtAuthorizer;
    public boolean hmrcVatObligationGetLambdaCustomAuthorizer;

    public String hmrcVatLiabilitiesGetIngestLambdaHandler;
    public String hmrcVatLiabilitiesGetIngestLambdaFunctionName;
    public String hmrcVatLiabilitiesGetIngestLambdaArn;
    public String hmrcVatLiabilitiesGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatLiabilitiesGetWorkerLambdaHandler;
    public String hmrcVatLiabilitiesGetWorkerLambdaFunctionName;
    public String hmrcVatLiabilitiesGetWorkerLambdaArn;
    public String hmrcVatLiabilitiesGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatLiabilitiesGetLambdaQueueName;
    public String hmrcVatLiabilitiesGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcVatLiabilitiesGetLambdaHttpMethod;
    public String hmrcVatLiabilitiesGetLambdaUrlPath;
    public boolean hmrcVatLiabilitiesGetLambdaJwtAuthorizer;
    public boolean hmrcVatLiabilitiesGetLambdaCustomAuthorizer;

    public String hmrcVatPaymentsGetIngestLambdaHandler;
    public String hmrcVatPaymentsGetIngestLambdaFunctionName;
    public String hmrcVatPaymentsGetIngestLambdaArn;
    public String hmrcVatPaymentsGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatPaymentsGetWorkerLambdaHandler;
    public String hmrcVatPaymentsGetWorkerLambdaFunctionName;
    public String hmrcVatPaymentsGetWorkerLambdaArn;
    public String hmrcVatPaymentsGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatPaymentsGetLambdaQueueName;
    public String hmrcVatPaymentsGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcVatPaymentsGetLambdaHttpMethod;
    public String hmrcVatPaymentsGetLambdaUrlPath;
    public boolean hmrcVatPaymentsGetLambdaJwtAuthorizer;
    public boolean hmrcVatPaymentsGetLambdaCustomAuthorizer;

    public String hmrcVatPenaltiesGetIngestLambdaHandler;
    public String hmrcVatPenaltiesGetIngestLambdaFunctionName;
    public String hmrcVatPenaltiesGetIngestLambdaArn;
    public String hmrcVatPenaltiesGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatPenaltiesGetWorkerLambdaHandler;
    public String hmrcVatPenaltiesGetWorkerLambdaFunctionName;
    public String hmrcVatPenaltiesGetWorkerLambdaArn;
    public String hmrcVatPenaltiesGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatPenaltiesGetLambdaQueueName;
    public String hmrcVatPenaltiesGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcVatPenaltiesGetLambdaHttpMethod;
    public String hmrcVatPenaltiesGetLambdaUrlPath;
    public boolean hmrcVatPenaltiesGetLambdaJwtAuthorizer;
    public boolean hmrcVatPenaltiesGetLambdaCustomAuthorizer;

    public String hmrcVatReturnGetIngestLambdaHandler;
    public String hmrcVatReturnGetIngestLambdaFunctionName;
    public String hmrcVatReturnGetIngestLambdaArn;
    public String hmrcVatReturnGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatReturnGetWorkerLambdaHandler;
    public String hmrcVatReturnGetWorkerLambdaFunctionName;
    public String hmrcVatReturnGetWorkerLambdaArn;
    public String hmrcVatReturnGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcVatReturnGetLambdaQueueName;
    public String hmrcVatReturnGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcVatReturnGetLambdaHttpMethod;
    public String hmrcVatReturnGetLambdaUrlPath;
    public boolean hmrcVatReturnGetLambdaJwtAuthorizer;
    public boolean hmrcVatReturnGetLambdaCustomAuthorizer;

    public String hmrcItsaBusinessDetailsGetIngestLambdaHandler;
    public String hmrcItsaBusinessDetailsGetIngestLambdaFunctionName;
    public String hmrcItsaBusinessDetailsGetIngestLambdaArn;
    public String hmrcItsaBusinessDetailsGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBusinessDetailsGetWorkerLambdaHandler;
    public String hmrcItsaBusinessDetailsGetWorkerLambdaFunctionName;
    public String hmrcItsaBusinessDetailsGetWorkerLambdaArn;
    public String hmrcItsaBusinessDetailsGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBusinessDetailsGetLambdaQueueName;
    public String hmrcItsaBusinessDetailsGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaBusinessDetailsGetLambdaHttpMethod;
    public String hmrcItsaBusinessDetailsGetLambdaUrlPath;
    public boolean hmrcItsaBusinessDetailsGetLambdaJwtAuthorizer;
    public boolean hmrcItsaBusinessDetailsGetLambdaCustomAuthorizer;

    public String hmrcItsaObligationsGetIngestLambdaHandler;
    public String hmrcItsaObligationsGetIngestLambdaFunctionName;
    public String hmrcItsaObligationsGetIngestLambdaArn;
    public String hmrcItsaObligationsGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaObligationsGetWorkerLambdaHandler;
    public String hmrcItsaObligationsGetWorkerLambdaFunctionName;
    public String hmrcItsaObligationsGetWorkerLambdaArn;
    public String hmrcItsaObligationsGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaObligationsGetLambdaQueueName;
    public String hmrcItsaObligationsGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaObligationsGetLambdaHttpMethod;
    public String hmrcItsaObligationsGetLambdaUrlPath;
    public boolean hmrcItsaObligationsGetLambdaJwtAuthorizer;
    public boolean hmrcItsaObligationsGetLambdaCustomAuthorizer;

    public String hmrcItsaSelfEmploymentPeriodPostIngestLambdaHandler;
    public String hmrcItsaSelfEmploymentPeriodPostIngestLambdaFunctionName;
    public String hmrcItsaSelfEmploymentPeriodPostIngestLambdaArn;
    public String hmrcItsaSelfEmploymentPeriodPostIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentPeriodPostWorkerLambdaHandler;
    public String hmrcItsaSelfEmploymentPeriodPostWorkerLambdaFunctionName;
    public String hmrcItsaSelfEmploymentPeriodPostWorkerLambdaArn;
    public String hmrcItsaSelfEmploymentPeriodPostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentPeriodPostLambdaQueueName;
    public String hmrcItsaSelfEmploymentPeriodPostLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaSelfEmploymentPeriodPostLambdaHttpMethod;
    public String hmrcItsaSelfEmploymentPeriodPostLambdaUrlPath;
    public boolean hmrcItsaSelfEmploymentPeriodPostLambdaJwtAuthorizer;
    public boolean hmrcItsaSelfEmploymentPeriodPostLambdaCustomAuthorizer;

    public String hmrcItsaSelfEmploymentPeriodsGetIngestLambdaHandler;
    public String hmrcItsaSelfEmploymentPeriodsGetIngestLambdaFunctionName;
    public String hmrcItsaSelfEmploymentPeriodsGetIngestLambdaArn;
    public String hmrcItsaSelfEmploymentPeriodsGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaHandler;
    public String hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaFunctionName;
    public String hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaArn;
    public String hmrcItsaSelfEmploymentPeriodsGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentPeriodsGetLambdaQueueName;
    public String hmrcItsaSelfEmploymentPeriodsGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaSelfEmploymentPeriodsGetLambdaHttpMethod;
    public String hmrcItsaSelfEmploymentPeriodsGetLambdaUrlPath;
    public boolean hmrcItsaSelfEmploymentPeriodsGetLambdaJwtAuthorizer;
    public boolean hmrcItsaSelfEmploymentPeriodsGetLambdaCustomAuthorizer;

    public String hmrcItsaSelfEmploymentPeriodGetIngestLambdaHandler;
    public String hmrcItsaSelfEmploymentPeriodGetIngestLambdaFunctionName;
    public String hmrcItsaSelfEmploymentPeriodGetIngestLambdaArn;
    public String hmrcItsaSelfEmploymentPeriodGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentPeriodGetWorkerLambdaHandler;
    public String hmrcItsaSelfEmploymentPeriodGetWorkerLambdaFunctionName;
    public String hmrcItsaSelfEmploymentPeriodGetWorkerLambdaArn;
    public String hmrcItsaSelfEmploymentPeriodGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentPeriodGetLambdaQueueName;
    public String hmrcItsaSelfEmploymentPeriodGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaSelfEmploymentPeriodGetLambdaHttpMethod;
    public String hmrcItsaSelfEmploymentPeriodGetLambdaUrlPath;
    public boolean hmrcItsaSelfEmploymentPeriodGetLambdaJwtAuthorizer;
    public boolean hmrcItsaSelfEmploymentPeriodGetLambdaCustomAuthorizer;

    public String hmrcItsaSelfEmploymentPeriodPutIngestLambdaHandler;
    public String hmrcItsaSelfEmploymentPeriodPutIngestLambdaFunctionName;
    public String hmrcItsaSelfEmploymentPeriodPutIngestLambdaArn;
    public String hmrcItsaSelfEmploymentPeriodPutIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentPeriodPutWorkerLambdaHandler;
    public String hmrcItsaSelfEmploymentPeriodPutWorkerLambdaFunctionName;
    public String hmrcItsaSelfEmploymentPeriodPutWorkerLambdaArn;
    public String hmrcItsaSelfEmploymentPeriodPutWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentPeriodPutLambdaQueueName;
    public String hmrcItsaSelfEmploymentPeriodPutLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaSelfEmploymentPeriodPutLambdaHttpMethod;
    public String hmrcItsaSelfEmploymentPeriodPutLambdaUrlPath;
    public boolean hmrcItsaSelfEmploymentPeriodPutLambdaJwtAuthorizer;
    public boolean hmrcItsaSelfEmploymentPeriodPutLambdaCustomAuthorizer;

    public String hmrcItsaSelfEmploymentAnnualGetIngestLambdaHandler;
    public String hmrcItsaSelfEmploymentAnnualGetIngestLambdaFunctionName;
    public String hmrcItsaSelfEmploymentAnnualGetIngestLambdaArn;
    public String hmrcItsaSelfEmploymentAnnualGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentAnnualGetWorkerLambdaHandler;
    public String hmrcItsaSelfEmploymentAnnualGetWorkerLambdaFunctionName;
    public String hmrcItsaSelfEmploymentAnnualGetWorkerLambdaArn;
    public String hmrcItsaSelfEmploymentAnnualGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentAnnualGetLambdaQueueName;
    public String hmrcItsaSelfEmploymentAnnualGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaSelfEmploymentAnnualGetLambdaHttpMethod;
    public String hmrcItsaSelfEmploymentAnnualGetLambdaUrlPath;
    public boolean hmrcItsaSelfEmploymentAnnualGetLambdaJwtAuthorizer;
    public boolean hmrcItsaSelfEmploymentAnnualGetLambdaCustomAuthorizer;

    public String hmrcItsaSelfEmploymentAnnualPutIngestLambdaHandler;
    public String hmrcItsaSelfEmploymentAnnualPutIngestLambdaFunctionName;
    public String hmrcItsaSelfEmploymentAnnualPutIngestLambdaArn;
    public String hmrcItsaSelfEmploymentAnnualPutIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentAnnualPutWorkerLambdaHandler;
    public String hmrcItsaSelfEmploymentAnnualPutWorkerLambdaFunctionName;
    public String hmrcItsaSelfEmploymentAnnualPutWorkerLambdaArn;
    public String hmrcItsaSelfEmploymentAnnualPutWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaSelfEmploymentAnnualPutLambdaQueueName;
    public String hmrcItsaSelfEmploymentAnnualPutLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaSelfEmploymentAnnualPutLambdaHttpMethod;
    public String hmrcItsaSelfEmploymentAnnualPutLambdaUrlPath;
    public boolean hmrcItsaSelfEmploymentAnnualPutLambdaJwtAuthorizer;
    public boolean hmrcItsaSelfEmploymentAnnualPutLambdaCustomAuthorizer;

    public String hmrcItsaCrystallisationObligationsGetIngestLambdaHandler;
    public String hmrcItsaCrystallisationObligationsGetIngestLambdaFunctionName;
    public String hmrcItsaCrystallisationObligationsGetIngestLambdaArn;
    public String hmrcItsaCrystallisationObligationsGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaCrystallisationObligationsGetWorkerLambdaHandler;
    public String hmrcItsaCrystallisationObligationsGetWorkerLambdaFunctionName;
    public String hmrcItsaCrystallisationObligationsGetWorkerLambdaArn;
    public String hmrcItsaCrystallisationObligationsGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaCrystallisationObligationsGetLambdaQueueName;
    public String hmrcItsaCrystallisationObligationsGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaCrystallisationObligationsGetLambdaHttpMethod;
    public String hmrcItsaCrystallisationObligationsGetLambdaUrlPath;
    public boolean hmrcItsaCrystallisationObligationsGetLambdaJwtAuthorizer;
    public boolean hmrcItsaCrystallisationObligationsGetLambdaCustomAuthorizer;

    public String hmrcItsaStatusGetIngestLambdaHandler;
    public String hmrcItsaStatusGetIngestLambdaFunctionName;
    public String hmrcItsaStatusGetIngestLambdaArn;
    public String hmrcItsaStatusGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaStatusGetWorkerLambdaHandler;
    public String hmrcItsaStatusGetWorkerLambdaFunctionName;
    public String hmrcItsaStatusGetWorkerLambdaArn;
    public String hmrcItsaStatusGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaStatusGetLambdaQueueName;
    public String hmrcItsaStatusGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaStatusGetLambdaHttpMethod;
    public String hmrcItsaStatusGetLambdaUrlPath;
    public boolean hmrcItsaStatusGetLambdaJwtAuthorizer;
    public boolean hmrcItsaStatusGetLambdaCustomAuthorizer;

    public String hmrcItsaBsasTriggerPostIngestLambdaHandler;
    public String hmrcItsaBsasTriggerPostIngestLambdaFunctionName;
    public String hmrcItsaBsasTriggerPostIngestLambdaArn;
    public String hmrcItsaBsasTriggerPostIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasTriggerPostWorkerLambdaHandler;
    public String hmrcItsaBsasTriggerPostWorkerLambdaFunctionName;
    public String hmrcItsaBsasTriggerPostWorkerLambdaArn;
    public String hmrcItsaBsasTriggerPostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasTriggerPostLambdaQueueName;
    public String hmrcItsaBsasTriggerPostLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaBsasTriggerPostLambdaHttpMethod;
    public String hmrcItsaBsasTriggerPostLambdaUrlPath;
    public boolean hmrcItsaBsasTriggerPostLambdaJwtAuthorizer;
    public boolean hmrcItsaBsasTriggerPostLambdaCustomAuthorizer;

    public String hmrcItsaBsasSelfEmploymentGetIngestLambdaHandler;
    public String hmrcItsaBsasSelfEmploymentGetIngestLambdaFunctionName;
    public String hmrcItsaBsasSelfEmploymentGetIngestLambdaArn;
    public String hmrcItsaBsasSelfEmploymentGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasSelfEmploymentGetWorkerLambdaHandler;
    public String hmrcItsaBsasSelfEmploymentGetWorkerLambdaFunctionName;
    public String hmrcItsaBsasSelfEmploymentGetWorkerLambdaArn;
    public String hmrcItsaBsasSelfEmploymentGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasSelfEmploymentGetLambdaQueueName;
    public String hmrcItsaBsasSelfEmploymentGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaBsasSelfEmploymentGetLambdaHttpMethod;
    public String hmrcItsaBsasSelfEmploymentGetLambdaUrlPath;
    public boolean hmrcItsaBsasSelfEmploymentGetLambdaJwtAuthorizer;
    public boolean hmrcItsaBsasSelfEmploymentGetLambdaCustomAuthorizer;

    public String hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaHandler;
    public String hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaFunctionName;
    public String hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaArn;
    public String hmrcItsaBsasSelfEmploymentAdjustPostIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaHandler;
    public String hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaFunctionName;
    public String hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaArn;
    public String hmrcItsaBsasSelfEmploymentAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasSelfEmploymentAdjustPostLambdaQueueName;
    public String hmrcItsaBsasSelfEmploymentAdjustPostLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaBsasSelfEmploymentAdjustPostLambdaHttpMethod;
    public String hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlPath;
    public boolean hmrcItsaBsasSelfEmploymentAdjustPostLambdaJwtAuthorizer;
    public boolean hmrcItsaBsasSelfEmploymentAdjustPostLambdaCustomAuthorizer;

    public String hmrcItsaCalculationTriggerPostIngestLambdaHandler;
    public String hmrcItsaCalculationTriggerPostIngestLambdaFunctionName;
    public String hmrcItsaCalculationTriggerPostIngestLambdaArn;
    public String hmrcItsaCalculationTriggerPostIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaCalculationTriggerPostWorkerLambdaHandler;
    public String hmrcItsaCalculationTriggerPostWorkerLambdaFunctionName;
    public String hmrcItsaCalculationTriggerPostWorkerLambdaArn;
    public String hmrcItsaCalculationTriggerPostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaCalculationTriggerPostLambdaQueueName;
    public String hmrcItsaCalculationTriggerPostLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaCalculationTriggerPostLambdaHttpMethod;
    public String hmrcItsaCalculationTriggerPostLambdaUrlPath;
    public boolean hmrcItsaCalculationTriggerPostLambdaJwtAuthorizer;
    public boolean hmrcItsaCalculationTriggerPostLambdaCustomAuthorizer;

    public String hmrcItsaCalculationGetIngestLambdaHandler;
    public String hmrcItsaCalculationGetIngestLambdaFunctionName;
    public String hmrcItsaCalculationGetIngestLambdaArn;
    public String hmrcItsaCalculationGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaCalculationGetWorkerLambdaHandler;
    public String hmrcItsaCalculationGetWorkerLambdaFunctionName;
    public String hmrcItsaCalculationGetWorkerLambdaArn;
    public String hmrcItsaCalculationGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaCalculationGetLambdaQueueName;
    public String hmrcItsaCalculationGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaCalculationGetLambdaHttpMethod;
    public String hmrcItsaCalculationGetLambdaUrlPath;
    public boolean hmrcItsaCalculationGetLambdaJwtAuthorizer;
    public boolean hmrcItsaCalculationGetLambdaCustomAuthorizer;

    public String hmrcItsaFinalDeclarationPostIngestLambdaHandler;
    public String hmrcItsaFinalDeclarationPostIngestLambdaFunctionName;
    public String hmrcItsaFinalDeclarationPostIngestLambdaArn;
    public String hmrcItsaFinalDeclarationPostIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaFinalDeclarationPostWorkerLambdaHandler;
    public String hmrcItsaFinalDeclarationPostWorkerLambdaFunctionName;
    public String hmrcItsaFinalDeclarationPostWorkerLambdaArn;
    public String hmrcItsaFinalDeclarationPostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaFinalDeclarationPostLambdaQueueName;
    public String hmrcItsaFinalDeclarationPostLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaFinalDeclarationPostLambdaHttpMethod;
    public String hmrcItsaFinalDeclarationPostLambdaUrlPath;
    public boolean hmrcItsaFinalDeclarationPostLambdaJwtAuthorizer;
    public boolean hmrcItsaFinalDeclarationPostLambdaCustomAuthorizer;

    public String receiptGetIngestLambdaHandler;
    public String receiptGetIngestLambdaFunctionName;
    public String receiptGetIngestLambdaArn;
    public String receiptGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod receiptGetLambdaHttpMethod;
    public String receiptGetLambdaUrlPath;
    public String receiptGetByNameLambdaUrlPath;
    public boolean receiptGetLambdaJwtAuthorizer;
    public boolean receiptGetLambdaCustomAuthorizer;

    public HmrcNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {

        this.hmrcTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcTokenPostLambdaUrlPath = "/api/v1/hmrc/token";
        this.hmrcTokenPostLambdaJwtAuthorizer = true;
        this.hmrcTokenPostLambdaCustomAuthorizer = false;
        var hmrcTokenPostLambdaHandlerName = "hmrcTokenPost.ingestHandler";
        var hmrcTokenPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcTokenPostLambdaHandlerName);
        this.hmrcTokenPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcTokenPostLambdaHandlerDashed);
        this.hmrcTokenPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcTokenPostLambdaHandlerName);
        this.hmrcTokenPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcTokenPostLambdaHandlerDashed);
        this.hmrcTokenPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcTokenPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcTokenPostLambdaHttpMethod,
                this.hmrcTokenPostLambdaUrlPath,
                "Exchange HMRC authorization code for access token",
                "Exchanges an HMRC authorization code for an access token",
                "exchangeHmrcToken"));

        this.hmrcVatReturnPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcVatReturnPostLambdaUrlPath = "/api/v1/hmrc/vat/return";
        this.hmrcVatReturnPostLambdaJwtAuthorizer = false;
        this.hmrcVatReturnPostLambdaCustomAuthorizer = true;
        var hmrcVatReturnPostLambdaHandlerName = "hmrcVatReturnPost.ingestHandler";
        var hmrcVatReturnPostLambdaWorkerHandlerName = "hmrcVatReturnPost.workerHandler";
        var hmrcVatReturnPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatReturnPostLambdaHandlerName);
        this.hmrcVatReturnPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcVatReturnPostLambdaHandlerDashed);
        this.hmrcVatReturnPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatReturnPostLambdaHandlerName);
        this.hmrcVatReturnPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcVatReturnPostLambdaHandlerDashed);
        this.hmrcVatReturnPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatReturnPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatReturnPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatReturnPostIngestLambdaFunctionName);
        this.hmrcVatReturnPostWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatReturnPostLambdaWorkerHandlerName);
        this.hmrcVatReturnPostWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatReturnPostIngestLambdaArn);
        this.hmrcVatReturnPostWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatReturnPostWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatReturnPostLambdaQueueName = "%s-queue".formatted(this.hmrcVatReturnPostIngestLambdaFunctionName);
        this.hmrcVatReturnPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatReturnPostIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcVatReturnPostLambdaHttpMethod,
                this.hmrcVatReturnPostLambdaUrlPath,
                "Submit VAT return to HMRC",
                "Submits a VAT return to HMRC on behalf of the authenticated user",
                "submitVatReturn",
                List.of(
                        new ApiParameter("Gov-Test-Scenario", "header", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcVatObligationGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatObligationGetLambdaUrlPath = "/api/v1/hmrc/vat/obligation";
        this.hmrcVatObligationGetLambdaJwtAuthorizer = false;
        this.hmrcVatObligationGetLambdaCustomAuthorizer = true;
        var hmrcVatObligationGetLambdaHandlerName = "hmrcVatObligationGet.ingestHandler";
        var hmrcVatObligationGetLambdaWorkerHandlerName = "hmrcVatObligationGet.workerHandler";
        var hmrcVatObligationGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatObligationGetLambdaHandlerName);
        this.hmrcVatObligationGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcVatObligationGetLambdaHandlerDashed);
        this.hmrcVatObligationGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatObligationGetLambdaHandlerName);
        this.hmrcVatObligationGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcVatObligationGetLambdaHandlerDashed);
        this.hmrcVatObligationGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatObligationGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatObligationGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatObligationGetIngestLambdaFunctionName);
        this.hmrcVatObligationGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatObligationGetLambdaWorkerHandlerName);
        this.hmrcVatObligationGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatObligationGetIngestLambdaArn);
        this.hmrcVatObligationGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatObligationGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatObligationGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcVatObligationGetIngestLambdaFunctionName);
        this.hmrcVatObligationGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatObligationGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcVatObligationGetLambdaHttpMethod,
                this.hmrcVatObligationGetLambdaUrlPath,
                "Get VAT obligations from HMRC",
                "Retrieves VAT obligations from HMRC for the authenticated user",
                "getVatObligations",
                List.of(
                        new ApiParameter("vrn", "query", true, "VAT registration number (9 digits)"),
                        new ApiParameter("from", "query", false, "From date in YYYY-MM-DD format"),
                        new ApiParameter("to", "query", false, "To date in YYYY-MM-DD format"),
                        new ApiParameter("status", "query", false, "Obligation status: O (Open) or F (Fulfilled)"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcVatLiabilitiesGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatLiabilitiesGetLambdaUrlPath = "/api/v1/hmrc/vat/liability";
        this.hmrcVatLiabilitiesGetLambdaJwtAuthorizer = false;
        this.hmrcVatLiabilitiesGetLambdaCustomAuthorizer = true;
        var hmrcVatLiabilitiesGetLambdaHandlerName = "hmrcVatLiabilitiesGet.ingestHandler";
        var hmrcVatLiabilitiesGetLambdaWorkerHandlerName = "hmrcVatLiabilitiesGet.workerHandler";
        var hmrcVatLiabilitiesGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatLiabilitiesGetLambdaHandlerName);
        this.hmrcVatLiabilitiesGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcVatLiabilitiesGetLambdaHandlerDashed);
        this.hmrcVatLiabilitiesGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatLiabilitiesGetLambdaHandlerName);
        this.hmrcVatLiabilitiesGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcVatLiabilitiesGetLambdaHandlerDashed);
        this.hmrcVatLiabilitiesGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatLiabilitiesGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatLiabilitiesGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatLiabilitiesGetIngestLambdaFunctionName);
        this.hmrcVatLiabilitiesGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatLiabilitiesGetLambdaWorkerHandlerName);
        this.hmrcVatLiabilitiesGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatLiabilitiesGetIngestLambdaArn);
        this.hmrcVatLiabilitiesGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatLiabilitiesGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatLiabilitiesGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcVatLiabilitiesGetIngestLambdaFunctionName);
        this.hmrcVatLiabilitiesGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatLiabilitiesGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcVatLiabilitiesGetLambdaHttpMethod,
                this.hmrcVatLiabilitiesGetLambdaUrlPath,
                "Get VAT liabilities from HMRC",
                "Retrieves VAT liabilities from HMRC for the authenticated user",
                "getVatLiabilities",
                List.of(
                        new ApiParameter("vrn", "query", true, "VAT registration number (9 digits)"),
                        new ApiParameter("from", "query", false, "From date in YYYY-MM-DD format"),
                        new ApiParameter("to", "query", false, "To date in YYYY-MM-DD format"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcVatPaymentsGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatPaymentsGetLambdaUrlPath = "/api/v1/hmrc/vat/payment";
        this.hmrcVatPaymentsGetLambdaJwtAuthorizer = false;
        this.hmrcVatPaymentsGetLambdaCustomAuthorizer = true;
        var hmrcVatPaymentsGetLambdaHandlerName = "hmrcVatPaymentsGet.ingestHandler";
        var hmrcVatPaymentsGetLambdaWorkerHandlerName = "hmrcVatPaymentsGet.workerHandler";
        var hmrcVatPaymentsGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatPaymentsGetLambdaHandlerName);
        this.hmrcVatPaymentsGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcVatPaymentsGetLambdaHandlerDashed);
        this.hmrcVatPaymentsGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatPaymentsGetLambdaHandlerName);
        this.hmrcVatPaymentsGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcVatPaymentsGetLambdaHandlerDashed);
        this.hmrcVatPaymentsGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatPaymentsGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatPaymentsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatPaymentsGetIngestLambdaFunctionName);
        this.hmrcVatPaymentsGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatPaymentsGetLambdaWorkerHandlerName);
        this.hmrcVatPaymentsGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatPaymentsGetIngestLambdaArn);
        this.hmrcVatPaymentsGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatPaymentsGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatPaymentsGetLambdaQueueName = "%s-queue".formatted(this.hmrcVatPaymentsGetIngestLambdaFunctionName);
        this.hmrcVatPaymentsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatPaymentsGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcVatPaymentsGetLambdaHttpMethod,
                this.hmrcVatPaymentsGetLambdaUrlPath,
                "Get VAT payments from HMRC",
                "Retrieves VAT payments from HMRC for the authenticated user",
                "getVatPayments",
                List.of(
                        new ApiParameter("vrn", "query", true, "VAT registration number (9 digits)"),
                        new ApiParameter("from", "query", false, "From date in YYYY-MM-DD format"),
                        new ApiParameter("to", "query", false, "To date in YYYY-MM-DD format"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcVatPenaltiesGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcVatPenaltiesGetLambdaUrlPath = "/api/v1/hmrc/vat/penalty";
        this.hmrcVatPenaltiesGetLambdaJwtAuthorizer = false;
        this.hmrcVatPenaltiesGetLambdaCustomAuthorizer = true;
        var hmrcVatPenaltiesGetLambdaHandlerName = "hmrcVatPenaltiesGet.ingestHandler";
        var hmrcVatPenaltiesGetLambdaWorkerHandlerName = "hmrcVatPenaltiesGet.workerHandler";
        var hmrcVatPenaltiesGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatPenaltiesGetLambdaHandlerName);
        this.hmrcVatPenaltiesGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcVatPenaltiesGetLambdaHandlerDashed);
        this.hmrcVatPenaltiesGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatPenaltiesGetLambdaHandlerName);
        this.hmrcVatPenaltiesGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcVatPenaltiesGetLambdaHandlerDashed);
        this.hmrcVatPenaltiesGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatPenaltiesGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatPenaltiesGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatPenaltiesGetIngestLambdaFunctionName);
        this.hmrcVatPenaltiesGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatPenaltiesGetLambdaWorkerHandlerName);
        this.hmrcVatPenaltiesGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatPenaltiesGetIngestLambdaArn);
        this.hmrcVatPenaltiesGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatPenaltiesGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatPenaltiesGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcVatPenaltiesGetIngestLambdaFunctionName);
        this.hmrcVatPenaltiesGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatPenaltiesGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcVatPenaltiesGetLambdaHttpMethod,
                this.hmrcVatPenaltiesGetLambdaUrlPath,
                "Get VAT penalties from HMRC",
                "Retrieves VAT penalties from HMRC for the authenticated user",
                "getVatPenalties",
                List.of(
                        new ApiParameter("vrn", "query", true, "VAT registration number (9 digits)"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcVatReturnGetLambdaHttpMethod = HttpMethod.GET;
        // Note: Uses query params (vrn, periodStart, periodEnd), not path parameter
        // Must match Express server route in app/functions/hmrc/hmrcVatReturnGet.js
        this.hmrcVatReturnGetLambdaUrlPath = "/api/v1/hmrc/vat/return";
        this.hmrcVatReturnGetLambdaJwtAuthorizer = false;
        this.hmrcVatReturnGetLambdaCustomAuthorizer = true;
        var hmrcVatReturnGetLambdaHandlerName = "hmrcVatReturnGet.ingestHandler";
        var hmrcVatReturnGetLambdaWorkerHandlerName = "hmrcVatReturnGet.workerHandler";
        var hmrcVatReturnGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcVatReturnGetLambdaHandlerName);
        this.hmrcVatReturnGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcVatReturnGetLambdaHandlerDashed);
        this.hmrcVatReturnGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatReturnGetLambdaHandlerName);
        this.hmrcVatReturnGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcVatReturnGetLambdaHandlerDashed);
        this.hmrcVatReturnGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatReturnGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatReturnGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatReturnGetIngestLambdaFunctionName);
        this.hmrcVatReturnGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcVatReturnGetLambdaWorkerHandlerName);
        this.hmrcVatReturnGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatReturnGetIngestLambdaArn);
        this.hmrcVatReturnGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatReturnGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcVatReturnGetLambdaQueueName = "%s-queue".formatted(this.hmrcVatReturnGetIngestLambdaFunctionName);
        this.hmrcVatReturnGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatReturnGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcVatReturnGetLambdaHttpMethod,
                this.hmrcVatReturnGetLambdaUrlPath,
                "Get submitted VAT returns from HMRC",
                "Retrieves previously submitted VAT returns from HMRC for the authenticated user",
                "getVatReturns",
                List.of(
                        new ApiParameter("periodKey", "path", true, "The VAT period key to retrieve"),
                        new ApiParameter("vrn", "query", true, "VAT registration number (9 digits)"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaBusinessDetailsGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaBusinessDetailsGetLambdaUrlPath = "/api/v1/hmrc/itsa/business/details";
        this.hmrcItsaBusinessDetailsGetLambdaJwtAuthorizer = false;
        this.hmrcItsaBusinessDetailsGetLambdaCustomAuthorizer = true;
        var hmrcItsaBusinessDetailsGetLambdaHandlerName = "hmrcItsaBusinessDetailsGet.ingestHandler";
        var hmrcItsaBusinessDetailsGetLambdaWorkerHandlerName = "hmrcItsaBusinessDetailsGet.workerHandler";
        var hmrcItsaBusinessDetailsGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaBusinessDetailsGetLambdaHandlerName);
        this.hmrcItsaBusinessDetailsGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaBusinessDetailsGetLambdaHandlerDashed);
        this.hmrcItsaBusinessDetailsGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaBusinessDetailsGetLambdaHandlerName);
        this.hmrcItsaBusinessDetailsGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaBusinessDetailsGetLambdaHandlerDashed);
        this.hmrcItsaBusinessDetailsGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaBusinessDetailsGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaBusinessDetailsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBusinessDetailsGetIngestLambdaFunctionName);
        this.hmrcItsaBusinessDetailsGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaBusinessDetailsGetLambdaWorkerHandlerName);
        this.hmrcItsaBusinessDetailsGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBusinessDetailsGetIngestLambdaArn);
        this.hmrcItsaBusinessDetailsGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaBusinessDetailsGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaBusinessDetailsGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBusinessDetailsGetIngestLambdaFunctionName);
        this.hmrcItsaBusinessDetailsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBusinessDetailsGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaBusinessDetailsGetLambdaHttpMethod,
                this.hmrcItsaBusinessDetailsGetLambdaUrlPath,
                "Get ITSA business details from HMRC",
                "Retrieves the authenticated user's self-employment and property business list from HMRC, "
                        + "including the businessId every other ITSA endpoint needs",
                "getItsaBusinessDetails",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaObligationsGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaObligationsGetLambdaUrlPath = "/api/v1/hmrc/itsa/obligations";
        this.hmrcItsaObligationsGetLambdaJwtAuthorizer = false;
        this.hmrcItsaObligationsGetLambdaCustomAuthorizer = true;
        var hmrcItsaObligationsGetLambdaHandlerName = "hmrcItsaObligationsGet.ingestHandler";
        var hmrcItsaObligationsGetLambdaWorkerHandlerName = "hmrcItsaObligationsGet.workerHandler";
        var hmrcItsaObligationsGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaObligationsGetLambdaHandlerName);
        this.hmrcItsaObligationsGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaObligationsGetLambdaHandlerDashed);
        this.hmrcItsaObligationsGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaObligationsGetLambdaHandlerName);
        this.hmrcItsaObligationsGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaObligationsGetLambdaHandlerDashed);
        this.hmrcItsaObligationsGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaObligationsGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaObligationsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaObligationsGetIngestLambdaFunctionName);
        this.hmrcItsaObligationsGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaObligationsGetLambdaWorkerHandlerName);
        this.hmrcItsaObligationsGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcItsaObligationsGetIngestLambdaArn);
        this.hmrcItsaObligationsGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaObligationsGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaObligationsGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaObligationsGetIngestLambdaFunctionName);
        this.hmrcItsaObligationsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaObligationsGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaObligationsGetLambdaHttpMethod,
                this.hmrcItsaObligationsGetLambdaUrlPath,
                "Get ITSA obligations from HMRC",
                "Retrieves the authenticated user's quarterly update obligations for a self-employment, "
                        + "UK property or foreign property business",
                "getItsaObligations",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter(
                                "typeOfBusiness",
                                "query",
                                false,
                                "One of self-employment, uk-property, foreign-property"),
                        new ApiParameter("businessId", "query", false, "The business id from Business Details"),
                        new ApiParameter("fromDate", "query", false, "Start of the date range, format YYYY-MM-DD"),
                        new ApiParameter("toDate", "query", false, "End of the date range, format YYYY-MM-DD"),
                        new ApiParameter("status", "query", false, "One of open, fulfilled"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaSelfEmploymentPeriodPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcItsaSelfEmploymentPeriodPostLambdaUrlPath = "/api/v1/hmrc/itsa/self-employment/period";
        this.hmrcItsaSelfEmploymentPeriodPostLambdaJwtAuthorizer = false;
        this.hmrcItsaSelfEmploymentPeriodPostLambdaCustomAuthorizer = true;
        var hmrcItsaSelfEmploymentPeriodPostLambdaHandlerName = "hmrcItsaSelfEmploymentPeriodPost.ingestHandler";
        var hmrcItsaSelfEmploymentPeriodPostLambdaWorkerHandlerName = "hmrcItsaSelfEmploymentPeriodPost.workerHandler";
        // AWS Lambda function names cap at 64 characters. The full dashed handler name (with
        // the resource name prefix and the "-worker" suffix) can push past that for a long
        // deployment name, so the deployed function name drops "self-employment" to "se" - the
        // handler entry point above keeps its full, self-documenting name. See the Companies
        // House registered-office-address Lambdas for the same pattern.
        var hmrcItsaSelfEmploymentPeriodPostLambdaHandlerDashed = "hmrc-itsa-se-period-post";
        this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaSelfEmploymentPeriodPostLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodPostLambdaHandlerName);
        this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaSelfEmploymentPeriodPostLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodPostLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaArn);
        this.hmrcItsaSelfEmploymentPeriodPostWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaSelfEmploymentPeriodPostLambdaHttpMethod,
                this.hmrcItsaSelfEmploymentPeriodPostLambdaUrlPath,
                "File an ITSA self-employment quarterly update",
                "Creates a self-employment period summary with HMRC for the given business and period",
                "postItsaSelfEmploymentPeriod",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("businessId", "body", true, "The business id from Business Details"),
                        new ApiParameter("periodStartDate", "body", true, "Start of the period, format YYYY-MM-DD"),
                        new ApiParameter("periodEndDate", "body", true, "End of the period, format YYYY-MM-DD"),
                        new ApiParameter("periodIncome", "body", false, "Income for the period"),
                        new ApiParameter("periodExpenses", "body", false, "Expenses for the period"),
                        new ApiParameter(
                                "periodDisallowableExpenses", "body", false, "Disallowable expenses for the period"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaSelfEmploymentPeriodsGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaSelfEmploymentPeriodsGetLambdaUrlPath = "/api/v1/hmrc/itsa/self-employment/periods";
        this.hmrcItsaSelfEmploymentPeriodsGetLambdaJwtAuthorizer = false;
        this.hmrcItsaSelfEmploymentPeriodsGetLambdaCustomAuthorizer = true;
        var hmrcItsaSelfEmploymentPeriodsGetLambdaHandlerName = "hmrcItsaSelfEmploymentPeriodsGet.ingestHandler";
        var hmrcItsaSelfEmploymentPeriodsGetLambdaWorkerHandlerName = "hmrcItsaSelfEmploymentPeriodsGet.workerHandler";
        // AWS Lambda function names cap at 64 characters - the deployed function name drops
        // "self-employment" to "se", the same shortening hmrcItsaSelfEmploymentPeriodPost uses.
        var hmrcItsaSelfEmploymentPeriodsGetLambdaHandlerDashed = "hmrc-itsa-se-periods-get";
        this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaSelfEmploymentPeriodsGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodsGetLambdaHandlerName);
        this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaSelfEmploymentPeriodsGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodsGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodsGetLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaArn);
        this.hmrcItsaSelfEmploymentPeriodsGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodsGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaSelfEmploymentPeriodsGetLambdaHttpMethod,
                this.hmrcItsaSelfEmploymentPeriodsGetLambdaUrlPath,
                "List ITSA self-employment period summaries",
                "Lists the cumulative period summaries filed for a self-employment business in a tax year",
                "getItsaSelfEmploymentPeriods",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter("businessId", "query", true, "The business id from Business Details"),
                        new ApiParameter("taxYear", "query", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaSelfEmploymentPeriodGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaSelfEmploymentPeriodGetLambdaUrlPath = "/api/v1/hmrc/itsa/self-employment/period";
        this.hmrcItsaSelfEmploymentPeriodGetLambdaJwtAuthorizer = false;
        this.hmrcItsaSelfEmploymentPeriodGetLambdaCustomAuthorizer = true;
        var hmrcItsaSelfEmploymentPeriodGetLambdaHandlerName = "hmrcItsaSelfEmploymentPeriodGet.ingestHandler";
        var hmrcItsaSelfEmploymentPeriodGetLambdaWorkerHandlerName = "hmrcItsaSelfEmploymentPeriodGet.workerHandler";
        // AWS Lambda function names cap at 64 characters - the deployed function name drops
        // "self-employment" to "se", the same shortening hmrcItsaSelfEmploymentPeriodPost uses.
        var hmrcItsaSelfEmploymentPeriodGetLambdaHandlerDashed = "hmrc-itsa-se-period-get";
        this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaSelfEmploymentPeriodGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodGetLambdaHandlerName);
        this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaSelfEmploymentPeriodGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodGetLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaArn);
        this.hmrcItsaSelfEmploymentPeriodGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaSelfEmploymentPeriodGetLambdaHttpMethod,
                this.hmrcItsaSelfEmploymentPeriodGetLambdaUrlPath,
                "Retrieve an ITSA self-employment period summary",
                "Retrieves one self-employment period summary by tax year and period id",
                "getItsaSelfEmploymentPeriod",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter("businessId", "query", true, "The business id from Business Details"),
                        new ApiParameter("taxYear", "query", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("periodId", "query", true, "The period id from a listed period summary"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaSelfEmploymentPeriodPutLambdaHttpMethod = HttpMethod.PUT;
        this.hmrcItsaSelfEmploymentPeriodPutLambdaUrlPath = "/api/v1/hmrc/itsa/self-employment/period";
        this.hmrcItsaSelfEmploymentPeriodPutLambdaJwtAuthorizer = false;
        this.hmrcItsaSelfEmploymentPeriodPutLambdaCustomAuthorizer = true;
        var hmrcItsaSelfEmploymentPeriodPutLambdaHandlerName = "hmrcItsaSelfEmploymentPeriodPut.ingestHandler";
        var hmrcItsaSelfEmploymentPeriodPutLambdaWorkerHandlerName = "hmrcItsaSelfEmploymentPeriodPut.workerHandler";
        // AWS Lambda function names cap at 64 characters - the deployed function name drops
        // "self-employment" to "se", the same shortening hmrcItsaSelfEmploymentPeriodPost uses.
        var hmrcItsaSelfEmploymentPeriodPutLambdaHandlerDashed = "hmrc-itsa-se-period-put";
        this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaSelfEmploymentPeriodPutLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodPutLambdaHandlerName);
        this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaSelfEmploymentPeriodPutLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodPutIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodPutLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaArn);
        this.hmrcItsaSelfEmploymentPeriodPutWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodPutLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodPutLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaSelfEmploymentPeriodPutLambdaHttpMethod,
                this.hmrcItsaSelfEmploymentPeriodPutLambdaUrlPath,
                "Amend an ITSA self-employment period summary",
                "Amends the income, expenses and disallowable expenses of an existing self-employment period summary",
                "putItsaSelfEmploymentPeriod",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("businessId", "body", true, "The business id from Business Details"),
                        new ApiParameter("taxYear", "body", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("periodId", "body", true, "The period id from a listed period summary"),
                        new ApiParameter("periodIncome", "body", false, "Income for the period"),
                        new ApiParameter("periodExpenses", "body", false, "Expenses for the period"),
                        new ApiParameter(
                                "periodDisallowableExpenses", "body", false, "Disallowable expenses for the period"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaSelfEmploymentAnnualGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaSelfEmploymentAnnualGetLambdaUrlPath = "/api/v1/hmrc/itsa/self-employment/annual";
        this.hmrcItsaSelfEmploymentAnnualGetLambdaJwtAuthorizer = false;
        this.hmrcItsaSelfEmploymentAnnualGetLambdaCustomAuthorizer = true;
        var hmrcItsaSelfEmploymentAnnualGetLambdaHandlerName = "hmrcItsaSelfEmploymentAnnualGet.ingestHandler";
        var hmrcItsaSelfEmploymentAnnualGetLambdaWorkerHandlerName = "hmrcItsaSelfEmploymentAnnualGet.workerHandler";
        // AWS Lambda function names cap at 64 characters - the deployed function name drops
        // "self-employment" to "se", the same shortening hmrcItsaSelfEmploymentPeriodPost uses.
        var hmrcItsaSelfEmploymentAnnualGetLambdaHandlerDashed = "hmrc-itsa-se-annual-get";
        this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaSelfEmploymentAnnualGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentAnnualGetLambdaHandlerName);
        this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaSelfEmploymentAnnualGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentAnnualGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentAnnualGetLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaArn);
        this.hmrcItsaSelfEmploymentAnnualGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentAnnualGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentAnnualGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaSelfEmploymentAnnualGetLambdaHttpMethod,
                this.hmrcItsaSelfEmploymentAnnualGetLambdaUrlPath,
                "Retrieve an ITSA self-employment annual submission",
                "Retrieves the adjustments, allowances and non-financials submitted for a tax year",
                "getItsaSelfEmploymentAnnual",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter("businessId", "query", true, "The business id from Business Details"),
                        new ApiParameter("taxYear", "query", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaSelfEmploymentAnnualPutLambdaHttpMethod = HttpMethod.PUT;
        this.hmrcItsaSelfEmploymentAnnualPutLambdaUrlPath = "/api/v1/hmrc/itsa/self-employment/annual";
        this.hmrcItsaSelfEmploymentAnnualPutLambdaJwtAuthorizer = false;
        this.hmrcItsaSelfEmploymentAnnualPutLambdaCustomAuthorizer = true;
        var hmrcItsaSelfEmploymentAnnualPutLambdaHandlerName = "hmrcItsaSelfEmploymentAnnualPut.ingestHandler";
        var hmrcItsaSelfEmploymentAnnualPutLambdaWorkerHandlerName = "hmrcItsaSelfEmploymentAnnualPut.workerHandler";
        // AWS Lambda function names cap at 64 characters - the deployed function name drops
        // "self-employment" to "se", the same shortening hmrcItsaSelfEmploymentPeriodPost uses.
        var hmrcItsaSelfEmploymentAnnualPutLambdaHandlerDashed = "hmrc-itsa-se-annual-put";
        this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaSelfEmploymentAnnualPutLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentAnnualPutLambdaHandlerName);
        this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaSelfEmploymentAnnualPutLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentAnnualPutIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaSelfEmploymentAnnualPutLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaArn);
        this.hmrcItsaSelfEmploymentAnnualPutWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentAnnualPutLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentAnnualPutLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaSelfEmploymentAnnualPutLambdaHttpMethod,
                this.hmrcItsaSelfEmploymentAnnualPutLambdaUrlPath,
                "Create or amend an ITSA self-employment annual submission",
                "Submits the adjustments, allowances and non-financials for a tax year in one call",
                "putItsaSelfEmploymentAnnual",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("businessId", "body", true, "The business id from Business Details"),
                        new ApiParameter("taxYear", "body", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("adjustments", "body", false, "Annual adjustments"),
                        new ApiParameter("allowances", "body", false, "Annual allowances"),
                        new ApiParameter("nonFinancials", "body", false, "Annual non-financials"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaCrystallisationObligationsGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaCrystallisationObligationsGetLambdaUrlPath = "/api/v1/hmrc/itsa/obligations/crystallisation";
        this.hmrcItsaCrystallisationObligationsGetLambdaJwtAuthorizer = false;
        this.hmrcItsaCrystallisationObligationsGetLambdaCustomAuthorizer = true;
        var hmrcItsaCrystallisationObligationsGetLambdaHandlerName =
                "hmrcItsaCrystallisationObligationsGet.ingestHandler";
        var hmrcItsaCrystallisationObligationsGetLambdaWorkerHandlerName =
                "hmrcItsaCrystallisationObligationsGet.workerHandler";
        // AWS Lambda function names cap at 64 characters - "crystallisation" already implies
        // "obligations", so the deployed function name drops the latter, the same shortening
        // hmrcItsaSelfEmploymentAnnualGet uses for "self-employment".
        var hmrcItsaCrystallisationObligationsGetLambdaHandlerDashed = "hmrc-itsa-crystallisation-get";
        this.hmrcItsaCrystallisationObligationsGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaCrystallisationObligationsGetLambdaHandlerDashed);
        this.hmrcItsaCrystallisationObligationsGetIngestLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaCrystallisationObligationsGetLambdaHandlerName);
        this.hmrcItsaCrystallisationObligationsGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaCrystallisationObligationsGetLambdaHandlerDashed);
        this.hmrcItsaCrystallisationObligationsGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.hmrcItsaCrystallisationObligationsGetIngestLambdaArn,
                        root.provisionedConcurrencyAliasName);
        this.hmrcItsaCrystallisationObligationsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaCrystallisationObligationsGetIngestLambdaFunctionName);
        this.hmrcItsaCrystallisationObligationsGetWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaCrystallisationObligationsGetLambdaWorkerHandlerName);
        this.hmrcItsaCrystallisationObligationsGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaCrystallisationObligationsGetIngestLambdaArn);
        this.hmrcItsaCrystallisationObligationsGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.hmrcItsaCrystallisationObligationsGetWorkerLambdaArn,
                        root.provisionedConcurrencyAliasName);
        this.hmrcItsaCrystallisationObligationsGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaCrystallisationObligationsGetIngestLambdaFunctionName);
        this.hmrcItsaCrystallisationObligationsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaCrystallisationObligationsGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaCrystallisationObligationsGetLambdaHttpMethod,
                this.hmrcItsaCrystallisationObligationsGetLambdaUrlPath,
                "Retrieve ITSA final declaration obligations",
                "Retrieves the obligations that say when the final declaration (crystallisation) is due",
                "getItsaCrystallisationObligations",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter("taxYear", "query", false, "Tax year in the format YYYY-YY"),
                        new ApiParameter("status", "query", false, "Filter by obligation status: open or fulfilled"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaStatusGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaStatusGetLambdaUrlPath = "/api/v1/hmrc/itsa/status";
        this.hmrcItsaStatusGetLambdaJwtAuthorizer = false;
        this.hmrcItsaStatusGetLambdaCustomAuthorizer = true;
        var hmrcItsaStatusGetLambdaHandlerName = "hmrcItsaStatusGet.ingestHandler";
        var hmrcItsaStatusGetLambdaWorkerHandlerName = "hmrcItsaStatusGet.workerHandler";
        var hmrcItsaStatusGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaStatusGetLambdaHandlerName);
        this.hmrcItsaStatusGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaStatusGetLambdaHandlerDashed);
        this.hmrcItsaStatusGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaStatusGetLambdaHandlerName);
        this.hmrcItsaStatusGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaStatusGetLambdaHandlerDashed);
        this.hmrcItsaStatusGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaStatusGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaStatusGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaStatusGetIngestLambdaFunctionName);
        this.hmrcItsaStatusGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaStatusGetLambdaWorkerHandlerName);
        this.hmrcItsaStatusGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcItsaStatusGetIngestLambdaArn);
        this.hmrcItsaStatusGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaStatusGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaStatusGetLambdaQueueName = "%s-queue".formatted(this.hmrcItsaStatusGetIngestLambdaFunctionName);
        this.hmrcItsaStatusGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaStatusGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaStatusGetLambdaHttpMethod,
                this.hmrcItsaStatusGetLambdaUrlPath,
                "Retrieve ITSA status",
                "Retrieves whether the customer is mandated, voluntary, annual or exempt for a tax year",
                "getItsaStatus",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter("taxYear", "query", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter(
                                "futureYears",
                                "query",
                                false,
                                "When true, also returns the following tax year's status"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaBsasTriggerPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcItsaBsasTriggerPostLambdaUrlPath = "/api/v1/hmrc/itsa/bsas/trigger";
        this.hmrcItsaBsasTriggerPostLambdaJwtAuthorizer = false;
        this.hmrcItsaBsasTriggerPostLambdaCustomAuthorizer = true;
        var hmrcItsaBsasTriggerPostLambdaHandlerName = "hmrcItsaBsasTriggerPost.ingestHandler";
        var hmrcItsaBsasTriggerPostLambdaWorkerHandlerName = "hmrcItsaBsasTriggerPost.workerHandler";
        var hmrcItsaBsasTriggerPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaBsasTriggerPostLambdaHandlerName);
        this.hmrcItsaBsasTriggerPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaBsasTriggerPostLambdaHandlerDashed);
        this.hmrcItsaBsasTriggerPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaBsasTriggerPostLambdaHandlerName);
        this.hmrcItsaBsasTriggerPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaBsasTriggerPostLambdaHandlerDashed);
        this.hmrcItsaBsasTriggerPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaBsasTriggerPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasTriggerPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBsasTriggerPostIngestLambdaFunctionName);
        this.hmrcItsaBsasTriggerPostWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaBsasTriggerPostLambdaWorkerHandlerName);
        this.hmrcItsaBsasTriggerPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBsasTriggerPostIngestLambdaArn);
        this.hmrcItsaBsasTriggerPostWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaBsasTriggerPostWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasTriggerPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBsasTriggerPostIngestLambdaFunctionName);
        this.hmrcItsaBsasTriggerPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBsasTriggerPostIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaBsasTriggerPostLambdaHttpMethod,
                this.hmrcItsaBsasTriggerPostLambdaUrlPath,
                "Trigger an ITSA business source adjustable summary",
                "Triggers an adjustable summary calculation for an accounting period, for self-employment or UK property",
                "triggerItsaBsas",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("businessId", "body", true, "The business id from Business Details"),
                        new ApiParameter(
                                "accountingPeriodStartDate", "body", true, "The accounting period's start date"),
                        new ApiParameter("accountingPeriodEndDate", "body", true, "The accounting period's end date"),
                        new ApiParameter(
                                "typeOfBusiness",
                                "body",
                                true,
                                "self-employment or uk-property, from the picked business"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaBsasSelfEmploymentGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaBsasSelfEmploymentGetLambdaUrlPath = "/api/v1/hmrc/itsa/bsas/self-employment";
        this.hmrcItsaBsasSelfEmploymentGetLambdaJwtAuthorizer = false;
        this.hmrcItsaBsasSelfEmploymentGetLambdaCustomAuthorizer = true;
        var hmrcItsaBsasSelfEmploymentGetLambdaHandlerName = "hmrcItsaBsasSelfEmploymentGet.ingestHandler";
        var hmrcItsaBsasSelfEmploymentGetLambdaWorkerHandlerName = "hmrcItsaBsasSelfEmploymentGet.workerHandler";
        // AWS Lambda function names cap at 64 characters - the deployed function name drops
        // "self-employment" to "se", the same shortening hmrcItsaSelfEmploymentAnnualGet uses.
        var hmrcItsaBsasSelfEmploymentGetLambdaHandlerDashed = "hmrc-itsa-bsas-se-get";
        this.hmrcItsaBsasSelfEmploymentGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaBsasSelfEmploymentGetLambdaHandlerDashed);
        this.hmrcItsaBsasSelfEmploymentGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaBsasSelfEmploymentGetLambdaHandlerName);
        this.hmrcItsaBsasSelfEmploymentGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaBsasSelfEmploymentGetLambdaHandlerDashed);
        this.hmrcItsaBsasSelfEmploymentGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaBsasSelfEmploymentGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasSelfEmploymentGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBsasSelfEmploymentGetIngestLambdaFunctionName);
        this.hmrcItsaBsasSelfEmploymentGetWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaBsasSelfEmploymentGetLambdaWorkerHandlerName);
        this.hmrcItsaBsasSelfEmploymentGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBsasSelfEmploymentGetIngestLambdaArn);
        this.hmrcItsaBsasSelfEmploymentGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaBsasSelfEmploymentGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasSelfEmploymentGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBsasSelfEmploymentGetIngestLambdaFunctionName);
        this.hmrcItsaBsasSelfEmploymentGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBsasSelfEmploymentGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaBsasSelfEmploymentGetLambdaHttpMethod,
                this.hmrcItsaBsasSelfEmploymentGetLambdaUrlPath,
                "Retrieve an ITSA self-employment business source adjustable summary",
                "Retrieves the income, expenses, additions and resulting net profit or loss for a triggered summary",
                "getItsaBsasSelfEmployment",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter("calculationId", "query", true, "The calculation id from a triggered summary"),
                        new ApiParameter("taxYear", "query", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlPath = "/api/v1/hmrc/itsa/bsas/self-employment/adjust";
        this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaJwtAuthorizer = false;
        this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaCustomAuthorizer = true;
        var hmrcItsaBsasSelfEmploymentAdjustPostLambdaHandlerName =
                "hmrcItsaBsasSelfEmploymentAdjustPost.ingestHandler";
        var hmrcItsaBsasSelfEmploymentAdjustPostLambdaWorkerHandlerName =
                "hmrcItsaBsasSelfEmploymentAdjustPost.workerHandler";
        // AWS Lambda function names cap at 64 characters - the deployed function name drops
        // "self-employment" to "se", the same shortening hmrcItsaSelfEmploymentAnnualGet uses.
        var hmrcItsaBsasSelfEmploymentAdjustPostLambdaHandlerDashed = "hmrc-itsa-bsas-se-adjust-post";
        this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaBsasSelfEmploymentAdjustPostLambdaHandlerDashed);
        this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaBsasSelfEmploymentAdjustPostLambdaHandlerName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaBsasSelfEmploymentAdjustPostLambdaHandlerDashed);
        this.hmrcItsaBsasSelfEmploymentAdjustPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaFunctionName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaBsasSelfEmploymentAdjustPostLambdaWorkerHandlerName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaArn);
        this.hmrcItsaBsasSelfEmploymentAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaFunctionName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaHttpMethod,
                this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaUrlPath,
                "Adjust an ITSA self-employment business source adjustable summary",
                "Submits income, expenses and additions adjustments, or states there are none, for a triggered summary",
                "adjustItsaBsasSelfEmployment",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("calculationId", "body", true, "The calculation id from a triggered summary"),
                        new ApiParameter("taxYear", "body", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("income", "body", false, "Income adjustments"),
                        new ApiParameter("expenses", "body", false, "Expenses adjustments"),
                        new ApiParameter("additions", "body", false, "Additions adjustments"),
                        new ApiParameter("zeroAdjustments", "body", false, "True to state that nothing changes"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaCalculationTriggerPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcItsaCalculationTriggerPostLambdaUrlPath = "/api/v1/hmrc/itsa/calculation/trigger";
        this.hmrcItsaCalculationTriggerPostLambdaJwtAuthorizer = false;
        this.hmrcItsaCalculationTriggerPostLambdaCustomAuthorizer = true;
        var hmrcItsaCalculationTriggerPostLambdaHandlerName = "hmrcItsaCalculationTriggerPost.ingestHandler";
        var hmrcItsaCalculationTriggerPostLambdaWorkerHandlerName = "hmrcItsaCalculationTriggerPost.workerHandler";
        var hmrcItsaCalculationTriggerPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaCalculationTriggerPostLambdaHandlerName);
        this.hmrcItsaCalculationTriggerPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaCalculationTriggerPostLambdaHandlerDashed);
        this.hmrcItsaCalculationTriggerPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaCalculationTriggerPostLambdaHandlerName);
        this.hmrcItsaCalculationTriggerPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaCalculationTriggerPostLambdaHandlerDashed);
        this.hmrcItsaCalculationTriggerPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaCalculationTriggerPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaCalculationTriggerPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaCalculationTriggerPostIngestLambdaFunctionName);
        this.hmrcItsaCalculationTriggerPostWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaCalculationTriggerPostLambdaWorkerHandlerName);
        this.hmrcItsaCalculationTriggerPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaCalculationTriggerPostIngestLambdaArn);
        this.hmrcItsaCalculationTriggerPostWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaCalculationTriggerPostWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaCalculationTriggerPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaCalculationTriggerPostIngestLambdaFunctionName);
        this.hmrcItsaCalculationTriggerPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaCalculationTriggerPostIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaCalculationTriggerPostLambdaHttpMethod,
                this.hmrcItsaCalculationTriggerPostLambdaUrlPath,
                "Trigger an ITSA tax calculation",
                "Triggers a self assessment tax calculation for a tax year and waits for HMRC to finish it",
                "triggerItsaCalculation",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("taxYear", "body", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter(
                                "calculationType", "body", true, "One of in-year, intent-to-finalise, intent-to-amend"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaCalculationGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaCalculationGetLambdaUrlPath = "/api/v1/hmrc/itsa/calculation";
        this.hmrcItsaCalculationGetLambdaJwtAuthorizer = false;
        this.hmrcItsaCalculationGetLambdaCustomAuthorizer = true;
        var hmrcItsaCalculationGetLambdaHandlerName = "hmrcItsaCalculationGet.ingestHandler";
        var hmrcItsaCalculationGetLambdaWorkerHandlerName = "hmrcItsaCalculationGet.workerHandler";
        var hmrcItsaCalculationGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaCalculationGetLambdaHandlerName);
        this.hmrcItsaCalculationGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaCalculationGetLambdaHandlerDashed);
        this.hmrcItsaCalculationGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaCalculationGetLambdaHandlerName);
        this.hmrcItsaCalculationGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaCalculationGetLambdaHandlerDashed);
        this.hmrcItsaCalculationGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaCalculationGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaCalculationGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaCalculationGetIngestLambdaFunctionName);
        this.hmrcItsaCalculationGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaCalculationGetLambdaWorkerHandlerName);
        this.hmrcItsaCalculationGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcItsaCalculationGetIngestLambdaArn);
        this.hmrcItsaCalculationGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaCalculationGetWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaCalculationGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaCalculationGetIngestLambdaFunctionName);
        this.hmrcItsaCalculationGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaCalculationGetIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaCalculationGetLambdaHttpMethod,
                this.hmrcItsaCalculationGetLambdaUrlPath,
                "Retrieve an ITSA tax calculation",
                "Retrieves a previously triggered self assessment tax calculation by its calculation id",
                "getItsaCalculation",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter("taxYear", "query", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter(
                                "calculationId", "query", true, "The calculation id from a triggered calculation"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaFinalDeclarationPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcItsaFinalDeclarationPostLambdaUrlPath = "/api/v1/hmrc/itsa/final-declaration";
        this.hmrcItsaFinalDeclarationPostLambdaJwtAuthorizer = false;
        this.hmrcItsaFinalDeclarationPostLambdaCustomAuthorizer = true;
        var hmrcItsaFinalDeclarationPostLambdaHandlerName = "hmrcItsaFinalDeclarationPost.ingestHandler";
        var hmrcItsaFinalDeclarationPostLambdaWorkerHandlerName = "hmrcItsaFinalDeclarationPost.workerHandler";
        var hmrcItsaFinalDeclarationPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaFinalDeclarationPostLambdaHandlerName);
        this.hmrcItsaFinalDeclarationPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, hmrcItsaFinalDeclarationPostLambdaHandlerDashed);
        this.hmrcItsaFinalDeclarationPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, hmrcItsaFinalDeclarationPostLambdaHandlerName);
        this.hmrcItsaFinalDeclarationPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, hmrcItsaFinalDeclarationPostLambdaHandlerDashed);
        this.hmrcItsaFinalDeclarationPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaFinalDeclarationPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaFinalDeclarationPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaFinalDeclarationPostIngestLambdaFunctionName);
        this.hmrcItsaFinalDeclarationPostWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(root.appLambdaHandlerPrefix, hmrcItsaFinalDeclarationPostLambdaWorkerHandlerName);
        this.hmrcItsaFinalDeclarationPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaFinalDeclarationPostIngestLambdaArn);
        this.hmrcItsaFinalDeclarationPostWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaFinalDeclarationPostWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.hmrcItsaFinalDeclarationPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaFinalDeclarationPostIngestLambdaFunctionName);
        this.hmrcItsaFinalDeclarationPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaFinalDeclarationPostIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaFinalDeclarationPostLambdaHttpMethod,
                this.hmrcItsaFinalDeclarationPostLambdaUrlPath,
                "Submit an ITSA final declaration",
                "Confirms a tax calculation and files the final declaration for a tax year",
                "submitItsaFinalDeclaration",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("taxYear", "body", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("calculationId", "body", true, "The calculation id being confirmed"),
                        new ApiParameter(
                                "calculationType", "body", true, "One of final-declaration, confirm-amendment"),
                        new ApiParameter(
                                "totalIncomeTaxAndNicsDue",
                                "body",
                                true,
                                "The figure shown to the customer and confirmed, stored on the receipt"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.receiptGetLambdaHttpMethod = HttpMethod.GET;
        this.receiptGetLambdaUrlPath = "/api/v1/hmrc/receipt";
        this.receiptGetLambdaJwtAuthorizer = true;
        this.receiptGetLambdaCustomAuthorizer = false;
        this.receiptGetByNameLambdaUrlPath = "/api/v1/hmrc/receipt/{name}";
        var receiptGetLambdaHandlerName = "hmrcReceiptGet.ingestHandler";
        var receiptGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(receiptGetLambdaHandlerName);
        this.receiptGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, receiptGetLambdaHandlerDashed);
        this.receiptGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(root.appLambdaHandlerPrefix, receiptGetLambdaHandlerName);
        this.receiptGetIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, receiptGetLambdaHandlerDashed);
        this.receiptGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.receiptGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.receiptGetLambdaHttpMethod,
                this.receiptGetLambdaUrlPath,
                "Retrieve stored receipts",
                "Retrieves previously stored receipts for the authenticated user",
                "getReceipts",
                List.of(
                        new ApiParameter("name", "query", false, "Receipt file name including .json"),
                        new ApiParameter("key", "query", false, "Full DynamoDB Item key"))));
        root.publishedApiLambdas.add(new PublishedLambda(
                this.receiptGetLambdaHttpMethod,
                this.receiptGetByNameLambdaUrlPath,
                "Retrieve a stored receipt by name",
                "Retrieves a specific stored receipt for the authenticated user by file name",
                "getReceiptByName",
                List.of(new ApiParameter("name", "path", true, "The receipt file name including .json"))));
    }
}
