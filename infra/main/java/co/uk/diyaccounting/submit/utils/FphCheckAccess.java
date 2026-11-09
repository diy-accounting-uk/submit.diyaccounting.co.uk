/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import java.util.List;
import java.util.Set;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.iam.Effect;
import software.amazon.awscdk.services.iam.PolicyStatement;
import software.amazon.awscdk.services.lambda.DockerImageFunction;
import software.amazon.awscdk.services.lambda.Function;

/**
 * Lets the Lambdas that send requests to HMRC queue a new header shape for the validator consumer
 * (app/lib/fraudPreventionHeaderCheckQueue.js). The queue lives in HmrcStack. Each sending stack
 * calls {@link #wireSenders} once after it has built its functions. The call adds the queue URL
 * to every container image function in the stack and one SendMessage statement on that queue to
 * each function's role. The statement joins the role's existing policy, so it adds no CloudFormation
 * resource, and the stacks need no reference to the queue construct.
 */
public final class FphCheckAccess {

    public static final String ENV_NAME = "FPH_CHECK_QUEUE_URL";

    private FphCheckAccess() {}

    public static String queueUrl(Stack stack, String queueName) {
        return "https://sqs.%s.amazonaws.com/%s/%s".formatted(stack.getRegion(), stack.getAccount(), queueName);
    }

    public static String queueArn(Stack stack, String queueName) {
        return "arn:aws:sqs:%s:%s:%s".formatted(stack.getRegion(), stack.getAccount(), queueName);
    }

    /**
     * Names the queue in the environment of every container image function in the stack, and lets
     * each send to it.
     *
     * @param excluded functions that do not send, such as the consumer itself
     */
    public static void wireSenders(Stack stack, String queueName, Set<Function> excluded) {
        String url = queueUrl(stack, queueName);
        String arn = queueArn(stack, queueName);
        for (var node : stack.getNode().findAll()) {
            if (node instanceof DockerImageFunction function && !excluded.contains(function)) {
                function.addEnvironment(ENV_NAME, url);
                function.addToRolePolicy(PolicyStatement.Builder.create()
                        .effect(Effect.ALLOW)
                        .actions(List.of("sqs:SendMessage"))
                        .resources(List.of(arn))
                        .build());
            }
        }
    }
}
