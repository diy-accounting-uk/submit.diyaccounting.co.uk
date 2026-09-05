#!/usr/bin/env node
// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd
//
// Lean app deployment: updates Lambda function code (Docker image) and static web assets
// without running CDK. Bypasses full deploy.yml for rapid iteration.
//
// Usage:
//   node scripts/deploy-app.js [--deployment <name>] [--skip-docker] [--skip-lambdas] [--skip-web]
//
// Prerequisites:
//   - AWS credentials assumed: . ./scripts/aws-assume-submit-deployment-role.sh
//   - Environment variables loaded via dotenv (use npm run deploy:app-ci or deploy:app-prod)
//
// Environment variables (from .env.ci or .env.prod via dotenv):
//   ENVIRONMENT_NAME  - ci or prod
//   DEPLOYMENT_NAME   - deployment name (overridden by --deployment flag)
//   COGNITO_CLIENT_ID, HMRC_CLIENT_ID, etc. - for submit.env generation

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import os from "os";
import { fileURLToPath } from "url";

const AWS_ACCOUNT_ID = "887764105431";
const AWS_REGION = "eu-west-2";
const AWS_REGION_UE1 = "us-east-1";

// CloudFront invalidation paths - must match PublishStack.java lines 227-269
const CLOUDFRONT_INVALIDATION_PATHS = [
  "/activities/*",
  "/auth/*",
  "/companies-house/*",
  "/docs/*",
  "/errors/*",
  "/hmrc/*",
  "/images/*",
  "/lib/*",
  "/prefetch/*",
  "/tests/*",
  "/widgets/*",
  "/about.html",
  "/accessibility.html",
  "/bundles.html",
  "/faqs.toml",
  "/guide.html",
  "/help.html",
  "/mcp.html",
  "/diy-accounting-spreadsheets.html",
  "/diy-accounting-limited.html",
  "/spreadsheets.html",
  "/android-chrome-192.png",
  "/android-chrome-512.png",
  "/apple-touch-icon.png",
  "/favicon.ico",
  "/favicon.svg",
  "/favicon-16.png",
  "/favicon-32.png",
  "/index.html",
  "/privacy.html",
  "/submit.catalogue.toml",
  "/submit.build-number.txt",
  "/submit.commit-hash.txt",
  "/submit.css",
  "/submit.deployment-name.txt",
  "/submit.env",
  "/submit.environment-name.txt",
  "/submit.js",
  "/submit.version.txt",
  "/terms.html",
  "/site.webmanifest",
  "/simulator.html",
  "/developer-mode.js",
];

// --- Helpers ---

function run(cmd, opts = {}) {
  const { silent = false, allowFailure = false } = opts;
  if (!silent) console.log(`  $ ${cmd}`);
  try {
    return execSync(cmd, {
      encoding: "utf-8",
      stdio: silent ? "pipe" : "inherit",
      ...opts,
    });
  } catch (err) {
    if (allowFailure) return "";
    throw err;
  }
}

function runCapture(cmd) {
  return execSync(cmd, { encoding: "utf-8" }).trim();
}

