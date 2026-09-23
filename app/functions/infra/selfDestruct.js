// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/functions/selfDestruct.js

import { extractRequest, http200OkResponse, http500ServerErrorResponse } from "../../lib/httpResponseHelper.js";
import { resolveAlarmEnv } from "../../lib/alarmName.js";
import { silenceDeployment } from "../../lib/alarmSilence.js";
import { createLogger } from "../../lib/logger.js";

const logger = createLogger({ source: "app/functions/infra/selfDestruct.js" });

let cloudFormationClient = null;
let cloudFormationClientUE1 = null;
let s3Client = null;
let ssmClient = null;
let cloudWatchClient = null;

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

async function getSsmClient() {
  if (!ssmClient) {
    const { SSMClient } = await import("@aws-sdk/client-ssm");
    ssmClient = new SSMClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return ssmClient;
}

async function getCloudWatchClient() {
  if (!cloudWatchClient) {
    const { CloudWatchClient } = await import("@aws-sdk/client-cloudwatch");
    cloudWatchClient = new CloudWatchClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return cloudWatchClient;
}

/**
 * Free this deployment's ci slot claim once its stacks are confirmed gone,
 * so the slot's next claimant does not wait out a stale claim that destroy-ci.yml never got to
 * release. Released only after every stack deletes cleanly (the caller's guard), the same
 * ordering destroy-ci.yml uses, so a slot is never handed to a new claimant while this
 * deployment's stacks might still be mid-teardown. Never throws: a release failure must not
 * fail the self-destruct sequence behind it.
 */
async function releaseSlot(parameterName) {
  try {
    const { DeleteParameterCommand } = await import("@aws-sdk/client-ssm");
    await (await getSsmClient()).send(new DeleteParameterCommand({ Name: parameterName }));
    console.log(`Released ci slot parameter ${parameterName}`);
  } catch (error) {
    if (error.name === "ParameterNotFound") {
      console.log(`Ci slot parameter ${parameterName} already released`);
    } else {
      console.log(`Error releasing ci slot parameter ${parameterName}: ${error.message}`);
    }
  }
}

/**
 * Silence this deployment's alarms before anything is torn down, so a normal teardown does not
 * fire the routers that open a GitHub issue or post to Telegram. DEPLOYMENT_NAME carries the env
 * prefix (e.g. "ci-branch"); an alarm's own name carries only the slug after it, so the prefix is
 * stripped here to match what the routers look up. Never throws: a silence failure must not stop
 * the teardown behind it.
 */
async function silenceDeploymentAlarms(deploymentName) {
  try {
    const env = resolveAlarmEnv(deploymentName, null);
    if (!env) {
      console.log(`Deployment name ${deploymentName} carries no ci/prod prefix, skipping alarm silence`);
      return;
    }
    const deployment = deploymentName.slice(env.length + 1);
    const result = await silenceDeployment({
      ssmClient: await getSsmClient(),
      cloudWatchClient: await getCloudWatchClient(),
      env,
      deployment,
      now: new Date(),
    });
    console.log(`Alarm silence result for ${deploymentName}: ${JSON.stringify(result)}`);
  } catch (error) {
    console.log(`Error silencing alarms for ${deploymentName}: ${error.message}`);
  }
}

/**
 * Read one SSM parameter, distinguishing "does not exist" from "could not be read": the callers
 * below use "does not exist" to mean no protection applies, but an unreadable parameter might
 * still be in force, so it must not be treated the same as absent - see findSkipReason.
 */
async function readSsmParameter(parameterName) {
  const { GetParameterCommand } = await import("@aws-sdk/client-ssm");
  try {
    const result = await (await getSsmClient()).send(new GetParameterCommand({ Name: parameterName }));
    return { found: true, value: result.Parameter?.Value ?? null };
  } catch (error) {
    if (error.name === "ParameterNotFound") {
      return { found: false, value: null };
    }
    return { found: true, value: null, unreadable: true, error };
  }
}

// deploy.yml releases its own ci slot claim when its run ends, pass or fail, so a claim record
// that exists and is younger than the longest deploy belongs to a deploy still working on the set.
const ACTIVE_CLAIM_WINDOW_MS = 3 * 60 * 60 * 1000;

/**
 * Why this deployment must be left alone this cycle, or null: it is the ci environment's
 * last-known-good deployment, or a deploy holds its ci slot. An unreadable parameter counts as
 * protection, because a wrongly skipped cycle costs one schedule interval and a wrong delete
 * breaks a running deploy. The schedule is recurring, so a skip needs no rescheduling.
 */
async function findSkipReason({ deploymentName, lastKnownGoodParameterName, slotParameterName, nowMs }) {
  if (lastKnownGoodParameterName) {
    const lastKnownGood = await readSsmParameter(lastKnownGoodParameterName);
    if (lastKnownGood.unreadable) {
      return `could not read ${lastKnownGoodParameterName} (${lastKnownGood.error.message}), treating this deployment as protected`;
    }
    if (lastKnownGood.value === deploymentName) {
      return `${deploymentName} is the last-known-good deployment`;
    }
  }

  if (slotParameterName) {
    const slot = await readSsmParameter(slotParameterName);
    if (slot.unreadable) {
      return `could not read ${slotParameterName} (${slot.error.message}), treating its ci slot claim as active`;
    }
    let record = null;
    if (slot.value) {
      try {
        record = JSON.parse(slot.value);
      } catch {
        record = null;
      }
    }
    const claimedAtMs = record?.claimedAt ? Date.parse(record.claimedAt) : NaN;
    if (!Number.isNaN(claimedAtMs) && nowMs - claimedAtMs < ACTIVE_CLAIM_WINDOW_MS) {
      return `ci slot is claimed by run ${record.runId} since ${record.claimedAt}`;
    }
  }

  return null;
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

    // Stack deletion order (reverse of creation dependency order)
    const stacksToDelete = [];
    addStackNameIfPresent(stacksToDelete, process.env.OPS_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.PUBLISH_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.EDGE_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.API_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.AUTH_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.HMRC_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.HMRC_ITSA_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.COMPANIES_HOUSE_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.BILLING_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.DIYA_GL_STACK_NAME);
    addStackNameIfPresent(stacksToDelete, process.env.ACCOUNT_STACK_NAME);
    const selfDestructStackName = process.env.SELF_DESTRUCT_STACK_NAME;

    // Checked before any destructive step below (alarm silencing included), so a set that is
    // last-known-good or mid-deploy is left untouched rather than silenced and then torn down.
    const skipReason = await findSkipReason({
      deploymentName: process.env.DEPLOYMENT_NAME,
      lastKnownGoodParameterName: process.env.LAST_KNOWN_GOOD_PARAMETER_NAME,
      slotParameterName: process.env.SLOT_PARAMETER_NAME,
      nowMs: Date.now(),
    });
    if (skipReason) {
      console.log(`skip: ${skipReason}`);
      return http200OkResponse({
        request,
        data: {
          message: "Self-destruct sequence skipped",
          reason: skipReason,
          timestamp: new Date().toISOString(),
        },
      });
    }

    if (process.env.DEPLOYMENT_NAME) {
      await silenceDeploymentAlarms(process.env.DEPLOYMENT_NAME);
    }

    if (process.env.EDGE_ORIGIN_BUCKET) {
      await emptyBucket(process.env.EDGE_ORIGIN_BUCKET);
    }

    // Clean up external API Gateway custom domain mappings before deleting ApiStack
    if (process.env.API_STACK_NAME) {
      await cleanupApiGatewayMappings(process.env.API_STACK_NAME);
    }

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

    if (process.env.SLOT_PARAMETER_NAME && results.every((r) => r.status !== "error")) {
      await releaseSlot(process.env.SLOT_PARAMETER_NAME);
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
        error: { results, timestamp: new Date().toISOString() },
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
      error: { error: error.message },
    });
  }
}

