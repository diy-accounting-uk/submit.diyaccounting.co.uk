/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import co.uk.diyaccounting.submit.utils.ResourceNameUtils;
import software.amazon.awscdk.services.apigatewayv2.HttpMethod;

public class LambdaNames {

    public final LambdaNameProps props;

    public HttpMethod apiHttpMethod;
    public String apiUrlPath;
    public boolean apiJwtAuthorizer;
    public boolean apiCustomAuthorizer;
    public String ingestLambdaHandler;
    public String ingestLambdaFunctionName;
    public String ingestLambdaArn;
    public String ingestProvisionedConcurrencyLambdaAliasArn;
    public String workerLambdaHandler;
    public String workerLambdaFunctionName;
    public String workerLambdaArn;
    public String workerProvisionedConcurrencyLambdaAliasArn;
    public String workerQueueName;
    public String workerDeadLetterQueueName;

    public LambdaNames(LambdaNameProps props) {
        this.props = props;

        this.apiHttpMethod = props.apiHttpMethod();
        this.apiUrlPath = props.apiUrlPath();
        this.apiJwtAuthorizer = props.apiJwtAuthorizer();
        this.apiCustomAuthorizer = props.apiCustomAuthorizer();
        var workerHandlerName = props.workerHandlerName();
        var ingestHandlerDashed = ResourceNameUtils.convertCamelCaseToDashSeparated(props.ingestHandlerName());
        this.ingestLambdaHandler =
                "%s/%s/%s".formatted(props.handlerPrefix(), props.handlerPath(), props.ingestHandlerName());
        this.ingestLambdaFunctionName = "%s-%s".formatted(props.resourceNamePrefix(), ingestHandlerDashed);
        this.ingestLambdaArn = "%s-%s".formatted(props.lambdaArnPrefix(), ingestHandlerDashed);
        this.ingestProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.ingestLambdaArn, props.provisionedConcurrencyAliasName());
        this.workerLambdaHandler = "%s/%s/%s".formatted(props.handlerPrefix(), props.handlerPath(), workerHandlerName);
        this.workerLambdaFunctionName = "%s-%s".formatted(this.ingestLambdaFunctionName, props.workerPostfix());
        this.workerLambdaArn = "%s-%s".formatted(this.ingestLambdaArn, props.workerPostfix());
        this.workerProvisionedConcurrencyLambdaAliasArn =
                "%s:%s".formatted(this.workerLambdaArn, props.provisionedConcurrencyAliasName());
        this.workerQueueName = "%s-%s".formatted(this.ingestLambdaFunctionName, props.queuePostfix());
        this.workerDeadLetterQueueName =
                "%s-%s".formatted(this.ingestLambdaFunctionName, props.deadLetterQueuePostfix());
    }
}
