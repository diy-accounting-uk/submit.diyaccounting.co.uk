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

        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        var commonEnv = new PopulatedMap<String, String>()
                .with("DIYA_GL_BUCKET_NAME", props.diyaGlBucketName())
                .with("ENVIRONMENT_NAME", props.envName())
                .with("DIYA_GL_ALLOWED_ORIGINS", props.booksAllowedOrigins());

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
                        .environment(commonEnv)
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
                        .environment(commonEnv)
                        .build());
        this.diyaGlVersionGetLambdaProps = diyaGlVersionGetApiLambda.apiProps;
        this.diyaGlVersionGetLambda = diyaGlVersionGetApiLambda.ingestLambda;
        this.diyaGlVersionGetLambdaLogGroup = diyaGlVersionGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.diyaGlVersionGetLambdaProps);
        this.lambdaFunctionProps.add(
                onSecondPublishedPath(this.diyaGlVersionGetLambdaProps, props.sharedNames().diyaGlVersionGetBooksUrlPath));
        this.diyaGlVersionGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(booksObjectsArnPattern))
                .build());
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
                .with("DIYA_GL_MAX_BYTES", "2097152")
                .with("DIYA_GL_MAX_PER_USER", "20")
                .with("DIYA_GL_VERSIONS_KEPT", "30")
                .with("DIYA_GL_ENTITLEMENT_ENFORCED", "false")
                .with("DIYA_GL_BUNDLE_ID", "resident-diya-gl")
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
                .actions(List.of("s3:GetObject", "s3:PutObject", "s3:DeleteObject"))
                .resources(List.of(booksObjectsArnPattern))
                .build());
        this.diyaGlPutLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(diyaGlBucketArn))
                .build());
        bundlesTable.grant(this.diyaGlPutLambda, "dynamodb:Query");
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
        SubHashSaltHelper.grantSaltAccess(this.diyaGlDeleteLambda, region, account, props.envName());
        infof("Created DIYA-GL DELETE Lambda %s", this.diyaGlDeleteLambda.getNode().getId());

        Lambda.stackHealthAlarm(
                this,
                props.resourceNamePrefix(),
                "diya-gl",
                List.of(diyaGlListGetApiLambda, diyaGlVersionGetApiLambda, diyaGlPutApiLambda, diyaGlDeleteApiLambda));

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