function parseArgs() {
  const args = process.argv.slice(2);
  const flags = {
    deployment: null,
    skipDocker: false,
    skipLambdas: false,
    skipWeb: false,
  };
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--deployment":
        flags.deployment = args[++i];
        break;
      case "--skip-docker":
        flags.skipDocker = true;
        break;
      case "--skip-lambdas":
        flags.skipLambdas = true;
        break;
      case "--skip-web":
        flags.skipWeb = true;
        break;
      case "--help":
      case "-h":
        console.log("Usage: node scripts/deploy-app.js [options]");
        console.log("");
        console.log("Options:");
        console.log("  --deployment <name>  Deployment name (or DEPLOYMENT_NAME env var, or SSM lookup)");
        console.log("  --skip-docker        Skip Docker build & ECR push");
        console.log("  --skip-lambdas       Skip Lambda function updates");
        console.log("  --skip-web           Skip web asset sync & CloudFront invalidation");
        console.log("");
        console.log("npm scripts:");
        console.log("  npm run deploy:app-ci             Deploy to CI environment");
        console.log("  npm run deploy:app-prod            Deploy to prod environment");
        console.log("  npm run deploy:app-ci -- --deployment ci-leanbuild");
        console.log("  npm run deploy:app-ci -- --skip-docker --skip-lambdas");
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${args[i]}`);
        process.exit(1);
    }
  }
  return flags;
}

// --- Step 1: Resolve deployment name ---

function resolveDeployment(flags) {
  let deploymentName = flags.deployment || process.env.DEPLOYMENT_NAME;
  let environmentName = process.env.ENVIRONMENT_NAME;

  // Fall back to SSM parameter
  if (!deploymentName && environmentName) {
    console.log(`No deployment name specified, reading from SSM /submit/${environmentName}/last-known-good-deployment...`);
    try {
      deploymentName = runCapture(
        `aws ssm get-parameter --name "/submit/${environmentName}/last-known-good-deployment" --query "Parameter.Value" --output text`,
      );
      console.log(`  Found: ${deploymentName}`);
    } catch {
      console.error("ERROR: Could not read deployment name from SSM. Specify --deployment or set DEPLOYMENT_NAME.");
      process.exit(1);
    }
  }

  if (!deploymentName) {
    console.error("ERROR: No deployment name. Use --deployment <name>, set DEPLOYMENT_NAME, or set ENVIRONMENT_NAME for SSM lookup.");
    process.exit(1);
  }

  // Derive environment from deployment name prefix if not set
  if (!environmentName) {
    if (deploymentName.startsWith("ci")) environmentName = "ci";
    else if (deploymentName.startsWith("prod")) environmentName = "prod";
    else {
      console.error(`ERROR: Cannot derive environment from deployment name '${deploymentName}'. Set ENVIRONMENT_NAME.`);
      process.exit(1);
    }
  }

  const gitSha = runCapture("git rev-parse HEAD");
  const gitShaShort = gitSha.substring(0, 7);
  const appPrefix = `${deploymentName}-app`;
  const envPrefix = `${environmentName}-env`;

  // ECR repos are environment-level, not deployment-level
  const ecrRepoEuw2 = `${envPrefix}-ecr`;
  const ecrRepoUe1 = `${envPrefix}-ecr-us-east-1`;
  const ecrUriEuw2 = `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ecrRepoEuw2}`;
  const ecrUriUe1 = `${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION_UE1}.amazonaws.com/${ecrRepoUe1}`;

  // S3 bucket: lookup from EdgeStack CloudFormation output
  const edgeStackName = `${appPrefix}-EdgeStack`;
  const originBucket = runCapture(
    `aws cloudformation describe-stacks --stack-name ${edgeStackName} --region ${AWS_REGION_UE1} --query 'Stacks[0].Outputs[?OutputKey==\`OriginBucketName\`].OutputValue' --output text`,
  );

  const version = JSON.parse(fs.readFileSync("package.json", "utf-8")).version;

  console.log("\n=== Deployment Configuration ===");
  console.log(`  Deployment:   ${deploymentName}`);
  console.log(`  Environment:  ${environmentName}`);
  console.log(`  Git SHA:      ${gitShaShort} (${gitSha})`);
  console.log(`  ECR (eu-w-2): ${ecrUriEuw2}`);
  console.log(`  ECR (us-e-1): ${ecrUriUe1}`);
  console.log(`  S3 bucket:    ${originBucket}`);
  console.log(`  Version:      ${version}`);
  console.log("");

  return {
    deploymentName,
    environmentName,
    gitSha,
    gitShaShort,
    appPrefix,
    envPrefix,
    ecrRepoEuw2,
    ecrRepoUe1,
    ecrUriEuw2,
    ecrUriUe1,
    originBucket,
    version,
  };
}

// --- Step 2: Docker build & ECR push ---

function dockerBuildAndPush(config) {
  console.log("=== Step 2: Docker Build & ECR Push ===\n");

  const localTag = `submit-base:${config.gitSha}`;

  // Build ARM64 image
  console.log("Building ARM64 Docker image...");
  run(`docker buildx build --platform linux/arm64 --provenance=false --load -t ${localTag} -f Dockerfile .`);

  // Push to eu-west-2
  console.log(`\nPushing to ECR eu-west-2 (${config.ecrRepoEuw2})...`);
  run(
    `aws ecr get-login-password --region ${AWS_REGION} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com`,
  );
  run(`docker tag ${localTag} ${config.ecrUriEuw2}:${config.gitSha}`);
  run(`docker tag ${localTag} ${config.ecrUriEuw2}:latest`);
  run(`docker push ${config.ecrUriEuw2}:${config.gitSha}`);
  run(`docker push ${config.ecrUriEuw2}:latest`);

  // Push to us-east-1
  console.log(`\nPushing to ECR us-east-1 (${config.ecrRepoUe1})...`);
  run(
    `aws ecr get-login-password --region ${AWS_REGION_UE1} | docker login --username AWS --password-stdin ${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION_UE1}.amazonaws.com`,
  );
  run(`docker tag ${localTag} ${config.ecrUriUe1}:${config.gitSha}`);
  run(`docker tag ${localTag} ${config.ecrUriUe1}:latest`);
  run(`docker push ${config.ecrUriUe1}:${config.gitSha}`);
  run(`docker push ${config.ecrUriUe1}:latest`);

  console.log("\nDocker build & push complete.\n");
}

// --- Step 3: Update Lambda functions ---

async function updateLambdas(config) {
  console.log("=== Step 3: Update Lambda Functions ===\n");

  const imageUri = `${config.ecrUriEuw2}:${config.gitSha}`;

  // List all Lambda functions with the deployment prefix
  const functionsJson = runCapture(
    `aws lambda list-functions --region ${AWS_REGION} --query "Functions[?starts_with(FunctionName, '${config.appPrefix}-')].FunctionName" --output json`,
  );
  const functions = JSON.parse(functionsJson);

  if (functions.length === 0) {
    console.log(`No Lambda functions found with prefix '${config.appPrefix}-'`);
    return;
  }

  console.log(`Found ${functions.length} Lambda functions to update:\n  ${functions.join("\n  ")}\n`);

  // Update in batches of 5 for parallelism
  const BATCH_SIZE = 5;
  for (let i = 0; i < functions.length; i += BATCH_SIZE) {
    const batch = functions.slice(i, i + BATCH_SIZE);
    console.log(`Batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(functions.length / BATCH_SIZE)}: ${batch.join(", ")}`);

    // Start all updates in this batch
    for (const fn of batch) {
      console.log(`  Updating ${fn}...`);
      run(`aws lambda update-function-code --function-name ${fn} --image-uri ${imageUri} --region ${AWS_REGION}`, { silent: true });
    }

    // Wait for all updates to complete, then publish versions and update aliases
    for (const fn of batch) {
      console.log(`  Waiting for ${fn} to be ready...`);
      run(`aws lambda wait function-updated --function-name ${fn} --region ${AWS_REGION}`, { silent: true });

      console.log(`  Publishing new version for ${fn}...`);
      const versionJson = runCapture(`aws lambda publish-version --function-name ${fn} --region ${AWS_REGION} --output json`);
      const version = JSON.parse(versionJson).Version;
      console.log(`  Published version ${version}`);

      // Update the provisioned concurrency alias
      try {
        run(`aws lambda update-alias --function-name ${fn} --name pc --function-version ${version} --region ${AWS_REGION}`, {
          silent: true,
        });
        console.log(`  Updated alias 'pc' -> version ${version}`);
      } catch {
        // Not all functions have a pc alias (e.g., worker lambdas)
        console.log(`  No 'pc' alias for ${fn} (skipped)`);
      }
    }
    console.log("");
  }

  console.log("Lambda updates complete.\n");
}

// --- Step 4: Sync web assets to S3 ---

function syncWebAssets(config) {
  console.log("=== Step 4: Sync Web Assets to S3 ===\n");

  // Create temp directory for web assets
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "deploy-web-"));
  const webSrcDir = path.resolve("web/public");
  const tmpWebDir = path.join(tmpDir, "web");

  try {
    // Copy web/public to temp dir
    console.log("Copying web/public to temp directory...");
    run(`cp -r ${webSrcDir} ${tmpWebDir}`, { silent: true });

    // Resolve RUM config from ObservabilityStack
    console.log("Resolving RUM config from ObservabilityStack...");
    const stackName = `${config.environmentName}-env-ObservabilityStack`;
    let rumConfig = {};
    try {
      const stackJson = runCapture(`aws cloudformation describe-stacks --stack-name ${stackName} --region ${AWS_REGION} --output json`);
      const outputs = JSON.parse(stackJson).Stacks[0].Outputs || [];
      for (const output of outputs) {
        switch (output.OutputKey) {
          case "RumAppMonitorId":
            rumConfig.appMonitorId = output.OutputValue;
            break;
          case "RumIdentityPoolId":
            rumConfig.identityPoolId = output.OutputValue;
            break;
          case "RumGuestRoleArn":
            rumConfig.guestRoleArn = output.OutputValue;
            break;
          case "RumRegion":
            rumConfig.region = output.OutputValue;
            break;
        }
      }
    } catch {
      console.log("  WARNING: Could not resolve RUM config. HTML placeholders will not be injected.");
    }

    // Inject RUM placeholders into HTML files
    if (rumConfig.appMonitorId) {
      console.log("Injecting RUM config into HTML files...");
      const rumRegion = rumConfig.region || AWS_REGION;
      const htmlFiles = execSync(`find ${tmpWebDir} -name '*.html' -type f`, {
        encoding: "utf-8",
      })
        .trim()
        .split("\n")
        .filter(Boolean);

      for (const htmlFile of htmlFiles) {
        let content = fs.readFileSync(htmlFile, "utf-8");
        content = content
          .replace(/\$\{RUM_APP_MONITOR_ID\}/gi, rumConfig.appMonitorId)
          .replace(/\$\{RUM_IDENTITY_POOL_ID\}/gi, rumConfig.identityPoolId)
          .replace(/\$\{RUM_GUEST_ROLE_ARN\}/gi, rumConfig.guestRoleArn)
          .replace(/\$\{AWS_REGION\}/gi, rumRegion);
        fs.writeFileSync(htmlFile, content);
      }
      console.log(`  Injected RUM config into ${htmlFiles.length} HTML files`);
    }

    // Generate submit.env
    console.log("Generating submit.env...");
    const cognitoClientId = process.env.COGNITO_CLIENT_ID || "";
    const cognitoBaseUri = process.env.COGNITO_BASE_URI || `https://${config.environmentName}-auth.diyaccounting.co.uk`;
    const submitEnv = [
      `COGNITO_CLIENT_ID=${cognitoClientId}`,
      `COGNITO_BASE_URI=${cognitoBaseUri}`,
      "",
      `HMRC_CLIENT_ID=${process.env.HMRC_CLIENT_ID || ""}`,
      `HMRC_BASE_URI=${process.env.HMRC_BASE_URI || ""}`,
      "",
      `HMRC_SANDBOX_CLIENT_ID=${process.env.HMRC_SANDBOX_CLIENT_ID || ""}`,
      `HMRC_SANDBOX_BASE_URI=${process.env.HMRC_SANDBOX_BASE_URI || ""}`,
      "",
      `DIY_SUBMIT_BASE_URL=${process.env.DIY_SUBMIT_BASE_URL || ""}`,
      "",
    ].join("\n");
    fs.writeFileSync(path.join(tmpWebDir, "submit.env"), submitEnv);

    // Generate metadata files
    console.log("Generating metadata files...");
    fs.writeFileSync(path.join(tmpWebDir, "submit.version.txt"), config.version);
    fs.writeFileSync(path.join(tmpWebDir, "submit.commit-hash.txt"), config.gitSha);
    fs.writeFileSync(path.join(tmpWebDir, "submit.deployment-name.txt"), config.deploymentName);
    fs.writeFileSync(path.join(tmpWebDir, "submit.environment-name.txt"), config.environmentName);

    // Sync to S3 (no --delete to match prune(false) in PublishStack)
    console.log(`Syncing to s3://${config.originBucket}/...`);
    run(`aws s3 sync ${tmpWebDir} s3://${config.originBucket}/ --region ${AWS_REGION_UE1}`);

    console.log("\nWeb asset sync complete.\n");
  } finally {
    // Cleanup temp dir
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

// --- Step 5: CloudFront invalidation ---

function invalidateCloudFront(config) {
  console.log("=== Step 5: CloudFront Invalidation ===\n");

  const originDomain = `${config.deploymentName}.submit.diyaccounting.co.uk`;
  const edgeStackName = `${config.deploymentName}-app-EdgeStack`;
  const lookupScript = path.join(path.dirname(fileURLToPath(import.meta.url)), "lookup-cloudfront-distribution.sh");

  let distributionId;
  try {
    distributionId = runCapture(`"${lookupScript}" "${originDomain}" "${edgeStackName}"`);
    if (!distributionId) {
      throw new Error("No distribution found");
    }
    console.log(`  Found distribution: ${distributionId}`);
  } catch {
    console.error(`ERROR: Could not find CloudFront distribution for ${originDomain}`);
    console.error("  The deployment may not have been created yet. Run a full deploy first.");
    process.exit(1);
  }

  // Create invalidation
  console.log(`Creating invalidation for ${CLOUDFRONT_INVALIDATION_PATHS.length} paths...`);
  const invalidationJson = runCapture(
    `aws cloudfront create-invalidation --distribution-id ${distributionId} --paths ${CLOUDFRONT_INVALIDATION_PATHS.join(" ")} --region ${AWS_REGION_UE1} --output json`,
  );
  const invalidationId = JSON.parse(invalidationJson).Invalidation.Id;
  console.log(`  Invalidation created: ${invalidationId}`);

  // Wait for invalidation to complete
  console.log("  Waiting for invalidation to complete...");
  run(`aws cloudfront wait invalidation-completed --distribution-id ${distributionId} --id ${invalidationId} --region ${AWS_REGION_UE1}`, {
    silent: true,
  });
  console.log("  Invalidation complete.\n");
}

// --- Main ---

async function main() {
  const flags = parseArgs();

  console.log("=== Lean App Deployment ===\n");

  // Check AWS credentials
  if (!process.env.AWS_ACCESS_KEY_ID && !process.env.AWS_PROFILE) {
    console.error("ERROR: No AWS credentials found.");
    console.error("Run: . ./scripts/aws-assume-submit-deployment-role.sh");
    process.exit(1);
  }
  const config = resolveDeployment(flags);

  // Step 2: Docker build & ECR push
  if (!flags.skipDocker) {
    dockerBuildAndPush(config);
  } else {
    console.log("=== Step 2: Docker Build & ECR Push (SKIPPED) ===\n");
  }

  // Step 3: Update Lambda functions
  if (!flags.skipLambdas) {
    await updateLambdas(config);
  } else {
    console.log("=== Step 3: Update Lambda Functions (SKIPPED) ===\n");
  }

  // Step 4: Sync web assets to S3
  if (!flags.skipWeb) {
    syncWebAssets(config);
  } else {
    console.log("=== Step 4: Sync Web Assets to S3 (SKIPPED) ===\n");
  }

  // Step 5: CloudFront invalidation (only if web assets were synced)
  if (!flags.skipWeb) {
    invalidateCloudFront(config);
  } else {
    console.log("=== Step 5: CloudFront Invalidation (SKIPPED) ===\n");
  }

  console.log("=== Lean App Deployment Complete ===");
  console.log(`  Deployment: ${config.deploymentName}`);
  console.log(`  Git SHA:    ${config.gitShaShort}`);
  if (!flags.skipDocker) console.log("  Docker:     pushed");
  if (!flags.skipLambdas) console.log("  Lambdas:    updated");
  if (!flags.skipWeb) console.log("  Web assets: synced + invalidated");
  console.log("");
}

main().catch((err) => {
  console.error("\nFATAL:", err.message || err);
  process.exit(1);
});
