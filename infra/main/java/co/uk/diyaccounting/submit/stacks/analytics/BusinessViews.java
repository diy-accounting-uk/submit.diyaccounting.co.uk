/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Paths;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.CustomResource;
import software.amazon.awscdk.Duration;
import software.amazon.awscdk.RemovalPolicy;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.customresources.Provider;
import software.amazon.awscdk.services.athena.CfnNamedQuery;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.ManagedPolicy;
import software.amazon.awscdk.services.iam.Policy;
import software.amazon.awscdk.services.iam.PolicyDocument;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.iam.Role;
import software.amazon.awscdk.services.iam.ServicePrincipal;
import software.amazon.awscdk.services.lambda.Architecture;
import software.amazon.awscdk.services.lambda.Code;
import software.amazon.awscdk.services.lambda.Function;
import software.amazon.awscdk.services.lambda.Runtime;
import software.amazon.awscdk.services.logs.LogGroup;
import software.amazon.awscdk.services.logs.RetentionDays;
import software.amazon.awscdk.services.s3.IBucket;
import software.amazon.awscdk.services.s3.assets.AssetOptions;
import software.constructs.Construct;

/**
 * The Athena views that answer the operator's recurring business questions, each backed
 * by {@code activity_events_all} and/or the {@code dynamo_*} and {@code stripe_*} catalog
 * tables, never the raw sources directly.
 *
 * <p>SQL lives in the repo, and one shared {@link Provider}-backed {@link CustomResource} per view
 * runs {@code CREATE OR REPLACE VIEW} at deploy time so a redeploy is idempotent. A {@link
 * CfnNamedQuery} per view keeps the same SQL one click away in the console.
 *
 * <p>Unlike {@code AnalyticsStack}'s own view ({@code activity_events_all}, created with a plain
 * {@code AwsCustomResource} around {@code Athena.startQueryExecution}), the resource here waits
 * for the query to actually finish. {@code startQueryExecution} returns as soon as the query is
 * submitted, not once it completes, so an {@code AwsCustomResource} around it alone marks
 * CloudFormation successful the instant the query starts — a {@code CREATE OR REPLACE VIEW} that
 * fails afterwards leaves the stack green and the view silently missing from the catalog. See
 * {@code app/functions/analytics/createView.js} for the onEvent/isComplete handler pair that
 * polls {@code GetQueryExecution} to a terminal state and fails loudly, carrying Athena's {@code
 * StateChangeReason}, on anything but {@code SUCCEEDED}.
 *
 * <p>The caller owns ordering: every view resource here must depend on the Glue database, the
 * Athena workgroup and the catalog tables it reads from — see the class Javadoc on {@link
 * TableChangeDelivery} and {@link StripeReconciliationTables} for the same convention.
 */
public class BusinessViews extends Construct {

    /**
     * Views by the business question they answer and the catalog tables they read. {@code
     * dependsOnViews} names sibling views (by {@link ViewDefinition#name()}) this view's SQL
     * reads from directly: the caller must create those first and add an explicit CloudFormation
     * dependency, since two {@code AwsCustomResource}s with no {@code Fn::GetAtt} between them
     * carry no implicit ordering.
     */
    private record ViewDefinition(
            String name, String description, List<String> readTables, List<String> dependsOnViews) {

        ViewDefinition(String name, String description, List<String> readTables) {
            this(name, description, readTables, List.of());
        }
    }

