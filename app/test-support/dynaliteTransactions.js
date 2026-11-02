// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-support/dynaliteTransactions.js

import { getDynamoDbDocClient } from "../lib/dynamoDbClient.js";

/**
 * Dynalite has no transactions. This makes the shared document client run a transaction's items one after
 * another and undo the earlier ones when an item's condition fails, which is enough for one writer at a time.
 */
export async function emulateTransactions() {
  const { docClient, module } = await getDynamoDbDocClient();
  const send = docClient.send.bind(docClient);

  docClient.send = async (command) => {
    if (!(command instanceof module.TransactWriteCommand)) return send(command);
    const applied = [];
    const items = command.input.TransactItems;
    for (const [index, item] of items.entries()) {
      const [kind, params] = Object.entries(item)[0];
      const key = kind === "Put" ? { pk: params.Item.pk, sk: params.Item.sk } : params.Key;
      const before = (await send(new module.GetCommand({ TableName: params.TableName, Key: key }))).Item ?? null;
      try {
        await send(new module[`${kind}Command`](params));
        applied.push({ params, key, before });
      } catch (error) {
        if (error.name !== "ConditionalCheckFailedException") throw error;
        for (const undo of applied.reverse()) {
          const restore = undo.before
            ? new module.PutCommand({ TableName: undo.params.TableName, Item: undo.before })
            : new module.DeleteCommand({ TableName: undo.params.TableName, Key: undo.key });
          await send(restore);
        }
        const cancelled = new Error("Transaction cancelled");
        cancelled.name = "TransactionCanceledException";
        cancelled.CancellationReasons = items.map((_, position) => ({ Code: position === index ? "ConditionalCheckFailed" : "None" }));
        throw cancelled;
      }
    }
    return {};
  };
}
