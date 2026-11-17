// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/actorClassObservations.js
//
// A figure of customers reads the rows of its view whose actor_class is customer. These two rows
// give the same figure for the accounts that are not customers: test, synthetic and operator
// accounts together, and the accounts no record names a class for. The page shows them on request.

export const CUSTOMER_ROWS = "actor_class = 'customer'";

/**
 * The two rows that sit beside a customer figure: one for the test, synthetic and other accounts,
 * one for the unknown accounts. Each copies the figure's view, day column, value and aggregation.
 *
 * @param {{id: string, label: string, unit: string, view: string, dayColumn: string, valueExpr: string, aggregation: string, deepLink: Function}} figure
 * @returns {Array<object>}
 */
export function nonCustomerObservations(figure) {
  const { id, label, unit, view, dayColumn, valueExpr, aggregation, deepLink } = figure;
  const shared = { unit, view, dayColumn, valueExpr, aggregation, deepLink };
  return [
    {
      ...shared,
      id: `${id}-not-customers`,
      label: `${label}, test, synthetic and operator accounts`,
      description: `${label} of the test, synthetic and operator accounts, which the customer figure leaves out.`,
      actorClass: "not-customer",
      where: "actor_class IN ('test', 'synthetic', 'other')",
    },
    {
      ...shared,
      id: `${id}-unknown`,
      label: `${label}, unknown accounts`,
      description: `${label} of the accounts that no record names a class for. They are never counted as customers.`,
      actorClass: "unknown",
      where: "actor_class = 'unknown'",
    },
  ];
}
