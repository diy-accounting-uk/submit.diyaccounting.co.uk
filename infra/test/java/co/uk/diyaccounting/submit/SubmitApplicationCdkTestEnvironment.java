/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit;

import org.junitpioneer.jupiter.SetEnvironmentVariable;

@SetEnvironmentVariable.SetEnvironmentVariables({
    @SetEnvironmentVariable(key = "ENVIRONMENT_NAME", value = "test"),
    @SetEnvironmentVariable(key = "DEPLOYMENT_NAME", value = "tt-witheight"),
    @SetEnvironmentVariable(
            key = "COGNITO_USER_POOL_ARN",
            value = "arn:aws:cognito-idp:eu-west-2:111111111111:userpool/eu-west-2_123456789"),
    @SetEnvironmentVariable(key = "COGNITO_CLIENT_ID", value = "tt-witheight-cognito-client-id"),
    @SetEnvironmentVariable(key = "COGNITO_DIYA_GL_CLIENT_ID", value = "tt-witheight-cognito-books-client-id"),
    @SetEnvironmentVariable(
            key = "HMRC_CLIENT_SECRET_ARN",
            value = "arn:aws:secretsmanager:eu-west-2:111111111111:secret:tt-witheight/submit/hmrc/client_secret"),
    @SetEnvironmentVariable(
            key = "HMRC_SANDBOX_CLIENT_SECRET_ARN",
            value =
                    "arn:aws:secretsmanager:eu-west-2:111111111111:secret:tt-witheight/submit/hmrc/sandbox_client_secret"),
    @SetEnvironmentVariable(key = "BASE_IMAGE_TAG", value = "test"),
    @SetEnvironmentVariable(key = "CLOUD_TRAIL_ENABLED", value = "true"),
    @SetEnvironmentVariable(key = "SELF_DESTRUCT_DELAY_HOURS", value = "1"),
    @SetEnvironmentVariable(key = "HTTP_API_URL", value = "https://test-api.example.com/"),
    @SetEnvironmentVariable(key = "DOC_ROOT_PATH", value = "web/public"),
    @SetEnvironmentVariable(key = "EDGE_FUNCTION_ASSET_PATH", value = "app/functions/edge"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_ACCOUNT", value = "111111111111"),
    @SetEnvironmentVariable(key = "CDK_DEFAULT_REGION", value = "eu-west-2"),
})
abstract class SubmitApplicationCdkTestEnvironment {}
