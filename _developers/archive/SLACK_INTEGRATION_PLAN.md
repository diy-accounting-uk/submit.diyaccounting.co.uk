> Archived 2026-09-07. Superseded: alarms go to GitHub issues through the triage chain in `PLAN_ALARM_EVIDENCE_AND_TRIAGE.md`, and the alarms panel of `PLAN_ONE_STOP_DASHBOARD.md` shows them over time. Slack was not chosen.

# Slack Alert Integration with Claude API Summarization

## Goal

Set up a Slack workspace as the operational heartbeat for submit.diyaccounting.co.uk, routing all AWS alerts and adding AI-powered summarization via Claude API.

## Approach

- **Raw alerts**: AWS Chatbot (native, simple)
- **AI digest**: Daily at 8am UTC
- **Implementation**: Phased (raw alerts first, AI digest later)

## Current State

- **AlertTopic** (OpsStack): Health checks, API canaries, GitHub synthetic tests
- **SecurityFindingsTopic** (ObservabilityStack): GuardDuty, Security Hub, anomaly detection
- **BackupStack**: Has notification support but alertTopic not wired up
- **Notification method**: Email only (no Slack integration)

## Architecture

```
┌─────────────────┐     ┌──────────────┐     ┌─────────────────────┐
│ CloudWatch      │────►│ AlertTopic   │────►│ AWS Chatbot         │──► #ops-alerts
│ Alarms          │     │ (SNS)        │     └─────────────────────┘
└─────────────────┘     └──────┬───────┘
                               │
┌─────────────────┐     ┌──────▼───────┐     ┌─────────────────────┐
│ GuardDuty       │────►│ Security     │────►│ AWS Chatbot         │──► #security-alerts
│ Security Hub    │     │ FindingsTopic│     └─────────────────────┘
│ Anomaly Rules   │     └──────┬───────┘
└─────────────────┘            │
                               ▼
                    ┌─────────────────────┐
                    │ Alert Aggregator    │     ┌─────────────────────┐
                    │ Lambda              │────►│ Alert History       │
                    │ - Stores alerts     │     │ (DynamoDB)          │
                    │ - Calls Claude API  │     └─────────────────────┘
                    │ - Posts digest      │
                    └─────────┬───────────┘
                              │
                              ▼
                         #daily-digest (AI summaries)
```

## Implementation Phases

### Phase 1: Slack Setup (Manual)

1. Go to slack.com/create, sign in with Google account
2. Create workspace (suggested name: `diyaccounting-ops`)
3. Create channels: `#ops-alerts`, `#security-alerts`, `#daily-digest`
4. Get Workspace ID: Slack Admin > Settings > About this workspace
5. Get Channel IDs: Right-click channel > View channel details > scroll to bottom

### Phase 2: AWS Chatbot Integration (First deployment)

**Files to modify:**

- `infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java`
- `infra/main/java/co/uk/diyaccounting/submit/stacks/ObservabilityStack.java`
- `infra/main/java/co/uk/diyaccounting/submit/SubmitApplication.java`
- `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java`

**Changes to OpsStack.java:**

1. Add import:
   ```java
   import software.amazon.awscdk.services.chatbot.SlackChannelConfiguration;
   ```

2. Add props to `OpsStackProps`:
   ```java
   // Slack workspace ID for AWS Chatbot integration (obtained from AWS Console after OAuth)
   @Value.Default
   default String slackWorkspaceId() {
       return "";
   }

   // Slack channel ID for ops alerts (e.g., C0XXXXXXX)
   @Value.Default
   default String slackOpsChannelId() {
       return "";
   }
   ```

3. Add SlackChannelConfiguration after email subscription:
   ```java
   // ============================================================================
   // AWS Chatbot Slack Integration (if configured)
   // ============================================================================
   if (props.slackWorkspaceId() != null
           && !props.slackWorkspaceId().isBlank()
           && props.slackOpsChannelId() != null
           && !props.slackOpsChannelId().isBlank()) {
       SlackChannelConfiguration opsSlackChannel = SlackChannelConfiguration.Builder.create(
                       this, props.resourceNamePrefix() + "-OpsSlackChannel")
               .slackChannelConfigurationName(props.resourceNamePrefix() + "-ops-alerts")
               .slackWorkspaceId(props.slackWorkspaceId())
               .slackChannelId(props.slackOpsChannelId())
               .notificationTopics(List.of(this.alertTopic))
               .build();
       cfnOutput(this, "OpsSlackChannelArn", opsSlackChannel.getSlackChannelConfigurationArn());
       infof("Added Slack channel for ops alerts: %s", props.slackOpsChannelId());
   }
   ```

**Changes to ObservabilityStack.java:**

1. Add import:
   ```java
   import software.amazon.awscdk.services.chatbot.SlackChannelConfiguration;
   ```

2. Add props to `ObservabilityStackProps`:
   ```java
   // Slack workspace ID for AWS Chatbot integration (obtained from AWS Console after OAuth)
   @Value.Default
   default String slackWorkspaceId() {
       return "";
   }

   // Slack channel ID for security alerts (e.g., C0XXXXXXX)
   @Value.Default
   default String slackSecurityChannelId() {
       return "";
   }
   ```

