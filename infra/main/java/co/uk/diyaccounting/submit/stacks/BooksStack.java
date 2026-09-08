/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
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
public class BooksStack extends Stack {

    public AbstractApiLambdaProps booksListGetLambdaProps;
    public Function booksListGetLambda;
    public ILogGroup booksListGetLambdaLogGroup;

    public AbstractApiLambdaProps booksVersionGetLambdaProps;
    public Function booksVersionGetLambda;
    public ILogGroup booksVersionGetLambdaLogGroup;

    public AbstractApiLambdaProps booksPutLambdaProps;
    public Function booksPutLambda;
    public ILogGroup booksPutLambdaLogGroup;

    public AbstractApiLambdaProps booksDeleteLambdaProps;
    public Function booksDeleteLambda;
    public ILogGroup booksDeleteLambdaLogGroup;

    public List<AbstractApiLambdaProps> lambdaFunctionProps;

    @Value.Immutable
    public interface BooksStackProps extends StackProps, SubmitStackProps {

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

        String booksBucketName();

        String booksAllowedOrigins();

        static ImmutableBooksStackProps.Builder builder() {
            return ImmutableBooksStackProps.builder();
        }
    }

    public BooksStack(Construct scope, String id, BooksStackProps props) {
        this(scope, id, null, props);
    }

