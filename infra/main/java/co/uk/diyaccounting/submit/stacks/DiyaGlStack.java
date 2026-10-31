/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

// spotless:off
// @capability BILL-39 CDK: diya-gl stack
// - **Use when:** tracing or changing the infrastructure behind diya-gl endpoints.
// - **Does:** The DiyaGlStack.java construct wires the diya-gl list, version, put and delete Lambdas. It also wires the practice client book-move Lambda. It grants their S3 bucket and DynamoDB access. The bucket's expire-sandbox lifecycle rule, in DataStack.java, expires sandbox books.
// - **Run:** no command; see Does and Entry
// - **Entry:** `infra/main/java/co/uk/diyaccounting/submit/stacks/DiyaGlStack.java`
// - **Files:** infra/main/java/co/uk/diyaccounting/submit/stacks/DiyaGlStack.java, infra/test/java/co/uk/diyaccounting/submit/stacks/DiyaGlStackTest.java
// - **Keywords:** cdk, diya-gl stack, s3 bucket grant, book-move lambda, expire-sandbox lifecycle
// - **Related:** BILL-15, BILL-17, BILL-21, BILL-23, SS-27
// @end-capability
// spotless:on

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.utils.OperatorEmailsHelper;
import co.uk.diyaccounting.submit.utils.PopulatedMap;
import co.uk.diyaccounting.submit.utils.SubHashSaltHelper;
import java.util.List;
import org.immutables.value.Value;
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
 * The diya-gl book storage API: four Lambdas behind the books JWT authoriser (see ApiStack), each
 * scoped to its own slice of the shared books bucket by IAM resource pattern rather than by
 * function boundary.
 */
public class DiyaGlStack extends Stack {

    public AbstractApiLambdaProps diyaGlListGetLambdaProps;
    public Function diyaGlListGetLambda;
    public ILogGroup diyaGlListGetLambdaLogGroup;

    public AbstractApiLambdaProps diyaGlVersionGetLambdaProps;
    public Function diyaGlVersionGetLambda;
    public ILogGroup diyaGlVersionGetLambdaLogGroup;

    public AbstractApiLambdaProps diyaGlPutLambdaProps;
    public Function diyaGlPutLambda;
    public ILogGroup diyaGlPutLambdaLogGroup;

    public AbstractApiLambdaProps diyaGlDeleteLambdaProps;
    public Function diyaGlDeleteLambda;
    public ILogGroup diyaGlDeleteLambdaLogGroup;

    public AbstractApiLambdaProps practiceClientBookMovePostLambdaProps;
    public Function practiceClientBookMovePostLambda;
    public ILogGroup practiceClientBookMovePostLambdaLogGroup;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface DiyaGlStackProps extends StackProps, SubmitStackProps {

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

        String baseImageTag();

        String diyaGlBucketName();

        String booksAllowedOrigins();

        Boolean residentTierEnabled();

        static ImmutableDiyaGlStackProps.Builder builder() {
            return ImmutableDiyaGlStackProps.builder();
        }
    }

    public DiyaGlStack(Construct scope, String id, DiyaGlStackProps props) {
        this(scope, id, null, props);
    }

    public DiyaGlStack(Construct scope, String id, StackProps stackProps, DiyaGlStackProps props) {
        super(scope, id, stackProps);

        String diyaGlBucketArn = "arn:aws:s3:::" + props.diyaGlBucketName();
        String booksObjectsArnPattern = diyaGlBucketArn + "/users/*/books/*";
        String booksMetadataArnPattern = diyaGlBucketArn + "/users/*/books/*/metadata.json";

        // Lookup existing DynamoDB Bundles Table, for the put Lambda's entitlement check
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.bundlesTableName);

