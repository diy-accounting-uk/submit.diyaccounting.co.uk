---
paths: infra/**/*.java
---

# CDK Infrastructure Rules

## Stack Pattern

```java
public class ExampleStack extends Stack {
    public ExampleStack(final Construct scope, final String id, final ExampleStackProps props) {
        super(scope, id, props);
        // 1. Create IAM roles (least privilege)
        // 2. Create Lambda functions (Docker images from ECR)
        // 3. Create API Gateway routes
        // 4. Create CloudWatch alarms/dashboards
        // 5. Output ARNs/URLs via CfnOutput
    }
}
```

## Two CDK Applications

**Environment Stacks** (`cdk-environment/`): Long-lived shared resources
- ObservabilityStack, DataStack, IdentityStack, EcrStack

**Application Stacks** (`cdk-application/`): Per-deployment resources
- AuthStack, HmrcStack, ApiStack, EdgeStack, etc.

## Entry Points

- `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java`
- `infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java`

## Formatting

- Spotless with Palantir Java Format (100-column width)
- Runs during Maven `install` phase
- Fix: `./mvnw spotless:apply` (only when asked)

## IAM Best Practices

- Follow least privilege principle
- Avoid `Resource: "*"` wildcards
- Use specific ARNs where possible
