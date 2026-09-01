/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit.stacks.analytics;

import co.uk.diyaccounting.submit.utils.KindCdk;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import org.immutables.value.Value;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.customresources.AwsCustomResource;
import software.amazon.awscdk.customresources.AwsSdkCall;
import software.amazon.awscdk.customresources.PhysicalResourceId;
import software.amazon.awscdk.services.athena.CfnNamedQuery;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.s3.IBucket;
import software.constructs.Construct;

/**
 * The eight Athena views that answer the operator's recurring business questions, each backed
 * by {@code activity_events_all} and/or the {@code dynamo_*} and {@code stripe_*} catalog
 * tables, never the raw sources directly.
 *
 * <p>Created the same way {@code AnalyticsStack} creates {@code activity_events_all}: SQL lives
 * in the repo, and a one-shot {@link AwsCustomResource} runs {@code CREATE OR REPLACE VIEW} at
 * deploy time so a redeploy is idempotent. A {@link CfnNamedQuery} per view keeps the same SQL
 * one click away in the console.
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
    private record ViewDefinition(String name, String description, List<String> readTables, List<String> dependsOnViews) {

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
                    List.of("v_ga4_funnel_daily")));

    public final List<CfnNamedQuery> namedQueries = new ArrayList<>();
    public final List<AwsCustomResource> viewResources = new ArrayList<>();

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

        // Every view here runs on the stack's one shared AwsCustomResource provider role, and IAM
        // caps the total size of a role's inline policies at 10240 bytes. A per-view policy repeats
        // the same Athena, Glue and S3 statements once per view and walks that budget down until a
        // deploy fails, so the whole family is granted once: the union of every table each view
        // reads and writes, depended on by each view resource.
        var providerRole = KindCdk.ensureAwsCustomResourceProviderRole(stack);
        var viewGrant = KindCdk.grantToAwsCustomResourceProvider(
                stack,
                List.of(
                        PolicyStatement.Builder.create()
                                .effect(Effect.ALLOW)
                                .actions(List.of("athena:StartQueryExecution"))
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
                                .build()));

        // Two AwsCustomResources with no Fn::GetAtt between them carry no implicit
        // CloudFormation ordering, so a view that reads a sibling view (e.g.
        // v_purchase_reconciliation_daily reading v_ga4_funnel_daily) needs an explicit
        // dependency edge, added below once both resources exist. VIEWS is declared with every
        // dependency earlier in the list than its dependent, so a single forward pass suffices.
        var viewResourcesByName = new java.util.LinkedHashMap<String, AwsCustomResource>();

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

            var createViewCall = AwsSdkCall.builder()
                    .service("Athena")
                    .action("startQueryExecution")
                    .parameters(Map.of(
                            "QueryString",
                            sql,
                            "QueryExecutionContext",
                            Map.of("Database", props.glueDatabaseName()),
                            "WorkGroup",
                            props.athenaWorkGroupName()))
                    .physicalResourceId(PhysicalResourceId.of(view.name() + "-view"))
                    .build();

            var viewResource = AwsCustomResource.Builder.create(this, view.name() + "-CreateView")
                    .onCreate(createViewCall)
                    .onUpdate(createViewCall)
                    .role(providerRole)
                    .logGroup(KindCdk.ensureAwsCustomResourceProviderLogGroup(stack))
                    .build();
            // AwsCustomResource adds this edge itself when it builds its own policy; the shared
            // policy has to be depended on explicitly or a view could run before its grant lands.
            viewResource.getNode().addDependency(viewGrant);
            this.viewResources.add(viewResource);
            viewResourcesByName.put(view.name(), viewResource);

            for (String dependsOnView : view.dependsOnViews()) {
                var upstream = viewResourcesByName.get(dependsOnView);
                if (upstream == null) {
                    throw new IllegalStateException(
                            "%s depends on %s, which must be declared earlier in VIEWS".formatted(
                                    view.name(), dependsOnView));
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
