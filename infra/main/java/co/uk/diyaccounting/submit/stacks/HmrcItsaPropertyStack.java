/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.AsyncApiLambda;
import co.uk.diyaccounting.submit.constructs.AsyncApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.utils.OperatorEmailsHelper;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.services.dynamodb.ITable;
import software.amazon.awscdk.services.dynamodb.Table;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.logs.ILogGroup;
import software.constructs.Construct;

/**
 * Holds the ITSA property Lambdas added after HmrcItsaStack reached CloudFormation's
 * 500-resource-per-stack limit: today the foreign property business source adjustable summary
 * retrieve and adjust. Each async Lambda pair costs about nineteen resources. A Lambda with a
 * fixed function name stays in the stack that first deployed it, because a move between stacks
 * fails on deploy.
 */
public class HmrcItsaPropertyStack extends Stack {

    public AbstractApiLambdaProps hmrcItsaBsasForeignPropertyGetLambdaProps;
    public Function hmrcItsaBsasForeignPropertyGetLambda;
    public ILogGroup hmrcItsaBsasForeignPropertyGetLambdaLogGroup;

    public AbstractApiLambdaProps hmrcItsaBsasForeignPropertyAdjustPostLambdaProps;
    public Function hmrcItsaBsasForeignPropertyAdjustPostLambda;
    public ILogGroup hmrcItsaBsasForeignPropertyAdjustPostLambdaLogGroup;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface HmrcItsaPropertyStackProps extends StackProps, SubmitStackProps {

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

        String baseImageTag();

        String hmrcBaseUri();

        String hmrcSandboxBaseUri();

        @Override
        SubmitSharedNames sharedNames();

        // The submission MCP's own client: read by every Lambda in this stack's
        // buildFraudHeaders call so an MCP-issued access token answers DESKTOP_APP_VIA_SERVER
        // instead of WEB_APP_VIA_SERVER. Blank until the deploy wiring sets it, the same way the
        // other stacks' own mcpUserPoolClientId props start.
        @Value.Default
        default String mcpUserPoolClientId() {
            return "";
        }

        static ImmutableHmrcItsaPropertyStackProps.Builder builder() {
            return ImmutableHmrcItsaPropertyStackProps.builder();
        }
    }

    public HmrcItsaPropertyStack(Construct scope, String id, HmrcItsaPropertyStackProps props) {
        this(scope, id, null, props);
    }

    public HmrcItsaPropertyStack(Construct scope, String id, StackProps stackProps, HmrcItsaPropertyStackProps props) {
        super(scope, id, stackProps);

        // Lookup existing DynamoDB Bundles Table
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        // Lookup existing DynamoDB HMRC API requests Table
        ITable hmrcApiRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcApiRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcApiRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA BSAS foreign property retrieve async request table
        ITable hmrcItsaBsasForeignPropertyGetAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaBsasForeignPropertyGetAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaBsasForeignPropertyGetAsyncRequestsTableName);