    private static final List<ViewDefinition> VIEWS = List.of(
            new ViewDefinition(
                    "v_active_users_daily", "Distinct customers active each day", List.of("activity_events_all")),
            new ViewDefinition(
                    "v_submissions_daily",
                    "VAT returns submitted each day, split by outcome",
                    List.of("activity_events_all")),
            new ViewDefinition(
                    "v_login_to_submission_funnel",
                    "Of the people who logged in on a day, how many submitted within 7 days",
                    List.of("activity_events_all")),
            new ViewDefinition(
                    "v_pass_redemptions_daily",
                    "Passes issued and redeemed each day, by pass type",
                    List.of("activity_events_all", "dynamo_passes")),
            new ViewDefinition("v_revenue_daily", "Stripe revenue each day, by product", List.of("stripe_charges")),
            new ViewDefinition(
                    "v_hmrc_failures_by_class",
                    "HMRC submission failures each day, by failure class",
                    List.of("activity_events_all")),
            new ViewDefinition(
                    "v_business_activity_daily",
                    "HMRC authentications, bundle grants and bundle deletions each day",
                    List.of("activity_events_all")),
            new ViewDefinition(
                    "v_signup_to_first_submission",
                    "Time from a new account's first bundle grant to its first submission",
                    List.of("dynamo_bundles", "dynamo_receipts")),
            new ViewDefinition(
                    "v_traffic_by_country_daily", "Sessions each day, by country", List.of("activity_events_all")),
            new ViewDefinition(
                    "v_ga4_funnel_daily",
                    "Distinct GA4 sessions reaching each funnel step each day",
                    List.of("ga4_bq_events")),
            new ViewDefinition(
                    "v_purchase_reconciliation_daily",
                    "GA4, Stripe and activity-event purchase counts each day, side by side",
                    List.of("stripe_charges", "activity_events_all", "v_ga4_funnel_daily"),
                    List.of("v_ga4_funnel_daily")),
            new ViewDefinition(
                    "v_submissions_by_activity_daily",
                    "Completions each day by activity (VAT, ITSA, Companies House), not VAT only",
                    List.of("activity_events_all")),
            new ViewDefinition(
                    "v_traffic_sources_daily", "Sessions each day, by GA4 channel group", List.of("ga4_traffic")),
            new ViewDefinition(
                    "v_availability_sli_daily",
                    "The uptime SLI: probe pass rate and error budget remaining each day, by suite",
                    List.of("probe_runs")),
            new ViewDefinition(
                    "v_alarm_state_changes_daily",
                    "Alarms fired and cleared each day, by family",
                    List.of("alarm_state_changes")),
            new ViewDefinition(
                    "v_dora_runs_daily",
                    "Deploy and destroy runs each day: frequency, lead time and failure rate",
                    List.of("dora_runs")),
            new ViewDefinition(
                    "v_returning_submitters_quarterly",
                    "Of the customers who submitted in a quarter, how many also submitted the previous one",
                    List.of("dynamo_receipts")),
            new ViewDefinition(
                    "v_subscription_renewals_daily",
                    "Subscriptions that renewed each day, by bundle",
                    List.of("dynamo_subscriptions")),
            new ViewDefinition(
                    "v_subscription_cancellations_daily",
                    "Subscriptions cancelled each day, by bundle",
                    List.of("dynamo_subscriptions")),
            new ViewDefinition(
                    "v_operator_interventions_daily",
                    "Operator interventions each day, by kind: dispatches, issue comments and commits",
                    List.of("github_workflow_runs", "github_issue_events", "github_commits")),
            new ViewDefinition(
                    "v_compliance_status",
                    "Open compliance findings each day, by area",
                    List.of("compliance_accessibility", "compliance_fraud_headers")),
            new ViewDefinition(
                    "v_cost_daily",
                    "Billed cost each day from the FOCUS export, by service, deployment and stack",
                    List.of("cost_focus")),
            new ViewDefinition(
                    "v_cost_per_submission_daily",
                    "The day's cost divided by the day's completed submissions",
                    List.of("v_cost_daily", "v_submissions_by_activity_daily")),
            new ViewDefinition(
                    "v_cost_vs_target_monthly",
                    "Each month's billed cost against the steady-state target",
                    List.of("v_cost_daily")));

    public final List<CfnNamedQuery> namedQueries = new ArrayList<>();
    public final List<CustomResource> viewResources = new ArrayList<>();

    /**
     * Every view's {@link CustomResource}, by {@link ViewDefinition#name()}, so a caller can add
     * an edge onto the one view that actually reads a table it owns rather than every view
     * unconditionally.
     */
    public final Map<String, CustomResource> viewResourcesByName = new java.util.LinkedHashMap<>();

    @Value.Immutable
    public interface BusinessViewsProps {

        /** {@code sharedNames.envResourceNamePrefix}, e.g. {@code ci-env}. Used for logical ids. */
        String resourceNamePrefix();

        String glueDatabaseName();

        String athenaWorkGroupName();

        /** The Athena query-results bucket, so the custom resource can be granted write access to it. */
        IBucket resultsBucket();

        static ImmutableBusinessViewsProps.Builder builder() {
            return ImmutableBusinessViewsProps.builder();
        }
    }

