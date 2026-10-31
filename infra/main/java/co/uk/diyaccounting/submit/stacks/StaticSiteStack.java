/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.stacks;

import static co.uk.diyaccounting.submit.utils.KindCdk.cfnOutput;

import co.uk.diyaccounting.submit.constructs.StaticSite;
import java.util.List;
import org.immutables.value.Value;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.StackProps;
import software.amazon.awscdk.Tags;
import software.amazon.awscdk.services.cloudfront.Distribution;
import software.amazon.awscdk.services.s3.Bucket;
import software.constructs.Construct;

/**
 * One env-level static site, such as the developer site, as a stack of its own. The root account
 * writes the DNS aliases from the {@code DistributionDomainName} output, so this stack holds no
 * Route53 records.
 */
public class StaticSiteStack extends Stack {

    public final Bucket bucket;
    public final Distribution distribution;

    @Value.Immutable
    public interface StaticSiteStackProps extends StackProps {
        @Override
        Environment getEnv();

        @Override
        @Value.Default
        default Boolean getCrossRegionReferences() {
            return false;
        }

        String envName();

        String siteName();

        List<String> domainNames();

        String certificateArn();

        String docRootPath();

        @Value.Default
        default List<String> unmanagedPrefixes() {
            return List.of();
        }

        static ImmutableStaticSiteStackProps.Builder builder() {
            return ImmutableStaticSiteStackProps.builder();
        }
    }

    public StaticSiteStack(final Construct scope, final String id, final StaticSiteStackProps props) {
        super(scope, id, StackProps.builder().env(props.getEnv()).build());

        Tags.of(this).add("ResourceType", "static-site");
        Tags.of(this).add("Criticality", "low");
        Tags.of(this).add("DataClassification", "public");
        Tags.of(this).add("BackupRequired", "false");
        Tags.of(this).add("MonitoringEnabled", "true");

        var site = new StaticSite(
                this,
                props.siteName() + "Site",
                StaticSite.StaticSiteProps.builder()
                        .siteName(props.siteName())
                        .domainNames(props.domainNames())
                        .certificateArn(props.certificateArn())
                        .docRootPath(props.docRootPath())
                        .unmanagedPrefixes(props.unmanagedPrefixes())
                        .build());
        this.bucket = site.bucket;
        this.distribution = site.distribution;

        cfnOutput(this, "DistributionDomainName", site.distribution.getDomainName());
        cfnOutput(this, "DistributionId", site.distribution.getDistributionId());
        cfnOutput(this, "BucketName", site.bucket.getBucketName());
        cfnOutput(this, "SiteDomainNames", String.join(",", props.domainNames()));
    }
}