        // Lookup existing DynamoDB HMRC ITSA BSAS foreign property adjust async request table
        ITable hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTable = Table.fromTableName(
                this,
                "ImportedHmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTableName);

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        // Region and account for Secrets Manager access
        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        // Construct EventBridge activity bus ARN for IAM policies
        var activityBusArn = String.format(
                "arn:aws:events:%s:%s:event-bus/%s", region, account, props.sharedNames().activityBusName);

        // ITSA business source adjustable summary (foreign property) retrieve
        var itsaBsasForeignPropertyGetLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_BSAS_FOREIGN_PROPERTY_GET_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaBsasForeignPropertyGetAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaBsasForeignPropertyGetLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaBsasForeignPropertyGetLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaBsasForeignPropertyGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().hmrcItsaBsasForeignPropertyGetIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsaBsasForeignPropertyGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaBsasForeignPropertyGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaBsasForeignPropertyGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(props.sharedNames().hmrcItsaBsasForeignPropertyGetWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaBsasForeignPropertyGetWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaBsasForeignPropertyGetWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaBsasForeignPropertyGetWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaBsasForeignPropertyGetLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaBsasForeignPropertyGetLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaBsasForeignPropertyGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaBsasForeignPropertyGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaBsasForeignPropertyGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().hmrcItsaBsasForeignPropertyGetLambdaCustomAuthorizer)
                        .environment(itsaBsasForeignPropertyGetLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaBsasForeignPropertyGetLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaBsasForeignPropertyGetLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaBsasForeignPropertyGetLambdaProps = hmrcItsaBsasForeignPropertyGetLambdaUrlOrigin.apiProps;
        this.hmrcItsaBsasForeignPropertyGetLambda = hmrcItsaBsasForeignPropertyGetLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaBsasForeignPropertyGetLambdaLogGroup = hmrcItsaBsasForeignPropertyGetLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaBsasForeignPropertyGetLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA BSAS foreign property retrieval with ingestHandler %s and worker %s",
                this.hmrcItsaBsasForeignPropertyGetLambda.getNode().getId(),
                props.sharedNames().hmrcItsaBsasForeignPropertyGetIngestLambdaHandler,
                props.sharedNames().hmrcItsaBsasForeignPropertyGetWorkerLambdaHandler);

        // Grant the ITSA BSAS foreign property retrieval Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(this.hmrcItsaBsasForeignPropertyGetLambda, hmrcItsaBsasForeignPropertyGetLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaBsasForeignPropertyGetAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaBsasForeignPropertyGetLambda.getFunctionName());

        // ITSA business source adjustable summary (foreign property) adjust
        var itsaBsasForeignPropertyAdjustPostLambdaEnv = new PopulatedMap<String, String>()
                .with("DIY_SUBMIT_BASE_URL", props.sharedNames().publicBaseUrl)
                .with("HMRC_BASE_URI", props.hmrcBaseUri())
                .with("HMRC_SANDBOX_BASE_URI", props.hmrcSandboxBaseUri())
                .with("BUNDLE_DYNAMODB_TABLE_NAME", props.sharedNames().bundlesTableName)
                .with("HMRC_API_REQUESTS_DYNAMODB_TABLE_NAME", hmrcApiRequestsTable.getTableName())
                .with(
                        "HMRC_ITSA_BSAS_FOREIGN_PROPERTY_ADJUST_POST_ASYNC_REQUESTS_TABLE_NAME",
                        hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTable.getTableName())
                .with("ACTIVITY_BUS_NAME", props.sharedNames().activityBusName)
                .with("ENVIRONMENT_NAME", props.envName());
        if (props.mcpUserPoolClientId() != null && !props.mcpUserPoolClientId().isBlank()) {
            itsaBsasForeignPropertyAdjustPostLambdaEnv.with("COGNITO_MCP_CLIENT_ID", props.mcpUserPoolClientId());
        }
        var hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlOrigin = new AsyncApiLambda(
                this,
                AsyncApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaFunctionName)
                        .callsExternalApi(true)
                        .ingestHandler(props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaBsasForeignPropertyAdjustPostIngestProvisionedConcurrencyLambdaAliasArn)
                        .workerFunctionName(
                                props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaFunctionName)
                        .workerHandler(props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaHandler)
                        .workerLambdaArn(props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaArn)
                        .workerProvisionedConcurrencyAliasArn(props.sharedNames()
                                .hmrcItsaBsasForeignPropertyAdjustPostWorkerProvisionedConcurrencyLambdaAliasArn)
                        .workerQueueName(props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostLambdaQueueName)
                        .workerDeadLetterQueueName(
                                props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostLambdaDeadLetterQueueName)
                        .workerProvisionedConcurrency(0)
                        .workerLambdaTimeout(Duration.seconds(120))
                        .queueVisibilityTimeout(Duration.seconds(140))
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostLambdaHttpMethod)
                        .urlPath(props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostLambdaJwtAuthorizer)
                        .customAuthorizer(
                                props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostLambdaCustomAuthorizer)
                        .environment(itsaBsasForeignPropertyAdjustPostLambdaEnv)
                        .build());

        // Update API environment with SQS queue URL
        itsaBsasForeignPropertyAdjustPostLambdaEnv.put(
                "SQS_QUEUE_URL", hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlOrigin.queue.getQueueUrl());

        this.hmrcItsaBsasForeignPropertyAdjustPostLambdaProps =
                hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlOrigin.apiProps;
        this.hmrcItsaBsasForeignPropertyAdjustPostLambda =
                hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlOrigin.ingestLambda;
        this.hmrcItsaBsasForeignPropertyAdjustPostLambdaLogGroup =
                hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlOrigin.logGroup;
        this.lambdaFunctionProps.add(this.hmrcItsaBsasForeignPropertyAdjustPostLambdaProps);
        infof(
                "Created Async API Lambda %s for ITSA BSAS foreign property adjustment with ingestHandler %s and worker %s",
                this.hmrcItsaBsasForeignPropertyAdjustPostLambda.getNode().getId(),
                props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostIngestLambdaHandler,
                props.sharedNames().hmrcItsaBsasForeignPropertyAdjustPostWorkerLambdaHandler);

        // Grant the ITSA BSAS foreign property adjustment Lambda and its worker permission to access DynamoDB Bundles
        // Table
        List.of(
                        this.hmrcItsaBsasForeignPropertyAdjustPostLambda,
                        hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlOrigin.workerLambda)
                .forEach(fn -> {
                    bundlesTable.grant(fn, "dynamodb:Query");
                    hmrcApiRequestsTable.grant(fn, "dynamodb:PutItem");
                    hmrcItsaBsasForeignPropertyAdjustPostAsyncRequestsTable.grant(
                            fn, "dynamodb:GetItem", "dynamodb:UpdateItem");

                    // Grant access to user sub hash salt secret in Secrets Manager
                    SubHashSaltHelper.grantSaltAccess(fn, region, account, props.envName());

                    // enforceBundles() grants the operator bundle to an email on the operator list
                    OperatorEmailsHelper.grantOperatorEmailsAccess(fn, region, account, props.envName());

                    // Grant EventBridge PutEvents permission
                    fn.addToRolePolicy(PolicyStatement.Builder.create()
                            .effect(Effect.ALLOW)
                            .actions(List.of("events:PutEvents"))
                            .resources(List.of(activityBusArn))
                            .build());
                });
        infof(
                "Granted DynamoDB and Secrets Manager salt permissions to %s and its worker",
                this.hmrcItsaBsasForeignPropertyAdjustPostLambda.getFunctionName());

        Lambda.appStackHealthAlarm(
                this,
                props.envName(),
                props.resourceNamePrefix(),
                "hmrc-itsa-property",
                List.of(
                        hmrcItsaBsasForeignPropertyGetLambdaUrlOrigin,
                        hmrcItsaBsasForeignPropertyAdjustPostLambdaUrlOrigin));

        infof("HmrcItsaPropertyStack %s created successfully for %s", id, props.deploymentName());
    }
}