    public BusinessViews(final Construct scope, final BusinessViewsProps props) {
        super(scope, props.resourceNamePrefix() + "-BusinessViews");

        var stack = Stack.of(this);
        var workGroupArn = athenaWorkGroupArn(stack.getRegion(), stack.getAccount(), props.athenaWorkGroupName());
        var catalogArn = glueCatalogArn(stack.getRegion(), stack.getAccount());
        var databaseArn = glueDatabaseArn(stack.getRegion(), stack.getAccount(), props.glueDatabaseName());

        // One onEvent/isComplete Lambda pair, shared by every view's CustomResource below, mirrors
        // KindCdk.ensurePitrProvider's shape: a Provider polls isComplete instead of trusting an
        // AwsSdkCall's immediate return, which is what lets a failed CREATE OR REPLACE VIEW fail
        // the deployment instead of vanishing into a query that nobody waited for. Built once here
        // rather than per-view, so its role and policy are granted once regardless of view count —
        // the same IAM-inline-policy-budget reasoning that used to require a shared grant per view
        // now needs no per-view policy at all.
        var athenaViewProviderRole = Role.Builder.create(this, "AthenaViewCreatorRole")
                .assumedBy(new ServicePrincipal("lambda.amazonaws.com"))
                .managedPolicies(
                        List.of(ManagedPolicy.fromAwsManagedPolicyName("service-role/AWSLambdaBasicExecutionRole")))
                .build();

        var athenaViewProviderPolicy = Policy.Builder.create(this, "AthenaViewCreatorPolicy")
                .document(PolicyDocument.Builder.create().minimize(true).build())
                .statements(List.of(
                        PolicyStatement.Builder.create()
                                .effect(Effect.ALLOW)
                                .actions(List.of("athena:StartQueryExecution", "athena:GetQueryExecution"))
                                .resources(List.of(workGroupArn))
                                .build(),
                        PolicyStatement.Builder.create()
                                .effect(Effect.ALLOW)
                                .actions(List.of(
                                        "glue:GetDatabase",
                                        "glue:GetTable",
                                        "glue:GetTables",
                                        "glue:CreateTable",
                                        "glue:UpdateTable"))
                                .resources(allTableResources(
                                        stack.getRegion(),
                                        stack.getAccount(),
                                        props.glueDatabaseName(),
                                        catalogArn,
                                        databaseArn))
                                .build(),
                        PolicyStatement.Builder.create()
                                .effect(Effect.ALLOW)
                                .actions(List.of("s3:PutObject", "s3:GetBucketLocation"))
                                .resources(List.of(
                                        props.resultsBucket().getBucketArn(),
                                        props.resultsBucket().getBucketArn() + "/*"))
                                .build()))
                .build();
        athenaViewProviderPolicy.attachToRole(athenaViewProviderRole);

        var createViewAssetDir = createViewAssetPath();

        var onEventLogGroup = LogGroup.Builder.create(this, "AthenaViewCreatorOnEventLogGroup")
                .logGroupName("/aws/lambda/" + stack.getStackName() + "-AthenaViewCreatorOnEvent")
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        var onEventFunction = Function.Builder.create(this, "AthenaViewCreatorOnEvent")
                .runtime(Runtime.NODEJS_24_X)
                .architecture(Architecture.ARM_64)
                .handler("createView.onEvent")
                .code(Code.fromAsset(
                        createViewAssetDir,
                        AssetOptions.builder()
                                .exclude(List.of("*", "!createView.js"))
                                .build()))
                .timeout(Duration.seconds(30))
                .role(athenaViewProviderRole)
                .logGroup(onEventLogGroup)
                .build();
        // Function references the role by Ref/GetAtt, which orders it after the role, but the
        // inline policy is a separate resource attached to that role — without this edge, the
        // function could run before the policy attaches, the same race the old single AwsCustomResource
        // grant guarded against.
        onEventFunction.getNode().addDependency(athenaViewProviderPolicy);

        var isCompleteLogGroup = LogGroup.Builder.create(this, "AthenaViewCreatorIsCompleteLogGroup")
                .logGroupName("/aws/lambda/" + stack.getStackName() + "-AthenaViewCreatorIsComplete")
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        var isCompleteFunction = Function.Builder.create(this, "AthenaViewCreatorIsComplete")
                .runtime(Runtime.NODEJS_24_X)
                .architecture(Architecture.ARM_64)
                .handler("createView.isComplete")
                .code(Code.fromAsset(
                        createViewAssetDir,
                        AssetOptions.builder()
                                .exclude(List.of("*", "!createView.js"))
                                .build()))
                .timeout(Duration.seconds(30))
                .role(athenaViewProviderRole)
                .logGroup(isCompleteLogGroup)
                .build();
        isCompleteFunction.getNode().addDependency(athenaViewProviderPolicy);

        var frameworkLogGroup = LogGroup.Builder.create(this, "AthenaViewCreatorFrameworkLogGroup")
                .logGroupName("/aws/lambda/" + stack.getStackName() + "-AthenaViewCreatorFramework")
                .retention(RetentionDays.THREE_DAYS)
                .removalPolicy(RemovalPolicy.DESTROY)
                .build();

        var athenaViewProvider = Provider.Builder.create(this, "AthenaViewCreatorProvider")
                .onEventHandler(onEventFunction)
                .isCompleteHandler(isCompleteFunction)
                .queryInterval(Duration.seconds(5))
                .totalTimeout(Duration.minutes(5))
                .logGroup(frameworkLogGroup)
                .build();

        // Two CustomResources with no Fn::GetAtt between them carry no implicit CloudFormation
        // ordering, so a view that reads a sibling view (e.g. v_purchase_reconciliation_daily
        // reading v_ga4_funnel_daily) needs an explicit dependency edge, added below once both
        // resources exist. VIEWS is declared with every dependency earlier in the list than its
        // dependent, so a single forward pass suffices.
        for (ViewDefinition view : VIEWS) {
            var sql = loadResourceText("analytics/views/" + view.name() + ".sql");
            var queryName = view.name().replace('_', '-');

            var namedQuery = CfnNamedQuery.Builder.create(this, view.name() + "-Query")
                    .name(queryName)
                    .description("Definition of the " + view.name()
                            + " view, kept here for reference; the custom resource is what actually runs it. "
                            + view.description())
                    .database(props.glueDatabaseName())
                    .workGroup(props.athenaWorkGroupName())
                    .queryString(sql)
                    .build();
            this.namedQueries.add(namedQuery);

            // A new construct id (not the old AwsCustomResource's "-CreateView") on purpose: the
            // resource type changes from Custom::AWS to Custom::AthenaView, which CloudFormation
            // cannot update in place under the same logical id. This id names a fresh logical
            // resource, so the next deploy removes the old one (a no-op: it never had an onDelete)
            // and creates this one from scratch, running a real Create event that actually waits
            // for the query to finish rather than trusting an Update that may never have run.
            var viewResource = CustomResource.Builder.create(this, view.name() + "-View")
                    .serviceToken(athenaViewProvider.getServiceToken())
                    .resourceType("Custom::AthenaView")
                    .properties(Map.of(
                            "ViewName",
                            view.name(),
                            "Sql",
                            sql,
                            "Database",
                            props.glueDatabaseName(),
                            "WorkGroup",
                            props.athenaWorkGroupName()))
                    .build();
            this.viewResources.add(viewResource);
            this.viewResourcesByName.put(view.name(), viewResource);

            for (String dependsOnView : view.dependsOnViews()) {
                var upstream = this.viewResourcesByName.get(dependsOnView);
                if (upstream == null) {
                    throw new IllegalStateException("%s depends on %s, which must be declared earlier in VIEWS"
                            .formatted(view.name(), dependsOnView));
                }
                viewResource.getNode().addDependency(upstream);
            }
        }
    }

