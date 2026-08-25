# OpenApiGenerator Refactoring - Summary of Changes

## Overview

The `OpenApiGenerator.java` has been completely refactored to introspect the CDK infrastructure code and dynamically generate OpenAPI specifications based on the actual API Gateway v2 configuration.

## Key Improvements

### 1. Dynamic Route Discovery from CDK Code

**Previous Approach:**
- Manually hardcoded endpoint definitions in separate methods (`addCognitoEndpoints`, `addHmrcEndpoints`, `addAccountEndpoints`)
- Required manual updates when adding new endpoints
- Prone to inconsistencies between CDK code and OpenAPI spec

**New Approach:**
- Introspects `SubmitSharedNames.publishedApiLambdas` which contains route metadata from CDK stacks
- Automatically discovers all API routes with their HTTP methods, paths, and metadata
- Groups endpoints by path for efficient processing
- Single source of truth: CDK code defines both infrastructure and documentation

### 2. Data-Driven Endpoint Enrichment

**Previous Approach:**
- Manually created tags, security, and responses for each endpoint individually
- Repetitive code for similar operations
- Difficult to maintain consistency

**New Approach:**
- Pattern-based enrichment using path prefixes (`/cognito/`, `/hmrc/`, etc.)
- Centralized methods for applying tags, security, and responses
- Consistent handling across all endpoints
- Switch expressions for clean, maintainable response descriptions

### 3. Improved Code Organization

**New Structure:**
```
- createInfoSection()          - Builds API info with auth guide
- createServersSection()        - Configures server URLs (parameterized)
- buildPathsFromCdkCode()       - Discovers routes from CDK metadata
- enrichEndpoints()             - Applies categorization
  ├─ enrichCognitoEndpoints()   - Authentication endpoints
  ├─ enrichHmrcEndpoints()      - HMRC integration endpoints
  └─ enrichAccountEndpoints()   - Account management endpoints
- createComponentsSection()     - Security schemes
- writeSpecificationFiles()     - Output generation
- generateSwaggerUiHtml()       - UI generation
```

### 4. Enhanced Maintainability

**Benefits:**
- **Less Code**: Reduced from ~418 lines to ~365 lines
- **Better Separation**: Each method has a single, clear responsibility
- **Documentation**: Comprehensive Javadoc explaining the introspection approach
- **Type Safety**: Using Java Streams and modern patterns
- **Extensibility**: Easy to add new endpoint categories or enrichment rules

## Technical Details

### Route Discovery Process

1. **Instantiate CDK Metadata**: `SubmitSharedNames.forDocs()`
2. **Extract Published Lambdas**: `sharedNames.publishedApiLambdas`
3. **Group by Path**: Using `Collectors.groupingBy()`
4. **Build Operations**: Create OpenAPI operations with summary, description, operationId
5. **Apply Enrichments**: Add tags, security, and responses based on patterns

### Enrichment Rules

| Path Pattern | Tag | Security | Description |
|-------------|-----|----------|-------------|
| `/cognito/*` | Authentication | None | Public auth endpoints |
| `/hmrc/token` | HMRC | CognitoAuth | HMRC token exchange |
| `/hmrc/vat/return` | HMRC | HmrcAuth | VAT submission (requires HMRC token) |
| `/hmrc/receipt` | HMRC | CognitoAuth | Receipt management |
| `/catalog` | Account | None | Public catalog |
| `/bundle` | Account | CognitoAuth | User bundle operations |

## Generated Output

The generator produces three files in `web/public/docs/api/`:

1. **openapi.json** - Complete OpenAPI 3.0.3 specification
2. **openapi.yaml** - Simplified YAML version (summary only)
3. **index.html** - Swagger UI with authentication detection

## Validation

All endpoints are correctly generated with:
- ✅ 8 unique paths
- ✅ 11 total operations (some paths have multiple methods)
- ✅ Proper HTTP methods (GET, POST, DELETE)
- ✅ Appropriate security requirements
- ✅ Consistent tags and responses
- ✅ Authentication guide included

## Future Enhancements

Potential improvements for future iterations:

1. **Request/Response Schemas**: Add JSON schema definitions for payloads
2. **Parameter Definitions**: Extract query/path parameters from Lambda configurations
3. **Error Responses**: Add common error codes (400, 401, 403, 500)
4. **Examples**: Include request/response examples
5. **Configuration File**: Support external YAML/JSON for customization
6. **CDK Synth Integration**: Parse synthesized CloudFormation templates for even more detail

## Migration Notes

This is a **drop-in replacement** - no API changes:
- Same command-line arguments
- Same output files and locations
- Same Maven build integration
- Generates functionally equivalent OpenAPI spec
- All existing tests pass

## Credits

This refactoring demonstrates best practices for:
- Infrastructure as Code (IaC) introspection
- API documentation generation
- Clean code architecture
- Java Stream API usage
- Modern switch expressions
