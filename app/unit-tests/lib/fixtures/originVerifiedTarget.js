// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

export async function echoHandler(event, lambdaContext) {
  return { statusCode: 200, event, lambdaContext };
}
