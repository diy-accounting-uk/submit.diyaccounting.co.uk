/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.buildDashedDomainName;
import static co.uk.diyaccounting.submit.utils.ResourceNameUtils.convertDotSeparatedToDashSeparated;

import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import java.util.ArrayList;
import java.util.List;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public class SubmitSharedNames {

    public static class PublishedLambda {
        public final HttpMethod method;
        public final String urlPath;
        public final String summary;
        public final String description;
        public final String operationId;
        public final List<ApiParameter> parameters;

        public PublishedLambda(
                HttpMethod method, String urlPath, String summary, String description, String operationId) {
            this(method, urlPath, summary, description, operationId, List.of());
        }

        public PublishedLambda(
                HttpMethod method,
                String urlPath,
                String summary,
                String description,
                String operationId,
                List<ApiParameter> parameters) {
            this.method = method;
            this.urlPath = urlPath;
            this.summary = summary;
            this.description = description;
            this.operationId = operationId;
            this.parameters = parameters != null ? parameters : List.of();
        }
    }

    public static class ApiParameter {
        public final String name;
        public final String in;
        public final boolean required;
        public final String description;

        public ApiParameter(String name, String in, boolean required, String description) {
            this.name = name;
            this.in = in;
            this.required = required;
            this.description = description;
        }
    }

    public final List<PublishedLambda> publishedApiLambdas = new ArrayList<>();

    public String hostedZoneName;
    public String deploymentDomainName;
    public String envDomainName;
    public String publicDomainName;
    public String cognitoDomainName;
    public String holdingDomainName;
    public String simulatorDomainName;
    public String billingDomainName;
    public String baseUrl;
    public String envBaseUrl;
    public String publicBaseUrl;
    public String dashedDeploymentDomainName;
    public String cognitoBaseUri;
    public String trailName;
    public String provisionedConcurrencyAliasName;

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
    public String hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName;
    public String hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName;
    public String hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName;
    public String hmrcItsaStatusGetAsyncRequestsTableName;
    public String hmrcItsaBsasTriggerPostAsyncRequestsTableName;
    public String hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName;
    public String hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName;
    public String hmrcItsaBsasUkPropertyGetAsyncRequestsTableName;
    public String hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName;
    public String hmrcItsaCalculationTriggerPostAsyncRequestsTableName;
    public String hmrcItsaCalculationGetAsyncRequestsTableName;
    public String hmrcItsaFinalDeclarationPostAsyncRequestsTableName;
    public String companiesHouseAccountsAsyncRequestsTableName;
    public String hmrcApiRequestsTableName;
    public String passesTableName;
    public String bundleCapacityTableName;
    public String activityBusName;
    public String subscriptionsTableName;
    public String securityStateTableName;
    public String booksBucketName;
    public String originBucketName;
    public String originAccessLogBucketName;
    public String distributionAccessLogGroupName;
    public String distributionAccessLogDeliveryHoldingSourceName;
    public String distributionAccessLogDeliveryOriginSourceName;
    public String distributionAccessLogDeliveryHoldingDestinationName;
    public String distributionAccessLogDeliveryOriginDestinationName;
    public String ew2SelfDestructLogGroupName;
    public String ue1SelfDestructLogGroupName;
    public String apiAccessLogGroupName;

    public String envResourceNamePrefix;
    public String observabilityStackId;
    public String observabilityUE1StackId;
    public String dataStackId;
    public String identityStackId;
    public String holdingStackId;
    public String backupStackId;
    public String activityStackId;
    public String simulatorStackId;
    public String billingWebhookStackId;
    public String ecrStackId;
    public String ue1EcrStackId;
    public String ecrRepositoryArn;
    public String ecrRepositoryName;
    public String ecrLogGroupName;
    public String ecrPublishRoleName;
    public String ue1EcrRepositoryArn;
    public String ue1EcrRepositoryName;
    public String ue1EcrLogGroupName;
    public String ue1EcrPublishRoleName;
    public String analyticsStackId;
    public String ingestionStackId;
    public String securityDetectionStackId;
    public String securityBaselineStackId;

    // Analytics lake, catalog and query resources
    public String analyticsLakeBucketName;
    public String analyticsResultsBucketName;
    public String glueDatabaseName;
    public String athenaWorkGroupName;
    public String stateMachineName;
    public String activityEventsDeliveryStreamName;
    public String activityEventsDeliveryStreamLogGroupName;
    public String activityEventTransformLambdaFunctionName;
    public String activityEventTransformLambdaHandler;
    public String activityEventTransformLambdaArn;
    public String activityEventTransformProvisionedConcurrencyLambdaAliasArn;
    public String dynamoStreamToFirehoseLambdaFunctionName;
    public String dynamoStreamToFirehoseLambdaHandler;
    public String dynamoStreamToFirehoseLambdaArn;
    public String dynamoStreamToFirehoseProvisionedConcurrencyLambdaAliasArn;
    public String alarmStateChangeDeliveryStreamName;
    public String alarmStateChangeTransformLambdaFunctionName;
    public String alarmStateChangeTransformLambdaHandler;
    public String alarmStateChangeTransformLambdaArn;
    public String alarmStateChangeTransformProvisionedConcurrencyLambdaAliasArn;

    // Env-level Telegram forwarder Lambda (EventBridge target, not API): one per environment,
    // shared by every deployment's OpsStack rules instead of each deployment building its own.
    public String activityTelegramForwarderLambdaHandler;
    public String activityTelegramForwarderLambdaFunctionName;
    public String activityTelegramForwarderLambdaArn;
    public String activityTelegramForwarderProvisionedConcurrencyLambdaAliasArn;

    // Env-level billing webhook Lambda
    public String envBillingWebhookLambdaFunctionName;
    public String envBillingWebhookLambdaHandler;
    public String envBillingWebhookLambdaArn;
    public String envBillingWebhookProvisionedConcurrencyAliasArn;

    public String appResourceNamePrefix;
    public String authStackId;
    public String hmrcStackId;
    public String hmrcItsaStackId;
    public String companiesHouseStackId;
    public String accountStackId;
    public String apiStackId;
    public String opsStackId;
    public String selfDestructStackId;

    public String cognitoTokenPostIngestLambdaHandler;
    public String cognitoTokenPostIngestLambdaFunctionName;
    public String cognitoTokenPostIngestLambdaArn;
    public String cognitoTokenPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod cognitoTokenPostLambdaHttpMethod;
    public String cognitoTokenPostLambdaUrlPath;
    public boolean cognitoTokenPostLambdaJwtAuthorizer;
    public boolean cognitoTokenPostLambdaCustomAuthorizer;

    public String customAuthorizerIngestLambdaHandler;
    public String customAuthorizerIngestLambdaFunctionName;
    public String customAuthorizerIngestLambdaArn;
    public String customAuthorizerIngestProvisionedConcurrencyLambdaAliasArn;

    public String bundleGetIngestLambdaHandler;
    public String bundleGetIngestLambdaFunctionName;
    public String bundleGetIngestLambdaArn;
    public String bundleGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod bundleGetLambdaHttpMethod;
    public String bundleGetLambdaUrlPath;
    public boolean bundleGetLambdaJwtAuthorizer;
    public boolean bundleGetLambdaCustomAuthorizer;

    public String operatorSnapshotGetIngestLambdaHandler;
    public String operatorSnapshotGetIngestLambdaFunctionName;
    public String operatorSnapshotGetIngestLambdaArn;
    public String operatorSnapshotGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod operatorSnapshotGetLambdaHttpMethod;
    public String operatorSnapshotGetLambdaUrlPath;
    public boolean operatorSnapshotGetLambdaJwtAuthorizer;
    public boolean operatorSnapshotGetLambdaCustomAuthorizer;

    // TODO: Replace individual attributes with LambdaNames instances
    public LambdaNames bundlePost;
    public String bundlePostIngestLambdaHandler;
    public String bundlePostIngestLambdaFunctionName;
    public String bundlePostIngestLambdaArn;
    public String bundlePostIngestProvisionedConcurrencyLambdaAliasArn;
    public String bundlePostWorkerLambdaHandler;
    public String bundlePostWorkerLambdaFunctionName;
    public String bundlePostWorkerLambdaArn;
    public String bundlePostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String bundlePostLambdaQueueName;
    public String bundlePostLambdaDeadLetterQueueName;
    public HttpMethod bundlePostLambdaHttpMethod;
    public String bundlePostLambdaUrlPath;
    public boolean bundlePostLambdaJwtAuthorizer;
    public boolean bundlePostLambdaCustomAuthorizer;

    public String bundleDeleteIngestLambdaHandler;
    public String bundleDeleteIngestLambdaFunctionName;
    public String bundleDeleteIngestLambdaArn;
    public String bundleDeleteIngestProvisionedConcurrencyLambdaAliasArn;
    public String bundleDeleteWorkerLambdaHandler;
    public String bundleDeleteWorkerLambdaFunctionName;
    public String bundleDeleteWorkerLambdaArn;
    public String bundleDeleteWorkerProvisionedConcurrencyLambdaAliasArn;
    public String bundleDeleteLambdaQueueName;
    public String bundleDeleteLambdaDeadLetterQueueName;
    public HttpMethod bundleDeleteLambdaHttpMethod;
    public String bundleDeleteLambdaUrlPath;
    public boolean bundleDeleteLambdaJwtAuthorizer;
    public boolean bundleDeleteLambdaCustomAuthorizer;

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

    public String hmrcItsaUkPropertyPeriodPostIngestLambdaHandler;
    public String hmrcItsaUkPropertyPeriodPostIngestLambdaFunctionName;
    public String hmrcItsaUkPropertyPeriodPostIngestLambdaArn;
    public String hmrcItsaUkPropertyPeriodPostIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyPeriodPostWorkerLambdaHandler;
    public String hmrcItsaUkPropertyPeriodPostWorkerLambdaFunctionName;
    public String hmrcItsaUkPropertyPeriodPostWorkerLambdaArn;
    public String hmrcItsaUkPropertyPeriodPostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyPeriodPostLambdaQueueName;
    public String hmrcItsaUkPropertyPeriodPostLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaUkPropertyPeriodPostLambdaHttpMethod;
    public String hmrcItsaUkPropertyPeriodPostLambdaUrlPath;
    public boolean hmrcItsaUkPropertyPeriodPostLambdaJwtAuthorizer;
    public boolean hmrcItsaUkPropertyPeriodPostLambdaCustomAuthorizer;

    public String hmrcItsaUkPropertyPeriodsGetIngestLambdaHandler;
    public String hmrcItsaUkPropertyPeriodsGetIngestLambdaFunctionName;
    public String hmrcItsaUkPropertyPeriodsGetIngestLambdaArn;
    public String hmrcItsaUkPropertyPeriodsGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyPeriodsGetWorkerLambdaHandler;
    public String hmrcItsaUkPropertyPeriodsGetWorkerLambdaFunctionName;
    public String hmrcItsaUkPropertyPeriodsGetWorkerLambdaArn;
    public String hmrcItsaUkPropertyPeriodsGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyPeriodsGetLambdaQueueName;
    public String hmrcItsaUkPropertyPeriodsGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaUkPropertyPeriodsGetLambdaHttpMethod;
    public String hmrcItsaUkPropertyPeriodsGetLambdaUrlPath;
    public boolean hmrcItsaUkPropertyPeriodsGetLambdaJwtAuthorizer;
    public boolean hmrcItsaUkPropertyPeriodsGetLambdaCustomAuthorizer;

    public String hmrcItsaUkPropertyPeriodGetIngestLambdaHandler;
    public String hmrcItsaUkPropertyPeriodGetIngestLambdaFunctionName;
    public String hmrcItsaUkPropertyPeriodGetIngestLambdaArn;
    public String hmrcItsaUkPropertyPeriodGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyPeriodGetWorkerLambdaHandler;
    public String hmrcItsaUkPropertyPeriodGetWorkerLambdaFunctionName;
    public String hmrcItsaUkPropertyPeriodGetWorkerLambdaArn;
    public String hmrcItsaUkPropertyPeriodGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyPeriodGetLambdaQueueName;
    public String hmrcItsaUkPropertyPeriodGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaUkPropertyPeriodGetLambdaHttpMethod;
    public String hmrcItsaUkPropertyPeriodGetLambdaUrlPath;
    public boolean hmrcItsaUkPropertyPeriodGetLambdaJwtAuthorizer;
    public boolean hmrcItsaUkPropertyPeriodGetLambdaCustomAuthorizer;

    public String hmrcItsaUkPropertyPeriodPutIngestLambdaHandler;
    public String hmrcItsaUkPropertyPeriodPutIngestLambdaFunctionName;
    public String hmrcItsaUkPropertyPeriodPutIngestLambdaArn;
    public String hmrcItsaUkPropertyPeriodPutIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyPeriodPutWorkerLambdaHandler;
    public String hmrcItsaUkPropertyPeriodPutWorkerLambdaFunctionName;
    public String hmrcItsaUkPropertyPeriodPutWorkerLambdaArn;
    public String hmrcItsaUkPropertyPeriodPutWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyPeriodPutLambdaQueueName;
    public String hmrcItsaUkPropertyPeriodPutLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaUkPropertyPeriodPutLambdaHttpMethod;
    public String hmrcItsaUkPropertyPeriodPutLambdaUrlPath;
    public boolean hmrcItsaUkPropertyPeriodPutLambdaJwtAuthorizer;
    public boolean hmrcItsaUkPropertyPeriodPutLambdaCustomAuthorizer;

    public String hmrcItsaUkPropertyAnnualGetIngestLambdaHandler;
    public String hmrcItsaUkPropertyAnnualGetIngestLambdaFunctionName;
    public String hmrcItsaUkPropertyAnnualGetIngestLambdaArn;
    public String hmrcItsaUkPropertyAnnualGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyAnnualGetWorkerLambdaHandler;
    public String hmrcItsaUkPropertyAnnualGetWorkerLambdaFunctionName;
    public String hmrcItsaUkPropertyAnnualGetWorkerLambdaArn;
    public String hmrcItsaUkPropertyAnnualGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyAnnualGetLambdaQueueName;
    public String hmrcItsaUkPropertyAnnualGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaUkPropertyAnnualGetLambdaHttpMethod;
    public String hmrcItsaUkPropertyAnnualGetLambdaUrlPath;
    public boolean hmrcItsaUkPropertyAnnualGetLambdaJwtAuthorizer;
    public boolean hmrcItsaUkPropertyAnnualGetLambdaCustomAuthorizer;

    public String hmrcItsaUkPropertyAnnualPutIngestLambdaHandler;
    public String hmrcItsaUkPropertyAnnualPutIngestLambdaFunctionName;
    public String hmrcItsaUkPropertyAnnualPutIngestLambdaArn;
    public String hmrcItsaUkPropertyAnnualPutIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyAnnualPutWorkerLambdaHandler;
    public String hmrcItsaUkPropertyAnnualPutWorkerLambdaFunctionName;
    public String hmrcItsaUkPropertyAnnualPutWorkerLambdaArn;
    public String hmrcItsaUkPropertyAnnualPutWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaUkPropertyAnnualPutLambdaQueueName;
    public String hmrcItsaUkPropertyAnnualPutLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaUkPropertyAnnualPutLambdaHttpMethod;
    public String hmrcItsaUkPropertyAnnualPutLambdaUrlPath;
    public boolean hmrcItsaUkPropertyAnnualPutLambdaJwtAuthorizer;
    public boolean hmrcItsaUkPropertyAnnualPutLambdaCustomAuthorizer;

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

    public String hmrcItsaBsasUkPropertyGetIngestLambdaHandler;
    public String hmrcItsaBsasUkPropertyGetIngestLambdaFunctionName;
    public String hmrcItsaBsasUkPropertyGetIngestLambdaArn;
    public String hmrcItsaBsasUkPropertyGetIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasUkPropertyGetWorkerLambdaHandler;
    public String hmrcItsaBsasUkPropertyGetWorkerLambdaFunctionName;
    public String hmrcItsaBsasUkPropertyGetWorkerLambdaArn;
    public String hmrcItsaBsasUkPropertyGetWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasUkPropertyGetLambdaQueueName;
    public String hmrcItsaBsasUkPropertyGetLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaBsasUkPropertyGetLambdaHttpMethod;
    public String hmrcItsaBsasUkPropertyGetLambdaUrlPath;
    public boolean hmrcItsaBsasUkPropertyGetLambdaJwtAuthorizer;
    public boolean hmrcItsaBsasUkPropertyGetLambdaCustomAuthorizer;

    public String hmrcItsaBsasUkPropertyAdjustPostIngestLambdaHandler;
    public String hmrcItsaBsasUkPropertyAdjustPostIngestLambdaFunctionName;
    public String hmrcItsaBsasUkPropertyAdjustPostIngestLambdaArn;
    public String hmrcItsaBsasUkPropertyAdjustPostIngestProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaHandler;
    public String hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaFunctionName;
    public String hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaArn;
    public String hmrcItsaBsasUkPropertyAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String hmrcItsaBsasUkPropertyAdjustPostLambdaQueueName;
    public String hmrcItsaBsasUkPropertyAdjustPostLambdaDeadLetterQueueName;
    public HttpMethod hmrcItsaBsasUkPropertyAdjustPostLambdaHttpMethod;
    public String hmrcItsaBsasUkPropertyAdjustPostLambdaUrlPath;
    public boolean hmrcItsaBsasUkPropertyAdjustPostLambdaJwtAuthorizer;
    public boolean hmrcItsaBsasUkPropertyAdjustPostLambdaCustomAuthorizer;

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

    public String companiesHouseSearchGetIngestLambdaHandler;
    public String companiesHouseSearchGetIngestLambdaFunctionName;
    public String companiesHouseSearchGetIngestLambdaArn;
    public String companiesHouseSearchGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseSearchGetLambdaHttpMethod;
    public String companiesHouseSearchGetLambdaUrlPath;
    public boolean companiesHouseSearchGetLambdaJwtAuthorizer;
    public boolean companiesHouseSearchGetLambdaCustomAuthorizer;

    public String companiesHouseCompanyGetIngestLambdaHandler;
    public String companiesHouseCompanyGetIngestLambdaFunctionName;
    public String companiesHouseCompanyGetIngestLambdaArn;
    public String companiesHouseCompanyGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseCompanyGetLambdaHttpMethod;
    public String companiesHouseCompanyGetLambdaUrlPath;
    public boolean companiesHouseCompanyGetLambdaJwtAuthorizer;
    public boolean companiesHouseCompanyGetLambdaCustomAuthorizer;

    public String companiesHouseTokenPostIngestLambdaHandler;
    public String companiesHouseTokenPostIngestLambdaFunctionName;
    public String companiesHouseTokenPostIngestLambdaArn;
    public String companiesHouseTokenPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseTokenPostLambdaHttpMethod;
    public String companiesHouseTokenPostLambdaUrlPath;
    public boolean companiesHouseTokenPostLambdaJwtAuthorizer;
    public boolean companiesHouseTokenPostLambdaCustomAuthorizer;

    public String companiesHouseTransactionPostIngestLambdaHandler;
    public String companiesHouseTransactionPostIngestLambdaFunctionName;
    public String companiesHouseTransactionPostIngestLambdaArn;
    public String companiesHouseTransactionPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseTransactionPostLambdaHttpMethod;
    public String companiesHouseTransactionPostLambdaUrlPath;
    public boolean companiesHouseTransactionPostLambdaJwtAuthorizer;
    public boolean companiesHouseTransactionPostLambdaCustomAuthorizer;

    public String companiesHouseTransactionGetIngestLambdaHandler;
    public String companiesHouseTransactionGetIngestLambdaFunctionName;
    public String companiesHouseTransactionGetIngestLambdaArn;
    public String companiesHouseTransactionGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseTransactionGetLambdaHttpMethod;
    public String companiesHouseTransactionGetLambdaUrlPath;
    public boolean companiesHouseTransactionGetLambdaJwtAuthorizer;
    public boolean companiesHouseTransactionGetLambdaCustomAuthorizer;

    public String companiesHouseTransactionPutIngestLambdaHandler;
    public String companiesHouseTransactionPutIngestLambdaFunctionName;
    public String companiesHouseTransactionPutIngestLambdaArn;
    public String companiesHouseTransactionPutIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseTransactionPutLambdaHttpMethod;
    public String companiesHouseTransactionPutLambdaUrlPath;
    public boolean companiesHouseTransactionPutLambdaJwtAuthorizer;
    public boolean companiesHouseTransactionPutLambdaCustomAuthorizer;

    public String companiesHouseRegisteredOfficeAddressGetIngestLambdaHandler;
    public String companiesHouseRegisteredOfficeAddressGetIngestLambdaFunctionName;
    public String companiesHouseRegisteredOfficeAddressGetIngestLambdaArn;
    public String companiesHouseRegisteredOfficeAddressGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseRegisteredOfficeAddressGetLambdaHttpMethod;
    public String companiesHouseRegisteredOfficeAddressGetLambdaUrlPath;
    public boolean companiesHouseRegisteredOfficeAddressGetLambdaJwtAuthorizer;
    public boolean companiesHouseRegisteredOfficeAddressGetLambdaCustomAuthorizer;

    public String companiesHouseRegisteredOfficeAddressPostIngestLambdaHandler;
    public String companiesHouseRegisteredOfficeAddressPostIngestLambdaFunctionName;
    public String companiesHouseRegisteredOfficeAddressPostIngestLambdaArn;
    public String companiesHouseRegisteredOfficeAddressPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseRegisteredOfficeAddressPostLambdaHttpMethod;
    public String companiesHouseRegisteredOfficeAddressPostLambdaUrlPath;
    public boolean companiesHouseRegisteredOfficeAddressPostLambdaJwtAuthorizer;
    public boolean companiesHouseRegisteredOfficeAddressPostLambdaCustomAuthorizer;

    public String companiesHouseRegisteredEmailEligibilityGetIngestLambdaHandler;
    public String companiesHouseRegisteredEmailEligibilityGetIngestLambdaFunctionName;
    public String companiesHouseRegisteredEmailEligibilityGetIngestLambdaArn;
    public String companiesHouseRegisteredEmailEligibilityGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseRegisteredEmailEligibilityGetLambdaHttpMethod;
    public String companiesHouseRegisteredEmailEligibilityGetLambdaUrlPath;
    public boolean companiesHouseRegisteredEmailEligibilityGetLambdaJwtAuthorizer;
    public boolean companiesHouseRegisteredEmailEligibilityGetLambdaCustomAuthorizer;

    public String companiesHouseRegisteredEmailAddressPostIngestLambdaHandler;
    public String companiesHouseRegisteredEmailAddressPostIngestLambdaFunctionName;
    public String companiesHouseRegisteredEmailAddressPostIngestLambdaArn;
    public String companiesHouseRegisteredEmailAddressPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseRegisteredEmailAddressPostLambdaHttpMethod;
    public String companiesHouseRegisteredEmailAddressPostLambdaUrlPath;
    public boolean companiesHouseRegisteredEmailAddressPostLambdaJwtAuthorizer;
    public boolean companiesHouseRegisteredEmailAddressPostLambdaCustomAuthorizer;

    public String companiesHouseAccountsPreviewPostIngestLambdaHandler;
    public String companiesHouseAccountsPreviewPostIngestLambdaFunctionName;
    public String companiesHouseAccountsPreviewPostIngestLambdaArn;
    public String companiesHouseAccountsPreviewPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseAccountsPreviewPostLambdaHttpMethod;
    public String companiesHouseAccountsPreviewPostLambdaUrlPath;
    public boolean companiesHouseAccountsPreviewPostLambdaJwtAuthorizer;
    public boolean companiesHouseAccountsPreviewPostLambdaCustomAuthorizer;

    public String companiesHouseAccountsPostIngestLambdaHandler;
    public String companiesHouseAccountsPostIngestLambdaFunctionName;
    public String companiesHouseAccountsPostIngestLambdaArn;
    public String companiesHouseAccountsPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseAccountsPostLambdaHttpMethod;
    public String companiesHouseAccountsPostLambdaUrlPath;
    public boolean companiesHouseAccountsPostLambdaJwtAuthorizer;
    public boolean companiesHouseAccountsPostLambdaCustomAuthorizer;

    public String companiesHouseAccountsGetIngestLambdaHandler;
    public String companiesHouseAccountsGetIngestLambdaFunctionName;
    public String companiesHouseAccountsGetIngestLambdaArn;
    public String companiesHouseAccountsGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod companiesHouseAccountsGetLambdaHttpMethod;
    public String companiesHouseAccountsGetLambdaUrlPath;
    public boolean companiesHouseAccountsGetLambdaJwtAuthorizer;
    public boolean companiesHouseAccountsGetLambdaCustomAuthorizer;

    public String supportTicketPostIngestLambdaHandler;
    public String supportTicketPostIngestLambdaFunctionName;
    public String supportTicketPostIngestLambdaArn;
    public String supportTicketPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod supportTicketPostLambdaHttpMethod;
    public String supportTicketPostLambdaUrlPath;
    public boolean supportTicketPostLambdaJwtAuthorizer;
    public boolean supportTicketPostLambdaCustomAuthorizer;

    public String interestPostIngestLambdaHandler;
    public String interestPostIngestLambdaFunctionName;
    public String interestPostIngestLambdaArn;
    public String interestPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod interestPostLambdaHttpMethod;
    public String interestPostLambdaUrlPath;
    public boolean interestPostLambdaJwtAuthorizer;
    public boolean interestPostLambdaCustomAuthorizer;

    public String passGetIngestLambdaHandler;
    public String passGetIngestLambdaFunctionName;
    public String passGetIngestLambdaArn;
    public String passGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passGetLambdaHttpMethod;
    public String passGetLambdaUrlPath;
    public boolean passGetLambdaJwtAuthorizer;
    public boolean passGetLambdaCustomAuthorizer;

    public String passPostIngestLambdaHandler;
    public String passPostIngestLambdaFunctionName;
    public String passPostIngestLambdaArn;
    public String passPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passPostLambdaHttpMethod;
    public String passPostLambdaUrlPath;
    public boolean passPostLambdaJwtAuthorizer;
    public boolean passPostLambdaCustomAuthorizer;

    public String passAdminPostIngestLambdaHandler;
    public String passAdminPostIngestLambdaFunctionName;
    public String passAdminPostIngestLambdaArn;
    public String passAdminPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passAdminPostLambdaHttpMethod;
    public String passAdminPostLambdaUrlPath;
    public boolean passAdminPostLambdaJwtAuthorizer;
    public boolean passAdminPostLambdaCustomAuthorizer;

    // Pass Generate POST Lambda (JWT auth - user pass generation via tokens)
    public String passGeneratePostIngestLambdaHandler;
    public String passGeneratePostIngestLambdaFunctionName;
    public String passGeneratePostIngestLambdaArn;
    public String passGeneratePostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passGeneratePostLambdaHttpMethod;
    public String passGeneratePostLambdaUrlPath;
    public boolean passGeneratePostLambdaJwtAuthorizer;
    public boolean passGeneratePostLambdaCustomAuthorizer;

    // Pass My Passes GET Lambda (JWT auth - list user's generated passes)
    public String passMyPassesGetIngestLambdaHandler;
    public String passMyPassesGetIngestLambdaFunctionName;
    public String passMyPassesGetIngestLambdaArn;
    public String passMyPassesGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passMyPassesGetLambdaHttpMethod;
    public String passMyPassesGetLambdaUrlPath;
    public boolean passMyPassesGetLambdaJwtAuthorizer;
    public boolean passMyPassesGetLambdaCustomAuthorizer;

    public String bundleCapacityReconcileLambdaHandler;
    public String bundleCapacityReconcileLambdaFunctionName;
    public String bundleCapacityReconcileLambdaArn;
    public String bundleCapacityReconcileProvisionedConcurrencyLambdaAliasArn;

    // Session Beacon POST Lambda (public, no auth)
    public String sessionBeaconPostIngestLambdaHandler;
    public String sessionBeaconPostIngestLambdaFunctionName;
    public String sessionBeaconPostIngestLambdaArn;
    public String sessionBeaconPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod sessionBeaconPostLambdaHttpMethod;
    public String sessionBeaconPostLambdaUrlPath;
    public boolean sessionBeaconPostLambdaJwtAuthorizer;
    public boolean sessionBeaconPostLambdaCustomAuthorizer;

    // Billing Lambda names
    public String billingCheckoutPostIngestLambdaHandler;
    public String billingCheckoutPostIngestLambdaFunctionName;
    public String billingCheckoutPostIngestLambdaArn;
    public String billingCheckoutPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingCheckoutPostLambdaHttpMethod;
    public String billingCheckoutPostLambdaUrlPath;
    public boolean billingCheckoutPostLambdaJwtAuthorizer;
    public boolean billingCheckoutPostLambdaCustomAuthorizer;

    public String billingCheckoutSessionGetIngestLambdaHandler;
    public String billingCheckoutSessionGetIngestLambdaFunctionName;
    public String billingCheckoutSessionGetIngestLambdaArn;
    public String billingCheckoutSessionGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingCheckoutSessionGetLambdaHttpMethod;
    public String billingCheckoutSessionGetLambdaUrlPath;
    public boolean billingCheckoutSessionGetLambdaJwtAuthorizer;
    public boolean billingCheckoutSessionGetLambdaCustomAuthorizer;

    public String billingPortalGetIngestLambdaHandler;
    public String billingPortalGetIngestLambdaFunctionName;
    public String billingPortalGetIngestLambdaArn;
    public String billingPortalGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingPortalGetLambdaHttpMethod;
    public String billingPortalGetLambdaUrlPath;
    public boolean billingPortalGetLambdaJwtAuthorizer;
    public boolean billingPortalGetLambdaCustomAuthorizer;

    public String billingRecoverPostIngestLambdaHandler;
    public String billingRecoverPostIngestLambdaFunctionName;
    public String billingRecoverPostIngestLambdaArn;
    public String billingRecoverPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingRecoverPostLambdaHttpMethod;
    public String billingRecoverPostLambdaUrlPath;
    public boolean billingRecoverPostLambdaJwtAuthorizer;
    public boolean billingRecoverPostLambdaCustomAuthorizer;

    public String billingWebhookPostIngestLambdaHandler;
    public String billingWebhookPostIngestLambdaFunctionName;
    public String billingWebhookPostIngestLambdaArn;
    public String billingWebhookPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod billingWebhookPostLambdaHttpMethod;
    public String billingWebhookPostLambdaUrlPath;
    public boolean billingWebhookPostLambdaJwtAuthorizer;
    public boolean billingWebhookPostLambdaCustomAuthorizer;

    public String billingStackId;

    // DIYA-GL Lambda names
    public String diyaGlStackId;

    public String diyaGlListGetIngestLambdaHandler;
    public String diyaGlListGetIngestLambdaFunctionName;
    public String diyaGlListGetIngestLambdaArn;
    public String diyaGlListGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod diyaGlListGetLambdaHttpMethod;
    public String diyaGlListGetLambdaUrlPath;
    // A second, permanent published path for the same Lambda as diyaGlListGetLambdaUrlPath. The
    // spreadsheets site's cloud.js, including copies held by installed service workers, calls this
    // path and does not switch to the diya-gl one.
    public String diyaGlListGetBooksUrlPath;
    public boolean diyaGlListGetLambdaJwtAuthorizer;
    public boolean diyaGlListGetLambdaCustomAuthorizer;

    public String diyaGlVersionGetIngestLambdaHandler;
    public String diyaGlVersionGetIngestLambdaFunctionName;
    public String diyaGlVersionGetIngestLambdaArn;
    public String diyaGlVersionGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod diyaGlVersionGetLambdaHttpMethod;
    public String diyaGlVersionGetLambdaUrlPath;
    public String diyaGlVersionGetBooksUrlPath;
    public boolean diyaGlVersionGetLambdaJwtAuthorizer;
    public boolean diyaGlVersionGetLambdaCustomAuthorizer;

    public String diyaGlPutIngestLambdaHandler;
    public String diyaGlPutIngestLambdaFunctionName;
    public String diyaGlPutIngestLambdaArn;
    public String diyaGlPutIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod diyaGlPutLambdaHttpMethod;
    public String diyaGlPutLambdaUrlPath;
    public String diyaGlPutBooksUrlPath;
    public boolean diyaGlPutLambdaJwtAuthorizer;
    public boolean diyaGlPutLambdaCustomAuthorizer;

    public String diyaGlDeleteIngestLambdaHandler;
    public String diyaGlDeleteIngestLambdaFunctionName;
    public String diyaGlDeleteIngestLambdaArn;
    public String diyaGlDeleteIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod diyaGlDeleteLambdaHttpMethod;
    public String diyaGlDeleteLambdaUrlPath;
    public String diyaGlDeleteBooksUrlPath;
    public boolean diyaGlDeleteLambdaJwtAuthorizer;
    public boolean diyaGlDeleteLambdaCustomAuthorizer;

    // Alarm-to-GitHub-issue Lambda (EventBridge target, not API)
    public String alarmToGithubIssueLambdaHandler;
    public String alarmToGithubIssueLambdaFunctionName;
    public String alarmToGithubIssueLambdaArn;
    public String alarmToGithubIssueProvisionedConcurrencyLambdaAliasArn;

    public String selfDestructLambdaHandler;
    public String selfDestructLambdaFunctionName;
    public String selfDestructLambdaArn;
    public String selfDestructProvisionedConcurrencyLambdaAliasArn;

    public String edgeStackId;
    public String publishStackId;

    public String alarmTriageRoleName;
    public String alarmTriageGuardrailName;
    public String alarmTriageGuardrailIdParameterName;
    public String alarmTriageGuardrailVersionParameterName;

    public static class SubmitSharedNamesProps {
        public String hostedZoneName;
        public String envName;
        public String subDomainName;
        public String deploymentName;
        public String regionName;
        public String awsAccount;
    }

    private SubmitSharedNames() {}

    // Common HTTP response codes to be referenced across infra generators and stacks
    public static class Responses {
        public static final String OK = "200";
        public static final String ACCEPTED = "202";
        public static final String UNAUTHORIZED = "401";
        public static final String FORBIDDEN = "403";
        public static final String NOT_FOUND = "404";
        public static final String SERVER_ERROR = "500";
    }

    public static SubmitSharedNames forDocs() {
        SubmitSharedNamesProps p = new SubmitSharedNamesProps();
        p.hostedZoneName = "example.com";
        p.envName = "docs";
        p.subDomainName = "submit";
        p.deploymentName = "docs";
        p.regionName = "eu-west-2";
        p.awsAccount = "111111111111";
        return new SubmitSharedNames(p);
    }

    public SubmitSharedNames(SubmitSharedNamesProps props) {
        this();
        this.hostedZoneName = props.hostedZoneName;
        this.envDomainName = "%s-%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        if ("prod".equals(props.envName)) {
            this.publicDomainName = "%s.%s".formatted(props.subDomainName, props.hostedZoneName);
        } else {
            this.publicDomainName = this.envDomainName;
        }
        this.cognitoDomainName = "%s-auth.%s".formatted(props.envName, props.hostedZoneName);
        this.holdingDomainName = "prod".equals(props.envName)
                ? "holding.%s.%s".formatted(props.subDomainName, props.hostedZoneName)
                : "%s-holding.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.simulatorDomainName = "%s-simulator.%s".formatted(props.envName, props.hostedZoneName);
        this.billingDomainName = "%s-billing.%s.%s".formatted(props.envName, props.subDomainName, props.hostedZoneName);
        this.deploymentDomainName = "%s.%s.%s"
                .formatted(
                        props.deploymentName,
                        props.subDomainName,
                        props.hostedZoneName); // TODO -> deploymentDomainName
        // this.defaultAliasName = "zero";
        this.provisionedConcurrencyAliasName = "pc";
        this.baseUrl = "https://%s/".formatted(this.deploymentDomainName);
        this.dashedDeploymentDomainName = buildDashedDomainName(this.deploymentDomainName);

        this.envBaseUrl = "https://%s/".formatted(this.envDomainName);
        this.publicBaseUrl = "https://%s/".formatted(this.publicDomainName);
        // Use envName directly for consistency with stack IDs (e.g., ci-env-IdentityStack → ci-env-user-pool)
        this.envResourceNamePrefix = "%s-env".formatted(props.envName);
        this.observabilityStackId = "%s-env-ObservabilityStack".formatted(props.envName);
        this.securityDetectionStackId = "%s-env-SecurityDetectionStack".formatted(props.envName);
        this.securityBaselineStackId = "%s-env-SecurityBaselineStack".formatted(props.envName);
        this.observabilityUE1StackId = "%s-env-ObservabilityUE1Stack".formatted(props.envName);
        this.dataStackId = "%s-env-DataStack".formatted(props.envName);
        this.identityStackId = "%s-env-IdentityStack".formatted(props.envName);
        this.holdingStackId = "%s-env-HoldingStack".formatted(props.envName);
        this.backupStackId = "%s-env-BackupStack".formatted(props.envName);
        this.activityStackId = "%s-env-ActivityStack".formatted(props.envName);
        this.simulatorStackId = "%s-env-SimulatorStack".formatted(props.envName);
        this.billingWebhookStackId = "%s-env-BillingWebhookStack".formatted(props.envName);
        this.ecrStackId = "%s-env-EcrStack".formatted(props.envName);
        this.ue1EcrStackId = "%s-env-EcrUE1Stack".formatted(props.envName);
        this.ecrRepositoryArn = "arn:aws:ecr:%s:%s:repository/%s-ecr"
                .formatted(props.regionName, props.awsAccount, this.envResourceNamePrefix);
        this.ecrRepositoryName = "%s-ecr".formatted(this.envResourceNamePrefix);
        this.ecrLogGroupName = "/aws/ecr/%s".formatted(this.envResourceNamePrefix);
        this.ecrPublishRoleName = "%s-ecr-publish-role".formatted(this.envResourceNamePrefix);
        this.ue1EcrRepositoryArn =
                "arn:aws:ecr:us-east-1:%s:repository/%s-ecr".formatted(props.awsAccount, this.envResourceNamePrefix);
        this.ue1EcrRepositoryName = "%s-ecr-us-east-1".formatted(this.envResourceNamePrefix);
        this.ue1EcrLogGroupName = "/aws/ecr/%s-us-east-1".formatted(this.envResourceNamePrefix);
        this.ue1EcrPublishRoleName = "%s-ecr-publish-role-us-east-1".formatted(this.envResourceNamePrefix);
        this.analyticsStackId = "%s-env-AnalyticsStack".formatted(props.envName);
        this.ingestionStackId = "%s-env-IngestionStack".formatted(props.envName);
        this.analyticsLakeBucketName = "%s-analytics-lake-%s".formatted(this.envResourceNamePrefix, props.awsAccount);
        this.analyticsResultsBucketName =
                "%s-analytics-results-%s".formatted(this.envResourceNamePrefix, props.awsAccount);
        this.glueDatabaseName = "%s_env_analytics".formatted(props.envName);
        this.athenaWorkGroupName = "%s-analytics".formatted(this.envResourceNamePrefix);
        this.stateMachineName = "%s-analytics-nightly".formatted(this.envResourceNamePrefix);
        this.activityEventsDeliveryStreamName = "%s-activity-events".formatted(this.envResourceNamePrefix);
        this.activityEventsDeliveryStreamLogGroupName =
                "/aws/kinesisfirehose/%s".formatted(this.activityEventsDeliveryStreamName);
        this.activityEventTransformLambdaFunctionName =
                "%s-activity-event-transform".formatted(this.envResourceNamePrefix);
        this.activityEventTransformLambdaHandler = "app/functions/analytics/activityEventTransform.handler";
        this.activityEventTransformLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.activityEventTransformLambdaFunctionName);
        this.activityEventTransformProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.activityEventTransformLambdaArn, this.provisionedConcurrencyAliasName);
        this.dynamoStreamToFirehoseLambdaFunctionName =
                "%s-dynamo-stream-to-firehose".formatted(this.envResourceNamePrefix);
        this.dynamoStreamToFirehoseLambdaHandler = "app/functions/analytics/dynamoStreamToFirehose.handler";
        this.dynamoStreamToFirehoseLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.dynamoStreamToFirehoseLambdaFunctionName);
        this.dynamoStreamToFirehoseProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.dynamoStreamToFirehoseLambdaArn, this.provisionedConcurrencyAliasName);
        this.alarmStateChangeDeliveryStreamName = "%s-alarm-state-changes".formatted(this.envResourceNamePrefix);
        this.alarmStateChangeTransformLambdaFunctionName =
                "%s-alarm-state-change-transform".formatted(this.envResourceNamePrefix);
        this.alarmStateChangeTransformLambdaHandler = "app/functions/analytics/alarmStateChangeTransform.handler";
        this.alarmStateChangeTransformLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.alarmStateChangeTransformLambdaFunctionName);
        this.alarmStateChangeTransformProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.alarmStateChangeTransformLambdaArn, this.provisionedConcurrencyAliasName);

        // Env-level Telegram forwarder Lambda: one instance shared by every deployment's OpsStack
        // rules, instead of each deployment building its own copy of the same catch-all rule.
        this.activityTelegramForwarderLambdaFunctionName =
                "%s-activity-telegram-forwarder".formatted(this.envResourceNamePrefix);
        this.activityTelegramForwarderLambdaHandler = "app/functions/ops/activityTelegramForwarder.handler";
        this.activityTelegramForwarderLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.activityTelegramForwarderLambdaFunctionName);
        this.activityTelegramForwarderProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.activityTelegramForwarderLambdaArn, this.provisionedConcurrencyAliasName);

        this.cognitoBaseUri = "https://%s".formatted(this.cognitoDomainName);

        // Env-level billing webhook Lambda
        this.envBillingWebhookLambdaFunctionName = "%s-billing-webhook".formatted(this.envResourceNamePrefix);
        this.envBillingWebhookLambdaHandler = "app/functions/billing/billingWebhookPost.ingestHandler";
        this.envBillingWebhookLambdaArn = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.envBillingWebhookLambdaFunctionName);
        this.envBillingWebhookProvisionedConcurrencyAliasArn =
                "%s:%s".formatted(this.envBillingWebhookLambdaArn, this.provisionedConcurrencyAliasName);

        this.receiptsTableName = "%s-receipts".formatted(this.envResourceNamePrefix);
        this.bundlesTableName = "%s-bundles".formatted(this.envResourceNamePrefix);
        this.bundlePostAsyncRequestsTableName = "%s-bundle-post-async-requests".formatted(this.envResourceNamePrefix);
        this.bundleDeleteAsyncRequestsTableName =
                "%s-bundle-delete-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcVatReturnPostAsyncRequestsTableName =
                "%s-hmrc-vat-return-post-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcVatReturnGetAsyncRequestsTableName =
                "%s-hmrc-vat-return-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcVatObligationGetAsyncRequestsTableName =
                "%s-hmrc-vat-obligation-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcVatLiabilitiesGetAsyncRequestsTableName =
                "%s-hmrc-vat-liabilities-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcVatPaymentsGetAsyncRequestsTableName =
                "%s-hmrc-vat-payments-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcVatPenaltiesGetAsyncRequestsTableName =
                "%s-hmrc-vat-penalties-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaBusinessDetailsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-business-details-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaObligationsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-obligations-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentPeriodPostAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-period-post-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentPeriodsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-periods-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentPeriodGetAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-period-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentPeriodPutAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-period-put-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaUkPropertyPeriodPostAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-period-post-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaUkPropertyPeriodsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-periods-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaUkPropertyPeriodGetAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-period-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaUkPropertyPeriodPutAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-period-put-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaUkPropertyAnnualGetAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-annual-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaUkPropertyAnnualPutAsyncRequestsTableName =
                "%s-hmrc-itsa-uk-property-annual-put-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentAnnualGetAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-annual-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaSelfEmploymentAnnualPutAsyncRequestsTableName =
                "%s-hmrc-itsa-self-employment-annual-put-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaCrystallisationObligationsGetAsyncRequestsTableName =
                "%s-hmrc-itsa-crystallisation-obligations-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaStatusGetAsyncRequestsTableName =
                "%s-hmrc-itsa-status-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaBsasTriggerPostAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-trigger-post-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaBsasSelfEmploymentGetAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-self-employment-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaBsasSelfEmploymentAdjustPostAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-self-employment-adjust-post-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaBsasUkPropertyGetAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-uk-property-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaBsasUkPropertyAdjustPostAsyncRequestsTableName =
                "%s-hmrc-itsa-bsas-uk-property-adjust-post-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaCalculationTriggerPostAsyncRequestsTableName =
                "%s-hmrc-itsa-calculation-trigger-post-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaCalculationGetAsyncRequestsTableName =
                "%s-hmrc-itsa-calculation-get-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcItsaFinalDeclarationPostAsyncRequestsTableName =
                "%s-hmrc-itsa-final-declaration-post-async-requests".formatted(this.envResourceNamePrefix);
        this.companiesHouseAccountsAsyncRequestsTableName =
                "%s-companies-house-accounts-async-requests".formatted(this.envResourceNamePrefix);
        this.hmrcApiRequestsTableName = "%s-hmrc-api-requests".formatted(this.envResourceNamePrefix);
        this.passesTableName = "%s-passes".formatted(this.envResourceNamePrefix);
        this.bundleCapacityTableName = "%s-bundle-capacity".formatted(this.envResourceNamePrefix);
        this.activityBusName = "%s-activity-bus".formatted(this.envResourceNamePrefix);
        this.subscriptionsTableName = "%s-subscriptions".formatted(this.envResourceNamePrefix);
        this.securityStateTableName = "%s-security-state".formatted(this.envResourceNamePrefix);
        this.booksBucketName = "%s-books-%s".formatted(this.envResourceNamePrefix, props.awsAccount);
        this.distributionAccessLogGroupName = "distribution-%s-logs".formatted(this.envResourceNamePrefix);
        this.distributionAccessLogDeliveryHoldingSourceName =
                "%s-holding-dist-logs-src".formatted(this.envResourceNamePrefix);
        this.distributionAccessLogDeliveryOriginSourceName = "%s-orig-dist-l-src".formatted(props.deploymentName); // x
        this.distributionAccessLogDeliveryHoldingDestinationName =
                "%s-holding-logs-dest".formatted(this.envResourceNamePrefix);
        this.distributionAccessLogDeliveryOriginDestinationName = "%s-orig-l-dst".formatted(props.deploymentName); // x

        this.ew2SelfDestructLogGroupName =
                "/aws/lambda/%s-self-destruct-eu-west-2".formatted(this.envResourceNamePrefix);
        this.ue1SelfDestructLogGroupName =
                "/aws/lambda/%s-self-destruct-us-east-1".formatted(this.envResourceNamePrefix);
        this.apiAccessLogGroupName = "/aws/apigw/%s/access".formatted(this.envResourceNamePrefix);

        this.appResourceNamePrefix = "%s-app".formatted(props.deploymentName);
        this.authStackId = "%s-app-AuthStack".formatted(props.deploymentName);
        this.hmrcStackId = "%s-app-HmrcStack".formatted(props.deploymentName);
        this.hmrcItsaStackId = "%s-app-HmrcItsaStack".formatted(props.deploymentName);
        this.companiesHouseStackId = "%s-app-CompaniesHouseStack".formatted(props.deploymentName);
        this.accountStackId = "%s-app-AccountStack".formatted(props.deploymentName);
        this.billingStackId = "%s-app-BillingStack".formatted(props.deploymentName);
        this.diyaGlStackId = "%s-app-DiyaGlStack".formatted(props.deploymentName);
        this.apiStackId = "%s-app-ApiStack".formatted(props.deploymentName);
        this.opsStackId = "%s-app-OpsStack".formatted(props.deploymentName);
        this.selfDestructStackId = "%s-app-SelfDestructStack".formatted(props.deploymentName);

        this.edgeStackId = "%s-app-EdgeStack".formatted(props.deploymentName);
        this.publishStackId = "%s-app-PublishStack".formatted(props.deploymentName);

        this.trailName = "%s-trail".formatted(this.envResourceNamePrefix);
        this.originBucketName =
                convertDotSeparatedToDashSeparated("%s-origin-us-east-1".formatted(this.appResourceNamePrefix));
        this.originAccessLogBucketName = "%s-origin-access-logs".formatted(this.appResourceNamePrefix);

        var appLambdaHandlerPrefix = "app/functions";
        var appLambdaArnPrefix = "arn:aws:lambda:%s:%s:function:%s"
                .formatted(props.regionName, props.awsAccount, this.appResourceNamePrefix);

        this.cognitoTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.cognitoTokenPostLambdaUrlPath = "/api/v1/cognito/token";
        this.cognitoTokenPostLambdaJwtAuthorizer = false;
        this.cognitoTokenPostLambdaCustomAuthorizer = false;
        var cognitoTokenPostLambdaHandlerName = "cognitoTokenPost.ingestHandler";
        var cognitoTokenPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(cognitoTokenPostLambdaHandlerName);
        this.cognitoTokenPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, cognitoTokenPostLambdaHandlerDashed);
        this.cognitoTokenPostIngestLambdaHandler =
                "%s/auth/%s".formatted(appLambdaHandlerPrefix, cognitoTokenPostLambdaHandlerName);
        this.cognitoTokenPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, cognitoTokenPostLambdaHandlerDashed);
        this.cognitoTokenPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.cognitoTokenPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.cognitoTokenPostLambdaHttpMethod,
                this.cognitoTokenPostLambdaUrlPath,
                "Exchange Cognito authorization code for access token",
                "Exchanges an authorization code for a Cognito access token",
                "exchangeCognitoToken"));

        // Custom authorizer for HMRC VAT endpoints
        var customAuthorizerHandlerName = "customAuthorizer.ingestHandler";
        var customAuthorizerHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(customAuthorizerHandlerName);
        this.customAuthorizerIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, customAuthorizerHandlerDashed);
        this.customAuthorizerIngestLambdaHandler =
                "%s/auth/%s".formatted(appLambdaHandlerPrefix, customAuthorizerHandlerName);
        this.customAuthorizerIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, customAuthorizerHandlerDashed);
        this.customAuthorizerIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.customAuthorizerIngestLambdaArn, this.provisionedConcurrencyAliasName);

        this.bundleGetLambdaHttpMethod = HttpMethod.GET;
        this.bundleGetLambdaUrlPath = "/api/v1/bundle";
        this.bundleGetLambdaJwtAuthorizer = true;
        this.bundleGetLambdaCustomAuthorizer = false;
        var bundleGetLambdaHandlerName = "bundleGet.ingestHandler";
        var bundleGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundleGetLambdaHandlerName);
        this.bundleGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, bundleGetLambdaHandlerDashed);
        this.bundleGetIngestLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, bundleGetLambdaHandlerName);
        this.bundleGetIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, bundleGetLambdaHandlerDashed);
        this.bundleGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.bundleGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.bundleGetLambdaHttpMethod,
                this.bundleGetLambdaUrlPath,
                "Get user bundles",
                "Retrieves all bundles for the authenticated user",
                "getBundles",
                List.of(new ApiParameter(
                        "x-wait-time-ms", "header", false, "Max time to wait for synchronous response (ms)"))));

        this.operatorSnapshotGetLambdaHttpMethod = HttpMethod.GET;
        this.operatorSnapshotGetLambdaUrlPath = "/api/v1/operator/snapshot";
        this.operatorSnapshotGetLambdaJwtAuthorizer = true;
        this.operatorSnapshotGetLambdaCustomAuthorizer = false;
        var operatorSnapshotGetLambdaHandlerName = "operatorSnapshotGet.ingestHandler";
        var operatorSnapshotGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(operatorSnapshotGetLambdaHandlerName);
        this.operatorSnapshotGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, operatorSnapshotGetLambdaHandlerDashed);
        this.operatorSnapshotGetIngestLambdaHandler =
                "%s/analytics/%s".formatted(appLambdaHandlerPrefix, operatorSnapshotGetLambdaHandlerName);
        this.operatorSnapshotGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, operatorSnapshotGetLambdaHandlerDashed);
        this.operatorSnapshotGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.operatorSnapshotGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.operatorSnapshotGetLambdaHttpMethod,
                this.operatorSnapshotGetLambdaUrlPath,
                "Get the operator objectives snapshot",
                "Retrieves the latest nightly snapshot behind the one-stop operator dashboard",
                "getOperatorSnapshot"));

        var bundlePostProps = LambdaNameProps.builder()
                .apiHttpMethod(HttpMethod.POST)
                .apiUrlPath("/api/v1/bundle")
                .handlerPath("account")
                .ingestHandlerName("bundlePost.ingestHandler")
                .workerHandlerName("bundlePost.workerHandler")
                .apiJwtAuthorizer(true)
                .apiCustomAuthorizer(false)
                .resourceNamePrefix(this.appResourceNamePrefix)
                .lambdaArnPrefix(appLambdaArnPrefix)
                .provisionedConcurrencyAliasName(this.provisionedConcurrencyAliasName)
                .build();
        this.bundlePost = new LambdaNames(bundlePostProps);
        // TODO: Remove and reference bundlePost directly where used
        this.bundlePostLambdaHttpMethod = this.bundlePost.apiHttpMethod;
        this.bundlePostLambdaUrlPath = this.bundlePost.apiUrlPath;
        this.bundlePostLambdaJwtAuthorizer = this.bundlePost.apiJwtAuthorizer;
        this.bundlePostLambdaCustomAuthorizer = this.bundlePost.apiCustomAuthorizer;
        this.bundlePostIngestLambdaFunctionName = this.bundlePost.ingestLambdaFunctionName;
        this.bundlePostIngestLambdaHandler = this.bundlePost.ingestLambdaHandler;
        this.bundlePostIngestLambdaArn = this.bundlePost.ingestLambdaArn;
        this.bundlePostIngestProvisionedConcurrencyLambdaAliasArn =
                this.bundlePost.ingestProvisionedConcurrencyLambdaAliasArn;
        this.bundlePostWorkerLambdaFunctionName = this.bundlePost.workerLambdaFunctionName;
        this.bundlePostWorkerLambdaHandler = this.bundlePost.workerLambdaHandler;
        this.bundlePostWorkerLambdaArn = this.bundlePost.workerLambdaArn;
        this.bundlePostWorkerProvisionedConcurrencyLambdaAliasArn =
                this.bundlePost.workerProvisionedConcurrencyLambdaAliasArn;
        this.bundlePostLambdaQueueName = "%s-queue".formatted(this.bundlePostIngestLambdaFunctionName);
        this.bundlePostLambdaDeadLetterQueueName = "%s-dlq".formatted(this.bundlePostIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
                this.bundlePostLambdaHttpMethod,
                this.bundlePostLambdaUrlPath,
                "Request new bundle",
                "Creates a new bundle request for the authenticated user",
                "requestBundle"));
        //        this.bundlePostLambdaHttpMethod = HttpMethod.POST;
        //        this.bundlePostLambdaUrlPath = "/api/v1/bundle";
        //        this.bundlePostLambdaJwtAuthorizer = true;
        //        this.bundlePostLambdaCustomAuthorizer = false;
        //        var bundlePostLambdaHandlerName = "bundlePost.ingestHandler";
        //        var bundlePostLambdaWorkerHandlerName = "bundlePost.workerHandler";
        //        var bundlePostLambdaHandlerDashed =
        //            ResourceNameUtils.convertCamelCaseToDashSeparated(bundlePostLambdaHandlerName);
        //        this.bundlePostIngestLambdaFunctionName =
        //            "%s-%s".formatted(this.appResourceNamePrefix, bundlePostLambdaHandlerDashed);
        //        this.bundlePostIngestLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix,
        // bundlePostLambdaHandlerName);
        //        this.bundlePostIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, bundlePostLambdaHandlerDashed);
        //        this.bundlePostIngestDefaultAliasLambdaArn = "%s:%s".formatted(this.bundlePostIngestLambdaArn,
        // this.defaultAliasName);
        //        this.bundlePostWorkerLambdaFunctionName =
        // "%s-worker".formatted(this.bundlePostIngestLambdaFunctionName);
        //        this.bundlePostWorkerLambdaHandler =
        //            "%s/account/%s".formatted(appLambdaHandlerPrefix, bundlePostLambdaWorkerHandlerName);
        //        this.bundlePostWorkerLambdaArn = "%s-worker".formatted(this.bundlePostIngestLambdaArn);
        //        this.bundlePostWorkerDefaultAliasLambdaArn =
        //            "%s:%s".formatted(this.bundlePostWorkerLambdaArn, this.defaultAliasName);
        //        this.bundlePostLambdaQueueName = "%s-queue".formatted(this.bundlePostIngestLambdaFunctionName);
        //        this.bundlePostLambdaDeadLetterQueueName =
        // "%s-dlq".formatted(this.bundlePostIngestLambdaFunctionName);
        //        publishedApiLambdas.add(new PublishedLambda(
        //            this.bundlePostLambdaHttpMethod,
        //            this.bundlePostLambdaUrlPath,
        //            "Request new bundle",
        //            "Creates a new bundle request for the authenticated user",
        //            "requestBundle"));

        this.bundleDeleteLambdaHttpMethod = HttpMethod.DELETE;
        this.bundleDeleteLambdaUrlPath = "/api/v1/bundle";
        this.bundleDeleteLambdaJwtAuthorizer = true;
        this.bundleDeleteLambdaCustomAuthorizer = false;
        var bundleDeleteLambdaHandlerName = "bundleDelete.ingestHandler";
        var bundleDeleteLambdaWorkerHandlerName = "bundleDelete.workerHandler";
        var bundleDeleteLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundleDeleteLambdaHandlerName);
        this.bundleDeleteIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, bundleDeleteLambdaHandlerDashed);
        this.bundleDeleteIngestLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, bundleDeleteLambdaHandlerName);
        this.bundleDeleteIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, bundleDeleteLambdaHandlerDashed);
        this.bundleDeleteIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.bundleDeleteIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.bundleDeleteWorkerLambdaFunctionName = "%s-worker".formatted(this.bundleDeleteIngestLambdaFunctionName);
        this.bundleDeleteWorkerLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, bundleDeleteLambdaWorkerHandlerName);
        this.bundleDeleteWorkerLambdaArn = "%s-worker".formatted(this.bundleDeleteIngestLambdaArn);
        this.bundleDeleteWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.bundleDeleteWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.bundleDeleteLambdaQueueName = "%s-queue".formatted(this.bundleDeleteIngestLambdaFunctionName);
        this.bundleDeleteLambdaDeadLetterQueueName = "%s-dlq".formatted(this.bundleDeleteIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
                this.bundleDeleteLambdaHttpMethod,
                this.bundleDeleteLambdaUrlPath,
                "Delete bundle",
                "Deletes a bundle for the authenticated user",
                "deleteBundle",
                List.of(
                        new ApiParameter("bundleId", "query", false, "The bundle id (or name) to delete"),
                        new ApiParameter("removeAll", "query", false, "When true, removes all bundles"))));
        publishedApiLambdas.add(new PublishedLambda(
                this.bundleDeleteLambdaHttpMethod,
                "/api/v1/bundle/{id}",
                "Delete bundle by id",
                "Deletes a bundle for the authenticated user using a path parameter",
                "deleteBundleById",
                List.of(new ApiParameter("id", "path", true, "The bundle id (or name) to delete"))));

        this.hmrcTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcTokenPostLambdaUrlPath = "/api/v1/hmrc/token";
        this.hmrcTokenPostLambdaJwtAuthorizer = false;
        this.hmrcTokenPostLambdaCustomAuthorizer = false;
        var hmrcTokenPostLambdaHandlerName = "hmrcTokenPost.ingestHandler";
        var hmrcTokenPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcTokenPostLambdaHandlerName);
        this.hmrcTokenPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcTokenPostLambdaHandlerDashed);
        this.hmrcTokenPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcTokenPostLambdaHandlerName);
        this.hmrcTokenPostIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, hmrcTokenPostLambdaHandlerDashed);
        this.hmrcTokenPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcTokenPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatReturnPostLambdaHandlerDashed);
        this.hmrcVatReturnPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatReturnPostLambdaHandlerName);
        this.hmrcVatReturnPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatReturnPostLambdaHandlerDashed);
        this.hmrcVatReturnPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatReturnPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatReturnPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatReturnPostIngestLambdaFunctionName);
        this.hmrcVatReturnPostWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatReturnPostLambdaWorkerHandlerName);
        this.hmrcVatReturnPostWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatReturnPostIngestLambdaArn);
        this.hmrcVatReturnPostWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatReturnPostWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatReturnPostLambdaQueueName = "%s-queue".formatted(this.hmrcVatReturnPostIngestLambdaFunctionName);
        this.hmrcVatReturnPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatReturnPostIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatObligationGetLambdaHandlerDashed);
        this.hmrcVatObligationGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatObligationGetLambdaHandlerName);
        this.hmrcVatObligationGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatObligationGetLambdaHandlerDashed);
        this.hmrcVatObligationGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatObligationGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatObligationGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatObligationGetIngestLambdaFunctionName);
        this.hmrcVatObligationGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatObligationGetLambdaWorkerHandlerName);
        this.hmrcVatObligationGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatObligationGetIngestLambdaArn);
        this.hmrcVatObligationGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatObligationGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatObligationGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcVatObligationGetIngestLambdaFunctionName);
        this.hmrcVatObligationGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatObligationGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatLiabilitiesGetLambdaHandlerDashed);
        this.hmrcVatLiabilitiesGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatLiabilitiesGetLambdaHandlerName);
        this.hmrcVatLiabilitiesGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatLiabilitiesGetLambdaHandlerDashed);
        this.hmrcVatLiabilitiesGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatLiabilitiesGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatLiabilitiesGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatLiabilitiesGetIngestLambdaFunctionName);
        this.hmrcVatLiabilitiesGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatLiabilitiesGetLambdaWorkerHandlerName);
        this.hmrcVatLiabilitiesGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatLiabilitiesGetIngestLambdaArn);
        this.hmrcVatLiabilitiesGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatLiabilitiesGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatLiabilitiesGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcVatLiabilitiesGetIngestLambdaFunctionName);
        this.hmrcVatLiabilitiesGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatLiabilitiesGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatPaymentsGetLambdaHandlerDashed);
        this.hmrcVatPaymentsGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatPaymentsGetLambdaHandlerName);
        this.hmrcVatPaymentsGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatPaymentsGetLambdaHandlerDashed);
        this.hmrcVatPaymentsGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatPaymentsGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatPaymentsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatPaymentsGetIngestLambdaFunctionName);
        this.hmrcVatPaymentsGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatPaymentsGetLambdaWorkerHandlerName);
        this.hmrcVatPaymentsGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatPaymentsGetIngestLambdaArn);
        this.hmrcVatPaymentsGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatPaymentsGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatPaymentsGetLambdaQueueName = "%s-queue".formatted(this.hmrcVatPaymentsGetIngestLambdaFunctionName);
        this.hmrcVatPaymentsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatPaymentsGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatPenaltiesGetLambdaHandlerDashed);
        this.hmrcVatPenaltiesGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatPenaltiesGetLambdaHandlerName);
        this.hmrcVatPenaltiesGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatPenaltiesGetLambdaHandlerDashed);
        this.hmrcVatPenaltiesGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatPenaltiesGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatPenaltiesGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatPenaltiesGetIngestLambdaFunctionName);
        this.hmrcVatPenaltiesGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatPenaltiesGetLambdaWorkerHandlerName);
        this.hmrcVatPenaltiesGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatPenaltiesGetIngestLambdaArn);
        this.hmrcVatPenaltiesGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatPenaltiesGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatPenaltiesGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcVatPenaltiesGetIngestLambdaFunctionName);
        this.hmrcVatPenaltiesGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatPenaltiesGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcVatReturnGetLambdaHandlerDashed);
        this.hmrcVatReturnGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatReturnGetLambdaHandlerName);
        this.hmrcVatReturnGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcVatReturnGetLambdaHandlerDashed);
        this.hmrcVatReturnGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatReturnGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatReturnGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcVatReturnGetIngestLambdaFunctionName);
        this.hmrcVatReturnGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcVatReturnGetLambdaWorkerHandlerName);
        this.hmrcVatReturnGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcVatReturnGetIngestLambdaArn);
        this.hmrcVatReturnGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcVatReturnGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcVatReturnGetLambdaQueueName = "%s-queue".formatted(this.hmrcVatReturnGetIngestLambdaFunctionName);
        this.hmrcVatReturnGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcVatReturnGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaBusinessDetailsGetLambdaHandlerDashed);
        this.hmrcItsaBusinessDetailsGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBusinessDetailsGetLambdaHandlerName);
        this.hmrcItsaBusinessDetailsGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaBusinessDetailsGetLambdaHandlerDashed);
        this.hmrcItsaBusinessDetailsGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaBusinessDetailsGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBusinessDetailsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBusinessDetailsGetIngestLambdaFunctionName);
        this.hmrcItsaBusinessDetailsGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBusinessDetailsGetLambdaWorkerHandlerName);
        this.hmrcItsaBusinessDetailsGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBusinessDetailsGetIngestLambdaArn);
        this.hmrcItsaBusinessDetailsGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaBusinessDetailsGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBusinessDetailsGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBusinessDetailsGetIngestLambdaFunctionName);
        this.hmrcItsaBusinessDetailsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBusinessDetailsGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaObligationsGetLambdaHandlerDashed);
        this.hmrcItsaObligationsGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaObligationsGetLambdaHandlerName);
        this.hmrcItsaObligationsGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaObligationsGetLambdaHandlerDashed);
        this.hmrcItsaObligationsGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaObligationsGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaObligationsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaObligationsGetIngestLambdaFunctionName);
        this.hmrcItsaObligationsGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaObligationsGetLambdaWorkerHandlerName);
        this.hmrcItsaObligationsGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcItsaObligationsGetIngestLambdaArn);
        this.hmrcItsaObligationsGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaObligationsGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaObligationsGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaObligationsGetIngestLambdaFunctionName);
        this.hmrcItsaObligationsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaObligationsGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaSelfEmploymentPeriodPostLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodPostLambdaHandlerName);
        this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaSelfEmploymentPeriodPostLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodPostLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaArn);
        this.hmrcItsaSelfEmploymentPeriodPostWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodPostWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentPeriodPostIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaSelfEmploymentPeriodsGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodsGetLambdaHandlerName);
        this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaSelfEmploymentPeriodsGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodsGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodsGetLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaArn);
        this.hmrcItsaSelfEmploymentPeriodsGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodsGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodsGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentPeriodsGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaSelfEmploymentPeriodGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodGetLambdaHandlerName);
        this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaSelfEmploymentPeriodGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodGetLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaArn);
        this.hmrcItsaSelfEmploymentPeriodGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentPeriodGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaSelfEmploymentPeriodPutLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodPutLambdaHandlerName);
        this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaSelfEmploymentPeriodPutLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentPeriodPutIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentPeriodPutLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaArn);
        this.hmrcItsaSelfEmploymentPeriodPutWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentPeriodPutWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentPeriodPutLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentPeriodPutLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentPeriodPutIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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

        this.hmrcItsaUkPropertyPeriodPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcItsaUkPropertyPeriodPostLambdaUrlPath = "/api/v1/hmrc/itsa/uk-property/period";
        this.hmrcItsaUkPropertyPeriodPostLambdaJwtAuthorizer = false;
        this.hmrcItsaUkPropertyPeriodPostLambdaCustomAuthorizer = true;
        var hmrcItsaUkPropertyPeriodPostLambdaHandlerName = "hmrcItsaUkPropertyPeriodPost.ingestHandler";
        var hmrcItsaUkPropertyPeriodPostLambdaWorkerHandlerName = "hmrcItsaUkPropertyPeriodPost.workerHandler";
        var hmrcItsaUkPropertyPeriodPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaUkPropertyPeriodPostLambdaHandlerName);
        this.hmrcItsaUkPropertyPeriodPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaUkPropertyPeriodPostLambdaHandlerDashed);
        this.hmrcItsaUkPropertyPeriodPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyPeriodPostLambdaHandlerName);
        this.hmrcItsaUkPropertyPeriodPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaUkPropertyPeriodPostLambdaHandlerDashed);
        this.hmrcItsaUkPropertyPeriodPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyPeriodPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyPeriodPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaUkPropertyPeriodPostIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyPeriodPostWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyPeriodPostLambdaWorkerHandlerName);
        this.hmrcItsaUkPropertyPeriodPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaUkPropertyPeriodPostIngestLambdaArn);
        this.hmrcItsaUkPropertyPeriodPostWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyPeriodPostWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyPeriodPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaUkPropertyPeriodPostIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyPeriodPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaUkPropertyPeriodPostIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaUkPropertyPeriodPostLambdaHttpMethod,
                this.hmrcItsaUkPropertyPeriodPostLambdaUrlPath,
                "File an ITSA UK property quarterly update",
                "Creates a UK property period summary with HMRC for the given business, tax year and period",
                "postItsaUkPropertyPeriod",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("businessId", "body", true, "The business id from Business Details"),
                        new ApiParameter("taxYear", "body", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("fromDate", "body", true, "Start of the period, format YYYY-MM-DD"),
                        new ApiParameter("toDate", "body", true, "End of the period, format YYYY-MM-DD"),
                        new ApiParameter("ukFhlProperty", "body", false, "Furnished holiday lettings income and expenses"),
                        new ApiParameter("ukNonFhlProperty", "body", false, "Non-FHL property income and expenses"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaUkPropertyPeriodsGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaUkPropertyPeriodsGetLambdaUrlPath = "/api/v1/hmrc/itsa/uk-property/periods";
        this.hmrcItsaUkPropertyPeriodsGetLambdaJwtAuthorizer = false;
        this.hmrcItsaUkPropertyPeriodsGetLambdaCustomAuthorizer = true;
        var hmrcItsaUkPropertyPeriodsGetLambdaHandlerName = "hmrcItsaUkPropertyPeriodsGet.ingestHandler";
        var hmrcItsaUkPropertyPeriodsGetLambdaWorkerHandlerName = "hmrcItsaUkPropertyPeriodsGet.workerHandler";
        var hmrcItsaUkPropertyPeriodsGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaUkPropertyPeriodsGetLambdaHandlerName);
        this.hmrcItsaUkPropertyPeriodsGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaUkPropertyPeriodsGetLambdaHandlerDashed);
        this.hmrcItsaUkPropertyPeriodsGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyPeriodsGetLambdaHandlerName);
        this.hmrcItsaUkPropertyPeriodsGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaUkPropertyPeriodsGetLambdaHandlerDashed);
        this.hmrcItsaUkPropertyPeriodsGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyPeriodsGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyPeriodsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaUkPropertyPeriodsGetIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyPeriodsGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyPeriodsGetLambdaWorkerHandlerName);
        this.hmrcItsaUkPropertyPeriodsGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaUkPropertyPeriodsGetIngestLambdaArn);
        this.hmrcItsaUkPropertyPeriodsGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyPeriodsGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyPeriodsGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaUkPropertyPeriodsGetIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyPeriodsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaUkPropertyPeriodsGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaUkPropertyPeriodsGetLambdaHttpMethod,
                this.hmrcItsaUkPropertyPeriodsGetLambdaUrlPath,
                "List ITSA UK property period summaries",
                "Lists the period summaries filed for a UK property business in a tax year, on HMRC's untyped list path",
                "getItsaUkPropertyPeriods",
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

        this.hmrcItsaUkPropertyPeriodGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaUkPropertyPeriodGetLambdaUrlPath = "/api/v1/hmrc/itsa/uk-property/period";
        this.hmrcItsaUkPropertyPeriodGetLambdaJwtAuthorizer = false;
        this.hmrcItsaUkPropertyPeriodGetLambdaCustomAuthorizer = true;
        var hmrcItsaUkPropertyPeriodGetLambdaHandlerName = "hmrcItsaUkPropertyPeriodGet.ingestHandler";
        var hmrcItsaUkPropertyPeriodGetLambdaWorkerHandlerName = "hmrcItsaUkPropertyPeriodGet.workerHandler";
        var hmrcItsaUkPropertyPeriodGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaUkPropertyPeriodGetLambdaHandlerName);
        this.hmrcItsaUkPropertyPeriodGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaUkPropertyPeriodGetLambdaHandlerDashed);
        this.hmrcItsaUkPropertyPeriodGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyPeriodGetLambdaHandlerName);
        this.hmrcItsaUkPropertyPeriodGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaUkPropertyPeriodGetLambdaHandlerDashed);
        this.hmrcItsaUkPropertyPeriodGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyPeriodGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyPeriodGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaUkPropertyPeriodGetIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyPeriodGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyPeriodGetLambdaWorkerHandlerName);
        this.hmrcItsaUkPropertyPeriodGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaUkPropertyPeriodGetIngestLambdaArn);
        this.hmrcItsaUkPropertyPeriodGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyPeriodGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyPeriodGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaUkPropertyPeriodGetIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyPeriodGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaUkPropertyPeriodGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaUkPropertyPeriodGetLambdaHttpMethod,
                this.hmrcItsaUkPropertyPeriodGetLambdaUrlPath,
                "Retrieve an ITSA UK property period summary",
                "Retrieves one UK property period summary by tax year and submission id",
                "getItsaUkPropertyPeriod",
                List.of(
                        new ApiParameter("nino", "query", true, "National Insurance number"),
                        new ApiParameter("businessId", "query", true, "The business id from Business Details"),
                        new ApiParameter("taxYear", "query", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("submissionId", "query", true, "The submission id from a listed period summary"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaUkPropertyPeriodPutLambdaHttpMethod = HttpMethod.PUT;
        this.hmrcItsaUkPropertyPeriodPutLambdaUrlPath = "/api/v1/hmrc/itsa/uk-property/period";
        this.hmrcItsaUkPropertyPeriodPutLambdaJwtAuthorizer = false;
        this.hmrcItsaUkPropertyPeriodPutLambdaCustomAuthorizer = true;
        var hmrcItsaUkPropertyPeriodPutLambdaHandlerName = "hmrcItsaUkPropertyPeriodPut.ingestHandler";
        var hmrcItsaUkPropertyPeriodPutLambdaWorkerHandlerName = "hmrcItsaUkPropertyPeriodPut.workerHandler";
        var hmrcItsaUkPropertyPeriodPutLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaUkPropertyPeriodPutLambdaHandlerName);
        this.hmrcItsaUkPropertyPeriodPutIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaUkPropertyPeriodPutLambdaHandlerDashed);
        this.hmrcItsaUkPropertyPeriodPutIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyPeriodPutLambdaHandlerName);
        this.hmrcItsaUkPropertyPeriodPutIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaUkPropertyPeriodPutLambdaHandlerDashed);
        this.hmrcItsaUkPropertyPeriodPutIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyPeriodPutIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyPeriodPutWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaUkPropertyPeriodPutIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyPeriodPutWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyPeriodPutLambdaWorkerHandlerName);
        this.hmrcItsaUkPropertyPeriodPutWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaUkPropertyPeriodPutIngestLambdaArn);
        this.hmrcItsaUkPropertyPeriodPutWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyPeriodPutWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyPeriodPutLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaUkPropertyPeriodPutIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyPeriodPutLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaUkPropertyPeriodPutIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaUkPropertyPeriodPutLambdaHttpMethod,
                this.hmrcItsaUkPropertyPeriodPutLambdaUrlPath,
                "Amend an ITSA UK property period summary",
                "Amends the income and expenses of an existing UK property period summary",
                "putItsaUkPropertyPeriod",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("businessId", "body", true, "The business id from Business Details"),
                        new ApiParameter("taxYear", "body", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("submissionId", "body", true, "The submission id from a listed period summary"),
                        new ApiParameter("ukFhlProperty", "body", false, "Furnished holiday lettings income and expenses"),
                        new ApiParameter("ukNonFhlProperty", "body", false, "Non-FHL property income and expenses"),
                        new ApiParameter("Gov-Test-Scenario", "query", false, "HMRC sandbox test scenario"),
                        new ApiParameter(
                                "runFraudPreventionHeaderValidation",
                                "query",
                                false,
                                "When true, validates HMRC Fraud Prevention Headers"))));

        this.hmrcItsaUkPropertyAnnualGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaUkPropertyAnnualGetLambdaUrlPath = "/api/v1/hmrc/itsa/uk-property/annual";
        this.hmrcItsaUkPropertyAnnualGetLambdaJwtAuthorizer = false;
        this.hmrcItsaUkPropertyAnnualGetLambdaCustomAuthorizer = true;
        var hmrcItsaUkPropertyAnnualGetLambdaHandlerName = "hmrcItsaUkPropertyAnnualGet.ingestHandler";
        var hmrcItsaUkPropertyAnnualGetLambdaWorkerHandlerName = "hmrcItsaUkPropertyAnnualGet.workerHandler";
        var hmrcItsaUkPropertyAnnualGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaUkPropertyAnnualGetLambdaHandlerName);
        this.hmrcItsaUkPropertyAnnualGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaUkPropertyAnnualGetLambdaHandlerDashed);
        this.hmrcItsaUkPropertyAnnualGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyAnnualGetLambdaHandlerName);
        this.hmrcItsaUkPropertyAnnualGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaUkPropertyAnnualGetLambdaHandlerDashed);
        this.hmrcItsaUkPropertyAnnualGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyAnnualGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyAnnualGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaUkPropertyAnnualGetIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyAnnualGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyAnnualGetLambdaWorkerHandlerName);
        this.hmrcItsaUkPropertyAnnualGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaUkPropertyAnnualGetIngestLambdaArn);
        this.hmrcItsaUkPropertyAnnualGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyAnnualGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyAnnualGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaUkPropertyAnnualGetIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyAnnualGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaUkPropertyAnnualGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaUkPropertyAnnualGetLambdaHttpMethod,
                this.hmrcItsaUkPropertyAnnualGetLambdaUrlPath,
                "Retrieve an ITSA UK property annual submission",
                "Retrieves the adjustments and allowances submitted for a UK property business for a tax year",
                "getItsaUkPropertyAnnual",
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

        this.hmrcItsaUkPropertyAnnualPutLambdaHttpMethod = HttpMethod.PUT;
        this.hmrcItsaUkPropertyAnnualPutLambdaUrlPath = "/api/v1/hmrc/itsa/uk-property/annual";
        this.hmrcItsaUkPropertyAnnualPutLambdaJwtAuthorizer = false;
        this.hmrcItsaUkPropertyAnnualPutLambdaCustomAuthorizer = true;
        var hmrcItsaUkPropertyAnnualPutLambdaHandlerName = "hmrcItsaUkPropertyAnnualPut.ingestHandler";
        var hmrcItsaUkPropertyAnnualPutLambdaWorkerHandlerName = "hmrcItsaUkPropertyAnnualPut.workerHandler";
        var hmrcItsaUkPropertyAnnualPutLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaUkPropertyAnnualPutLambdaHandlerName);
        this.hmrcItsaUkPropertyAnnualPutIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaUkPropertyAnnualPutLambdaHandlerDashed);
        this.hmrcItsaUkPropertyAnnualPutIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyAnnualPutLambdaHandlerName);
        this.hmrcItsaUkPropertyAnnualPutIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaUkPropertyAnnualPutLambdaHandlerDashed);
        this.hmrcItsaUkPropertyAnnualPutIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyAnnualPutIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyAnnualPutWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaUkPropertyAnnualPutIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyAnnualPutWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaUkPropertyAnnualPutLambdaWorkerHandlerName);
        this.hmrcItsaUkPropertyAnnualPutWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaUkPropertyAnnualPutIngestLambdaArn);
        this.hmrcItsaUkPropertyAnnualPutWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaUkPropertyAnnualPutWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaUkPropertyAnnualPutLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaUkPropertyAnnualPutIngestLambdaFunctionName);
        this.hmrcItsaUkPropertyAnnualPutLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaUkPropertyAnnualPutIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaUkPropertyAnnualPutLambdaHttpMethod,
                this.hmrcItsaUkPropertyAnnualPutLambdaUrlPath,
                "Create or amend an ITSA UK property annual submission",
                "Submits the adjustments and allowances for a UK property business for a tax year in one call",
                "putItsaUkPropertyAnnual",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("businessId", "body", true, "The business id from Business Details"),
                        new ApiParameter("taxYear", "body", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("adjustments", "body", false, "Annual adjustments"),
                        new ApiParameter("allowances", "body", false, "Annual allowances"),
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaSelfEmploymentAnnualGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentAnnualGetLambdaHandlerName);
        this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaSelfEmploymentAnnualGetLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentAnnualGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentAnnualGetLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaArn);
        this.hmrcItsaSelfEmploymentAnnualGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentAnnualGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentAnnualGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentAnnualGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentAnnualGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaSelfEmploymentAnnualPutLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentAnnualPutLambdaHandlerName);
        this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaSelfEmploymentAnnualPutLambdaHandlerDashed);
        this.hmrcItsaSelfEmploymentAnnualPutIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaSelfEmploymentAnnualPutLambdaWorkerHandlerName);
        this.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaArn);
        this.hmrcItsaSelfEmploymentAnnualPutWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaSelfEmploymentAnnualPutWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaSelfEmploymentAnnualPutLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaFunctionName);
        this.hmrcItsaSelfEmploymentAnnualPutLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaSelfEmploymentAnnualPutIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaCrystallisationObligationsGetLambdaHandlerDashed);
        this.hmrcItsaCrystallisationObligationsGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaCrystallisationObligationsGetLambdaHandlerName);
        this.hmrcItsaCrystallisationObligationsGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaCrystallisationObligationsGetLambdaHandlerDashed);
        this.hmrcItsaCrystallisationObligationsGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.hmrcItsaCrystallisationObligationsGetIngestLambdaArn,
                        this.provisionedConcurrencyAliasName);
        this.hmrcItsaCrystallisationObligationsGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaCrystallisationObligationsGetIngestLambdaFunctionName);
        this.hmrcItsaCrystallisationObligationsGetWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(appLambdaHandlerPrefix, hmrcItsaCrystallisationObligationsGetLambdaWorkerHandlerName);
        this.hmrcItsaCrystallisationObligationsGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaCrystallisationObligationsGetIngestLambdaArn);
        this.hmrcItsaCrystallisationObligationsGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.hmrcItsaCrystallisationObligationsGetWorkerLambdaArn,
                        this.provisionedConcurrencyAliasName);
        this.hmrcItsaCrystallisationObligationsGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaCrystallisationObligationsGetIngestLambdaFunctionName);
        this.hmrcItsaCrystallisationObligationsGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaCrystallisationObligationsGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaStatusGetLambdaHandlerDashed);
        this.hmrcItsaStatusGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaStatusGetLambdaHandlerName);
        this.hmrcItsaStatusGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaStatusGetLambdaHandlerDashed);
        this.hmrcItsaStatusGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaStatusGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaStatusGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaStatusGetIngestLambdaFunctionName);
        this.hmrcItsaStatusGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaStatusGetLambdaWorkerHandlerName);
        this.hmrcItsaStatusGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcItsaStatusGetIngestLambdaArn);
        this.hmrcItsaStatusGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaStatusGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaStatusGetLambdaQueueName = "%s-queue".formatted(this.hmrcItsaStatusGetIngestLambdaFunctionName);
        this.hmrcItsaStatusGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaStatusGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaBsasTriggerPostLambdaHandlerDashed);
        this.hmrcItsaBsasTriggerPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBsasTriggerPostLambdaHandlerName);
        this.hmrcItsaBsasTriggerPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaBsasTriggerPostLambdaHandlerDashed);
        this.hmrcItsaBsasTriggerPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaBsasTriggerPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasTriggerPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBsasTriggerPostIngestLambdaFunctionName);
        this.hmrcItsaBsasTriggerPostWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBsasTriggerPostLambdaWorkerHandlerName);
        this.hmrcItsaBsasTriggerPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBsasTriggerPostIngestLambdaArn);
        this.hmrcItsaBsasTriggerPostWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaBsasTriggerPostWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasTriggerPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBsasTriggerPostIngestLambdaFunctionName);
        this.hmrcItsaBsasTriggerPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBsasTriggerPostIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                                "typeOfBusiness", "body", true, "self-employment or uk-property, from the picked business"),
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaBsasSelfEmploymentGetLambdaHandlerDashed);
        this.hmrcItsaBsasSelfEmploymentGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBsasSelfEmploymentGetLambdaHandlerName);
        this.hmrcItsaBsasSelfEmploymentGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaBsasSelfEmploymentGetLambdaHandlerDashed);
        this.hmrcItsaBsasSelfEmploymentGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaBsasSelfEmploymentGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasSelfEmploymentGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBsasSelfEmploymentGetIngestLambdaFunctionName);
        this.hmrcItsaBsasSelfEmploymentGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBsasSelfEmploymentGetLambdaWorkerHandlerName);
        this.hmrcItsaBsasSelfEmploymentGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBsasSelfEmploymentGetIngestLambdaArn);
        this.hmrcItsaBsasSelfEmploymentGetWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaBsasSelfEmploymentGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasSelfEmploymentGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBsasSelfEmploymentGetIngestLambdaFunctionName);
        this.hmrcItsaBsasSelfEmploymentGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBsasSelfEmploymentGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaBsasSelfEmploymentAdjustPostLambdaHandlerDashed);
        this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBsasSelfEmploymentAdjustPostLambdaHandlerName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaBsasSelfEmploymentAdjustPostLambdaHandlerDashed);
        this.hmrcItsaBsasSelfEmploymentAdjustPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaFunctionName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaHandler = "%s/hmrc/%s"
                .formatted(appLambdaHandlerPrefix, hmrcItsaBsasSelfEmploymentAdjustPostLambdaWorkerHandlerName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaArn);
        this.hmrcItsaBsasSelfEmploymentAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.hmrcItsaBsasSelfEmploymentAdjustPostWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaFunctionName);
        this.hmrcItsaBsasSelfEmploymentAdjustPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBsasSelfEmploymentAdjustPostIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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

        this.hmrcItsaBsasUkPropertyGetLambdaHttpMethod = HttpMethod.GET;
        this.hmrcItsaBsasUkPropertyGetLambdaUrlPath = "/api/v1/hmrc/itsa/bsas/uk-property";
        this.hmrcItsaBsasUkPropertyGetLambdaJwtAuthorizer = false;
        this.hmrcItsaBsasUkPropertyGetLambdaCustomAuthorizer = true;
        var hmrcItsaBsasUkPropertyGetLambdaHandlerName = "hmrcItsaBsasUkPropertyGet.ingestHandler";
        var hmrcItsaBsasUkPropertyGetLambdaWorkerHandlerName = "hmrcItsaBsasUkPropertyGet.workerHandler";
        var hmrcItsaBsasUkPropertyGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaBsasUkPropertyGetLambdaHandlerName);
        this.hmrcItsaBsasUkPropertyGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaBsasUkPropertyGetLambdaHandlerDashed);
        this.hmrcItsaBsasUkPropertyGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBsasUkPropertyGetLambdaHandlerName);
        this.hmrcItsaBsasUkPropertyGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaBsasUkPropertyGetLambdaHandlerDashed);
        this.hmrcItsaBsasUkPropertyGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaBsasUkPropertyGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasUkPropertyGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBsasUkPropertyGetIngestLambdaFunctionName);
        this.hmrcItsaBsasUkPropertyGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBsasUkPropertyGetLambdaWorkerHandlerName);
        this.hmrcItsaBsasUkPropertyGetWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBsasUkPropertyGetIngestLambdaArn);
        this.hmrcItsaBsasUkPropertyGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaBsasUkPropertyGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasUkPropertyGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBsasUkPropertyGetIngestLambdaFunctionName);
        this.hmrcItsaBsasUkPropertyGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBsasUkPropertyGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaBsasUkPropertyGetLambdaHttpMethod,
                this.hmrcItsaBsasUkPropertyGetLambdaUrlPath,
                "Retrieve an ITSA UK property business source adjustable summary",
                "Retrieves the income, expenses and resulting net profit or loss for a triggered summary",
                "getItsaBsasUkProperty",
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

        this.hmrcItsaBsasUkPropertyAdjustPostLambdaHttpMethod = HttpMethod.POST;
        this.hmrcItsaBsasUkPropertyAdjustPostLambdaUrlPath = "/api/v1/hmrc/itsa/bsas/uk-property/adjust";
        this.hmrcItsaBsasUkPropertyAdjustPostLambdaJwtAuthorizer = false;
        this.hmrcItsaBsasUkPropertyAdjustPostLambdaCustomAuthorizer = true;
        var hmrcItsaBsasUkPropertyAdjustPostLambdaHandlerName = "hmrcItsaBsasUkPropertyAdjustPost.ingestHandler";
        var hmrcItsaBsasUkPropertyAdjustPostLambdaWorkerHandlerName = "hmrcItsaBsasUkPropertyAdjustPost.workerHandler";
        var hmrcItsaBsasUkPropertyAdjustPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(hmrcItsaBsasUkPropertyAdjustPostLambdaHandlerName);
        this.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaBsasUkPropertyAdjustPostLambdaHandlerDashed);
        this.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBsasUkPropertyAdjustPostLambdaHandlerName);
        this.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaBsasUkPropertyAdjustPostLambdaHandlerDashed);
        this.hmrcItsaBsasUkPropertyAdjustPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaFunctionName);
        this.hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaBsasUkPropertyAdjustPostLambdaWorkerHandlerName);
        this.hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaArn);
        this.hmrcItsaBsasUkPropertyAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaBsasUkPropertyAdjustPostWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaBsasUkPropertyAdjustPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaFunctionName);
        this.hmrcItsaBsasUkPropertyAdjustPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaBsasUkPropertyAdjustPostIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
                this.hmrcItsaBsasUkPropertyAdjustPostLambdaHttpMethod,
                this.hmrcItsaBsasUkPropertyAdjustPostLambdaUrlPath,
                "Adjust an ITSA UK property business source adjustable summary",
                "Submits income and expenses adjustments, or states there are none, for a triggered summary",
                "adjustItsaBsasUkProperty",
                List.of(
                        new ApiParameter("nino", "body", true, "National Insurance number"),
                        new ApiParameter("calculationId", "body", true, "The calculation id from a triggered summary"),
                        new ApiParameter("taxYear", "body", true, "Tax year in the format YYYY-YY"),
                        new ApiParameter("income", "body", false, "Income adjustments"),
                        new ApiParameter("expenses", "body", false, "Expenses adjustments"),
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaCalculationTriggerPostLambdaHandlerDashed);
        this.hmrcItsaCalculationTriggerPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaCalculationTriggerPostLambdaHandlerName);
        this.hmrcItsaCalculationTriggerPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaCalculationTriggerPostLambdaHandlerDashed);
        this.hmrcItsaCalculationTriggerPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaCalculationTriggerPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaCalculationTriggerPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaCalculationTriggerPostIngestLambdaFunctionName);
        this.hmrcItsaCalculationTriggerPostWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaCalculationTriggerPostLambdaWorkerHandlerName);
        this.hmrcItsaCalculationTriggerPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaCalculationTriggerPostIngestLambdaArn);
        this.hmrcItsaCalculationTriggerPostWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaCalculationTriggerPostWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaCalculationTriggerPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaCalculationTriggerPostIngestLambdaFunctionName);
        this.hmrcItsaCalculationTriggerPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaCalculationTriggerPostIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaCalculationGetLambdaHandlerDashed);
        this.hmrcItsaCalculationGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaCalculationGetLambdaHandlerName);
        this.hmrcItsaCalculationGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaCalculationGetLambdaHandlerDashed);
        this.hmrcItsaCalculationGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaCalculationGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaCalculationGetWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaCalculationGetIngestLambdaFunctionName);
        this.hmrcItsaCalculationGetWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaCalculationGetLambdaWorkerHandlerName);
        this.hmrcItsaCalculationGetWorkerLambdaArn = "%s-worker".formatted(this.hmrcItsaCalculationGetIngestLambdaArn);
        this.hmrcItsaCalculationGetWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.hmrcItsaCalculationGetWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaCalculationGetLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaCalculationGetIngestLambdaFunctionName);
        this.hmrcItsaCalculationGetLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaCalculationGetIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, hmrcItsaFinalDeclarationPostLambdaHandlerDashed);
        this.hmrcItsaFinalDeclarationPostIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaFinalDeclarationPostLambdaHandlerName);
        this.hmrcItsaFinalDeclarationPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, hmrcItsaFinalDeclarationPostLambdaHandlerDashed);
        this.hmrcItsaFinalDeclarationPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaFinalDeclarationPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaFinalDeclarationPostWorkerLambdaFunctionName =
                "%s-worker".formatted(this.hmrcItsaFinalDeclarationPostIngestLambdaFunctionName);
        this.hmrcItsaFinalDeclarationPostWorkerLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, hmrcItsaFinalDeclarationPostLambdaWorkerHandlerName);
        this.hmrcItsaFinalDeclarationPostWorkerLambdaArn =
                "%s-worker".formatted(this.hmrcItsaFinalDeclarationPostIngestLambdaArn);
        this.hmrcItsaFinalDeclarationPostWorkerProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.hmrcItsaFinalDeclarationPostWorkerLambdaArn, this.provisionedConcurrencyAliasName);
        this.hmrcItsaFinalDeclarationPostLambdaQueueName =
                "%s-queue".formatted(this.hmrcItsaFinalDeclarationPostIngestLambdaFunctionName);
        this.hmrcItsaFinalDeclarationPostLambdaDeadLetterQueueName =
                "%s-dlq".formatted(this.hmrcItsaFinalDeclarationPostIngestLambdaFunctionName);
        publishedApiLambdas.add(new PublishedLambda(
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
                "%s-%s".formatted(this.appResourceNamePrefix, receiptGetLambdaHandlerDashed);
        this.receiptGetIngestLambdaHandler =
                "%s/hmrc/%s".formatted(appLambdaHandlerPrefix, receiptGetLambdaHandlerName);
        this.receiptGetIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, receiptGetLambdaHandlerDashed);
        this.receiptGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.receiptGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.receiptGetLambdaHttpMethod,
                this.receiptGetLambdaUrlPath,
                "Retrieve stored receipts",
                "Retrieves previously stored receipts for the authenticated user",
                "getReceipts",
                List.of(
                        new ApiParameter("name", "query", false, "Receipt file name including .json"),
                        new ApiParameter("key", "query", false, "Full DynamoDB Item key"))));
        publishedApiLambdas.add(new PublishedLambda(
                this.receiptGetLambdaHttpMethod,
                this.receiptGetByNameLambdaUrlPath,
                "Retrieve a stored receipt by name",
                "Retrieves a specific stored receipt for the authenticated user by file name",
                "getReceiptByName",
                List.of(new ApiParameter("name", "path", true, "The receipt file name including .json"))));

        this.companiesHouseSearchGetLambdaHttpMethod = HttpMethod.GET;
        this.companiesHouseSearchGetLambdaUrlPath = "/api/v1/companies-house/search";
        this.companiesHouseSearchGetLambdaJwtAuthorizer = true;
        this.companiesHouseSearchGetLambdaCustomAuthorizer = false;
        var companiesHouseSearchGetLambdaHandlerName = "companiesHouseSearchGet.ingestHandler";
        var companiesHouseSearchGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(companiesHouseSearchGetLambdaHandlerName);
        this.companiesHouseSearchGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, companiesHouseSearchGetLambdaHandlerDashed);
        this.companiesHouseSearchGetIngestLambdaHandler =
                "%s/companies-house/%s".formatted(appLambdaHandlerPrefix, companiesHouseSearchGetLambdaHandlerName);
        this.companiesHouseSearchGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseSearchGetLambdaHandlerDashed);
        this.companiesHouseSearchGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.companiesHouseSearchGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseSearchGetLambdaHttpMethod,
                this.companiesHouseSearchGetLambdaUrlPath,
                "Search Companies House",
                "Searches Companies House for a company by name or number",
                "searchCompanies",
                List.of(
                        new ApiParameter("q", "query", true, "Company name or number search term"),
                        new ApiParameter("itemsPerPage", "query", false, "Results per page (1-50, default 20)"),
                        new ApiParameter("startIndex", "query", false, "Zero-based offset into the result set"))));

        this.companiesHouseCompanyGetLambdaHttpMethod = HttpMethod.GET;
        this.companiesHouseCompanyGetLambdaUrlPath = "/api/v1/companies-house/company/{companyNumber}";
        this.companiesHouseCompanyGetLambdaJwtAuthorizer = true;
        this.companiesHouseCompanyGetLambdaCustomAuthorizer = false;
        var companiesHouseCompanyGetLambdaHandlerName = "companiesHouseCompanyGet.ingestHandler";
        var companiesHouseCompanyGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(companiesHouseCompanyGetLambdaHandlerName);
        this.companiesHouseCompanyGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, companiesHouseCompanyGetLambdaHandlerDashed);
        this.companiesHouseCompanyGetIngestLambdaHandler =
                "%s/companies-house/%s".formatted(appLambdaHandlerPrefix, companiesHouseCompanyGetLambdaHandlerName);
        this.companiesHouseCompanyGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseCompanyGetLambdaHandlerDashed);
        this.companiesHouseCompanyGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.companiesHouseCompanyGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseCompanyGetLambdaHttpMethod,
                this.companiesHouseCompanyGetLambdaUrlPath,
                "Get a Companies House company profile",
                "Retrieves the Companies House profile for a company number",
                "getCompanyProfile",
                List.of(new ApiParameter("companyNumber", "path", true, "The 8-character company number"))));

        this.companiesHouseTokenPostLambdaHttpMethod = HttpMethod.POST;
        this.companiesHouseTokenPostLambdaUrlPath = "/api/v1/companies-house/token";
        this.companiesHouseTokenPostLambdaJwtAuthorizer = false;
        this.companiesHouseTokenPostLambdaCustomAuthorizer = false;
        var companiesHouseTokenPostLambdaHandlerName = "companiesHouseTokenPost.ingestHandler";
        var companiesHouseTokenPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(companiesHouseTokenPostLambdaHandlerName);
        this.companiesHouseTokenPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, companiesHouseTokenPostLambdaHandlerDashed);
        this.companiesHouseTokenPostIngestLambdaHandler =
                "%s/companies-house/%s".formatted(appLambdaHandlerPrefix, companiesHouseTokenPostLambdaHandlerName);
        this.companiesHouseTokenPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseTokenPostLambdaHandlerDashed);
        this.companiesHouseTokenPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.companiesHouseTokenPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseTokenPostLambdaHttpMethod,
                this.companiesHouseTokenPostLambdaUrlPath,
                "Exchange Companies House authorization code for access token",
                "Exchanges a Companies House OAuth authorisation code for an access token",
                "exchangeCompaniesHouseToken"));

        this.companiesHouseTransactionPostLambdaHttpMethod = HttpMethod.POST;
        this.companiesHouseTransactionPostLambdaUrlPath = "/api/v1/companies-house/transaction";
        this.companiesHouseTransactionPostLambdaJwtAuthorizer = false;
        this.companiesHouseTransactionPostLambdaCustomAuthorizer = true;
        var companiesHouseTransactionPostLambdaHandlerName = "companiesHouseTransactionPost.ingestHandler";
        var companiesHouseTransactionPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(companiesHouseTransactionPostLambdaHandlerName);
        this.companiesHouseTransactionPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, companiesHouseTransactionPostLambdaHandlerDashed);
        this.companiesHouseTransactionPostIngestLambdaHandler = "%s/companies-house/%s"
                .formatted(appLambdaHandlerPrefix, companiesHouseTransactionPostLambdaHandlerName);
        this.companiesHouseTransactionPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseTransactionPostLambdaHandlerDashed);
        this.companiesHouseTransactionPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.companiesHouseTransactionPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseTransactionPostLambdaHttpMethod,
                this.companiesHouseTransactionPostLambdaUrlPath,
                "Open a Companies House transaction",
                "Opens a Companies House filing transaction against a company number",
                "openCompaniesHouseTransaction",
                List.of(
                        new ApiParameter("companyNumber", "body", true, "The 8-character company number"),
                        new ApiParameter(
                                "description", "body", true, "A description of the filing, at most 200 characters"),
                        new ApiParameter("reference", "body", false, "An optional caller-supplied reference"))));

        this.companiesHouseTransactionGetLambdaHttpMethod = HttpMethod.GET;
        this.companiesHouseTransactionGetLambdaUrlPath = "/api/v1/companies-house/transaction/{transactionId}";
        this.companiesHouseTransactionGetLambdaJwtAuthorizer = false;
        this.companiesHouseTransactionGetLambdaCustomAuthorizer = true;
        var companiesHouseTransactionGetLambdaHandlerName = "companiesHouseTransactionGet.ingestHandler";
        var companiesHouseTransactionGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(companiesHouseTransactionGetLambdaHandlerName);
        this.companiesHouseTransactionGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, companiesHouseTransactionGetLambdaHandlerDashed);
        this.companiesHouseTransactionGetIngestLambdaHandler = "%s/companies-house/%s"
                .formatted(appLambdaHandlerPrefix, companiesHouseTransactionGetLambdaHandlerName);
        this.companiesHouseTransactionGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseTransactionGetLambdaHandlerDashed);
        this.companiesHouseTransactionGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.companiesHouseTransactionGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseTransactionGetLambdaHttpMethod,
                this.companiesHouseTransactionGetLambdaUrlPath,
                "Get a Companies House transaction",
                "Retrieves a Companies House filing transaction and its filing status",
                "getCompaniesHouseTransaction",
                List.of(new ApiParameter("transactionId", "path", true, "The Companies House transaction id"))));

        this.companiesHouseTransactionPutLambdaHttpMethod = HttpMethod.PUT;
        this.companiesHouseTransactionPutLambdaUrlPath = "/api/v1/companies-house/transaction/{transactionId}";
        this.companiesHouseTransactionPutLambdaJwtAuthorizer = false;
        this.companiesHouseTransactionPutLambdaCustomAuthorizer = true;
        var companiesHouseTransactionPutLambdaHandlerName = "companiesHouseTransactionPut.ingestHandler";
        var companiesHouseTransactionPutLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(companiesHouseTransactionPutLambdaHandlerName);
        this.companiesHouseTransactionPutIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, companiesHouseTransactionPutLambdaHandlerDashed);
        this.companiesHouseTransactionPutIngestLambdaHandler = "%s/companies-house/%s"
                .formatted(appLambdaHandlerPrefix, companiesHouseTransactionPutLambdaHandlerName);
        this.companiesHouseTransactionPutIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseTransactionPutLambdaHandlerDashed);
        this.companiesHouseTransactionPutIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.companiesHouseTransactionPutIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseTransactionPutLambdaHttpMethod,
                this.companiesHouseTransactionPutLambdaUrlPath,
                "Close a Companies House transaction",
                "Closes a Companies House filing transaction, submitting the filing",
                "closeCompaniesHouseTransaction",
                List.of(new ApiParameter("transactionId", "path", true, "The Companies House transaction id"))));

        this.companiesHouseRegisteredOfficeAddressGetLambdaHttpMethod = HttpMethod.GET;
        this.companiesHouseRegisteredOfficeAddressGetLambdaUrlPath =
                "/api/v1/companies-house/company/{companyNumber}/registered-office-address";
        this.companiesHouseRegisteredOfficeAddressGetLambdaJwtAuthorizer = true;
        this.companiesHouseRegisteredOfficeAddressGetLambdaCustomAuthorizer = false;
        var companiesHouseRegisteredOfficeAddressGetLambdaHandlerName =
                "companiesHouseRegisteredOfficeAddressGet.ingestHandler";
        // AWS Lambda function names cap at 64 characters. The full dashed handler name (with the
        // resource name prefix) can push past that for a long deployment name, so the deployed
        // function name drops "registered" - the handler entry point above keeps its full,
        // self-documenting name.
        var companiesHouseRegisteredOfficeAddressGetLambdaHandlerDashed = "companies-house-office-address-get";
        this.companiesHouseRegisteredOfficeAddressGetIngestLambdaFunctionName = "%s-%s"
                .formatted(this.appResourceNamePrefix, companiesHouseRegisteredOfficeAddressGetLambdaHandlerDashed);
        this.companiesHouseRegisteredOfficeAddressGetIngestLambdaHandler = "%s/companies-house/%s"
                .formatted(appLambdaHandlerPrefix, companiesHouseRegisteredOfficeAddressGetLambdaHandlerName);
        this.companiesHouseRegisteredOfficeAddressGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseRegisteredOfficeAddressGetLambdaHandlerDashed);
        this.companiesHouseRegisteredOfficeAddressGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.companiesHouseRegisteredOfficeAddressGetIngestLambdaArn,
                        this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseRegisteredOfficeAddressGetLambdaHttpMethod,
                this.companiesHouseRegisteredOfficeAddressGetLambdaUrlPath,
                "Get a company's registered office address",
                "Reads the current registered office address from the public register, with its etag",
                "getCompaniesHouseRegisteredOfficeAddress",
                List.of(new ApiParameter("companyNumber", "path", true, "The 8-character company number"))));

        this.companiesHouseRegisteredOfficeAddressPostLambdaHttpMethod = HttpMethod.POST;
        this.companiesHouseRegisteredOfficeAddressPostLambdaUrlPath =
                "/api/v1/companies-house/transaction/{transactionId}/registered-office-address";
        this.companiesHouseRegisteredOfficeAddressPostLambdaJwtAuthorizer = false;
        this.companiesHouseRegisteredOfficeAddressPostLambdaCustomAuthorizer = true;
        var companiesHouseRegisteredOfficeAddressPostLambdaHandlerName =
                "companiesHouseRegisteredOfficeAddressPost.ingestHandler";
        // See the registered office address read above: the deployed function name drops
        // "registered" to stay clear of the 64-character AWS Lambda function name cap.
        var companiesHouseRegisteredOfficeAddressPostLambdaHandlerDashed = "companies-house-office-address-post";
        this.companiesHouseRegisteredOfficeAddressPostIngestLambdaFunctionName = "%s-%s"
                .formatted(this.appResourceNamePrefix, companiesHouseRegisteredOfficeAddressPostLambdaHandlerDashed);
        this.companiesHouseRegisteredOfficeAddressPostIngestLambdaHandler = "%s/companies-house/%s"
                .formatted(appLambdaHandlerPrefix, companiesHouseRegisteredOfficeAddressPostLambdaHandlerName);
        this.companiesHouseRegisteredOfficeAddressPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseRegisteredOfficeAddressPostLambdaHandlerDashed);
        this.companiesHouseRegisteredOfficeAddressPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.companiesHouseRegisteredOfficeAddressPostIngestLambdaArn,
                        this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseRegisteredOfficeAddressPostLambdaHttpMethod,
                this.companiesHouseRegisteredOfficeAddressPostLambdaUrlPath,
                "File a registered office address change",
                "Adds a registered office address change (AD01) resource to an open transaction",
                "postCompaniesHouseRegisteredOfficeAddress",
                List.of(
                        new ApiParameter("transactionId", "path", true, "The Companies House transaction id"),
                        new ApiParameter("premises", "body", true, "The building name or number"),
                        new ApiParameter("addressLine1", "body", true, "The first address line"),
                        new ApiParameter("addressLine2", "body", false, "The second address line"),
                        new ApiParameter("locality", "body", true, "The town or city"),
                        new ApiParameter("region", "body", false, "The county or region"),
                        new ApiParameter("postalCode", "body", true, "The postcode"),
                        new ApiParameter("country", "body", true, "One of the Companies House country enum values"),
                        new ApiParameter(
                                "acceptAppropriateOfficeAddressStatement",
                                "body",
                                true,
                                "Must be true - confirms the section 86(2) Companies Act 2006 statement"),
                        new ApiParameter(
                                "referenceEtag",
                                "body",
                                true,
                                "The etag from the current registered office address read"))));

        this.companiesHouseRegisteredEmailEligibilityGetLambdaHttpMethod = HttpMethod.GET;
        this.companiesHouseRegisteredEmailEligibilityGetLambdaUrlPath =
                "/api/v1/companies-house/company/{companyNumber}/registered-email-address/eligibility";
        this.companiesHouseRegisteredEmailEligibilityGetLambdaJwtAuthorizer = false;
        this.companiesHouseRegisteredEmailEligibilityGetLambdaCustomAuthorizer = true;
        var companiesHouseRegisteredEmailEligibilityGetLambdaHandlerName =
                "companiesHouseRegisteredEmailEligibilityGet.ingestHandler";
        // See the registered office address read above: the deployed function name drops
        // "registered" to stay clear of the 64-character AWS Lambda function name cap.
        var companiesHouseRegisteredEmailEligibilityGetLambdaHandlerDashed = "companies-house-email-eligibility-get";
        this.companiesHouseRegisteredEmailEligibilityGetIngestLambdaFunctionName = "%s-%s"
                .formatted(this.appResourceNamePrefix, companiesHouseRegisteredEmailEligibilityGetLambdaHandlerDashed);
        this.companiesHouseRegisteredEmailEligibilityGetIngestLambdaHandler = "%s/companies-house/%s"
                .formatted(appLambdaHandlerPrefix, companiesHouseRegisteredEmailEligibilityGetLambdaHandlerName);
        this.companiesHouseRegisteredEmailEligibilityGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseRegisteredEmailEligibilityGetLambdaHandlerDashed);
        this.companiesHouseRegisteredEmailEligibilityGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.companiesHouseRegisteredEmailEligibilityGetIngestLambdaArn,
                        this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseRegisteredEmailEligibilityGetLambdaHttpMethod,
                this.companiesHouseRegisteredEmailEligibilityGetLambdaUrlPath,
                "Check registered email address change eligibility",
                "Checks whether a company is eligible for a registered email address change",
                "getCompaniesHouseRegisteredEmailEligibility",
                List.of(new ApiParameter("companyNumber", "path", true, "The 8-character company number"))));

        this.companiesHouseRegisteredEmailAddressPostLambdaHttpMethod = HttpMethod.POST;
        this.companiesHouseRegisteredEmailAddressPostLambdaUrlPath =
                "/api/v1/companies-house/transaction/{transactionId}/registered-email-address";
        this.companiesHouseRegisteredEmailAddressPostLambdaJwtAuthorizer = false;
        this.companiesHouseRegisteredEmailAddressPostLambdaCustomAuthorizer = true;
        var companiesHouseRegisteredEmailAddressPostLambdaHandlerName =
                "companiesHouseRegisteredEmailAddressPost.ingestHandler";
        // See the registered office address read above: the deployed function name drops
        // "registered" to stay clear of the 64-character AWS Lambda function name cap.
        var companiesHouseRegisteredEmailAddressPostLambdaHandlerDashed = "companies-house-email-address-post";
        this.companiesHouseRegisteredEmailAddressPostIngestLambdaFunctionName = "%s-%s"
                .formatted(this.appResourceNamePrefix, companiesHouseRegisteredEmailAddressPostLambdaHandlerDashed);
        this.companiesHouseRegisteredEmailAddressPostIngestLambdaHandler = "%s/companies-house/%s"
                .formatted(appLambdaHandlerPrefix, companiesHouseRegisteredEmailAddressPostLambdaHandlerName);
        this.companiesHouseRegisteredEmailAddressPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseRegisteredEmailAddressPostLambdaHandlerDashed);
        this.companiesHouseRegisteredEmailAddressPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.companiesHouseRegisteredEmailAddressPostIngestLambdaArn,
                        this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseRegisteredEmailAddressPostLambdaHttpMethod,
                this.companiesHouseRegisteredEmailAddressPostLambdaUrlPath,
                "File a registered email address change",
                "Adds a registered email address change resource to an open transaction",
                "postCompaniesHouseRegisteredEmailAddress",
                List.of(
                        new ApiParameter("transactionId", "path", true, "The Companies House transaction id"),
                        new ApiParameter("registeredEmailAddress", "body", true, "The new registered email address"),
                        new ApiParameter(
                                "acceptAppropriateEmailAddressStatement",
                                "body",
                                true,
                                "Must be true - confirms the section 88A(2) Companies Act 2006 statement"))));

        this.companiesHouseAccountsPreviewPostLambdaHttpMethod = HttpMethod.POST;
        this.companiesHouseAccountsPreviewPostLambdaUrlPath = "/api/v1/companies-house/accounts/preview";
        this.companiesHouseAccountsPreviewPostLambdaJwtAuthorizer = true;
        this.companiesHouseAccountsPreviewPostLambdaCustomAuthorizer = false;
        var companiesHouseAccountsPreviewPostLambdaHandlerName = "companiesHouseAccountsPreviewPost.ingestHandler";
        var companiesHouseAccountsPreviewPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(companiesHouseAccountsPreviewPostLambdaHandlerName);
        this.companiesHouseAccountsPreviewPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, companiesHouseAccountsPreviewPostLambdaHandlerDashed);
        this.companiesHouseAccountsPreviewPostIngestLambdaHandler = "%s/companies-house/%s"
                .formatted(appLambdaHandlerPrefix, companiesHouseAccountsPreviewPostLambdaHandlerName);
        this.companiesHouseAccountsPreviewPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseAccountsPreviewPostLambdaHandlerDashed);
        this.companiesHouseAccountsPreviewPostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.companiesHouseAccountsPreviewPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseAccountsPreviewPostLambdaHttpMethod,
                this.companiesHouseAccountsPreviewPostLambdaUrlPath,
                "Preview a micro-entity accounts filing",
                "Renders the FRS 105 micro-entity iXBRL from the balance sheet without submitting it",
                "previewCompaniesHouseAccounts"));

        this.companiesHouseAccountsPostLambdaHttpMethod = HttpMethod.POST;
        this.companiesHouseAccountsPostLambdaUrlPath = "/api/v1/companies-house/accounts";
        this.companiesHouseAccountsPostLambdaJwtAuthorizer = true;
        this.companiesHouseAccountsPostLambdaCustomAuthorizer = false;
        var companiesHouseAccountsPostLambdaHandlerName = "companiesHouseAccountsPost.ingestHandler";
        var companiesHouseAccountsPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(companiesHouseAccountsPostLambdaHandlerName);
        this.companiesHouseAccountsPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, companiesHouseAccountsPostLambdaHandlerDashed);
        this.companiesHouseAccountsPostIngestLambdaHandler =
                "%s/companies-house/%s".formatted(appLambdaHandlerPrefix, companiesHouseAccountsPostLambdaHandlerName);
        this.companiesHouseAccountsPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseAccountsPostLambdaHandlerDashed);
        this.companiesHouseAccountsPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.companiesHouseAccountsPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseAccountsPostLambdaHttpMethod,
                this.companiesHouseAccountsPostLambdaUrlPath,
                "Submit a micro-entity accounts filing",
                "Generates the FRS 105 micro-entity iXBRL and submits it through the Companies House XML Gateway",
                "postCompaniesHouseAccounts"));

        this.companiesHouseAccountsGetLambdaHttpMethod = HttpMethod.GET;
        this.companiesHouseAccountsGetLambdaUrlPath = "/api/v1/companies-house/accounts/{submissionNumber}";
        this.companiesHouseAccountsGetLambdaJwtAuthorizer = true;
        this.companiesHouseAccountsGetLambdaCustomAuthorizer = false;
        var companiesHouseAccountsGetLambdaHandlerName = "companiesHouseAccountsGet.ingestHandler";
        var companiesHouseAccountsGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(companiesHouseAccountsGetLambdaHandlerName);
        this.companiesHouseAccountsGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, companiesHouseAccountsGetLambdaHandlerDashed);
        this.companiesHouseAccountsGetIngestLambdaHandler =
                "%s/companies-house/%s".formatted(appLambdaHandlerPrefix, companiesHouseAccountsGetLambdaHandlerName);
        this.companiesHouseAccountsGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, companiesHouseAccountsGetLambdaHandlerDashed);
        this.companiesHouseAccountsGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.companiesHouseAccountsGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.companiesHouseAccountsGetLambdaHttpMethod,
                this.companiesHouseAccountsGetLambdaUrlPath,
                "Poll a micro-entity accounts filing",
                "Polls the Companies House XML Gateway for the outcome of a submitted accounts filing",
                "getCompaniesHouseAccounts",
                List.of(new ApiParameter("submissionNumber", "path", true, "The 6-character submission number"))));

        this.supportTicketPostLambdaHttpMethod = HttpMethod.POST;
        this.supportTicketPostLambdaUrlPath = "/api/v1/support/ticket";
        this.supportTicketPostLambdaJwtAuthorizer = false;
        this.supportTicketPostLambdaCustomAuthorizer = false;
        var supportTicketPostLambdaHandlerName = "supportTicketPost.ingestHandler";
        var supportTicketPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(supportTicketPostLambdaHandlerName);
        this.supportTicketPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, supportTicketPostLambdaHandlerDashed);
        this.supportTicketPostIngestLambdaHandler =
                "%s/support/%s".formatted(appLambdaHandlerPrefix, supportTicketPostLambdaHandlerName);
        this.supportTicketPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, supportTicketPostLambdaHandlerDashed);
        this.supportTicketPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.supportTicketPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.supportTicketPostLambdaHttpMethod,
                this.supportTicketPostLambdaUrlPath,
                "Submit a support ticket",
                "Creates a GitHub issue for the authenticated user's support request",
                "submitSupportTicket"));

        // Interest POST Lambda (JWT auth - feedback engagement)
        this.interestPostLambdaHttpMethod = HttpMethod.POST;
        this.interestPostLambdaUrlPath = "/api/v1/interest";
        this.interestPostLambdaJwtAuthorizer = true;
        this.interestPostLambdaCustomAuthorizer = false;
        var interestPostLambdaHandlerName = "interestPost.ingestHandler";
        var interestPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(interestPostLambdaHandlerName);
        this.interestPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, interestPostLambdaHandlerDashed);
        this.interestPostIngestLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, interestPostLambdaHandlerName);
        this.interestPostIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, interestPostLambdaHandlerDashed);
        this.interestPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.interestPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.interestPostLambdaHttpMethod,
                this.interestPostLambdaUrlPath,
                "Register feedback engagement",
                "Publishes the authenticated user's email to an SNS topic for feedback engagement",
                "registerInterest"));

        // Pass GET Lambda (public, no auth)
        this.passGetLambdaHttpMethod = HttpMethod.GET;
        this.passGetLambdaUrlPath = "/api/v1/pass";
        this.passGetLambdaJwtAuthorizer = false;
        this.passGetLambdaCustomAuthorizer = false;
        var passGetLambdaHandlerName = "passGet.ingestHandler";
        var passGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(passGetLambdaHandlerName);
        this.passGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, passGetLambdaHandlerDashed);
        this.passGetIngestLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, passGetLambdaHandlerName);
        this.passGetIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, passGetLambdaHandlerDashed);
        this.passGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.passGetLambdaHttpMethod,
                this.passGetLambdaUrlPath,
                "Validate a pass code",
                "Checks if a pass code is valid and returns its details",
                "validatePass",
                List.of(new ApiParameter("code", "query", true, "The four-word pass code to validate"))));

        // Pass POST Lambda (JWT auth)
        this.passPostLambdaHttpMethod = HttpMethod.POST;
        this.passPostLambdaUrlPath = "/api/v1/pass";
        this.passPostLambdaJwtAuthorizer = true;
        this.passPostLambdaCustomAuthorizer = false;
        var passPostLambdaHandlerName = "passPost.ingestHandler";
        var passPostLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(passPostLambdaHandlerName);
        this.passPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, passPostLambdaHandlerDashed);
        this.passPostIngestLambdaHandler = "%s/account/%s".formatted(appLambdaHandlerPrefix, passPostLambdaHandlerName);
        this.passPostIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, passPostLambdaHandlerDashed);
        this.passPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.passPostLambdaHttpMethod,
                this.passPostLambdaUrlPath,
                "Redeem a pass code",
                "Redeems a pass code and grants the associated bundle to the authenticated user",
                "redeemPass"));

        // Pass Admin POST Lambda (JWT auth)
        this.passAdminPostLambdaHttpMethod = HttpMethod.POST;
        this.passAdminPostLambdaUrlPath = "/api/v1/pass/admin";
        this.passAdminPostLambdaJwtAuthorizer = false;
        this.passAdminPostLambdaCustomAuthorizer = false;
        var passAdminPostLambdaHandlerName = "passAdminPost.ingestHandler";
        var passAdminPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(passAdminPostLambdaHandlerName);
        this.passAdminPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, passAdminPostLambdaHandlerDashed);
        this.passAdminPostIngestLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, passAdminPostLambdaHandlerName);
        this.passAdminPostIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, passAdminPostLambdaHandlerDashed);
        this.passAdminPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passAdminPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.passAdminPostLambdaHttpMethod,
                this.passAdminPostLambdaUrlPath,
                "Generate a new pass",
                "Generates a new pass code for a specified bundle type (admin only)",
                "generatePass"));

        // Pass Generate POST Lambda (JWT auth - user pass generation using tokens)
        this.passGeneratePostLambdaHttpMethod = HttpMethod.POST;
        this.passGeneratePostLambdaUrlPath = "/api/v1/pass/generate";
        this.passGeneratePostLambdaJwtAuthorizer = true;
        this.passGeneratePostLambdaCustomAuthorizer = false;
        var passGeneratePostLambdaHandlerName = "passGeneratePost.ingestHandler";
        var passGeneratePostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(passGeneratePostLambdaHandlerName);
        this.passGeneratePostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, passGeneratePostLambdaHandlerDashed);
        this.passGeneratePostIngestLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, passGeneratePostLambdaHandlerName);
        this.passGeneratePostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, passGeneratePostLambdaHandlerDashed);
        this.passGeneratePostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passGeneratePostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.passGeneratePostLambdaHttpMethod,
                this.passGeneratePostLambdaUrlPath,
                "Generate a pass using tokens",
                "Generates a new pass code using the authenticated user's token balance",
                "generatePassWithTokens"));

        // Pass My Passes GET Lambda (JWT auth - list user's generated passes)
        this.passMyPassesGetLambdaHttpMethod = HttpMethod.GET;
        this.passMyPassesGetLambdaUrlPath = "/api/v1/pass/my-passes";
        this.passMyPassesGetLambdaJwtAuthorizer = true;
        this.passMyPassesGetLambdaCustomAuthorizer = false;
        var passMyPassesGetLambdaHandlerName = "passMyPassesGet.ingestHandler";
        var passMyPassesGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(passMyPassesGetLambdaHandlerName);
        this.passMyPassesGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, passMyPassesGetLambdaHandlerDashed);
        this.passMyPassesGetIngestLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, passMyPassesGetLambdaHandlerName);
        this.passMyPassesGetIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, passMyPassesGetLambdaHandlerDashed);
        this.passMyPassesGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passMyPassesGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.passMyPassesGetLambdaHttpMethod,
                this.passMyPassesGetLambdaUrlPath,
                "List generated passes",
                "Lists all passes generated by the authenticated user",
                "listMyPasses",
                List.of(new ApiParameter(
                        "limit", "query", false, "Maximum number of passes to return (default 20, max 50)"))));

        // Bundle Capacity Reconciliation Lambda (scheduled, not API)
        var bundleCapacityReconcileLambdaHandlerName = "bundleCapacityReconcile.handler";
        var bundleCapacityReconcileLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundleCapacityReconcileLambdaHandlerName);
        this.bundleCapacityReconcileLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, bundleCapacityReconcileLambdaHandlerDashed);
        this.bundleCapacityReconcileLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, bundleCapacityReconcileLambdaHandlerName);
        this.bundleCapacityReconcileLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, bundleCapacityReconcileLambdaHandlerDashed);
        this.bundleCapacityReconcileProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.bundleCapacityReconcileLambdaArn, this.provisionedConcurrencyAliasName);

        // Session Beacon POST Lambda (public, no auth). Path carries the /api/v1 prefix, not
        // the bare /api/session/beacon the endpoint used before: CloudFront only forwards
        // /api/v1/* and /api/v1/books/* to API Gateway, so a bare /api/* path fell through to
        // the default S3 behaviour (GET/HEAD/OPTIONS only) and every POST here was rejected by
        // CloudFront before it ever reached this Lambda - zero invocations, and so zero
        // new-session and logout activity events ever reached the lake.
        this.sessionBeaconPostLambdaHttpMethod = HttpMethod.POST;
        this.sessionBeaconPostLambdaUrlPath = "/api/v1/session/beacon";
        this.sessionBeaconPostLambdaJwtAuthorizer = false;
        this.sessionBeaconPostLambdaCustomAuthorizer = false;
        var sessionBeaconPostLambdaHandlerName = "sessionBeaconPost.ingestHandler";
        var sessionBeaconPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(sessionBeaconPostLambdaHandlerName);
        this.sessionBeaconPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, sessionBeaconPostLambdaHandlerDashed);
        this.sessionBeaconPostIngestLambdaHandler =
                "%s/account/%s".formatted(appLambdaHandlerPrefix, sessionBeaconPostLambdaHandlerName);
        this.sessionBeaconPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, sessionBeaconPostLambdaHandlerDashed);
        this.sessionBeaconPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.sessionBeaconPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.sessionBeaconPostLambdaHttpMethod,
                this.sessionBeaconPostLambdaUrlPath,
                "Session beacon",
                "Records a new browser session for activity monitoring",
                "sessionBeacon"));

        // Billing Checkout POST Lambda (billing JWT auth: main and books client audiences)
        this.billingCheckoutPostLambdaHttpMethod = HttpMethod.POST;
        this.billingCheckoutPostLambdaUrlPath = "/api/v1/billing/checkout";
        this.billingCheckoutPostLambdaJwtAuthorizer = false;
        this.billingCheckoutPostLambdaCustomAuthorizer = false;
        var billingCheckoutPostLambdaHandlerName = "billingCheckoutPost.ingestHandler";
        var billingCheckoutPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingCheckoutPostLambdaHandlerName);
        this.billingCheckoutPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, billingCheckoutPostLambdaHandlerDashed);
        this.billingCheckoutPostIngestLambdaHandler =
                "%s/billing/%s".formatted(appLambdaHandlerPrefix, billingCheckoutPostLambdaHandlerName);
        this.billingCheckoutPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, billingCheckoutPostLambdaHandlerDashed);
        this.billingCheckoutPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.billingCheckoutPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.billingCheckoutPostLambdaHttpMethod,
                this.billingCheckoutPostLambdaUrlPath,
                "Create billing checkout session",
                "Creates a Stripe checkout session for subscription",
                "createCheckoutSession"));

        // Billing Checkout Session GET Lambda (JWT auth)
        this.billingCheckoutSessionGetLambdaHttpMethod = HttpMethod.GET;
        this.billingCheckoutSessionGetLambdaUrlPath = "/api/v1/billing/checkout/{id}";
        this.billingCheckoutSessionGetLambdaJwtAuthorizer = true;
        this.billingCheckoutSessionGetLambdaCustomAuthorizer = false;
        var billingCheckoutSessionGetLambdaHandlerName = "billingCheckoutSessionGet.ingestHandler";
        var billingCheckoutSessionGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingCheckoutSessionGetLambdaHandlerName);
        this.billingCheckoutSessionGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, billingCheckoutSessionGetLambdaHandlerDashed);
        this.billingCheckoutSessionGetIngestLambdaHandler =
                "%s/billing/%s".formatted(appLambdaHandlerPrefix, billingCheckoutSessionGetLambdaHandlerName);
        this.billingCheckoutSessionGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, billingCheckoutSessionGetLambdaHandlerDashed);
        this.billingCheckoutSessionGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.billingCheckoutSessionGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.billingCheckoutSessionGetLambdaHttpMethod,
                this.billingCheckoutSessionGetLambdaUrlPath,
                "Retrieve a billing checkout session",
                "Retrieves the amount, currency and bundle of a completed Stripe checkout session for the authenticated user",
                "getCheckoutSession",
                List.of(new ApiParameter("id", "path", true, "The Stripe checkout session id"))));

        // Billing Portal GET Lambda (billing JWT auth: main and books client audiences)
        this.billingPortalGetLambdaHttpMethod = HttpMethod.GET;
        this.billingPortalGetLambdaUrlPath = "/api/v1/billing/portal";
        this.billingPortalGetLambdaJwtAuthorizer = false;
        this.billingPortalGetLambdaCustomAuthorizer = false;
        var billingPortalGetLambdaHandlerName = "billingPortalGet.ingestHandler";
        var billingPortalGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingPortalGetLambdaHandlerName);
        this.billingPortalGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, billingPortalGetLambdaHandlerDashed);
        this.billingPortalGetIngestLambdaHandler =
                "%s/billing/%s".formatted(appLambdaHandlerPrefix, billingPortalGetLambdaHandlerName);
        this.billingPortalGetIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, billingPortalGetLambdaHandlerDashed);
        this.billingPortalGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.billingPortalGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.billingPortalGetLambdaHttpMethod,
                this.billingPortalGetLambdaUrlPath,
                "Get billing portal URL",
                "Creates a Stripe billing portal session URL",
                "getBillingPortal"));

        // Billing Recover POST Lambda (JWT auth)
        this.billingRecoverPostLambdaHttpMethod = HttpMethod.POST;
        this.billingRecoverPostLambdaUrlPath = "/api/v1/billing/recover";
        this.billingRecoverPostLambdaJwtAuthorizer = true;
        this.billingRecoverPostLambdaCustomAuthorizer = false;
        var billingRecoverPostLambdaHandlerName = "billingRecoverPost.ingestHandler";
        var billingRecoverPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingRecoverPostLambdaHandlerName);
        this.billingRecoverPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, billingRecoverPostLambdaHandlerDashed);
        this.billingRecoverPostIngestLambdaHandler =
                "%s/billing/%s".formatted(appLambdaHandlerPrefix, billingRecoverPostLambdaHandlerName);
        this.billingRecoverPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, billingRecoverPostLambdaHandlerDashed);
        this.billingRecoverPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.billingRecoverPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.billingRecoverPostLambdaHttpMethod,
                this.billingRecoverPostLambdaUrlPath,
                "Recover billing subscription",
                "Recovers or reconciles a billing subscription",
                "recoverBilling"));

        // Billing Webhook POST Lambda (NO auth - Stripe signature verification)
        this.billingWebhookPostLambdaHttpMethod = HttpMethod.POST;
        this.billingWebhookPostLambdaUrlPath = "/api/v1/billing/webhook";
        this.billingWebhookPostLambdaJwtAuthorizer = false;
        this.billingWebhookPostLambdaCustomAuthorizer = false;
        var billingWebhookPostLambdaHandlerName = "billingWebhookPost.ingestHandler";
        var billingWebhookPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(billingWebhookPostLambdaHandlerName);
        this.billingWebhookPostIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, billingWebhookPostLambdaHandlerDashed);
        this.billingWebhookPostIngestLambdaHandler =
                "%s/billing/%s".formatted(appLambdaHandlerPrefix, billingWebhookPostLambdaHandlerName);
        this.billingWebhookPostIngestLambdaArn =
                "%s-%s".formatted(appLambdaArnPrefix, billingWebhookPostLambdaHandlerDashed);
        this.billingWebhookPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.billingWebhookPostIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.billingWebhookPostLambdaHttpMethod,
                this.billingWebhookPostLambdaUrlPath,
                "Stripe webhook",
                "Receives Stripe webhook events for subscription lifecycle",
                "stripeWebhook"));

        // DIYA-GL List GET Lambda (DIYA-GL JWT auth, scoped to the DIYA-GL app client)
        this.diyaGlListGetLambdaHttpMethod = HttpMethod.GET;
        this.diyaGlListGetLambdaUrlPath = "/api/v1/diya-gl";
        this.diyaGlListGetBooksUrlPath = "/api/v1/books";
        this.diyaGlListGetLambdaJwtAuthorizer = false;
        this.diyaGlListGetLambdaCustomAuthorizer = false;
        var diyaGlListGetLambdaHandlerName = "diyaGlListGet.ingestHandler";
        var diyaGlListGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(diyaGlListGetLambdaHandlerName);
        this.diyaGlListGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, diyaGlListGetLambdaHandlerDashed);
        this.diyaGlListGetIngestLambdaHandler =
                "%s/diyaGl/%s".formatted(appLambdaHandlerPrefix, diyaGlListGetLambdaHandlerName);
        this.diyaGlListGetIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, diyaGlListGetLambdaHandlerDashed);
        this.diyaGlListGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.diyaGlListGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.diyaGlListGetLambdaHttpMethod,
                this.diyaGlListGetLambdaUrlPath,
                "List the caller's books",
                "Lists every stored book's metadata for the authenticated books user",
                "listBooks"));

        // DIYA-GL Version GET Lambda (books JWT auth)
        this.diyaGlVersionGetLambdaHttpMethod = HttpMethod.GET;
        this.diyaGlVersionGetLambdaUrlPath = "/api/v1/diya-gl/{bookId}/versions/{version}";
        this.diyaGlVersionGetBooksUrlPath = "/api/v1/books/{bookId}/versions/{version}";
        this.diyaGlVersionGetLambdaJwtAuthorizer = false;
        this.diyaGlVersionGetLambdaCustomAuthorizer = false;
        var diyaGlVersionGetLambdaHandlerName = "diyaGlVersionGet.ingestHandler";
        var diyaGlVersionGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(diyaGlVersionGetLambdaHandlerName);
        this.diyaGlVersionGetIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, diyaGlVersionGetLambdaHandlerDashed);
        this.diyaGlVersionGetIngestLambdaHandler =
                "%s/diyaGl/%s".formatted(appLambdaHandlerPrefix, diyaGlVersionGetLambdaHandlerName);
        this.diyaGlVersionGetIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, diyaGlVersionGetLambdaHandlerDashed);
        this.diyaGlVersionGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.diyaGlVersionGetIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.diyaGlVersionGetLambdaHttpMethod,
                this.diyaGlVersionGetLambdaUrlPath,
                "Read a book version",
                "Reads one version of a stored book, or its latest version, for the authenticated books user",
                "getBookVersion",
                List.of(
                        new ApiParameter("bookId", "path", true, "The book's id"),
                        new ApiParameter("version", "path", true, "\"latest\" or a positive version number"))));

        // DIYA-GL PUT Lambda (books JWT auth)
        this.diyaGlPutLambdaHttpMethod = HttpMethod.PUT;
        this.diyaGlPutLambdaUrlPath = "/api/v1/diya-gl/{bookId}";
        this.diyaGlPutBooksUrlPath = "/api/v1/books/{bookId}";
        this.diyaGlPutLambdaJwtAuthorizer = false;
        this.diyaGlPutLambdaCustomAuthorizer = false;
        var diyaGlPutLambdaHandlerName = "diyaGlPut.ingestHandler";
        var diyaGlPutLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(diyaGlPutLambdaHandlerName);
        this.diyaGlPutIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, diyaGlPutLambdaHandlerDashed);
        this.diyaGlPutIngestLambdaHandler = "%s/diyaGl/%s".formatted(appLambdaHandlerPrefix, diyaGlPutLambdaHandlerName);
        this.diyaGlPutIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, diyaGlPutLambdaHandlerDashed);
        this.diyaGlPutIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.diyaGlPutIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.diyaGlPutLambdaHttpMethod,
                this.diyaGlPutLambdaUrlPath,
                "Store a book version",
                "Writes the next version of a book with optimistic concurrency via If-Match",
                "putBook",
                List.of(new ApiParameter("bookId", "path", true, "The book's id"))));

        // DIYA-GL DELETE Lambda (books JWT auth)
        this.diyaGlDeleteLambdaHttpMethod = HttpMethod.DELETE;
        this.diyaGlDeleteLambdaUrlPath = "/api/v1/diya-gl/{bookId}";
        this.diyaGlDeleteBooksUrlPath = "/api/v1/books/{bookId}";
        this.diyaGlDeleteLambdaJwtAuthorizer = false;
        this.diyaGlDeleteLambdaCustomAuthorizer = false;
        var diyaGlDeleteLambdaHandlerName = "diyaGlDelete.ingestHandler";
        var diyaGlDeleteLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(diyaGlDeleteLambdaHandlerName);
        this.diyaGlDeleteIngestLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, diyaGlDeleteLambdaHandlerDashed);
        this.diyaGlDeleteIngestLambdaHandler =
                "%s/diyaGl/%s".formatted(appLambdaHandlerPrefix, diyaGlDeleteLambdaHandlerName);
        this.diyaGlDeleteIngestLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, diyaGlDeleteLambdaHandlerDashed);
        this.diyaGlDeleteIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.diyaGlDeleteIngestLambdaArn, this.provisionedConcurrencyAliasName);
        publishedApiLambdas.add(new PublishedLambda(
                this.diyaGlDeleteLambdaHttpMethod,
                this.diyaGlDeleteLambdaUrlPath,
                "Delete a book",
                "Deletes a book and every stored version for the authenticated books user",
                "deleteBook",
                List.of(new ApiParameter("bookId", "path", true, "The book's id"))));

        // Alarm-to-GitHub-issue Lambda (EventBridge target, not API)
        var alarmToGithubIssueLambdaHandlerName = "alarmToGithubIssue.handler";
        var alarmToGithubIssueLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(alarmToGithubIssueLambdaHandlerName);
        this.alarmToGithubIssueLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, alarmToGithubIssueLambdaHandlerDashed);
        this.alarmToGithubIssueLambdaHandler =
                "%s/ops/%s".formatted(appLambdaHandlerPrefix, alarmToGithubIssueLambdaHandlerName);
        this.alarmToGithubIssueLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, alarmToGithubIssueLambdaHandlerDashed);
        this.alarmToGithubIssueProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.alarmToGithubIssueLambdaArn, this.provisionedConcurrencyAliasName);

        var appSelfDestructLambdaHandlerName = "selfDestruct.ingestHandler";
        var appSelfDestructLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(appSelfDestructLambdaHandlerName);
        this.selfDestructLambdaFunctionName =
                "%s-%s".formatted(this.appResourceNamePrefix, appSelfDestructLambdaHandlerDashed);
        this.selfDestructLambdaHandler =
                "%s/infra/%s".formatted(appLambdaHandlerPrefix, appSelfDestructLambdaHandlerName);
        this.selfDestructLambdaArn = "%s-%s".formatted(appLambdaArnPrefix, appSelfDestructLambdaHandlerDashed);
        this.selfDestructProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.selfDestructLambdaArn, this.provisionedConcurrencyAliasName);

        this.alarmTriageRoleName = "%s-alarm-triage-role".formatted(this.envResourceNamePrefix);
        this.alarmTriageGuardrailName = "%s-alarm-triage-guardrail".formatted(this.envResourceNamePrefix);
        this.alarmTriageGuardrailIdParameterName = "/submit/%s/alarm-triage/guardrail-id".formatted(props.envName);
        this.alarmTriageGuardrailVersionParameterName =
                "/submit/%s/alarm-triage/guardrail-version".formatted(props.envName);
    }

    /**
     * Firehose delivery stream name for one DynamoDB table's change records, e.g.
     * {@code ci-env-stream-receipts}. Parameterized rather than a fixed field because it is
     * needed once per streamed table (receipts, bundles, subscriptions, passes).
     *
     * @param table the table's short name, e.g. "receipts"
     * @return the delivery stream name
     */
    public String tableStreamDeliveryStreamName(String table) {
        return "%s-stream-%s".formatted(this.envResourceNamePrefix, table);
    }

    /**
     * CloudWatch log group name for a Firehose delivery stream, matching the naming this repo
     * already uses for the activity-events stream's log group.
     *
     * @param deliveryStreamName the delivery stream's name
     * @return the log group name
     */
    public String deliveryStreamLogGroupName(String deliveryStreamName) {
        return "/aws/kinesisfirehose/%s".formatted(deliveryStreamName);
    }
}