async function deleteLeftoverLogGroups(deploymentName) {
  const { CloudWatchLogsClient, DescribeLogGroupsCommand, DeleteLogGroupCommand } = await import("@aws-sdk/client-cloudwatch-logs");
  const logGroupNamePrefix = `/aws/lambda/${deploymentName}-`;
  const deleted = [];
  for (const region of ["eu-west-2", "us-east-1"]) {
    const logsClient = new CloudWatchLogsClient({ region });
    let nextToken;
    do {
      const page = await logsClient.send(new DescribeLogGroupsCommand({ logGroupNamePrefix, nextToken }));
      for (const { logGroupName, retentionInDays } of page.logGroups ?? []) {
        // Every log group this repo creates already carries a short retention. This sweep
        // exists only for CDK's framework provider log groups, which have none - a group
        // with a retention set belongs to a retired deployment and keeps its evidence.
        if (retentionInDays) {
          console.log(`Skipping log group ${logGroupName} in ${region}, retention already set (${retentionInDays} days)`);
          continue;
        }
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
      throw new Error(`Stack ${stackName} was not deleted`);
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
  let forced = false;

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
      if (status === "DELETE_FAILED" && forced) {
        // Routed through the structured logger, not console.log, because stackName carries the
        // deployment name and CodeQL flags a raw console.log of that value as clear-text logging.
        logger.info({ message: `Stack ${stackName} is DELETE_FAILED after a forced delete, giving up.` });
        return false;
      }
      if (status === "DELETE_FAILED") {
        // The same path destroy-ci.yml's sweep takes: one forced delete, which skips the
        // resources the first delete could not remove. The earlier retain-resources retry
        // needed cloudformation:ListStackResources, which this Lambda's role never had, so it
        // was denied on every poll and the stack stayed DELETE_FAILED until the sweep.
        logger.info({ message: `Stack ${stackName} entered DELETE_FAILED, retrying with FORCE_DELETE_STACK` });
        await forceDeleteStack(client, stackName);
        forced = true;
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

  logger.info({ message: `Timeout waiting for stack ${stackName} deletion.` });
  return false;
}

async function forceDeleteStack(client, stackName) {
  const { DeleteStackCommand } = await import("@aws-sdk/client-cloudformation");
  try {
    await client.send(new DeleteStackCommand({ StackName: stackName, DeletionMode: "FORCE_DELETE_STACK" }));
  } catch (error) {
    logger.info({ message: `Error forcing delete of ${stackName}: ${error.message}` });
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
      // A deployment's origin bucket name is a synth-time literal with no CloudFormation
      // dependency forcing EdgeStack to finish first, so self-destruct can run (and try to
      // empty this bucket) while EdgeStack is still creating it. That is a normal state for a
      // young deployment, not a failure, so it is logged at warn rather than error.
      if (error.name === "NoSuchBucket" || error.message?.includes("does not exist")) {
        console.warn(`Bucket ${bucketName} does not exist yet, nothing to empty: ${error.message}`);
      } else {
        console.error(`Error retrieving bucket contents for bucket ${bucketName}: ${error.message}`);
        console.log(`Error retrieving bucket contents for bucket ${bucketName}: stack trace: ${error.stack}`);
      }
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
