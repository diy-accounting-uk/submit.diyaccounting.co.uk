/*
 * SPDX-License-Identifier: AGPL-3.0-only
 * Copyright (C) 2025-2026 DIY Accounting Ltd
 */

package co.uk.diyaccounting.submit;

import static org.junit.jupiter.api.Assertions.assertEquals;

import co.uk.diyaccounting.submit.stacks.BackupStack;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.App;
import software.amazon.awscdk.Environment;
import software.amazon.awscdk.assertions.Match;
import software.amazon.awscdk.assertions.Matcher;
import software.amazon.awscdk.assertions.Template;

class BackupStackCdkResourceTest {

    private static final String CROSS_ACCOUNT_VAULT_ARN =
            "arn:aws:backup:eu-west-2:914216784828:backup-vault:submit-cross-account-vault";

    private static Template synthBackupStack(Optional<String> crossAccountVaultArn) {
        App app = new App();
        var nameProps = new SubmitSharedNames.SubmitSharedNamesProps();
        nameProps.envName = "prod";
        nameProps.deploymentName = "prod";
        nameProps.hostedZoneName = "diyaccounting.co.uk";
        nameProps.subDomainName = "submit";
        nameProps.regionName = "eu-west-2";
        nameProps.awsAccount = "972912397388";
        var sharedNames = new SubmitSharedNames(nameProps);

        var stack = new BackupStack(
                app,
                sharedNames.backupStackId,
                BackupStack.BackupStackProps.builder()
                        .env(Environment.builder()
                                .account("972912397388")
                                .region("eu-west-2")
                                .build())
                        .crossRegionReferences(false)
                        .envName("prod")
                        .deploymentName("prod")
                        .resourceNamePrefix(sharedNames.envResourceNamePrefix)
                        .cloudTrailEnabled("false")
                        .sharedNames(sharedNames)
                        .crossAccountBackupVaultArn(crossAccountVaultArn)
                        .build());
        return Template.fromStack(stack);
    }

    @Test
    void dailyAndMonthlyRecoveryPointsAreCopiedToTheBackupAccount() {
        Template template = synthBackupStack(Optional.of(CROSS_ACCOUNT_VAULT_ARN));

        template.hasResourceProperties(
                "AWS::Backup::BackupPlan",
                Match.objectLike(Map.of(
                        "BackupPlan",
                        Match.objectLike(Map.of(
                                "BackupPlanRule",
                                Match.arrayWith(List.of(
                                        Match.objectLike(Map.of(
                                                "RuleName",
                                                "DailyBackup",
                                                "CopyActions",
                                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                                        "DestinationBackupVaultArn", CROSS_ACCOUNT_VAULT_ARN)))))),
                                        Match.objectLike(Map.of(
                                                "RuleName",
                                                "MonthlyCompliance",
                                                "CopyActions",
                                                Match.arrayWith(List.of(Match.objectLike(Map.of(
                                                        "DestinationBackupVaultArn",
                                                        CROSS_ACCOUNT_VAULT_ARN)))))))))))));
    }

    @Test
    void theBackupRoleCanCopyIntoTheBackupAccountAndUseItsKey() {
        Template template = synthBackupStack(Optional.of(CROSS_ACCOUNT_VAULT_ARN));

        template.hasResourceProperties(
                "AWS::IAM::Policy",
                Match.objectLike(Map.of(
                        "PolicyDocument",
                        Match.objectLike(Map.of(
                                "Statement",
                                Match.arrayWith(List.of(
                                        Match.objectLike(Map.of(
                                                "Sid",
                                                "CopyRecoveryPointsToBackupAccount",
                                                "Action",
                                                List.of("backup:CopyFromBackupVault", "backup:CopyIntoBackupVault"))),
                                        Match.objectLike(Map.of(
                                                "Sid",
                                                "UseBackupAccountKeyForCopies",
                                                "Resource",
                                                "arn:aws:kms:eu-west-2:914216784828:key/*"))))))))); 
    }

    @Test
    void withoutADestinationVaultNothingIsCopiedOut() {
        Template template = synthBackupStack(Optional.empty());

        template.hasResourceProperties(
                "AWS::Backup::BackupPlan",
                Match.objectLike(Map.of(
                        "BackupPlan",
                        Match.objectLike(Map.of(
                                "BackupPlanRule",
                                Match.arrayWith(List.of(
                                        Match.objectLike(Map.of(
                                                "RuleName", "DailyBackup",
                                                "CopyActions", Match.absent())),
                                        Match.objectLike(Map.of(
                                                "RuleName", "MonthlyCompliance",
                                                "CopyActions", Match.absent())))))))));
    }

    @Test
    void everyTableHoldingCustomerOrComplianceDataIsSelected() {
        Template template = synthBackupStack(Optional.of(CROSS_ACCOUNT_VAULT_ARN));

        var selections = template.findResources("AWS::Backup::BackupSelection");
        assertEquals(1, selections.size());

        template.hasResourceProperties(
                "AWS::Backup::BackupSelection",
                Match.objectLike(Map.of(
                        "BackupSelection",
                        Match.objectLike(Map.of(
                                "SelectionName",
                                "prod-env-critical-tables",
                                "Resources",
                                Match.arrayWith(List.of(
                                        selectedTable("prod-env-receipts"),
                                        selectedTable("prod-env-bundles"),
                                        selectedTable("prod-env-hmrc-api-requests"),
                                        selectedTable("prod-env-passes"),
                                        selectedTable("prod-env-subscriptions"))))))));
    }

    private static Matcher selectedTable(String tableName) {
        return Match.objectLike(Map.of(
                "Fn::Join", Match.arrayWith(List.of(Match.arrayWith(List.of(":table/" + tableName))))));
    }
}
