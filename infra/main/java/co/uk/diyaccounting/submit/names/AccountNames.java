/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.LambdaNameProps;
import co.uk.diyaccounting.submit.LambdaNames;
import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.SubmitSharedNames.ApiParameter;
import co.uk.diyaccounting.submit.SubmitSharedNames.PublishedLambda;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import java.util.List;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public class AccountNames {

    public String bundleGetIngestLambdaHandler;
    public String bundleGetIngestLambdaFunctionName;
    public String bundleGetIngestLambdaArn;
    public String bundleGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod bundleGetLambdaHttpMethod;
    public String bundleGetLambdaUrlPath;
    public boolean bundleGetLambdaJwtAuthorizer;
    public boolean bundleGetLambdaCustomAuthorizer;

    public String operatorSnapshotGetIngestLambdaHandler;
    public String operatorSnapshotGetIngestLambdaFunctionName;
    public String operatorSnapshotGetIngestLambdaArn;
    public String operatorSnapshotGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod operatorSnapshotGetLambdaHttpMethod;
    public String operatorSnapshotGetLambdaUrlPath;
    public boolean operatorSnapshotGetLambdaJwtAuthorizer;
    public boolean operatorSnapshotGetLambdaCustomAuthorizer;

    public String practiceClientsListGetIngestLambdaHandler;
    public String practiceClientsListGetIngestLambdaFunctionName;
    public String practiceClientsListGetIngestLambdaArn;
    public String practiceClientsListGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod practiceClientsListGetLambdaHttpMethod;
    public String practiceClientsListGetLambdaUrlPath;
    public boolean practiceClientsListGetLambdaJwtAuthorizer;
    public boolean practiceClientsListGetLambdaCustomAuthorizer;

    public String practiceClientsPostIngestLambdaHandler;
    public String practiceClientsPostIngestLambdaFunctionName;
    public String practiceClientsPostIngestLambdaArn;
    public String practiceClientsPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod practiceClientsPostLambdaHttpMethod;
    public String practiceClientsPostLambdaUrlPath;
    public boolean practiceClientsPostLambdaJwtAuthorizer;
    public boolean practiceClientsPostLambdaCustomAuthorizer;

    public String practiceClientGetIngestLambdaHandler;
    public String practiceClientGetIngestLambdaFunctionName;
    public String practiceClientGetIngestLambdaArn;
    public String practiceClientGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod practiceClientGetLambdaHttpMethod;
    public String practiceClientGetLambdaUrlPath;
    public boolean practiceClientGetLambdaJwtAuthorizer;
    public boolean practiceClientGetLambdaCustomAuthorizer;

    public String practiceClientDeleteIngestLambdaHandler;
    public String practiceClientDeleteIngestLambdaFunctionName;
    public String practiceClientDeleteIngestLambdaArn;
    public String practiceClientDeleteIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod practiceClientDeleteLambdaHttpMethod;
    public String practiceClientDeleteLambdaUrlPath;
    public boolean practiceClientDeleteLambdaJwtAuthorizer;
    public boolean practiceClientDeleteLambdaCustomAuthorizer;

    public String practiceClientAuthorisationInvitePostIngestLambdaHandler;
    public String practiceClientAuthorisationInvitePostIngestLambdaFunctionName;
    public String practiceClientAuthorisationInvitePostIngestLambdaArn;
    public String practiceClientAuthorisationInvitePostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod practiceClientAuthorisationInvitePostLambdaHttpMethod;
    public String practiceClientAuthorisationInvitePostLambdaUrlPath;
    public boolean practiceClientAuthorisationInvitePostLambdaJwtAuthorizer;
    public boolean practiceClientAuthorisationInvitePostLambdaCustomAuthorizer;

    public String practiceClientAuthorisationGetIngestLambdaHandler;
    public String practiceClientAuthorisationGetIngestLambdaFunctionName;
    public String practiceClientAuthorisationGetIngestLambdaArn;
    public String practiceClientAuthorisationGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod practiceClientAuthorisationGetLambdaHttpMethod;
    public String practiceClientAuthorisationGetLambdaUrlPath;
    public boolean practiceClientAuthorisationGetLambdaJwtAuthorizer;
    public boolean practiceClientAuthorisationGetLambdaCustomAuthorizer;

    public String practiceClientAuthorisationInviteDeleteIngestLambdaHandler;
    public String practiceClientAuthorisationInviteDeleteIngestLambdaFunctionName;
    public String practiceClientAuthorisationInviteDeleteIngestLambdaArn;
    public String practiceClientAuthorisationInviteDeleteIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod practiceClientAuthorisationInviteDeleteLambdaHttpMethod;
    public String practiceClientAuthorisationInviteDeleteLambdaUrlPath;
    public boolean practiceClientAuthorisationInviteDeleteLambdaJwtAuthorizer;
    public boolean practiceClientAuthorisationInviteDeleteLambdaCustomAuthorizer;

    // TODO: Replace individual attributes with LambdaNames instances
    public LambdaNames bundlePost;
    public String bundlePostIngestLambdaHandler;
    public String bundlePostIngestLambdaFunctionName;
    public String bundlePostIngestLambdaArn;
    public String bundlePostIngestProvisionedConcurrencyLambdaAliasArn;
    public String bundlePostWorkerLambdaHandler;
    public String bundlePostWorkerLambdaFunctionName;
    public String bundlePostWorkerLambdaArn;
    public String bundlePostWorkerProvisionedConcurrencyLambdaAliasArn;
    public String bundlePostLambdaQueueName;
    public String bundlePostLambdaDeadLetterQueueName;
    public HttpMethod bundlePostLambdaHttpMethod;
    public String bundlePostLambdaUrlPath;
    public boolean bundlePostLambdaJwtAuthorizer;
    public boolean bundlePostLambdaCustomAuthorizer;

    public String bundleDeleteIngestLambdaHandler;
    public String bundleDeleteIngestLambdaFunctionName;
    public String bundleDeleteIngestLambdaArn;
    public String bundleDeleteIngestProvisionedConcurrencyLambdaAliasArn;
    public String bundleDeleteWorkerLambdaHandler;
    public String bundleDeleteWorkerLambdaFunctionName;
    public String bundleDeleteWorkerLambdaArn;
    public String bundleDeleteWorkerProvisionedConcurrencyLambdaAliasArn;
    public String bundleDeleteLambdaQueueName;
    public String bundleDeleteLambdaDeadLetterQueueName;
    public HttpMethod bundleDeleteLambdaHttpMethod;
    public String bundleDeleteLambdaUrlPath;
    public boolean bundleDeleteLambdaJwtAuthorizer;
    public boolean bundleDeleteLambdaCustomAuthorizer;

    public String supportTicketPostIngestLambdaHandler;
    public String supportTicketPostIngestLambdaFunctionName;
    public String supportTicketPostIngestLambdaArn;
    public String supportTicketPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod supportTicketPostLambdaHttpMethod;
    public String supportTicketPostLambdaUrlPath;
    public boolean supportTicketPostLambdaJwtAuthorizer;
    public boolean supportTicketPostLambdaCustomAuthorizer;

    public String interestPostIngestLambdaHandler;
    public String interestPostIngestLambdaFunctionName;
    public String interestPostIngestLambdaArn;
    public String interestPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod interestPostLambdaHttpMethod;
    public String interestPostLambdaUrlPath;
    public boolean interestPostLambdaJwtAuthorizer;
    public boolean interestPostLambdaCustomAuthorizer;

    public String activityStartedPostIngestLambdaHandler;
    public String activityStartedPostIngestLambdaFunctionName;
    public String activityStartedPostIngestLambdaArn;
    public String activityStartedPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod activityStartedPostLambdaHttpMethod;
    public String activityStartedPostLambdaUrlPath;
    public boolean activityStartedPostLambdaJwtAuthorizer;
    public boolean activityStartedPostLambdaCustomAuthorizer;

    public String passGetIngestLambdaHandler;
    public String passGetIngestLambdaFunctionName;
    public String passGetIngestLambdaArn;
    public String passGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passGetLambdaHttpMethod;
    public String passGetLambdaUrlPath;
    public boolean passGetLambdaJwtAuthorizer;
    public boolean passGetLambdaCustomAuthorizer;

    public String passPostIngestLambdaHandler;
    public String passPostIngestLambdaFunctionName;
    public String passPostIngestLambdaArn;
    public String passPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passPostLambdaHttpMethod;
    public String passPostLambdaUrlPath;
    public boolean passPostLambdaJwtAuthorizer;
    public boolean passPostLambdaCustomAuthorizer;

    public String passAdminPostIngestLambdaHandler;
    public String passAdminPostIngestLambdaFunctionName;
    public String passAdminPostIngestLambdaArn;
    public String passAdminPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passAdminPostLambdaHttpMethod;
    public String passAdminPostLambdaUrlPath;
    public boolean passAdminPostLambdaJwtAuthorizer;
    public boolean passAdminPostLambdaCustomAuthorizer;
    public String passReleasePostIngestLambdaHandler;
    public String passReleasePostIngestLambdaFunctionName;
    public String passReleasePostIngestLambdaArn;
    public String passReleasePostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passReleasePostLambdaHttpMethod;
    public String passReleasePostLambdaUrlPath;
    public boolean passReleasePostLambdaJwtAuthorizer;
    public boolean passReleasePostLambdaCustomAuthorizer;
    public String affiliatePostIngestLambdaHandler;
    public String affiliatePostIngestLambdaFunctionName;
    public String affiliatePostIngestLambdaArn;
    public String affiliatePostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod affiliatePostLambdaHttpMethod;
    public String affiliatePostLambdaUrlPath;
    public boolean affiliatePostLambdaJwtAuthorizer;
    public boolean affiliatePostLambdaCustomAuthorizer;
    public String affiliateGetIngestLambdaHandler;
    public String affiliateGetIngestLambdaFunctionName;
    public String affiliateGetIngestLambdaArn;
    public String affiliateGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod affiliateGetLambdaHttpMethod;
    public String affiliateGetLambdaUrlPath;
    public boolean affiliateGetLambdaJwtAuthorizer;
    public boolean affiliateGetLambdaCustomAuthorizer;
    public String affiliateApplicationPostIngestLambdaHandler;
    public String affiliateApplicationPostIngestLambdaFunctionName;
    public String affiliateApplicationPostIngestLambdaArn;
    public String affiliateApplicationPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod affiliateApplicationPostLambdaHttpMethod;
    public String affiliateApplicationPostLambdaUrlPath;
    public boolean affiliateApplicationPostLambdaJwtAuthorizer;
    public boolean affiliateApplicationPostLambdaCustomAuthorizer;
    public String affiliateApplicationGetIngestLambdaHandler;
    public String affiliateApplicationGetIngestLambdaFunctionName;
    public String affiliateApplicationGetIngestLambdaArn;
    public String affiliateApplicationGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod affiliateApplicationGetLambdaHttpMethod;
    public String affiliateApplicationGetLambdaUrlPath;
    public boolean affiliateApplicationGetLambdaJwtAuthorizer;
    public boolean affiliateApplicationGetLambdaCustomAuthorizer;
    public String passHeldGetIngestLambdaHandler;
    public String passHeldGetIngestLambdaFunctionName;
    public String passHeldGetIngestLambdaArn;
    public String passHeldGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passHeldGetLambdaHttpMethod;
    public String passHeldGetLambdaUrlPath;
    public boolean passHeldGetLambdaJwtAuthorizer;
    public boolean passHeldGetLambdaCustomAuthorizer;

    // Pass Generate POST Lambda (JWT auth - user pass generation via tokens)
    public String passGeneratePostIngestLambdaHandler;
    public String passGeneratePostIngestLambdaFunctionName;
    public String passGeneratePostIngestLambdaArn;
    public String passGeneratePostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passGeneratePostLambdaHttpMethod;
    public String passGeneratePostLambdaUrlPath;
    public boolean passGeneratePostLambdaJwtAuthorizer;
    public boolean passGeneratePostLambdaCustomAuthorizer;

    // Pass My Passes GET Lambda (JWT auth - list user's generated passes)
    public String passMyPassesGetIngestLambdaHandler;
    public String passMyPassesGetIngestLambdaFunctionName;
    public String passMyPassesGetIngestLambdaArn;
    public String passMyPassesGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod passMyPassesGetLambdaHttpMethod;
    public String passMyPassesGetLambdaUrlPath;
    public boolean passMyPassesGetLambdaJwtAuthorizer;
    public boolean passMyPassesGetLambdaCustomAuthorizer;

    public String bundleCapacityReconcileLambdaHandler;
    public String bundleCapacityReconcileLambdaFunctionName;
    public String bundleCapacityReconcileLambdaArn;
    public String bundleCapacityReconcileProvisionedConcurrencyLambdaAliasArn;

    public String commissionReleaseLambdaHandler;
    public String commissionReleaseLambdaFunctionName;
    public String commissionReleaseLambdaArn;
    public String commissionReleaseProvisionedConcurrencyLambdaAliasArn;
    public String commissionCreditPayoutLambdaHandler;
    public String commissionCreditPayoutLambdaFunctionName;
    public String commissionCreditPayoutLambdaArn;
    public String commissionCreditPayoutProvisionedConcurrencyLambdaAliasArn;

    // Session Beacon POST Lambda (public, no auth)
    public String sessionBeaconPostIngestLambdaHandler;
    public String sessionBeaconPostIngestLambdaFunctionName;
    public String sessionBeaconPostIngestLambdaArn;
    public String sessionBeaconPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod sessionBeaconPostLambdaHttpMethod;
    public String sessionBeaconPostLambdaUrlPath;
    public boolean sessionBeaconPostLambdaJwtAuthorizer;
    public boolean sessionBeaconPostLambdaCustomAuthorizer;

    // Session Sign-Out POST Lambda (authenticated, all three Cognito clients)
    public String sessionSignOutPostIngestLambdaHandler;
    public String sessionSignOutPostIngestLambdaFunctionName;
    public String sessionSignOutPostIngestLambdaArn;
    public String sessionSignOutPostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod sessionSignOutPostLambdaHttpMethod;
    public String sessionSignOutPostLambdaUrlPath;

    // Account Settings PUT Lambda (standard JWT auth)
    public String accountSettingsPutIngestLambdaHandler;
    public String accountSettingsPutIngestLambdaFunctionName;
    public String accountSettingsPutIngestLambdaArn;
    public String accountSettingsPutIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod accountSettingsPutLambdaHttpMethod;
    public String accountSettingsPutLambdaUrlPath;
    public boolean accountSettingsPutLambdaJwtAuthorizer;
    public boolean accountSettingsPutLambdaCustomAuthorizer;

    public AccountNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {

        this.bundleGetLambdaHttpMethod = HttpMethod.GET;
        this.bundleGetLambdaUrlPath = "/api/v1/bundle";
        this.bundleGetLambdaJwtAuthorizer = true;
        this.bundleGetLambdaCustomAuthorizer = false;
        var bundleGetLambdaHandlerName = "bundleGet.ingestHandler";
        var bundleGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundleGetLambdaHandlerName);
        this.bundleGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, bundleGetLambdaHandlerDashed);
        this.bundleGetIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, bundleGetLambdaHandlerName);
        this.bundleGetIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, bundleGetLambdaHandlerDashed);
        this.bundleGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.bundleGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.bundleGetLambdaHttpMethod,
                this.bundleGetLambdaUrlPath,
                "Get user bundles",
                "Retrieves all bundles for the authenticated user",
                "getBundles",
                List.of(new ApiParameter(
                        "x-wait-time-ms", "header", false, "Max time to wait for synchronous response (ms)"))));

        // Practice clients list GET Lambda (standard JWT auth, same as bundleGet)
        this.practiceClientsListGetLambdaHttpMethod = HttpMethod.GET;
        this.practiceClientsListGetLambdaUrlPath = "/api/v1/practice/clients";
        this.practiceClientsListGetLambdaJwtAuthorizer = true;
        this.practiceClientsListGetLambdaCustomAuthorizer = false;
        var practiceClientsListGetLambdaHandlerName = "practiceClientsListGet.ingestHandler";
        var practiceClientsListGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(practiceClientsListGetLambdaHandlerName);
        this.practiceClientsListGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, practiceClientsListGetLambdaHandlerDashed);
        this.practiceClientsListGetIngestLambdaHandler =
                "%s/practice/%s".formatted(root.appLambdaHandlerPrefix, practiceClientsListGetLambdaHandlerName);
        this.practiceClientsListGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, practiceClientsListGetLambdaHandlerDashed);
        this.practiceClientsListGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.practiceClientsListGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.practiceClientsListGetLambdaHttpMethod,
                this.practiceClientsListGetLambdaUrlPath,
                "List the practice's clients",
                "Lists every active client held by the authenticated practice",
                "listPracticeClients"));

        // Practice clients create POST Lambda
        this.practiceClientsPostLambdaHttpMethod = HttpMethod.POST;
        this.practiceClientsPostLambdaUrlPath = "/api/v1/practice/clients";
        this.practiceClientsPostLambdaJwtAuthorizer = true;
        this.practiceClientsPostLambdaCustomAuthorizer = false;
        var practiceClientsPostLambdaHandlerName = "practiceClientsPost.ingestHandler";
        var practiceClientsPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(practiceClientsPostLambdaHandlerName);
        this.practiceClientsPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, practiceClientsPostLambdaHandlerDashed);
        this.practiceClientsPostIngestLambdaHandler =
                "%s/practice/%s".formatted(root.appLambdaHandlerPrefix, practiceClientsPostLambdaHandlerName);
        this.practiceClientsPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, practiceClientsPostLambdaHandlerDashed);
        this.practiceClientsPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.practiceClientsPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.practiceClientsPostLambdaHttpMethod,
                this.practiceClientsPostLambdaUrlPath,
                "Add a practice client",
                "Creates a new client row for the authenticated practice",
                "addPracticeClient",
                List.of(
                        new ApiParameter("displayName", "body", true, "The client's display name"),
                        new ApiParameter("vrn", "body", false, "VAT registration number"),
                        new ApiParameter("nino", "body", false, "National Insurance number"),
                        new ApiParameter("utr", "body", false, "Unique Taxpayer Reference"),
                        new ApiParameter("companyNumber", "body", false, "Companies House company number"))));

        // Practice client read GET Lambda
        this.practiceClientGetLambdaHttpMethod = HttpMethod.GET;
        this.practiceClientGetLambdaUrlPath = "/api/v1/practice/clients/{clientId}";
        this.practiceClientGetLambdaJwtAuthorizer = true;
        this.practiceClientGetLambdaCustomAuthorizer = false;
        var practiceClientGetLambdaHandlerName = "practiceClientGet.ingestHandler";
        var practiceClientGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(practiceClientGetLambdaHandlerName);
        this.practiceClientGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, practiceClientGetLambdaHandlerDashed);
        this.practiceClientGetIngestLambdaHandler =
                "%s/practice/%s".formatted(root.appLambdaHandlerPrefix, practiceClientGetLambdaHandlerName);
        this.practiceClientGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, practiceClientGetLambdaHandlerDashed);
        this.practiceClientGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.practiceClientGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.practiceClientGetLambdaHttpMethod,
                this.practiceClientGetLambdaUrlPath,
                "Read a practice client",
                "Reads one client row belonging to the authenticated practice",
                "getPracticeClient",
                List.of(new ApiParameter("clientId", "path", true, "The client's id"))));

        // Practice client archive DELETE Lambda
        this.practiceClientDeleteLambdaHttpMethod = HttpMethod.DELETE;
        this.practiceClientDeleteLambdaUrlPath = "/api/v1/practice/clients/{clientId}";
        this.practiceClientDeleteLambdaJwtAuthorizer = true;
        this.practiceClientDeleteLambdaCustomAuthorizer = false;
        var practiceClientDeleteLambdaHandlerName = "practiceClientDelete.ingestHandler";
        var practiceClientDeleteLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(practiceClientDeleteLambdaHandlerName);
        this.practiceClientDeleteIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, practiceClientDeleteLambdaHandlerDashed);
        this.practiceClientDeleteIngestLambdaHandler =
                "%s/practice/%s".formatted(root.appLambdaHandlerPrefix, practiceClientDeleteLambdaHandlerName);
        this.practiceClientDeleteIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, practiceClientDeleteLambdaHandlerDashed);
        this.practiceClientDeleteIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.practiceClientDeleteIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.practiceClientDeleteLambdaHttpMethod,
                this.practiceClientDeleteLambdaUrlPath,
                "Archive a practice client",
                "Archives one client row belonging to the authenticated practice",
                "archivePracticeClient",
                List.of(new ApiParameter("clientId", "path", true, "The client's id"))));

        // Practice client authorisation invite POST Lambda: creates an HMRC Agent Authorisation
        // invitation for a client.
        this.practiceClientAuthorisationInvitePostLambdaHttpMethod = HttpMethod.POST;
        this.practiceClientAuthorisationInvitePostLambdaUrlPath =
                "/api/v1/practice/clients/{clientId}/authorisation/invitations";
        this.practiceClientAuthorisationInvitePostLambdaJwtAuthorizer = true;
        this.practiceClientAuthorisationInvitePostLambdaCustomAuthorizer = false;
        var practiceClientAuthorisationInvitePostLambdaHandlerName =
                "practiceClientAuthorisationInvitePost.ingestHandler";
        var practiceClientAuthorisationInvitePostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(
                        practiceClientAuthorisationInvitePostLambdaHandlerName);
        this.practiceClientAuthorisationInvitePostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, practiceClientAuthorisationInvitePostLambdaHandlerDashed);
        this.practiceClientAuthorisationInvitePostIngestLambdaHandler = "%s/practice/%s"
                .formatted(root.appLambdaHandlerPrefix, practiceClientAuthorisationInvitePostLambdaHandlerName);
        this.practiceClientAuthorisationInvitePostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, practiceClientAuthorisationInvitePostLambdaHandlerDashed);
        this.practiceClientAuthorisationInvitePostIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.practiceClientAuthorisationInvitePostIngestLambdaArn,
                        root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.practiceClientAuthorisationInvitePostLambdaHttpMethod,
                this.practiceClientAuthorisationInvitePostLambdaUrlPath,
                "Invite a client to authorise this practice",
                "Creates an HMRC Agent Authorisation invitation for one client and service",
                "invitePracticeClientAuthorisation",
                List.of(
                        new ApiParameter("clientId", "path", true, "The client's id"),
                        new ApiParameter("service", "body", true, "MTD-VAT or MTD-IT"),
                        new ApiParameter(
                                "knownFact", "body", true, "The VAT registration date, or the client's postcode"),
                        new ApiParameter("accessToken", "body", true, "The practice's HMRC access token"),
                        new ApiParameter(
                                "arn",
                                "body",
                                false,
                                "The practice's agent reference number, if not already stored"))));

        // Practice client authorisation status GET Lambda: reads an invitation's status, or
        // checks for a relationship already in place when none is pending.
        this.practiceClientAuthorisationGetLambdaHttpMethod = HttpMethod.GET;
        this.practiceClientAuthorisationGetLambdaUrlPath = "/api/v1/practice/clients/{clientId}/authorisation";
        // The handler reads the HMRC access token from the plain Authorization header
        // (extractHmrcAccessTokenFromLambdaEvent), so this route needs the custom authoriser (like
        // hmrcVatObligationGet) to free that header: the Cognito session travels on X-Authorization
        // instead.
        this.practiceClientAuthorisationGetLambdaJwtAuthorizer = false;
        this.practiceClientAuthorisationGetLambdaCustomAuthorizer = true;
        var practiceClientAuthorisationGetLambdaHandlerName = "practiceClientAuthorisationGet.ingestHandler";
        var practiceClientAuthorisationGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(practiceClientAuthorisationGetLambdaHandlerName);
        this.practiceClientAuthorisationGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, practiceClientAuthorisationGetLambdaHandlerDashed);
        this.practiceClientAuthorisationGetIngestLambdaHandler = "%s/practice/%s"
                .formatted(root.appLambdaHandlerPrefix, practiceClientAuthorisationGetLambdaHandlerName);
        this.practiceClientAuthorisationGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, practiceClientAuthorisationGetLambdaHandlerDashed);
        this.practiceClientAuthorisationGetIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(this.practiceClientAuthorisationGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.practiceClientAuthorisationGetLambdaHttpMethod,
                this.practiceClientAuthorisationGetLambdaUrlPath,
                "Read a client's authorisation status",
                "Reads a pending invitation's status, or checks HMRC for an existing relationship",
                "getPracticeClientAuthorisation",
                List.of(
                        new ApiParameter("clientId", "path", true, "The client's id"),
                        new ApiParameter("service", "query", true, "MTD-VAT or MTD-IT"))));

        // Practice client authorisation invite DELETE Lambda: cancels a pending invitation.
        this.practiceClientAuthorisationInviteDeleteLambdaHttpMethod = HttpMethod.DELETE;
        this.practiceClientAuthorisationInviteDeleteLambdaUrlPath =
                "/api/v1/practice/clients/{clientId}/authorisation/invitations";
        // Same reasoning as practiceClientAuthorisationGet above: the handler reads the HMRC
        // access token off the plain Authorization header, so this route needs the custom
        // authoriser to free that header for it.
        this.practiceClientAuthorisationInviteDeleteLambdaJwtAuthorizer = false;
        this.practiceClientAuthorisationInviteDeleteLambdaCustomAuthorizer = true;
        var practiceClientAuthorisationInviteDeleteLambdaHandlerName =
                "practiceClientAuthorisationInviteDelete.ingestHandler";
        var practiceClientAuthorisationInviteDeleteLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(
                        practiceClientAuthorisationInviteDeleteLambdaHandlerName);
        this.practiceClientAuthorisationInviteDeleteIngestLambdaFunctionName = "%s-%s"
                .formatted(root.appResourceNamePrefix, practiceClientAuthorisationInviteDeleteLambdaHandlerDashed);
        this.practiceClientAuthorisationInviteDeleteIngestLambdaHandler = "%s/practice/%s"
                .formatted(root.appLambdaHandlerPrefix, practiceClientAuthorisationInviteDeleteLambdaHandlerName);
        this.practiceClientAuthorisationInviteDeleteIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, practiceClientAuthorisationInviteDeleteLambdaHandlerDashed);
        this.practiceClientAuthorisationInviteDeleteIngestProvisionedConcurrencyLambdaAliasArn = "%s:%s"
                .formatted(
                        this.practiceClientAuthorisationInviteDeleteIngestLambdaArn,
                        root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.practiceClientAuthorisationInviteDeleteLambdaHttpMethod,
                this.practiceClientAuthorisationInviteDeleteLambdaUrlPath,
                "Cancel a client's pending invitation",
                "Cancels a pending HMRC Agent Authorisation invitation for one client and service",
                "cancelPracticeClientAuthorisationInvite",
                List.of(
                        new ApiParameter("clientId", "path", true, "The client's id"),
                        new ApiParameter("service", "query", true, "MTD-VAT or MTD-IT"))));

        this.operatorSnapshotGetLambdaHttpMethod = HttpMethod.GET;
        this.operatorSnapshotGetLambdaUrlPath = "/api/v1/operator/snapshot";
        this.operatorSnapshotGetLambdaJwtAuthorizer = true;
        this.operatorSnapshotGetLambdaCustomAuthorizer = false;
        var operatorSnapshotGetLambdaHandlerName = "operatorSnapshotGet.ingestHandler";
        var operatorSnapshotGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(operatorSnapshotGetLambdaHandlerName);
        this.operatorSnapshotGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, operatorSnapshotGetLambdaHandlerDashed);
        this.operatorSnapshotGetIngestLambdaHandler =
                "%s/analytics/%s".formatted(root.appLambdaHandlerPrefix, operatorSnapshotGetLambdaHandlerName);
        this.operatorSnapshotGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, operatorSnapshotGetLambdaHandlerDashed);
        this.operatorSnapshotGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.operatorSnapshotGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.operatorSnapshotGetLambdaHttpMethod,
                this.operatorSnapshotGetLambdaUrlPath,
                "Get the operator objectives snapshot",
                "Retrieves the latest nightly snapshot behind the one-stop operator dashboard",
                "getOperatorSnapshot"));

        var bundlePostProps = LambdaNameProps.builder()
                .apiHttpMethod(HttpMethod.POST)
                .apiUrlPath("/api/v1/bundle")
                .handlerPath("account")
                .ingestHandlerName("bundlePost.ingestHandler")
                .workerHandlerName("bundlePost.workerHandler")
                .apiJwtAuthorizer(true)
                .apiCustomAuthorizer(false)
                .resourceNamePrefix(root.appResourceNamePrefix)
                .lambdaArnPrefix(root.appLambdaArnPrefix)
                .provisionedConcurrencyAliasName(root.provisionedConcurrencyAliasName)
                .build();
        this.bundlePost = new LambdaNames(bundlePostProps);
        // TODO: Remove and reference bundlePost directly where used
        this.bundlePostLambdaHttpMethod = this.bundlePost.apiHttpMethod;
        this.bundlePostLambdaUrlPath = this.bundlePost.apiUrlPath;
        this.bundlePostLambdaJwtAuthorizer = this.bundlePost.apiJwtAuthorizer;
        this.bundlePostLambdaCustomAuthorizer = this.bundlePost.apiCustomAuthorizer;
        this.bundlePostIngestLambdaFunctionName = this.bundlePost.ingestLambdaFunctionName;
        this.bundlePostIngestLambdaHandler = this.bundlePost.ingestLambdaHandler;
        this.bundlePostIngestLambdaArn = this.bundlePost.ingestLambdaArn;
        this.bundlePostIngestProvisionedConcurrencyLambdaAliasArn =
                this.bundlePost.ingestProvisionedConcurrencyLambdaAliasArn;
        this.bundlePostWorkerLambdaFunctionName = this.bundlePost.workerLambdaFunctionName;
        this.bundlePostWorkerLambdaHandler = this.bundlePost.workerLambdaHandler;
        this.bundlePostWorkerLambdaArn = this.bundlePost.workerLambdaArn;
        this.bundlePostWorkerProvisionedConcurrencyLambdaAliasArn =
                this.bundlePost.workerProvisionedConcurrencyLambdaAliasArn;
        this.bundlePostLambdaQueueName = "%s-queue".formatted(this.bundlePostIngestLambdaFunctionName);
        this.bundlePostLambdaDeadLetterQueueName = "%s-dlq".formatted(this.bundlePostIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.bundlePostLambdaHttpMethod,
                this.bundlePostLambdaUrlPath,
                "Request new bundle",
                "Creates a new bundle request for the authenticated user",
                "requestBundle"));
        //        this.bundlePostLambdaHttpMethod = HttpMethod.POST;
        //        this.bundlePostLambdaUrlPath = "/api/v1/bundle";
        //        this.bundlePostLambdaJwtAuthorizer = true;
        //        this.bundlePostLambdaCustomAuthorizer = false;
        //        var bundlePostLambdaHandlerName = "bundlePost.ingestHandler";
        //        var bundlePostLambdaWorkerHandlerName = "bundlePost.workerHandler";
        //        var bundlePostLambdaHandlerDashed =
        //            ResourceNameUtils.convertCamelCaseToDashSeparated(bundlePostLambdaHandlerName);
        //        this.bundlePostIngestLambdaFunctionName =
        //            "%s-%s".formatted(this.appResourceNamePrefix, bundlePostLambdaHandlerDashed);
        //        this.bundlePostIngestLambdaHandler = "%s/account/%s".formatted(this.appLambdaHandlerPrefix,
        // bundlePostLambdaHandlerName);
        //        this.bundlePostIngestLambdaArn = "%s-%s".formatted(this.appLambdaArnPrefix,
        // bundlePostLambdaHandlerDashed);
        //        this.bundlePostIngestDefaultAliasLambdaArn = "%s:%s".formatted(this.bundlePostIngestLambdaArn,
        // this.defaultAliasName);
        //        this.bundlePostWorkerLambdaFunctionName =
        // "%s-worker".formatted(this.bundlePostIngestLambdaFunctionName);
        //        this.bundlePostWorkerLambdaHandler =
        //            "%s/account/%s".formatted(this.appLambdaHandlerPrefix, bundlePostLambdaWorkerHandlerName);
        //        this.bundlePostWorkerLambdaArn = "%s-worker".formatted(this.bundlePostIngestLambdaArn);
        //        this.bundlePostWorkerDefaultAliasLambdaArn =
        //            "%s:%s".formatted(this.bundlePostWorkerLambdaArn, this.defaultAliasName);
        //        this.bundlePostLambdaQueueName = "%s-queue".formatted(this.bundlePostIngestLambdaFunctionName);
        //        this.bundlePostLambdaDeadLetterQueueName =
        // "%s-dlq".formatted(this.bundlePostIngestLambdaFunctionName);
        //        publishedApiLambdas.add(new PublishedLambda(
        //            this.bundlePostLambdaHttpMethod,
        //            this.bundlePostLambdaUrlPath,
        //            "Request new bundle",
        //            "Creates a new bundle request for the authenticated user",
        //            "requestBundle"));

        this.bundleDeleteLambdaHttpMethod = HttpMethod.DELETE;
        this.bundleDeleteLambdaUrlPath = "/api/v1/bundle";
        this.bundleDeleteLambdaJwtAuthorizer = true;
        this.bundleDeleteLambdaCustomAuthorizer = false;
        var bundleDeleteLambdaHandlerName = "bundleDelete.ingestHandler";
        var bundleDeleteLambdaWorkerHandlerName = "bundleDelete.workerHandler";
        var bundleDeleteLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundleDeleteLambdaHandlerName);
        this.bundleDeleteIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, bundleDeleteLambdaHandlerDashed);
        this.bundleDeleteIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, bundleDeleteLambdaHandlerName);
        this.bundleDeleteIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, bundleDeleteLambdaHandlerDashed);
        this.bundleDeleteIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.bundleDeleteIngestLambdaArn, root.provisionedConcurrencyAliasName);
        this.bundleDeleteWorkerLambdaFunctionName = "%s-worker".formatted(this.bundleDeleteIngestLambdaFunctionName);
        this.bundleDeleteWorkerLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, bundleDeleteLambdaWorkerHandlerName);
        this.bundleDeleteWorkerLambdaArn = "%s-worker".formatted(this.bundleDeleteIngestLambdaArn);
        this.bundleDeleteWorkerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.bundleDeleteWorkerLambdaArn, root.provisionedConcurrencyAliasName);
        this.bundleDeleteLambdaQueueName = "%s-queue".formatted(this.bundleDeleteIngestLambdaFunctionName);
        this.bundleDeleteLambdaDeadLetterQueueName = "%s-dlq".formatted(this.bundleDeleteIngestLambdaFunctionName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.bundleDeleteLambdaHttpMethod,
                this.bundleDeleteLambdaUrlPath,
                "Delete bundle",
                "Deletes a bundle for the authenticated user",
                "deleteBundle",
                List.of(
                        new ApiParameter("bundleId", "query", false, "The bundle id (or name) to delete"),
                        new ApiParameter("removeAll", "query", false, "When true, removes all bundles"))));
        root.publishedApiLambdas.add(new PublishedLambda(
                this.bundleDeleteLambdaHttpMethod,
                "/api/v1/bundle/{id}",
                "Delete bundle by id",
                "Deletes a bundle for the authenticated user using a path parameter",
                "deleteBundleById",
                List.of(new ApiParameter("id", "path", true, "The bundle id (or name) to delete"))));

        this.supportTicketPostLambdaHttpMethod = HttpMethod.POST;
        this.supportTicketPostLambdaUrlPath = "/api/v1/support/ticket";
        this.supportTicketPostLambdaJwtAuthorizer = false;
        this.supportTicketPostLambdaCustomAuthorizer = false;
        var supportTicketPostLambdaHandlerName = "supportTicketPost.ingestHandler";
        var supportTicketPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(supportTicketPostLambdaHandlerName);
        this.supportTicketPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, supportTicketPostLambdaHandlerDashed);
        this.supportTicketPostIngestLambdaHandler =
                "%s/support/%s".formatted(root.appLambdaHandlerPrefix, supportTicketPostLambdaHandlerName);
        this.supportTicketPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, supportTicketPostLambdaHandlerDashed);
        this.supportTicketPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.supportTicketPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.supportTicketPostLambdaHttpMethod,
                this.supportTicketPostLambdaUrlPath,
                "Submit a support ticket",
                "Creates a GitHub issue for the authenticated user's support request",
                "submitSupportTicket"));

        // Interest POST Lambda (JWT auth - feedback engagement)
        this.interestPostLambdaHttpMethod = HttpMethod.POST;
        this.interestPostLambdaUrlPath = "/api/v1/interest";
        this.interestPostLambdaJwtAuthorizer = true;
        this.interestPostLambdaCustomAuthorizer = false;
        var interestPostLambdaHandlerName = "interestPost.ingestHandler";
        var interestPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(interestPostLambdaHandlerName);
        this.interestPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, interestPostLambdaHandlerDashed);
        this.interestPostIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, interestPostLambdaHandlerName);
        this.interestPostIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, interestPostLambdaHandlerDashed);
        this.interestPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.interestPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.interestPostLambdaHttpMethod,
                this.interestPostLambdaUrlPath,
                "Register feedback engagement",
                "Publishes the authenticated user's email to an SNS topic for feedback engagement",
                "registerInterest"));

        // Activity Started POST Lambda (JWT auth - an activity's primary button was clicked)
        this.activityStartedPostLambdaHttpMethod = HttpMethod.POST;
        this.activityStartedPostLambdaUrlPath = "/api/v1/activity/started";
        this.activityStartedPostLambdaJwtAuthorizer = true;
        this.activityStartedPostLambdaCustomAuthorizer = false;
        var activityStartedPostLambdaHandlerName = "activityStartedPost.ingestHandler";
        var activityStartedPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(activityStartedPostLambdaHandlerName);
        this.activityStartedPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, activityStartedPostLambdaHandlerDashed);
        this.activityStartedPostIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, activityStartedPostLambdaHandlerName);
        this.activityStartedPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, activityStartedPostLambdaHandlerDashed);
        this.activityStartedPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.activityStartedPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.activityStartedPostLambdaHttpMethod,
                this.activityStartedPostLambdaUrlPath,
                "Record an activity started",
                "Publishes an activity-started event for the authenticated user's activity id, "
                        + "clicked from that activity's primary button",
                "recordActivityStarted"));

        // Pass GET Lambda (public, no auth)
        this.passGetLambdaHttpMethod = HttpMethod.GET;
        this.passGetLambdaUrlPath = "/api/v1/pass";
        this.passGetLambdaJwtAuthorizer = false;
        this.passGetLambdaCustomAuthorizer = false;
        var passGetLambdaHandlerName = "passGet.ingestHandler";
        var passGetLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(passGetLambdaHandlerName);
        this.passGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, passGetLambdaHandlerDashed);
        this.passGetIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, passGetLambdaHandlerName);
        this.passGetIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, passGetLambdaHandlerDashed);
        this.passGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.passGetLambdaHttpMethod,
                this.passGetLambdaUrlPath,
                "Validate a pass code",
                "Checks if a pass code is valid and returns its details",
                "validatePass",
                List.of(new ApiParameter("code", "query", true, "The four-word pass code to validate"))));

        // Pass POST Lambda (JWT auth)
        this.passPostLambdaHttpMethod = HttpMethod.POST;
        this.passPostLambdaUrlPath = "/api/v1/pass";
        this.passPostLambdaJwtAuthorizer = true;
        this.passPostLambdaCustomAuthorizer = false;
        var passPostLambdaHandlerName = "passPost.ingestHandler";
        var passPostLambdaHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(passPostLambdaHandlerName);
        this.passPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, passPostLambdaHandlerDashed);
        this.passPostIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, passPostLambdaHandlerName);
        this.passPostIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, passPostLambdaHandlerDashed);
        this.passPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.passPostLambdaHttpMethod,
                this.passPostLambdaUrlPath,
                "Redeem a pass code",
                "Redeems a pass code and grants the associated bundle to the authenticated user",
                "redeemPass"));

        // Pass Admin POST Lambda (JWT auth; the handler admits operators and synthetic test users only)
        this.passAdminPostLambdaHttpMethod = HttpMethod.POST;
        this.passAdminPostLambdaUrlPath = "/api/v1/pass/admin";
        this.passAdminPostLambdaJwtAuthorizer = true;
        this.passAdminPostLambdaCustomAuthorizer = false;
        var passAdminPostLambdaHandlerName = "passAdminPost.ingestHandler";
        var passAdminPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(passAdminPostLambdaHandlerName);
        this.passAdminPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, passAdminPostLambdaHandlerDashed);
        this.passAdminPostIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, passAdminPostLambdaHandlerName);
        this.passAdminPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, passAdminPostLambdaHandlerDashed);
        this.passAdminPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passAdminPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.passAdminPostLambdaHttpMethod,
                this.passAdminPostLambdaUrlPath,
                "Generate a new pass",
                "Generates a new pass code for a specified bundle type (admin only)",
                "generatePass"));

        // Pass Release POST Lambda (JWT auth; the handler admits operators only)
        this.passReleasePostLambdaHttpMethod = HttpMethod.POST;
        this.passReleasePostLambdaUrlPath = "/api/v1/pass/release";
        this.passReleasePostLambdaJwtAuthorizer = true;
        this.passReleasePostLambdaCustomAuthorizer = false;
        var passReleasePostLambdaHandlerName = "passReleasePost.ingestHandler";
        var passReleasePostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(passReleasePostLambdaHandlerName);
        this.passReleasePostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, passReleasePostLambdaHandlerDashed);
        this.passReleasePostIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, passReleasePostLambdaHandlerName);
        this.passReleasePostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, passReleasePostLambdaHandlerDashed);
        this.passReleasePostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passReleasePostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.passReleasePostLambdaHttpMethod,
                this.passReleasePostLambdaUrlPath,
                "Release a held pass",
                "Raises, sets or removes the review limit of a pass held for review (operator only)",
                "releasePass"));

        // Affiliate POST Lambda (JWT auth; the handler admits operators only)
        this.affiliatePostLambdaHttpMethod = HttpMethod.POST;
        this.affiliatePostLambdaUrlPath = "/api/v1/affiliate";
        this.affiliatePostLambdaJwtAuthorizer = true;
        this.affiliatePostLambdaCustomAuthorizer = false;
        var affiliatePostLambdaHandlerName = "affiliatePost.ingestHandler";
        var affiliatePostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(affiliatePostLambdaHandlerName);
        this.affiliatePostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, affiliatePostLambdaHandlerDashed);
        this.affiliatePostIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, affiliatePostLambdaHandlerName);
        this.affiliatePostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, affiliatePostLambdaHandlerDashed);
        this.affiliatePostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.affiliatePostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.affiliatePostLambdaHttpMethod,
                this.affiliatePostLambdaUrlPath,
                "Set an affiliate",
                "Sets the tier and state of a referrer's affiliate record (operator only)",
                "setAffiliate"));

        // Affiliate GET Lambda (JWT auth; the handler admits operators only)
        this.affiliateGetLambdaHttpMethod = HttpMethod.GET;
        this.affiliateGetLambdaUrlPath = "/api/v1/affiliate";
        this.affiliateGetLambdaJwtAuthorizer = true;
        this.affiliateGetLambdaCustomAuthorizer = false;
        var affiliateGetLambdaHandlerName = "affiliateGet.ingestHandler";
        var affiliateGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(affiliateGetLambdaHandlerName);
        this.affiliateGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, affiliateGetLambdaHandlerDashed);
        this.affiliateGetIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, affiliateGetLambdaHandlerName);
        this.affiliateGetIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, affiliateGetLambdaHandlerDashed);
        this.affiliateGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.affiliateGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.affiliateGetLambdaHttpMethod,
                this.affiliateGetLambdaUrlPath,
                "Read an affiliate",
                "Reads the tier and state of a referrer's affiliate record (operator only)",
                "getAffiliate"));
        // Affiliate application POST Lambda (JWT auth; any signed-in user)
        this.affiliateApplicationPostLambdaHttpMethod = HttpMethod.POST;
        this.affiliateApplicationPostLambdaUrlPath = "/api/v1/affiliate/application";
        this.affiliateApplicationPostLambdaJwtAuthorizer = true;
        this.affiliateApplicationPostLambdaCustomAuthorizer = false;
        var affiliateApplicationPostLambdaHandlerName = "affiliateApplicationPost.ingestHandler";
        var affiliateApplicationPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(affiliateApplicationPostLambdaHandlerName);
        this.affiliateApplicationPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, affiliateApplicationPostLambdaHandlerDashed);
        this.affiliateApplicationPostIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, affiliateApplicationPostLambdaHandlerName);
        this.affiliateApplicationPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, affiliateApplicationPostLambdaHandlerDashed);
        this.affiliateApplicationPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.affiliateApplicationPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.affiliateApplicationPostLambdaHttpMethod,
                this.affiliateApplicationPostLambdaUrlPath,
                "Start an affiliate application",
                "Creates the caller's Stripe Connect account if needed and answers a Stripe-hosted onboarding link",
                "startAffiliateApplication"));
        // Affiliate application GET Lambda (JWT auth; any signed-in user)
        this.affiliateApplicationGetLambdaHttpMethod = HttpMethod.GET;
        this.affiliateApplicationGetLambdaUrlPath = "/api/v1/affiliate/application";
        this.affiliateApplicationGetLambdaJwtAuthorizer = true;
        this.affiliateApplicationGetLambdaCustomAuthorizer = false;
        var affiliateApplicationGetLambdaHandlerName = "affiliateApplicationGet.ingestHandler";
        var affiliateApplicationGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(affiliateApplicationGetLambdaHandlerName);
        this.affiliateApplicationGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, affiliateApplicationGetLambdaHandlerDashed);
        this.affiliateApplicationGetIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, affiliateApplicationGetLambdaHandlerName);
        this.affiliateApplicationGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, affiliateApplicationGetLambdaHandlerDashed);
        this.affiliateApplicationGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.affiliateApplicationGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.affiliateApplicationGetLambdaHttpMethod,
                this.affiliateApplicationGetLambdaUrlPath,
                "Read my affiliate application",
                "Reads the state of the caller's affiliate application and the Stripe Connect onboarding flags",
                "getAffiliateApplication"));
        // Pass Held GET Lambda (JWT auth; the handler admits operators only)
        this.passHeldGetLambdaHttpMethod = HttpMethod.GET;
        this.passHeldGetLambdaUrlPath = "/api/v1/pass/held";
        this.passHeldGetLambdaJwtAuthorizer = true;
        this.passHeldGetLambdaCustomAuthorizer = false;
        var passHeldGetLambdaHandlerName = "passHeldGet.ingestHandler";
        var passHeldGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(passHeldGetLambdaHandlerName);
        this.passHeldGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, passHeldGetLambdaHandlerDashed);
        this.passHeldGetIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, passHeldGetLambdaHandlerName);
        this.passHeldGetIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, passHeldGetLambdaHandlerDashed);
        this.passHeldGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passHeldGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.passHeldGetLambdaHttpMethod,
                this.passHeldGetLambdaUrlPath,
                "List held passes",
                "Lists the passes held for review, with their issuer hash, use count, review limit and held time (operator only)",
                "listHeldPasses"));

        // Pass Generate POST Lambda (JWT auth - user pass generation using tokens)
        this.passGeneratePostLambdaHttpMethod = HttpMethod.POST;
        this.passGeneratePostLambdaUrlPath = "/api/v1/pass/generate";
        this.passGeneratePostLambdaJwtAuthorizer = true;
        this.passGeneratePostLambdaCustomAuthorizer = false;
        var passGeneratePostLambdaHandlerName = "passGeneratePost.ingestHandler";
        var passGeneratePostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(passGeneratePostLambdaHandlerName);
        this.passGeneratePostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, passGeneratePostLambdaHandlerDashed);
        this.passGeneratePostIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, passGeneratePostLambdaHandlerName);
        this.passGeneratePostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, passGeneratePostLambdaHandlerDashed);
        this.passGeneratePostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passGeneratePostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.passGeneratePostLambdaHttpMethod,
                this.passGeneratePostLambdaUrlPath,
                "Generate a pass using tokens",
                "Generates a new pass code using the authenticated user's token balance",
                "generatePassWithTokens"));

        // Pass My Passes GET Lambda (JWT auth - list user's generated passes)
        this.passMyPassesGetLambdaHttpMethod = HttpMethod.GET;
        this.passMyPassesGetLambdaUrlPath = "/api/v1/pass/my-passes";
        this.passMyPassesGetLambdaJwtAuthorizer = true;
        this.passMyPassesGetLambdaCustomAuthorizer = false;
        var passMyPassesGetLambdaHandlerName = "passMyPassesGet.ingestHandler";
        var passMyPassesGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(passMyPassesGetLambdaHandlerName);
        this.passMyPassesGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, passMyPassesGetLambdaHandlerDashed);
        this.passMyPassesGetIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, passMyPassesGetLambdaHandlerName);
        this.passMyPassesGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, passMyPassesGetLambdaHandlerDashed);
        this.passMyPassesGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.passMyPassesGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.passMyPassesGetLambdaHttpMethod,
                this.passMyPassesGetLambdaUrlPath,
                "List generated passes",
                "Lists all passes generated by the authenticated user",
                "listMyPasses",
                List.of(new ApiParameter(
                        "limit", "query", false, "Maximum number of passes to return (default 20, max 50)"))));

        // Bundle Capacity Reconciliation Lambda (scheduled, not API)
        var bundleCapacityReconcileLambdaHandlerName = "bundleCapacityReconcile.handler";
        var bundleCapacityReconcileLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(bundleCapacityReconcileLambdaHandlerName);
        this.bundleCapacityReconcileLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, bundleCapacityReconcileLambdaHandlerDashed);
        this.bundleCapacityReconcileLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, bundleCapacityReconcileLambdaHandlerName);
        this.bundleCapacityReconcileLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, bundleCapacityReconcileLambdaHandlerDashed);
        this.bundleCapacityReconcileProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.bundleCapacityReconcileLambdaArn, root.provisionedConcurrencyAliasName);

        var commissionReleaseLambdaHandlerName = "commissionRelease.handler";
        var commissionReleaseLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(commissionReleaseLambdaHandlerName);
        this.commissionReleaseLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, commissionReleaseLambdaHandlerDashed);
        this.commissionReleaseLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, commissionReleaseLambdaHandlerName);
        this.commissionReleaseLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, commissionReleaseLambdaHandlerDashed);
        this.commissionReleaseProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.commissionReleaseLambdaArn, root.provisionedConcurrencyAliasName);

        var commissionCreditPayoutLambdaHandlerName = "commissionCreditPayout.handler";
        var commissionCreditPayoutLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(commissionCreditPayoutLambdaHandlerName);
        this.commissionCreditPayoutLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, commissionCreditPayoutLambdaHandlerDashed);
        this.commissionCreditPayoutLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, commissionCreditPayoutLambdaHandlerName);
        this.commissionCreditPayoutLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, commissionCreditPayoutLambdaHandlerDashed);
        this.commissionCreditPayoutProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.commissionCreditPayoutLambdaArn, root.provisionedConcurrencyAliasName);

        // Session Beacon POST Lambda (public, no auth). Path carries the /api/v1 prefix, not
        // the bare /api/session/beacon the endpoint used before: CloudFront only forwards
        // /api/v1/* and /api/v1/books/* to API Gateway, so a bare /api/* path fell through to
        // the default S3 behaviour (GET/HEAD/OPTIONS only) and every POST here was rejected by
        // CloudFront before it ever reached this Lambda - zero invocations, and so zero
        // new-session and logout activity events ever reached the lake.
        this.sessionBeaconPostLambdaHttpMethod = HttpMethod.POST;
        this.sessionBeaconPostLambdaUrlPath = "/api/v1/session/beacon";
        this.sessionBeaconPostLambdaJwtAuthorizer = false;
        this.sessionBeaconPostLambdaCustomAuthorizer = false;
        var sessionBeaconPostLambdaHandlerName = "sessionBeaconPost.ingestHandler";
        var sessionBeaconPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(sessionBeaconPostLambdaHandlerName);
        this.sessionBeaconPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, sessionBeaconPostLambdaHandlerDashed);
        this.sessionBeaconPostIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, sessionBeaconPostLambdaHandlerName);
        this.sessionBeaconPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, sessionBeaconPostLambdaHandlerDashed);
        this.sessionBeaconPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.sessionBeaconPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.sessionBeaconPostLambdaHttpMethod,
                this.sessionBeaconPostLambdaUrlPath,
                "Session beacon",
                "Records a new browser session for activity monitoring",
                "sessionBeacon"));

        // Session Sign-Out POST Lambda (behind ApiStack's allClientsJwtAuthorizer, set directly
        // at the call site in AccountStack.java, the same way billingJwtAuthorizer and
        // booksJwtAuthorizer are -- so no boolean flag here).
        this.sessionSignOutPostLambdaHttpMethod = HttpMethod.POST;
        this.sessionSignOutPostLambdaUrlPath = "/api/v1/session/sign-out";
        var sessionSignOutPostLambdaHandlerName = "sessionSignOutPost.ingestHandler";
        var sessionSignOutPostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(sessionSignOutPostLambdaHandlerName);
        this.sessionSignOutPostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, sessionSignOutPostLambdaHandlerDashed);
        this.sessionSignOutPostIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, sessionSignOutPostLambdaHandlerName);
        this.sessionSignOutPostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, sessionSignOutPostLambdaHandlerDashed);
        this.sessionSignOutPostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.sessionSignOutPostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.sessionSignOutPostLambdaHttpMethod,
                this.sessionSignOutPostLambdaUrlPath,
                "Session sign-out",
                "Ends the caller's sign-in session on every Cognito app client",
                "sessionSignOut"));

        // Account Settings PUT Lambda (standard JWT auth, same as bundleGet)
        this.accountSettingsPutLambdaHttpMethod = HttpMethod.PUT;
        this.accountSettingsPutLambdaUrlPath = "/api/v1/account/settings";
        this.accountSettingsPutLambdaJwtAuthorizer = true;
        this.accountSettingsPutLambdaCustomAuthorizer = false;
        var accountSettingsPutLambdaHandlerName = "accountSettingsPut.ingestHandler";
        var accountSettingsPutLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(accountSettingsPutLambdaHandlerName);
        this.accountSettingsPutIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, accountSettingsPutLambdaHandlerDashed);
        this.accountSettingsPutIngestLambdaHandler =
                "%s/account/%s".formatted(root.appLambdaHandlerPrefix, accountSettingsPutLambdaHandlerName);
        this.accountSettingsPutIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, accountSettingsPutLambdaHandlerDashed);
        this.accountSettingsPutIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.accountSettingsPutIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.accountSettingsPutLambdaHttpMethod,
                this.accountSettingsPutLambdaUrlPath,
                "Change account settings",
                "Changes the account settings of the authenticated user, such as showing or hiding pass generation",
                "accountSettings"));
    }
}
