// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// @capability DATA-10 Create or replace Athena business views
// - **Use when:** a new or changed Athena view under infra/main/resources/analytics/views must deploy with the stack.
// - **Does:** createView.mjs is a CDK custom-resource handler pair, onEvent and isComplete, that submits a view's CREATE OR REPLACE VIEW to Athena. It polls GetQueryExecution to a terminal state before CloudFormation reports success, so a bad view definition fails the stack. BusinessViews.java wires one Provider-backed CustomResource per SQL file for the operator-facing views.
// - **Run:** no command; see Does and Entry
// - **Entry:** `app/functions/analytics/createView.mjs:onEvent`; `app/functions/analytics/createView.mjs:isComplete`
// - **Files:** app/functions/analytics/createView.mjs, app/unit-tests/analytics/createView.test.js, infra/main/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViews.java, infra/test/java/co/uk/diyaccounting/submit/stacks/analytics/BusinessViewsTest.java
// - **Keywords:** athena view, create or replace view, cdk custom resource, getqueryexecution, cfnnamedquery, business views
// - **Related:** DATA-27, DATA-28, DATA-29, DATA-30, DATA-31
// @end-capability

// app/functions/analytics/createView.mjs
//
// Custom resource handler pair for a CDK Provider that creates (or replaces) one Athena
// business view. Athena.startQueryExecution returns as soon as the query is submitted, not once
// it finishes, so a plain AwsCustomResource around that one call marks CloudFormation successful
// the instant the query starts: a CREATE OR REPLACE VIEW that fails afterwards leaves the stack
// green and the view silently absent. onEvent submits the query; isComplete is polled by the
// Provider framework until the query reaches a terminal state, throwing on anything but SUCCEEDED
// so the Athena StateChangeReason becomes the CloudFormation failure reason.

import { AthenaClient, StartQueryExecutionCommand, GetQueryExecutionCommand } from "@aws-sdk/client-athena";

let athenaClient = null;

function getAthenaClient() {
  if (!athenaClient) {
    athenaClient = new AthenaClient({ region: process.env.AWS_REGION || "eu-west-2" });
  }
  return athenaClient;
}

function physicalResourceIdFor(viewName) {
  return `${viewName}-view`;
}

export async function onEvent(event) {
  const { ViewName } = event.ResourceProperties;

  if (event.RequestType === "Delete") {
    return { PhysicalResourceId: event.PhysicalResourceId || physicalResourceIdFor(ViewName) };
  }

  const { Sql, Database, WorkGroup } = event.ResourceProperties;
  const client = getAthenaClient();

  const { QueryExecutionId } = await client.send(
    new StartQueryExecutionCommand({
      QueryString: Sql,
      QueryExecutionContext: { Database },
      WorkGroup,
    }),
  );

  // The physical resource id names the view, not this query execution, so a later update that
  // resubmits the same CREATE OR REPLACE VIEW keeps CloudFormation on the same resource instead
  // of replacing it.
  return { PhysicalResourceId: physicalResourceIdFor(ViewName), Data: { QueryExecutionId } };
}

export async function isComplete(event) {
  if (event.RequestType === "Delete") {
    return { IsComplete: true };
  }

  const { QueryExecutionId } = event.Data;
  const client = getAthenaClient();
  const { QueryExecution } = await client.send(new GetQueryExecutionCommand({ QueryExecutionId }));

  const state = QueryExecution?.Status?.State;
  if (state === "SUCCEEDED") {
    return { IsComplete: true };
  }
  if (state === "FAILED" || state === "CANCELLED") {
    const reason = QueryExecution?.Status?.StateChangeReason || "no StateChangeReason returned";
    const viewName = event.ResourceProperties.ViewName;
    throw new Error(`Athena view ${viewName} query ${QueryExecutionId} ${state}: ${reason}`);
  }

  // QUEUED or RUNNING: the Provider framework's own waiter calls isComplete again after its
  // configured query interval, so this returns without looping itself.
  return { IsComplete: false };
}
