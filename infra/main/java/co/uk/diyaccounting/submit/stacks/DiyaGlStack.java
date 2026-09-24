/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;
import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.ApiLambda;
import co.uk.diyaccounting.submit.constructs.ApiLambdaProps;
import co.uk.diyaccounting.submit.constructs.Lambda;
import co.uk.diyaccounting.submit.constructs.LambdaProps;
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
import software.amazon.awscdk.services.events.Rule;
import software.amazon.awscdk.services.events.Schedule;
import software.amazon.awscdk.services.events.targets.LambdaFunction;
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

    /** Null when {@code residentTierEnabled} is false: no resident books, nothing to sweep. */
    public co.uk.diyaccounting.submit.constructs.AbstractLambdaProps diyaGlLapseSweepLambdaProps;

    public Function diyaGlLapseSweepLambda;
    public ILogGroup diyaGlLapseSweepLambdaLogGroup;
    public Rule diyaGlLapseSweepSchedule;

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
                props.sharedNames().bundlesTableName);

        // Lookup existing DynamoDB Practice Clients Table: every books route here takes an
        // optional clientId and checks it belongs to the caller via getClient before resolving
        // the client's book prefix.
        ITable practiceClientsTable = Table.fromTableName(
                this,
                "ImportedPracticeClientsTable-%s".formatted(props.deploymentName()),
                props.sharedNames().practiceClientsTableName);

        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        var commonEnv = new PopulatedMap<String, String>()
                .with("DIYA_GL_BUCKET_NAME", props.diyaGlBucketName())
                .with("ENVIRONMENT_NAME", props.envName())
                .with("DIYA_GL_ALLOWED_ORIGINS", props.booksAllowedOrigins())
                .with("PRACTICE_CLIENTS_DYNAMODB_TABLE_NAME", practiceClientsTable.getTableName());

        // List and Version GET both apply the resident-lapse rule (section (c)), so both need the
        // bundle lookup this DELETE and the plain commonEnv functions do not.
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
                        .idPrefix(props.sharedNames().diyaGlListGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().diyaGlListGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().diyaGlListGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().diyaGlListGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().diyaGlListGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().diyaGlListGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().diyaGlListGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().diyaGlListGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().diyaGlListGetLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(entitlementReadEnv)
                        .build());
        this.diyaGlListGetLambdaProps = diyaGlListGetApiLambda.apiProps;
        this.diyaGlListGetLambda = diyaGlListGetApiLambda.ingestLambda;
        this.diyaGlListGetLambdaLogGroup = diyaGlListGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.diyaGlListGetLambdaProps);
        this.lambdaFunctionProps.add(
                onSecondPublishedPath(this.diyaGlListGetLambdaProps, props.sharedNames().diyaGlListGetBooksUrlPath));
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
        infof(
                "Created DIYA-GL List GET Lambda %s",
                this.diyaGlListGetLambda.getNode().getId());

        // ============================================================================
        // DIYA-GL Version GET Lambda (books JWT auth)
        // ============================================================================
        var diyaGlVersionGetApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().diyaGlVersionGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().diyaGlVersionGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().diyaGlVersionGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().diyaGlVersionGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().diyaGlVersionGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().diyaGlVersionGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().diyaGlVersionGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().diyaGlVersionGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().diyaGlVersionGetLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(entitlementReadEnv)
                        .build());
        this.diyaGlVersionGetLambdaProps = diyaGlVersionGetApiLambda.apiProps;
        this.diyaGlVersionGetLambda = diyaGlVersionGetApiLambda.ingestLambda;
        this.diyaGlVersionGetLambdaLogGroup = diyaGlVersionGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.diyaGlVersionGetLambdaProps);
        this.lambdaFunctionProps.add(onSecondPublishedPath(
                this.diyaGlVersionGetLambdaProps, props.sharedNames().diyaGlVersionGetBooksUrlPath));
        this.diyaGlVersionGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(booksObjectsArnPattern))
                .build());
        bundlesTable.grant(this.diyaGlVersionGetLambda, "dynamodb:Query");
        practiceClientsTable.grant(this.diyaGlVersionGetLambda, "dynamodb:GetItem");
        SubHashSaltHelper.grantSaltAccess(this.diyaGlVersionGetLambda, region, account, props.envName());
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
                        .idPrefix(props.sharedNames().diyaGlPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().diyaGlPutIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().diyaGlPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().diyaGlPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().diyaGlPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().diyaGlPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().diyaGlPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().diyaGlPutLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().diyaGlPutLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(diyaGlPutLambdaEnv)
                        .build());
        this.diyaGlPutLambdaProps = diyaGlPutApiLambda.apiProps;
        this.diyaGlPutLambda = diyaGlPutApiLambda.ingestLambda;
        this.diyaGlPutLambdaLogGroup = diyaGlPutApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.diyaGlPutLambdaProps);
        this.lambdaFunctionProps.add(
                onSecondPublishedPath(this.diyaGlPutLambdaProps, props.sharedNames().diyaGlPutBooksUrlPath));
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
        infof("Created DIYA-GL PUT Lambda %s", this.diyaGlPutLambda.getNode().getId());

        // ============================================================================
        // DIYA-GL DELETE Lambda (books JWT auth)
        // ============================================================================
        var diyaGlDeleteApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().diyaGlDeleteIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().diyaGlDeleteIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().diyaGlDeleteIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().diyaGlDeleteIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().diyaGlDeleteIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().diyaGlDeleteLambdaHttpMethod)
                        .urlPath(props.sharedNames().diyaGlDeleteLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().diyaGlDeleteLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().diyaGlDeleteLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(commonEnv)
                        .build());
        this.diyaGlDeleteLambdaProps = diyaGlDeleteApiLambda.apiProps;
        this.diyaGlDeleteLambda = diyaGlDeleteApiLambda.ingestLambda;
        this.diyaGlDeleteLambdaLogGroup = diyaGlDeleteApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.diyaGlDeleteLambdaProps);
        this.lambdaFunctionProps.add(
                onSecondPublishedPath(this.diyaGlDeleteLambdaProps, props.sharedNames().diyaGlDeleteBooksUrlPath));
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
                        .idPrefix(props.sharedNames().practiceClientBookMovePostIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().practiceClientBookMovePostIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().practiceClientBookMovePostIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().practiceClientBookMovePostIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(props.sharedNames()
                                .practiceClientBookMovePostIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().practiceClientBookMovePostLambdaHttpMethod)
                        .urlPath(props.sharedNames().practiceClientBookMovePostLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().practiceClientBookMovePostLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().practiceClientBookMovePostLambdaCustomAuthorizer)
                        .environment(commonEnv)
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
        SubHashSaltHelper.grantSaltAccess(this.practiceClientBookMovePostLambda, region, account, props.envName());
        infof(
                "Created Practice Client Book Move Lambda %s",
                this.practiceClientBookMovePostLambda.getNode().getId());

        var healthCheckedLambdas = new java.util.ArrayList<Lambda>(List.of(
                diyaGlListGetApiLambda,
                diyaGlVersionGetApiLambda,
                diyaGlPutApiLambda,
                diyaGlDeleteApiLambda,
                practiceClientBookMovePostApiLambda));

        // ============================================================================
        // DIYA-GL Lapse Sweep Lambda (EventBridge scheduled, daily; deletes a lapsed resident
        // subscriber's books once the grace period has passed). No resident books exist unless
        // the tier is on, so the sweeper is built only then.
        // ============================================================================
        if (props.residentTierEnabled()) {
            var diyaGlLapseSweepFunctionName = props.resourceNamePrefix() + "-diya-gl-lapse-sweep";
            var diyaGlLapseSweepEnv = new PopulatedMap<String, String>()
                    .with("DIYA_GL_BUCKET_NAME", props.diyaGlBucketName())
                    .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName())
                    .with("DIYA_GL_BUNDLE_ID", "resident")
                    .with("DIYA_GL_LAPSE_GRACE_DAYS", "30")
                    .with("ENVIRONMENT_NAME", props.envName());
            var diyaGlLapseSweepLambdaConstruct = new Lambda(
                    this,
                    LambdaProps.builder()
                            .idPrefix(diyaGlLapseSweepFunctionName)
                            .baseImageTag(props.baseImageTag())
                            .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                            .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                            .ingestFunctionName(diyaGlLapseSweepFunctionName)
                            .ingestHandler("app/functions/diyaGl/diyaGlLapseSweep.handler")
                            .ingestLambdaArn("arn:aws:lambda:" + region + ":" + account + ":function:"
                                    + diyaGlLapseSweepFunctionName)
                            .ingestProvisionedConcurrencyAliasArn("arn:aws:lambda:" + region + ":" + account
                                    + ":function:" + diyaGlLapseSweepFunctionName + ":live")
                            .ingestProvisionedConcurrency(0)
                            .ingestLambdaTimeout(Duration.minutes(5))
                            .provisionedConcurrencyAliasName("live")
                            .environment(diyaGlLapseSweepEnv)
                            .build());
            this.diyaGlLapseSweepLambdaProps = diyaGlLapseSweepLambdaConstruct.props;
            this.diyaGlLapseSweepLambda = diyaGlLapseSweepLambdaConstruct.ingestLambda;
            this.diyaGlLapseSweepLambdaLogGroup = diyaGlLapseSweepLambdaConstruct.logGroup;
            this.diyaGlLapseSweepLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("s3:ListBucket"))
                    .resources(List.of(diyaGlBucketArn))
                    .build());
            this.diyaGlLapseSweepLambda.addToRolePolicy(PolicyStatement.Builder.create()
                    .effect(Effect.ALLOW)
                    .actions(List.of("s3:GetObject", "s3:DeleteObject"))
                    .resources(List.of(booksObjectsArnPattern))
                    .build());
            bundlesTable.grant(this.diyaGlLapseSweepLambda, "dynamodb:Query");

            this.diyaGlLapseSweepSchedule = Rule.Builder.create(this, diyaGlLapseSweepFunctionName + "-Schedule")
                    .ruleName(diyaGlLapseSweepFunctionName + "-schedule")
                    .description("Delete a lapsed diya-gl subscriber's resident books once the grace period has passed")
                    .schedule(Schedule.rate(Duration.days(1)))
                    .targets(List.of(LambdaFunction.Builder.create(this.diyaGlLapseSweepLambda)
                            .build()))
                    .build();

            healthCheckedLambdas.add(diyaGlLapseSweepLambdaConstruct);
            infof(
                    "Created DIYA-GL Lapse Sweep Lambda %s",
                    this.diyaGlLapseSweepLambda.getNode().getId());
        }

        Lambda.stackHealthAlarm(this, props.resourceNamePrefix(), "diya-gl", healthCheckedLambdas);

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