    public BooksStack(Construct scope, String id, StackProps stackProps, BooksStackProps props) {
        super(scope, id, stackProps);

        String booksBucketArn = "arn:aws:s3:::" + props.booksBucketName();
        String booksObjectsArnPattern = booksBucketArn + "/users/*/books/*";
        String booksMetadataArnPattern = booksBucketArn + "/users/*/books/*/metadata.json";

        // Lookup existing DynamoDB Bundles Table, for the put Lambda's entitlement check
        ITable bundlesTable = Table.fromTableName(
                this,
                "ImportedBundlesTable-%s".formatted(props.deploymentName()),
                props.sharedNames().bundlesTableName);

        var region = props.getEnv() != null ? props.getEnv().getRegion() : "eu-west-2";
        var account = props.getEnv() != null ? props.getEnv().getAccount() : "";

        this.lambdaFunctionProps = new java.util.ArrayList<>();

        var commonEnv = new PopulatedMap<String, String>()
                .with("BOOKS_BUCKET_NAME", props.booksBucketName())
                .with("ENVIRONMENT_NAME", props.envName())
                .with("BOOKS_ALLOWED_ORIGINS", props.booksAllowedOrigins());

        // ============================================================================
        // Books List GET Lambda (books JWT auth)
        // ============================================================================
        var booksListGetApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().booksListGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().booksListGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().booksListGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().booksListGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().booksListGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().booksListGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().booksListGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().booksListGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().booksListGetLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(commonEnv)
                        .build());
        this.booksListGetLambdaProps = booksListGetApiLambda.apiProps;
        this.booksListGetLambda = booksListGetApiLambda.ingestLambda;
        this.booksListGetLambdaLogGroup = booksListGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.booksListGetLambdaProps);
        this.booksListGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(booksBucketArn))
                .build());
        this.booksListGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(booksMetadataArnPattern))
                .build());
        SubHashSaltHelper.grantSaltAccess(this.booksListGetLambda, region, account, props.envName());
        infof("Created Books List GET Lambda %s", this.booksListGetLambda.getNode().getId());

        // ============================================================================
        // Books Version GET Lambda (books JWT auth)
        // ============================================================================
        var booksVersionGetApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().booksVersionGetIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().booksVersionGetIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().booksVersionGetIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().booksVersionGetIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().booksVersionGetIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().booksVersionGetLambdaHttpMethod)
                        .urlPath(props.sharedNames().booksVersionGetLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().booksVersionGetLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().booksVersionGetLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(commonEnv)
                        .build());
        this.booksVersionGetLambdaProps = booksVersionGetApiLambda.apiProps;
        this.booksVersionGetLambda = booksVersionGetApiLambda.ingestLambda;
        this.booksVersionGetLambdaLogGroup = booksVersionGetApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.booksVersionGetLambdaProps);
        this.booksVersionGetLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject"))
                .resources(List.of(booksObjectsArnPattern))
                .build());
        SubHashSaltHelper.grantSaltAccess(this.booksVersionGetLambda, region, account, props.envName());
        infof("Created Books Version GET Lambda %s", this.booksVersionGetLambda.getNode().getId());

        // ============================================================================
        // Books PUT Lambda (books JWT auth)
        // ============================================================================
        var booksPutLambdaEnv = new PopulatedMap<String, String>()
                .with("BOOKS_BUCKET_NAME", props.booksBucketName())
                .with("ENVIRONMENT_NAME", props.envName())
                .with("BOOKS_ALLOWED_ORIGINS", props.booksAllowedOrigins())
                .with("BOOKS_MAX_BYTES", "2097152")
                .with("BOOKS_MAX_PER_USER", "20")
                .with("BOOKS_VERSIONS_KEPT", "30")
                .with("BOOKS_ENTITLEMENT_ENFORCED", "false")
                .with("BOOKS_BUNDLE_ID", "resident-diya-gl")
                .with("BUNDLE_DYNAMODB_TABLE_NAME", bundlesTable.getTableName());
        var booksPutApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().booksPutIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().booksPutIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().booksPutIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().booksPutIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().booksPutIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().booksPutLambdaHttpMethod)
                        .urlPath(props.sharedNames().booksPutLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().booksPutLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().booksPutLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(booksPutLambdaEnv)
                        .build());
        this.booksPutLambdaProps = booksPutApiLambda.apiProps;
        this.booksPutLambda = booksPutApiLambda.ingestLambda;
        this.booksPutLambdaLogGroup = booksPutApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.booksPutLambdaProps);
        this.booksPutLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:PutObject", "s3:DeleteObject"))
                .resources(List.of(booksObjectsArnPattern))
                .build());
        this.booksPutLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(booksBucketArn))
                .build());
        bundlesTable.grant(this.booksPutLambda, "dynamodb:Query");
        SubHashSaltHelper.grantSaltAccess(this.booksPutLambda, region, account, props.envName());
        infof("Created Books PUT Lambda %s", this.booksPutLambda.getNode().getId());

        // ============================================================================
        // Books DELETE Lambda (books JWT auth)
        // ============================================================================
        var booksDeleteApiLambda = new ApiLambda(
                this,
                ApiLambdaProps.builder()
                        .idPrefix(props.sharedNames().booksDeleteIngestLambdaFunctionName)
                        .baseImageTag(props.baseImageTag())
                        .ecrRepositoryName(props.sharedNames().ecrRepositoryName)
                        .ecrRepositoryArn(props.sharedNames().ecrRepositoryArn)
                        .ingestFunctionName(props.sharedNames().booksDeleteIngestLambdaFunctionName)
                        .ingestHandler(props.sharedNames().booksDeleteIngestLambdaHandler)
                        .ingestLambdaArn(props.sharedNames().booksDeleteIngestLambdaArn)
                        .ingestProvisionedConcurrencyAliasArn(
                                props.sharedNames().booksDeleteIngestProvisionedConcurrencyLambdaAliasArn)
                        .ingestProvisionedConcurrency(0)
                        .provisionedConcurrencyAliasName(props.sharedNames().provisionedConcurrencyAliasName)
                        .httpMethod(props.sharedNames().booksDeleteLambdaHttpMethod)
                        .urlPath(props.sharedNames().booksDeleteLambdaUrlPath)
                        .jwtAuthorizer(props.sharedNames().booksDeleteLambdaJwtAuthorizer)
                        .customAuthorizer(props.sharedNames().booksDeleteLambdaCustomAuthorizer)
                        .booksJwtAuthorizer(true)
                        .optionsPreflightRoute(true)
                        .environment(commonEnv)
                        .build());
        this.booksDeleteLambdaProps = booksDeleteApiLambda.apiProps;
        this.booksDeleteLambda = booksDeleteApiLambda.ingestLambda;
        this.booksDeleteLambdaLogGroup = booksDeleteApiLambda.logGroup;
        this.lambdaFunctionProps.add(this.booksDeleteLambdaProps);
        this.booksDeleteLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:ListBucket"))
                .resources(List.of(booksBucketArn))
                .build());
        this.booksDeleteLambda.addToRolePolicy(PolicyStatement.Builder.create()
                .effect(Effect.ALLOW)
                .actions(List.of("s3:GetObject", "s3:DeleteObject"))
                .resources(List.of(booksObjectsArnPattern))
                .build());
        SubHashSaltHelper.grantSaltAccess(this.booksDeleteLambda, region, account, props.envName());
        infof("Created Books DELETE Lambda %s", this.booksDeleteLambda.getNode().getId());

        Lambda.stackHealthAlarm(
                this,
                props.resourceNamePrefix(),
                "books",
                List.of(booksListGetApiLambda, booksVersionGetApiLambda, booksPutApiLambda, booksDeleteApiLambda));

        cfnOutput(this, "BooksListGetLambdaArn", this.booksListGetLambda.getFunctionArn());
        cfnOutput(this, "BooksVersionGetLambdaArn", this.booksVersionGetLambda.getFunctionArn());
        cfnOutput(this, "BooksPutLambdaArn", this.booksPutLambda.getFunctionArn());
        cfnOutput(this, "BooksDeleteLambdaArn", this.booksDeleteLambda.getFunctionArn());
        cfnOutput(this, "BooksApiBaseUrl", props.sharedNames().publicBaseUrl + "api/v1/books");

        infof(
                "BooksStack %s created successfully for %s",
                this.getNode().getId(), props.sharedNames().dashedDeploymentDomainName);
    }
}