        // Lookup existing DynamoDB Practice Clients Table: every books route here takes an
        // optional clientId and checks it belongs to the caller via getClient before resolving
        // the client's book prefix.
        ITable practiceClientsTable = Table.fromTableName(
                this,
                "ImportedPracticeClientsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().data.practiceClientsTableName);

        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        var commonEnv = new PopulatedMap<String, String>()
                .with("DIYA_GL_BUCKET_NAME", props.diyaGlBucketName())
                .with("ENVIRONMENT_NAME", props.envName())
                .with("DIYA_GL_ALLOWED_ORIGINS", props.booksAllowedOrigins())
                .with("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME", practiceClientsTable.getTableName());

        // List GET reports the caller's live entitlement alongside the book list, so it alone
        // needs this bundle lookup; DELETE and Version GET don't carry it. Version GET's
        // book-expired check reads the book's own retention and expiresAt, which the billing
        // webhook keeps current on a lapse or a resubscribe, rather than checking the bundle live.
        var entitlementReadEnv = new PopulatedMap<String, String>(commonEnv)
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                .with("DIYA_GL_BUNDLE_ID", "resident")
                .with("DIYA_GL_RESIDENT_TIER", props.residentTierEnabled().toString());

        // ============================================================================
        // DIYA-GL List GET Lambda (books JWT auth)
        // ============================================================================
        var diyaGlListGetApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().diyaGl.diyaGlListGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().diyaGl.diyaGlListGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().diyaGl.diyaGlListGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().diyaGl.diyaGlListGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().diyaGl.diyaGlListGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().diyaGl.diyaGlListGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().diyaGl.diyaGlListGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().diyaGl.diyaGlListGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().diyaGl.diyaGlListGetLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(entitlementReadEnv)
                        .build());
        this.diyaGlListGetLambdaProps = diyaGlListGetApiLambda.apiProps;
        this.diyaGlListGetLambda = diyaGlListGetApiLambda.ingestLambda;
        this.diyaGlListGetLambdaLogGroup = diyaGlListGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.diyaGlListGetLambdaProps);
        this.lambdaFunctionProps.add(onSecondPublishedPath(
                this.diyaGlListGetLambdaProps, props.sharedNames().diyaGl.diyaGlListGetBooksUrlPath));
        this.diyaGlListGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(diyaGlBucketArn))
                .build());
        this.diyaGlListGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(booksMetadataArnPattern))
                .build());
        bundlesTable.grant(this.diyaGlListGetLambda, "dynamodb:Query");
        practiceClientsTable.grant(this.diyaGlListGetLambda, "dynamodb:GetItem");
        SubHashSaltHelper.grantSaltAccess(this.diyaGlListGetLambda, region, account, props.envName());
        // The response helper warms the operator list on every API call
        OperatorEmailsHelper.grantOperatorEmailsAccess(this.diyaGlListGetLambda, region, account, props.envName());
        infof(
                "Created DIYA-GL List GET Lambda %s",
                this.diyaGlListGetLambda.getNode().getId());

        // ============================================================================
        // DIYA-GL Version GET Lambda (books JWT auth)
        // ============================================================================
        var diyaGlVersionGetApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().diyaGl.diyaGlVersionGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().diyaGl.diyaGlVersionGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().diyaGl.diyaGlVersionGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().diyaGl.diyaGlVersionGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().diyaGl.diyaGlVersionGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().diyaGl.diyaGlVersionGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().diyaGl.diyaGlVersionGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().diyaGl.diyaGlVersionGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().diyaGl.diyaGlVersionGetLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(commonEnv)
                        .build());
        this.diyaGlVersionGetLambdaProps = diyaGlVersionGetApiLambda.apiProps;
        this.diyaGlVersionGetLambda = diyaGlVersionGetApiLambda.ingestLambda;
        this.diyaGlVersionGetLambdaLogGroup = diyaGlVersionGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.diyaGlVersionGetLambdaProps);
        this.lambdaFunctionProps.add(onSecondPublishedPath(
                this.diyaGlVersionGetLambdaProps, props.sharedNames().diyaGl.diyaGlVersionGetBooksUrlPath));
        this.diyaGlVersionGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(booksObjectsArnPattern))
                .build());
        practiceClientsTable.grant(this.diyaGlVersionGetLambda, "dynamodb:GetItem");
        SubHashSaltHelper.grantSaltAccess(this.diyaGlVersionGetLambda, region, account, props.envName());
        // The response helper warms the operator list on every API call
        OperatorEmailsHelper.grantOperatorEmailsAccess(this.diyaGlVersionGetLambda, region, account, props.envName());
        grantAppClientIdParameterAccess(this.diyaGlVersionGetLambda, region, account, props.envName());
        infof(
                "Created DIYA-GL Version GET Lambda %s",
                this.diyaGlVersionGetLambda.getNode().getId());

        // ============================================================================
        // DIYA-GL PUT Lambda (books JWT auth)
        // ============================================================================
        var diyaGlPutLambdaEnv = new PopulatedMap<String, String>()
                .with("DIYA_GL_BUCKET_NAME", props.diyaGlBucketName())
                .with("ENVIRONMENT_NAME", props.envName())
                .with("DIYA_GL_ALLOWED_ORIGINS", props.booksAllowedOrigins())
                .with("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME", practiceClientsTable.getTableName())
                .with("DIYA_GL_MAX_BYTES", "2097152")
                .with("DIYA_GL_MAX_PER_USER", "20")
                .with("DIYA_GL_VERSIONS_KEPT", "30")
                .with("DIYA_GL_RESIDENT_TIER", props.residentTierEnabled().toString())
                .with("DIYA_GL_BUNDLE_ID", "resident")
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName());
        var diyaGlPutApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().diyaGl.diyaGlPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().diyaGl.diyaGlPutIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().diyaGl.diyaGlPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().diyaGl.diyaGlPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().diyaGl.diyaGlPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().diyaGl.diyaGlPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().diyaGl.diyaGlPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().diyaGl.diyaGlPutLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().diyaGl.diyaGlPutLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(diyaGlPutLambdaEnv)
                        .build());
        this.diyaGlPutLambdaProps = diyaGlPutApiLambda.apiProps;
        this.diyaGlPutLambda = diyaGlPutApiLambda.ingestLambda;
        this.diyaGlPutLambdaLogGroup = diyaGlPutApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.diyaGlPutLambdaProps);
        this.lambdaFunctionProps.add(
                onSecondPublishedPath(this.diyaGlPutLambdaProps, props.sharedNames().diyaGl.diyaGlPutBooksUrlPath));
        this.diyaGlPutLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:PutObjectTagging"))
                .resources(List.of(booksObjectsArnPattern))
                .build());
        this.diyaGlPutLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(diyaGlBucketArn))
                .build());
        bundlesTable.grant(this.diyaGlPutLambda, "dynamodb:Query");
        practiceClientsTable.grant(this.diyaGlPutLambda, "dynamodb:GetItem");
        SubHashSaltHelper.grantSaltAccess(this.diyaGlPutLambda, region, account, props.envName());
        // The response helper warms the operator list on every API call
        OperatorEmailsHelper.grantOperatorEmailsAccess(this.diyaGlPutLambda, region, account, props.envName());
        grantAppClientIdParameterAccess(this.diyaGlPutLambda, region, account, props.envName());
        infof("Created DIYA-GL PUT Lambda %s", this.diyaGlPutLambda.getNode().getId());

        // ============================================================================
        // DIYA-GL DELETE Lambda (books JWT auth)
        // ============================================================================
        var diyaGlDeleteApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().diyaGl.diyaGlDeleteIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().diyaGl.diyaGlDeleteIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().diyaGl.diyaGlDeleteIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().diyaGl.diyaGlDeleteIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().diyaGl.diyaGlDeleteIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().diyaGl.diyaGlDeleteLambdaHttpMethod)
                        .urlPath(props.sharedNames().diyaGl.diyaGlDeleteLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().diyaGl.diyaGlDeleteLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().diyaGl.diyaGlDeleteLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(commonEnv)
                        .build());
        this.diyaGlDeleteLambdaProps = diyaGlDeleteApiLambda.apiProps;
        this.diyaGlDeleteLambda = diyaGlDeleteApiLambda.ingestLambda;
        this.diyaGlDeleteLambdaLogGroup = diyaGlDeleteApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.diyaGlDeleteLambdaProps);
        this.lambdaFunctionProps.add(onSecondPublishedPath(
                this.diyaGlDeleteLambdaProps, props.sharedNames().diyaGl.diyaGlDeleteBooksUrlPath));
        this.diyaGlDeleteLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(diyaGlBucketArn))
                .build());
        this.diyaGlDeleteLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:DeleteObject"))
                .resources(List.of(booksObjectsArnPattern))
                .build());
        practiceClientsTable.grant(this.diyaGlDeleteLambda, "dynamodb:GetItem");
        SubHashSaltHelper.grantSaltAccess(this.diyaGlDeleteLambda, region, account, props.envName());
        // The response helper warms the operator list on every API call
        OperatorEmailsHelper.grantOperatorEmailsAccess(this.diyaGlDeleteLambda, region, account, props.envName());
        grantAppClientIdParameterAccess(this.diyaGlDeleteLambda, region, account, props.envName());
        infof(
                "Created DIYA-GL DELETE Lambda %s",
                this.diyaGlDeleteLambda.getNode().getId());

        // ============================================================================
        // Practice client book move POST Lambda (standard JWT auth, not the books authoriser -
        // the caller is always the signed-in practice, never a client)
        // ============================================================================
        var practiceClientBookMovePostApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().diyaGl.practiceClientBookMovePostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecr.ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecr.ecrRepositoryArn)
                        .ingestFunctionName(
                                props.sharedNames().diyaGl.practiceClientBookMovePostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().diyaGl.practiceClientBookMovePostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().diyaGl.practiceClientBookMovePostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .diyaGl
                                .practiceClientBookMovePostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().diyaGl.practiceClientBookMovePostLambdaHttpMethod)
                        .urlPath(props.sharedNames().diyaGl.practiceClientBookMovePostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().diyaGl.practiceClientBookMovePostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().diyaGl.practiceClientBookMovePostLambdaCustomAuthorizer)
                        .environment(new PopulatedMap<String, String>(commonEnv)
                                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName()))
                        .build());
        this.practiceClientBookMovePostLambdaProps = practiceClientBookMovePostApiLambda.apiProps;
        this.practiceClientBookMovePostLambda = practiceClientBookMovePostApiLambda.ingestLambda;
        this.practiceClientBookMovePostLambdaLogGroup = practiceClientBookMovePostApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.practiceClientBookMovePostLambdaProps);
        this.practiceClientBookMovePostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(diyaGlBucketArn))
                .build());
        this.practiceClientBookMovePostLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:GetObjectTagging", "s3:PutObject", "s3:DeleteObject"))
                .resources(List.of(booksObjectsArnPattern))
                .build());
        practiceClientsTable.grant(this.practiceClientBookMovePostLambda, "dynamodb:GetItem");
        bundlesTable.grant(this.practiceClientBookMovePostLambda, "dynamodb:Query");
        SubHashSaltHelper.grantSaltAccess(this.practiceClientBookMovePostLambda, region, account, props.envName());
        // The response helper warms the operator list on every API call
        OperatorEmailsHelper.grantOperatorEmailsAccess(
                this.practiceClientBookMovePostLambda, region, account, props.envName());
        grantAppClientIdParameterAccess(this.practiceClientBookMovePostLambda, region, account, props.envName());
        infof(
                "Created Practice Client Book Move Lambda %s",
                this.practiceClientBookMovePostLambda.getNode().getId());

        var healthCheckedLambdas = new java.util.ArrayList<Lambda>(List.of(
                diyaGlListGetApiLambda,
                diyaGlVersionGetApiLambda,
                diyaGlPutApiLambda,
                diyaGlDeleteApiLambda,
                practiceClientBookMovePostApiLambda));

        Lambda.appStackHealthAlarm(this, props.envName(), props.resourceNamePrefix(), "diya-gl", healthCheckedLambdas);

        cfnOutput(this, "DiyaGlListGetLambdaArn", this.diyaGlListGetLambda.getFunctionArn());
        cfnOutput(this, "DiyaGlVersionGetLambdaArn", this.diyaGlVersionGetLambda.getFunctionArn());
        cfnOutput(this, "DiyaGlPutLambdaArn", this.diyaGlPutLambda.getFunctionArn());
        cfnOutput(this, "DiyaGlDeleteLambdaArn", this.diyaGlDeleteLambda.getFunctionArn());
        cfnOutput(this, "DiyaGlApiBaseUrl", props.sharedNames().publicBaseUrl + "api/v1/diya-gl");

        infof(
                "DiyaGlStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }

    /**
     * Grants the Lambda role permission to read the three app-client-id parameters written by
     * IdentityStack, to map the caller's verified client id to "submit", "spreadsheets-diya-gl" or
     * "mcp" (app/lib/appClientResolver.js).
     */
    private static void grantAppClientIdParameterAccess(
            Function lambda, String region, String account, String envName) {
        lambda.addToRolePolicy(PolicyStatement.Builder.create()
                .sid("ReadAppClientIdParameters")
                .effect(Effect.ALLOW)
                .actions(List.of("ssm:GetParameter"))
                .resources(List.of(
                        "arn:aws:ssm:%s:%s:parameter/submit/%s/submit-app-client-id"
                                .formatted(region, account, envName),
                        "arn:aws:ssm:%s:%s:parameter/submit/%s/spreadsheets-diya-gl-app-client-id"
                                .formatted(region, account, envName),
                        "arn:aws:ssm:%s:%s:parameter/submit/%s/mcp-app-client-id".formatted(region, account, envName)))
                .build());
    }

    /**
     * Builds a second route entry for the same already-created Lambda, differing only in urlPath.
     * ApiStack imports the function by ARN rather than creating it, so this adds a route with no
     * new Lambda resource. Serves the old {@code /api/v1/books} path permanently, alongside the
     * new {@code /api/v1/diya-gl} one: the spreadsheets site's cloud.js, including copies held by
     * installed service workers, calls the old path and never switches to the new one. There is
     * no import of it to grep for in this repository, so removing this second entry breaks that
     * caller silently.
     */
    private static AbstractApiLambdaProps onSecondPublishedPath(AbstractApiLambdaProps primary, String secondUrlPath) {
        return ApiLambdaProps.builder().from(primary).urlPath(secondUrlPath).build();
    }
}
