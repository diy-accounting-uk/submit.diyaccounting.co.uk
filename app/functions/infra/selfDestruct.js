// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/functions/selfDestruct.js

import { extractRequest, http200OkResponse, http500ServerErrorResponse } from "../../lib/httpResponseHelper.js";

let cloudFormationClient = null;
let cloudFormationClientUE1 = null;
let s3Client = null;

async function getCloudFormationClient(region = "eu-west-2") {
  if (region === "us-east-1") {
    if (!cloudFormationClientUE1) {
      const { CloudFormationClient } = await import("@aws-sdk/client-cloudformation");
      cloudFormationClientUE1 = new CloudFormationClient({ region: "us-east-1" });
    }
    return cloudFormationClientUE1;
  } else {
    if (!cloudFormationClient) {
      const { CloudFormationClient } = await import("@aws-sdk/client-cloudformation");
      cloudFormationClient = new CloudFormationClient({ region: process.env.AWS_REGION || "eu-west-2" });
    }
    return cloudFormationClient;
  }
}

async function getS3Client() {
  if (!s3Client) {
    const { S3Client } = await import("@aws-sdk/client-s3");
    s3Client = new S3Client({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return s3Client;
}

export async function ingestHandler(event, context) {
  const client = await getCloudFormationClient();
  const clientUE1 = await getCloudFormationClient("us-east-1");

  // Ensure context has a fallback for getRemainingTimeInMillis
  const safeContext = {
    ...context,
    getRemainingTimeInMillis: context.getRemainingTimeInMillis || (() => 900000), // 15 minutes default
  };

  console.log("Starting self-destruct sequence...");

  let request = "Not created";
  try {
    request = extractRequest(event);

    if (process.env.EDGE_ORIGIN_BUCKET) {
      await emptyBucket(process.env.EDGE_ORIGIN_BUCKET);
    }

    // Clean up external API Gateway custom domain mappings before deleting ApiStack
    if (process.env.API_STACK_NAME) {
      await cleanupApiGatewayMappings(process.env.API_STACK_NAME);
    }

    // Stack deletion order (reverse of creation dependency order)
    const stacksToDelete = [];
    addStackNameIfPresent(stacksToDelete, process.env.OPS_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.PUBLISH_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.EDGE_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.API_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.AUTH_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.HMRC_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.BILLING_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.ACCOUNT_STACK_NAME);
    const selfDestructStackName = process.env.SELF_DESTRUCT_STACK_NAME;

    console.log(`Stacks to delete in order: ${stacksToDelete.join(", ")}`);

    const results = [];

    // Delete stacks in order, the primary region first then us-east-1
    for (const stackName of stacksToDelete) {
      try {
        console.log(`Checking if stack ${stackName} exists in region eu-west-2...`);
        let deleted = await deleteStackIfExistsAndWait(client, safeContext, stackName);
        if (!deleted) {
          console.log(`Checking if stack ${stackName} exists in region us-east-1...`);
          deleted = await deleteStackIfExistsAndWait(clientUE1, safeContext, stackName);
        }
        results.push({
          stackName,
          status: deleted ? "deleted" : "skipped",
          error: null,
        });
      } catch (error) {
        console.log(`Error deleting stack ${stackName}: ${error.message}`);
        results.push({ stackName, status: "error", error: error.message });
      }
    }

    // CDK custom-resource provider Lambdas log after their stack has deleted their log group,
    // so the group comes back with no retention and blocks the next deployment of the same
    // name with "already exists". Sweep the deployment's log groups once its stacks are gone.
    if (process.env.DEPLOYMENT_NAME && results.every((r) => r.status !== "error")) {
      try {
        const deletedLogGroups = await deleteLeftoverLogGroups(process.env.DEPLOYMENT_NAME);
        results.push({ logGroups: deletedLogGroups, status: "deleted", error: null });
      } catch (error) {
        console.log(`Error deleting leftover log groups for ${process.env.DEPLOYMENT_NAME}: ${error.message}`);
        results.push({ logGroups: [], status: "error", error: error.message });
      }
    }

    // Delete self-destruct stack last if no errors
    if (selfDestructStackName && results.every((r) => r.status !== "error")) {
      try {
        console.log(`Checking if stack ${selfDestructStackName} exists in region eu-west-2...`);
        const deleted = await deleteStackIfExistsAndWait(client, safeContext, selfDestructStackName, true);
        results.push({
          stackName: selfDestructStackName,
          status: deleted ? "deleted" : "skipped",
          error: null,
        });
      } catch (error) {
        console.log(`Error deleting stack ${selfDestructStackName}: ${error.message}`);
        results.push({ stackName: selfDestructStackName, status: "error", error: error.message });
      }
    }

    const hasErrors = results.some((r) => r.status === "error");

    if (hasErrors) {
      console.log("One or more stacks failed to delete.");
      return http500ServerErrorResponse({
        request,
        message: "Self-destruct sequence completed with errors",
        data: { results, timestamp: new Date().toISOString() },
      });
    } else {
      console.log("Self-destruct sequence completed");
      return http200OkResponse({
        request,
        data: {
          message: "Self-destruct sequence completed",
          results,
          timestamp: new Date().toISOString(),
        },
      });
    }
  } catch (error) {
    console.error("Error in self-destruct ingestHandler:", error);
    return http500ServerErrorResponse({
      request,
      message: "Internal Server Error in self-destruct ingestHandler",
      data: { error: error.message },
    });
  }
}

async function deleteLeftoverLogGroups(deploymentName) {
  const { CloudWatchLogsClient, DescribeLogGroupsCommand, DeleteLogGroupCommand } =
    await import("@aws-sdk/client-cloudwatch-logs");
  const logGroupNamePrefix = `/aws/lambda/${deploymentName}-`;
  const deleted = [];
  for (const region of ["eu-west-2", "us-east-1"]) {
    const logsClient = new CloudWatchLogsClient({ region });
    let nextToken;
    do {
      const page = await logsClient.send(new DescribeLogGroupsCommand({ logGroupNamePrefix, nextToken }));
      for (const { logGroupName } of page.logGroups ?? []) {
        console.log(`Deleting leftover log group ${logGroupName} in ${region}`);
        await logsClient.send(new DeleteLogGroupCommand({ logGroupName }));
        deleted.push(`${region}:${logGroupName}`);
      }
      nextToken = page.nextToken;
    } while (nextToken);
  }
  return deleted;
}

async function deleteStackIfExistsAndWait(client, context, stackName, isSelfDestruct = false) {
  // Check if a stack exists
  const { DescribeStacksCommand, DeleteStackCommand } = await import("@aws-sdk/client-cloudformation");

  try {
    await client.send(new DescribeStacksCommand({ StackName: stackName }));
  } catch (error) {
    if (error.message?.includes("does not exist")) {
      console.log(`Stack ${stackName} does not exist, skipping`);
      return false; // Stack doesn't exist
    }
    throw error;
  }

  console.log(`Deleting stack: ${stackName}`);
  await client.send(new DeleteStackCommand({ StackName: stackName }));
  console.log(`Deletion initiated for stack: ${stackName}`);

  // Wait for stack to be fully deleted before proceeding (except for self-destruct stack)
  if (!isSelfDestruct) {
    const deleted = await waitForStackDeletion(client, context, stackName, 600); // 10 min timeout
    if (!deleted) {
      console.log(`Stack ${stackName} did not delete in time.`);
    }
    return deleted;
  }

  return true; // Self-destruct stack deletion was initiated
}

function addStackNameIfPresent(stackList, stackName) {
  if (stackName && stackName.trim()) {
    stackList.push(stackName);
  }
}

async function waitForStackDeletion(client, context, stackName, maxWaitSeconds) {
  let waited = 0;
  const interval = 10; // seconds

  while (waited < maxWaitSeconds) {
    // Check remaining time
    if (context.getRemainingTimeInMillis() < 30000) {
      // 30 seconds buffer
      console.log(`Timeout approaching, stopping wait for stack ${stackName}`);
      break;
    }

    try {
      const { DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");
      const resp = await client.send(new DescribeStacksCommand({ StackName: stackName }));
      const status = resp.Stacks?.[0]?.StackStatus;
      if (status === "DELETE_FAILED") {
        console.log(`Stack ${stackName} entered DELETE_FAILED, retrying with --retain-resources`);
        await retryDeleteWithRetainResources(client, stackName);
      } else {
        console.log(`Stack ${stackName} status: ${status}, waiting...`);
      }
    } catch (error) {
      if (error.message?.includes("does not exist")) {
        console.log(`Stack ${stackName} deleted.`);
        return true;
      }
      console.log(`Error polling stack ${stackName}: ${error.message}`);
    }

    await new Promise((resolve) => setTimeout(resolve, interval * 1000));
    waited += interval;
  }

  console.log(`Timeout waiting for stack ${stackName} deletion.`);
  return false;
}

async function retryDeleteWithRetainResources(client, stackName) {
  const { DeleteStackCommand, ListStackResourcesCommand } = await import("@aws-sdk/client-cloudformation");

  try {
    // Find resources that failed to delete
    const resources = await client.send(new ListStackResourcesCommand({ StackName: stackName }));
    const failedResources = (resources.StackResourceSummaries || [])
      .filter((r) => r.ResourceStatus === "DELETE_FAILED")
      .map((r) => r.LogicalResourceId);

    if (failedResources.length === 0) {
      console.log(`No DELETE_FAILED resources found in ${stackName}, retrying plain delete`);
      await client.send(new DeleteStackCommand({ StackName: stackName }));
    } else {
      console.log(`Retaining failed resources in ${stackName}: ${failedResources.join(", ")}`);
      await client.send(
        new DeleteStackCommand({
          StackName: stackName,
          RetainResources: failedResources,
        }),
      );
    }
  } catch (error) {
    console.log(`Error retrying delete for ${stackName}: ${error.message}`);
  }
}

async function resolveBucketRegion(bucketName) {
  try {
    const probe = await getS3Client();
    const { GetBucketLocationCommand } = await import("@aws-sdk/client-s3");
    const out = await probe.send(new GetBucketLocationCommand({ Bucket: bucketName }));
    const loc = out.LocationConstraint;
    if (!loc) return "us-east-1";
    if (loc === "EU") return "eu-west-1";
    return loc;
  } catch (err) {
    console.warn(`Falling back to default region for bucket ${bucketName}: ${err.message}`);
    return process.env.AWS_REGION || "eu-west-2";
  }
}

async function emptyBucket(bucketName) {
  console.log(`Emptying bucket: ${bucketName}`);

  const region = await resolveBucketRegion(bucketName);
  const { S3Client } = await import("@aws-sdk/client-s3");
  const s3Client = new S3Client({ region });

  const { ListObjectsV2Command, DeleteObjectsCommand } = await import("@aws-sdk/client-s3");

  let continuationToken;
  do {
    console.log(`Retrieving bucket contents for bucket ${bucketName} (continuation token: ${continuationToken})`);
    try {
      const list = await s3Client.send(
        new ListObjectsV2Command({
          Bucket: bucketName,
          ContinuationToken: continuationToken,
        }),
      );

      if (list.Contents && list.Contents.length > 0) {
        console.log(`Deleting ${list.Contents.length} objects from bucket ${bucketName}`);
        await s3Client.send(
          new DeleteObjectsCommand({
            Bucket: bucketName,
            Delete: {
              Objects: list.Contents.map((o) => ({ Key: o.Key })),
              Quiet: true,
            },
          }),
        );
      }
      continuationToken = list.IsTruncated ? list.NextContinuationToken : undefined;
    } catch (error) {
      console.error(`Error retrieving bucket contents for bucket ${bucketName}: ${error.message}`);
      console.log(`Error retrieving bucket contents for bucket ${bucketName}: stack trace: ${error.stack}`);
      continuationToken = undefined;
    }
  } while (continuationToken);

  console.log(`Bucket ${bucketName} emptied (or failed while emptying) successfully.`);
}

async function cleanupApiGatewayMappings(apiStackName) {
  console.log(`Cleaning up API Gateway custom domain mappings for stack: ${apiStackName}`);

  try {
    // Get the API ID from CloudFormation stack outputs
    const cfClient = await getCloudFormationClient();
    const { DescribeStacksCommand } = await import("@aws-sdk/client-cloudformation");

    let apiId;
    try {
      const stackResp = await cfClient.send(new DescribeStacksCommand({ StackName: apiStackName }));
      const outputs = stackResp.Stacks?.[0]?.Outputs || [];
      const apiIdOutput = outputs.find((o) => o.OutputKey === "HttpApiId");
      apiId = apiIdOutput?.OutputValue;
    } catch (error) {
      if (error.message?.includes("does not exist")) {
        console.log(`Stack ${apiStackName} does not exist, skipping API Gateway cleanup`);
        return;
      }
      throw error;
    }

    if (!apiId) {
      console.log(`No HttpApiId output found in stack ${apiStackName}, skipping`);
      return;
    }

    console.log(`Found API ID: ${apiId}, scanning for external domain mappings`);

    const { ApiGatewayV2Client, GetDomainNamesCommand, GetApiMappingsCommand, DeleteApiMappingCommand, DeleteDomainNameCommand } =
      await import("@aws-sdk/client-apigatewayv2");

    const apigwClient = new ApiGatewayV2Client({ region: process.env.AWS_REGION || "eu-west-2" });

    let nextToken;
    do {
      const domainResp = await apigwClient.send(new GetDomainNamesCommand({ NextToken: nextToken }));
      const domains = domainResp.Items || [];

      for (const domain of domains) {
        const domainName = domain.DomainName;
        try {
          const mapResp = await apigwClient.send(new GetApiMappingsCommand({ DomainName: domainName }));
          const mappings = mapResp.Items || [];
          const ourMappings = mappings.filter((m) => m.ApiId === apiId);

          for (const m of ourMappings) {
            console.log(`Deleting mapping ${m.ApiMappingId} from domain ${domainName}`);
            try {
              await apigwClient.send(new DeleteApiMappingCommand({ DomainName: domainName, ApiMappingId: m.ApiMappingId }));
            } catch (e) {
              console.log(`Delete mapping error (ignored): ${e.message}`);
            }
          }

          if (ourMappings.length > 0 && ourMappings.length === mappings.length) {
            console.log(`Deleting domain ${domainName} (all mappings were ours)`);
            try {
              await apigwClient.send(new DeleteDomainNameCommand({ DomainName: domainName }));
            } catch (e) {
              console.log(`Delete domain error (ignored): ${e.message}`);
            }
          }
        } catch (e) {
          console.log(`Error processing domain ${domainName} (ignored): ${e.message}`);
        }
      }

      nextToken = domainResp.NextToken;
    } while (nextToken);

    console.log("API Gateway custom domain mapping cleanup complete");
  } catch (error) {
    console.log(`API Gateway cleanup error (non-fatal): ${error.message}`);
  }
}