    /**
     * The Glue catalog, the database, and every table any view reads or writes: each view's own
     * table plus the tables named in its {@code readTables}, de-duplicated because several views
     * read the same source and one view reads another view's table.
     */
    private static List<String> allTableResources(
            String region, String account, String databaseName, String catalogArn, String databaseArn) {
        var all = new ArrayList<String>();
        all.add(catalogArn);
        all.add(databaseArn);
        var tableNames = new LinkedHashSet<String>();
        for (ViewDefinition view : VIEWS) {
            tableNames.add(view.name());
            tableNames.addAll(view.readTables());
        }
        for (String tableName : tableNames) {
            all.add(glueTableArn(region, account, databaseName, tableName));
        }
        return all;
    }

    private static String glueTableArn(String region, String account, String databaseName, String tableName) {
        return "arn:aws:glue:%s:%s:table/%s/%s".formatted(region, account, databaseName, tableName);
    }

    private static String glueDatabaseArn(String region, String account, String databaseName) {
        return "arn:aws:glue:%s:%s:database/%s".formatted(region, account, databaseName);
    }

    private static String glueCatalogArn(String region, String account) {
        return "arn:aws:glue:%s:%s:catalog".formatted(region, account);
    }

    private static String athenaWorkGroupArn(String region, String account, String workGroupName) {
        return "arn:aws:athena:%s:%s:workgroup/%s".formatted(region, account, workGroupName);
    }

    /**
     * Resolves the createView Lambda's source directory from either the project root (Maven test)
     * or a CDK app subdirectory such as {@code cdk-environment/} (cdk synth), matching the
     * resolution {@code KindCdk.ensurePitrProvider} uses for {@code ensurePitr.mjs}.
     *
     * @return The absolute path to {@code app/functions/analytics}
     */
    private static String createViewAssetPath() {
        var relativePath = "app/functions/analytics";
        var assetDir = Paths.get(relativePath).toAbsolutePath().normalize();
        if (!assetDir.toFile().isDirectory()) {
            assetDir = Paths.get("../" + relativePath).toAbsolutePath().normalize();
        }
        return assetDir.toString();
    }

    private static String loadResourceText(String resourcePath) {
        try (InputStream in = BusinessViews.class.getClassLoader().getResourceAsStream(resourcePath)) {
            if (in == null) {
                throw new IllegalStateException("Missing analytics resource: " + resourcePath);
            }
            return new String(in.readAllBytes(), StandardCharsets.UTF_8);
        } catch (IOException e) {
            throw new UncheckedIOException("Failed to load analytics resource: " + resourcePath, e);
        }
    }
}
