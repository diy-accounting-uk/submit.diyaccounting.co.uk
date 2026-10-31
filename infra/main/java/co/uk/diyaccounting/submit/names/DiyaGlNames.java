/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;
import co.uk.diyaccounting.submit.SubmitSharedNames.ApiParameter;
import co.uk.diyaccounting.submit.SubmitSharedNames.PublishedLambda;
import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import java.util.List;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public class DiyaGlNames {

    public String diyaGlListGetIngestLambdaHandler;
    public String diyaGlListGetIngestLambdaFunctionName;
    public String diyaGlListGetIngestLambdaArn;
    public String diyaGlListGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod diyaGlListGetLambdaHttpMethod;
    public String diyaGlListGetLambdaUrlPath;
    // A second, permanent published path for the same Lambda as diyaGlListGetLambdaUrlPath. The
    // spreadsheets site's cloud.js, including copies held by installed service workers, calls this
    // path and does not switch to the diya-gl one.
    public String diyaGlListGetBooksUrlPath;
    public boolean diyaGlListGetLambdaJwtAuthorizer;
    public boolean diyaGlListGetLambdaCustomAuthorizer;

    public String diyaGlVersionGetIngestLambdaHandler;
    public String diyaGlVersionGetIngestLambdaFunctionName;
    public String diyaGlVersionGetIngestLambdaArn;
    public String diyaGlVersionGetIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod diyaGlVersionGetLambdaHttpMethod;
    public String diyaGlVersionGetLambdaUrlPath;
    public String diyaGlVersionGetBooksUrlPath;
    public boolean diyaGlVersionGetLambdaJwtAuthorizer;
    public boolean diyaGlVersionGetLambdaCustomAuthorizer;

    public String diyaGlPutIngestLambdaHandler;
    public String diyaGlPutIngestLambdaFunctionName;
    public String diyaGlPutIngestLambdaArn;
    public String diyaGlPutIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod diyaGlPutLambdaHttpMethod;
    public String diyaGlPutLambdaUrlPath;
    public String diyaGlPutBooksUrlPath;
    public boolean diyaGlPutLambdaJwtAuthorizer;
    public boolean diyaGlPutLambdaCustomAuthorizer;

    public String diyaGlDeleteIngestLambdaHandler;
    public String diyaGlDeleteIngestLambdaFunctionName;
    public String diyaGlDeleteIngestLambdaArn;
    public String diyaGlDeleteIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod diyaGlDeleteLambdaHttpMethod;
    public String diyaGlDeleteLambdaUrlPath;
    public String diyaGlDeleteBooksUrlPath;
    public boolean diyaGlDeleteLambdaJwtAuthorizer;
    public boolean diyaGlDeleteLambdaCustomAuthorizer;

    public String practiceClientBookMovePostIngestLambdaHandler;
    public String practiceClientBookMovePostIngestLambdaFunctionName;
    public String practiceClientBookMovePostIngestLambdaArn;
    public String practiceClientBookMovePostIngestProvisionedConcurrencyLambdaAliasArn;
    public HttpMethod practiceClientBookMovePostLambdaHttpMethod;
    public String practiceClientBookMovePostLambdaUrlPath;
    public boolean practiceClientBookMovePostLambdaJwtAuthorizer;
    public boolean practiceClientBookMovePostLambdaCustomAuthorizer;

    public DiyaGlNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {

        // DIYA-GL List GET Lambda (DIYA-GL JWT auth, scoped to the DIYA-GL app client)
        this.diyaGlListGetLambdaHttpMethod = HttpMethod.GET;
        this.diyaGlListGetLambdaUrlPath = "/api/v1/diya-gl";
        this.diyaGlListGetBooksUrlPath = "/api/v1/books";
        this.diyaGlListGetLambdaJwtAuthorizer = false;
        this.diyaGlListGetLambdaCustomAuthorizer = false;
        var diyaGlListGetLambdaHandlerName = "diyaGlListGet.ingestHandler";
        var diyaGlListGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(diyaGlListGetLambdaHandlerName);
        this.diyaGlListGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, diyaGlListGetLambdaHandlerDashed);
        this.diyaGlListGetIngestLambdaHandler =
                "%s/diyaGl/%s".formatted(root.appLambdaHandlerPrefix, diyaGlListGetLambdaHandlerName);
        this.diyaGlListGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, diyaGlListGetLambdaHandlerDashed);
        this.diyaGlListGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.diyaGlListGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.diyaGlListGetLambdaHttpMethod,
                this.diyaGlListGetLambdaUrlPath,
                "List the caller's books",
                "Lists every stored book's metadata for the authenticated books user",
                "listBooks"));

        // DIYA-GL Version GET Lambda (books JWT auth)
        this.diyaGlVersionGetLambdaHttpMethod = HttpMethod.GET;
        this.diyaGlVersionGetLambdaUrlPath = "/api/v1/diya-gl/{bookId}/versions/{version}";
        this.diyaGlVersionGetBooksUrlPath = "/api/v1/books/{bookId}/versions/{version}";
        this.diyaGlVersionGetLambdaJwtAuthorizer = false;
        this.diyaGlVersionGetLambdaCustomAuthorizer = false;
        var diyaGlVersionGetLambdaHandlerName = "diyaGlVersionGet.ingestHandler";
        var diyaGlVersionGetLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(diyaGlVersionGetLambdaHandlerName);
        this.diyaGlVersionGetIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, diyaGlVersionGetLambdaHandlerDashed);
        this.diyaGlVersionGetIngestLambdaHandler =
                "%s/diyaGl/%s".formatted(root.appLambdaHandlerPrefix, diyaGlVersionGetLambdaHandlerName);
        this.diyaGlVersionGetIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, diyaGlVersionGetLambdaHandlerDashed);
        this.diyaGlVersionGetIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.diyaGlVersionGetIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.diyaGlVersionGetLambdaHttpMethod,
                this.diyaGlVersionGetLambdaUrlPath,
                "Read a book version",
                "Reads one version of a stored book, or its latest version, for the authenticated books user",
                "getBookVersion",
                List.of(
                        new ApiParameter("bookId", "path", true, "The book's id"),
                        new ApiParameter("version", "path", true, "\"latest\" or a positive version number"))));

        // DIYA-GL PUT Lambda (books JWT auth)
        this.diyaGlPutLambdaHttpMethod = HttpMethod.PUT;
        this.diyaGlPutLambdaUrlPath = "/api/v1/diya-gl/{bookId}";
        this.diyaGlPutBooksUrlPath = "/api/v1/books/{bookId}";
        this.diyaGlPutLambdaJwtAuthorizer = false;
        this.diyaGlPutLambdaCustomAuthorizer = false;
        var diyaGlPutLambdaHandlerName = "diyaGlPut.ingestHandler";
        var diyaGlPutLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(diyaGlPutLambdaHandlerName);
        this.diyaGlPutIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, diyaGlPutLambdaHandlerDashed);
        this.diyaGlPutIngestLambdaHandler =
                "%s/diyaGl/%s".formatted(root.appLambdaHandlerPrefix, diyaGlPutLambdaHandlerName);
        this.diyaGlPutIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, diyaGlPutLambdaHandlerDashed);
        this.diyaGlPutIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.diyaGlPutIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.diyaGlPutLambdaHttpMethod,
                this.diyaGlPutLambdaUrlPath,
                "Store a book version",
                "Writes the next version of a book with optimistic concurrency via If-Match",
                "putBook",
                List.of(new ApiParameter("bookId", "path", true, "The book's id"))));

        // DIYA-GL DELETE Lambda (books JWT auth)
        this.diyaGlDeleteLambdaHttpMethod = HttpMethod.DELETE;
        this.diyaGlDeleteLambdaUrlPath = "/api/v1/diya-gl/{bookId}";
        this.diyaGlDeleteBooksUrlPath = "/api/v1/books/{bookId}";
        this.diyaGlDeleteLambdaJwtAuthorizer = false;
        this.diyaGlDeleteLambdaCustomAuthorizer = false;
        var diyaGlDeleteLambdaHandlerName = "diyaGlDelete.ingestHandler";
        var diyaGlDeleteLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(diyaGlDeleteLambdaHandlerName);
        this.diyaGlDeleteIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, diyaGlDeleteLambdaHandlerDashed);
        this.diyaGlDeleteIngestLambdaHandler =
                "%s/diyaGl/%s".formatted(root.appLambdaHandlerPrefix, diyaGlDeleteLambdaHandlerName);
        this.diyaGlDeleteIngestLambdaArn = "%s-%s".formatted(root.appLambdaArnPrefix, diyaGlDeleteLambdaHandlerDashed);
        this.diyaGlDeleteIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.diyaGlDeleteIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.diyaGlDeleteLambdaHttpMethod,
                this.diyaGlDeleteLambdaUrlPath,
                "Delete a book",
                "Deletes a book and every stored version for the authenticated books user",
                "deleteBook",
                List.of(new ApiParameter("bookId", "path", true, "The book's id"))));

        // Practice client book move POST Lambda: copies one of the practice's own books to a
        // client's book set and deletes the source. Standard JWT auth like the other practice
        // routes, not the books authoriser, since the caller here is always the practice itself.
        this.practiceClientBookMovePostLambdaHttpMethod = HttpMethod.POST;
        this.practiceClientBookMovePostLambdaUrlPath = "/api/v1/practice/clients/{clientId}/books/{bookId}/move";
        this.practiceClientBookMovePostLambdaJwtAuthorizer = true;
        this.practiceClientBookMovePostLambdaCustomAuthorizer = false;
        var practiceClientBookMovePostLambdaHandlerName = "practiceClientBookMovePost.ingestHandler";
        var practiceClientBookMovePostLambdaHandlerDashed =
                ResourceNameUtils.convertCamelCaseToDashSeparated(practiceClientBookMovePostLambdaHandlerName);
        this.practiceClientBookMovePostIngestLambdaFunctionName =
                "%s-%s".formatted(root.appResourceNamePrefix, practiceClientBookMovePostLambdaHandlerDashed);
        this.practiceClientBookMovePostIngestLambdaHandler =
                "%s/practice/%s".formatted(root.appLambdaHandlerPrefix, practiceClientBookMovePostLambdaHandlerName);
        this.practiceClientBookMovePostIngestLambdaArn =
                "%s-%s".formatted(root.appLambdaArnPrefix, practiceClientBookMovePostLambdaHandlerDashed);
        this.practiceClientBookMovePostIngestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.practiceClientBookMovePostIngestLambdaArn, root.provisionedConcurrencyAliasName);
        root.publishedApiLambdas.add(new PublishedLambda(
                this.practiceClientBookMovePostLambdaHttpMethod,
                this.practiceClientBookMovePostLambdaUrlPath,
                "Move a book to a client",
                "Copies one of the practice's own books to a client's book set and deletes the source",
                "movePracticeClientBook",
                List.of(
                        new ApiParameter("clientId", "path", true, "The client's id"),
                        new ApiParameter("bookId", "path", true, "The book's id"))));
    }
}
