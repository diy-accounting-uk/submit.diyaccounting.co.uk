// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/test-helpers/fakeCodesEntryTable.js
// An in-memory stand-in for the sessions table, for tests that mock executeDynamoDbCommand. It
// runs Put, Get, Update and Delete with the condition shapes the codes entry and HMRC grant
// repositories use.

export class FakeCodesEntryTable {
  constructor() {
    this.items = new Map();
    const record = (name) =>
      class {
        constructor(input) {
          this.input = input;
          this.commandName = name;
        }
      };
    this.module = {
      PutCommand: record("Put"),
      GetCommand: record("Get"),
      UpdateCommand: record("Update"),
      DeleteCommand: record("Delete"),
    };
  }

  failure() {
    const error = new Error("The conditional request failed");
    error.name = "ConditionalCheckFailedException";
    return error;
  }

  holds(condition, names, values, item) {
    if (!condition) return true;
    return condition.split(" AND ").every((group) =>
      group
        .replace(/^\((.*)\)$/, "$1")
        .split(" OR ")
        .some((clause) => this.clauseHolds(clause, names, values, item)),
    );
  }

  clauseHolds(clause, names, values, item) {
    const exists = clause.match(/^attribute_exists\((\w+)\)$/);
    if (exists) return item !== undefined && item[exists[1]] !== undefined;
    const absent = clause.match(/^attribute_not_exists\((\w+)\)$/);
    if (absent) return item === undefined || item[absent[1]] === undefined;
    const [left, operator, right] = clause.split(" ");
    const attribute = names[left] ?? left;
    if (item === undefined) return false;
    if (operator === ">") return item[attribute] > values[right];
    if (operator === "<") return item[attribute] < values[right];
    return item[attribute] === values[right];
  }

  execute = async (commandBuilder) => {
    const command = commandBuilder(this.module);
    const input = command.input;
    const key = input.Key?.sessionId;
    const names = input.ExpressionAttributeNames ?? {};
    const values = input.ExpressionAttributeValues ?? {};
    if (command.commandName === "Put") {
      if (!this.holds(input.ConditionExpression, names, values, this.items.get(input.Item.sessionId))) throw this.failure();
      this.items.set(input.Item.sessionId, { ...input.Item });
      return {};
    }
    const item = this.items.get(key);
    if (command.commandName === "Get") return { Item: item && { ...item } };
    if (!this.holds(input.ConditionExpression, names, values, item)) throw this.failure();
    if (command.commandName === "Update") {
      const [setPart, removePart] = input.UpdateExpression.replace(/^SET /, "").split(" REMOVE ");
      for (const assignment of setPart.split(", ")) {
        const [left, right] = assignment.split(" = ");
        item[names[left] ?? left] = values[right];
      }
      for (const attribute of removePart ? removePart.split(", ") : []) delete item[names[attribute] ?? attribute];
      return {};
    }
    this.items.delete(key);
    return { Attributes: input.ReturnValues === "ALL_OLD" ? item : undefined };
  };
}