3. Add SlackChannelConfiguration after securityFindingsTopic creation:
   ```java
   // ============================================================================
   // AWS Chatbot Slack Integration for Security Findings (if configured)
   // ============================================================================
   if (props.slackWorkspaceId() != null
           && !props.slackWorkspaceId().isBlank()
           && props.slackSecurityChannelId() != null
           && !props.slackSecurityChannelId().isBlank()) {
       SlackChannelConfiguration securitySlackChannel = SlackChannelConfiguration.Builder.create(
                       this, props.resourceNamePrefix() + "-SecuritySlackChannel")
               .slackChannelConfigurationName(props.resourceNamePrefix() + "-security-alerts")
               .slackWorkspaceId(props.slackWorkspaceId())
               .slackChannelId(props.slackSecurityChannelId())
               .notificationTopics(List.of(securityFindingsTopic))
               .build();
       cfnOutput(this, "SecuritySlackChannelArn", securitySlackChannel.getSlackChannelConfigurationArn());
       infof("Added Slack channel for security alerts: %s", props.slackSecurityChannelId());
   }
   ```

**Changes to SubmitApplication.java:**

Wire environment variables to OpsStack:
```java
// Slack configuration for AWS Chatbot integration
String slackWorkspaceId = envOr("SLACK_WORKSPACE_ID", "");
String slackOpsChannelId = envOr("SLACK_OPS_CHANNEL_ID", "");

// Add to OpsStack builder:
.slackWorkspaceId(slackWorkspaceId)
.slackOpsChannelId(slackOpsChannelId)
```

**Changes to SubmitEnvironment.java:**

Wire environment variables to ObservabilityStack:
```java
// Slack configuration for AWS Chatbot integration
var slackWorkspaceId = envOr("SLACK_WORKSPACE_ID", "");
var slackSecurityChannelId = envOr("SLACK_SECURITY_CHANNEL_ID", "");

// Add to ObservabilityStack builder:
.slackWorkspaceId(slackWorkspaceId)
.slackSecurityChannelId(slackSecurityChannelId)
```

**GitHub Actions Secrets to add:**

- `SLACK_WORKSPACE_ID` - Workspace ID from AWS Chatbot OAuth
- `SLACK_OPS_CHANNEL_ID` - Channel ID for #ops-alerts
- `SLACK_SECURITY_CHANNEL_ID` - Channel ID for #security-alerts

### Phase 3: Wire BackupStack Notifications

**Files to modify:**

- `infra/main/java/co/uk/diyaccounting/submit/SubmitEnvironment.java`

**Changes:**

Pass alertTopic from OpsStack to BackupStack. Currently `alertTopic()` returns `Optional.empty()`.

Note: This requires cross-stack reference since OpsStack is in SubmitApplication and BackupStack is in SubmitEnvironment. May need to create alertTopic in a shared location or pass via SSM Parameter.

### Phase 4: Alert Aggregator Lambda (Second deployment - later)

**New files:**

- `app/functions/infra/alertAggregator.js` - Lambda handler

**Files to modify:**

- `infra/main/java/co/uk/diyaccounting/submit/stacks/DataStack.java` - Alert history table
- `infra/main/java/co/uk/diyaccounting/submit/stacks/OpsStack.java` - Lambda + EventBridge schedule

**Lambda functionality:**

- SNS trigger: Store incoming alerts in DynamoDB (30-day TTL)
- Scheduled trigger (8am UTC): Query last 24h, call Claude API, post digest to Slack

**DynamoDB Table Schema:**

```
Table: {env}-submit-alert-history
Partition Key: alertId (string)
Sort Key: timestamp (number)
TTL: expiresAt (30 days from creation)
GSI: timestamp-index for querying last 24h
```

### Phase 5: Claude API Integration (Second deployment - later)

**Manual setup:**

1. Create Anthropic API key at console.anthropic.com
2. Store in Secrets Manager: `{env}/submit/claude/api-key`
3. Create Slack incoming webhook for `#daily-digest`
4. Store webhook in Secrets Manager: `{env}/submit/slack/digest-webhook`

**Digest prompt design:**

```
You are a DevOps assistant for submit.diyaccounting.co.uk (VAT submission app).
Summarize these alerts from the last 24 hours:

{alerts}

Format as:
1. **Status**: Overall health (healthy/degraded/critical)
2. **Key Events**: 2-3 most important events
3. **Action Required**: Items needing attention
4. **Trends**: Patterns worth noting

Keep it concise for a solo developer.
```

## Slack Channel Structure

| Channel | Source | Purpose |
|---------|--------|---------|
| `#ops-alerts` | AWS Chatbot | Raw operational alerts |
| `#security-alerts` | AWS Chatbot | Raw security findings |
| `#daily-digest` | Lambda webhook | AI-summarized daily digest |

## Cost Estimate

- AWS Chatbot: $0
- DynamoDB (alerts): ~$1/month
- Lambda: <$1/month
- Secrets Manager: ~$1/month
- Claude API: $5-20/month (usage-based)
- **Total: ~$7-23/month**

## Verification

1. Trigger a test alarm → verify appears in `#ops-alerts`
2. Check GuardDuty findings → verify appears in `#security-alerts`
3. Wait for scheduled digest → verify AI summary in `#daily-digest`
4. Force a backup failure → verify notification appears

## Prerequisites

Before implementing Phase 2, you must:

1. Complete Phase 1 (manual Slack setup)
2. Authorize AWS Chatbot with Slack workspace in AWS Console:
   - Go to AWS Chatbot Console
   - Click "Configure new client"
   - Select Slack
   - Complete OAuth flow
   - Note the Workspace ID shown after authorization
