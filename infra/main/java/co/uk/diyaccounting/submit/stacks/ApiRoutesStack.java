/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.Kind.infof;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.constructs.AbstractApiLambdaProps;
import java.util.List;
import java.util.Set;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.apigatewayv2.IHttpApi;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.FunctionAttributes;
import software.amazon.awscdk.services.lambda.IFunction;
import software.constructs.Construct;

/**
 * The second half of the HTTP API's routes. ApiStack owns the API, its stage, domain and the routes
 * of one group of Lambda stacks; this stack adds the routes of the other group to the same API, so
 * neither stack reaches CloudFormation's 500-resource limit. Routes are grouped by the stack that
 * owns their Lambda, so a route stays in the same API stack from one deploy to the next.
 */
public class ApiRoutesStack extends Stack {

    @Value.Immutable
    public interface ApiRoutesStackProps extends StackProps, SubmitStackProps {

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

        IHttpApi httpApi();

        Set<String> routeKeysTakenElsewhere();

        List<AbstractApiLambdaProps> lambdaFunctions();

        String userPoolId();

        String userPoolClientId();

        String booksUserPoolClientId();

        @Value.Default
        default String mcpUserPoolClientId() {
            return "";
        }

        String customAuthorizerLambdaArn();

        static ImmutableApiRoutesStackProps.Builder builder() {
            return ImmutableApiRoutesStackProps.builder();
        }
    }

    public ApiRoutesStack(final Construct scope, final String id, final ApiRoutesStackProps props) {
        super(scope, id, props);

        Tags.of(this).add("ResourceType", "serverless-web-app");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        IFunction customAuthorizerLambda = Function.fromFunctionAttributes(
                this,
                props.resourceNamePrefix() + "-CustomAuthorizerLambda",
                FunctionAttributes.builder()
                        .functionArn(props.customAuthorizerLambdaArn())
                        .sameEnvironment(true)
                        .build());

        ApiRoutes routes = new ApiRoutes(
                this,
                props.httpApi(),
                props.resourceNamePrefix() + "-Routes",
                props.userPoolId(),
                props.userPoolClientId(),
                props.booksUserPoolClientId(),
                props.mcpUserPoolClientId(),
                customAuthorizerLambda);
        routes.reserve(props.routeKeysTakenElsewhere());
        routes.addAll(props.lambdaFunctions());

        infof("ApiRoutesStack %s created for %s", this.getNode().getId(), props.resourceNamePrefix());
    }
}
