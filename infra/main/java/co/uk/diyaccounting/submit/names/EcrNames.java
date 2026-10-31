/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.names;

import co.uk.diyaccounting.submit.SubmitSharedNames;

public class EcrNames {

    public String ecrRepositoryArn;
    public String ecrRepositoryName;
    public String ecrLogGroupName;
    public String ecrPublishRoleName;
    public String ue1EcrRepositoryArn;
    public String ue1EcrRepositoryName;
    public String ue1EcrLogGroupName;
    public String ue1EcrPublishRoleName;

    public EcrNames(SubmitSharedNames.SubmitSharedNamesProps props, SubmitSharedNames root) {
        this.ecrRepositoryArn = "arn:aws:ecr:%s:%s:repository/%s-ecr"
                .formatted(props.regionName, props.awsAccount, root.envResourceNamePrefix);
        this.ecrRepositoryName = "%s-ecr".formatted(root.envResourceNamePrefix);
        this.ecrLogGroupName = "/aws/ecr/%s".formatted(root.envResourceNamePrefix);
        this.ecrPublishRoleName = "%s-ecr-publish-role".formatted(root.envResourceNamePrefix);
        this.ue1EcrRepositoryArn =
                "arn:aws:ecr:us-east-1:%s:repository/%s-ecr".formatted(props.awsAccount, root.envResourceNamePrefix);
        this.ue1EcrRepositoryName = "%s-ecr-us-east-1".formatted(root.envResourceNamePrefix);
        this.ue1EcrLogGroupName = "/aws/ecr/%s-us-east-1".formatted(root.envResourceNamePrefix);
        this.ue1EcrPublishRoleName = "%s-ecr-publish-role-us-east-1".formatted(root.envResourceNamePrefix);
    }
}
