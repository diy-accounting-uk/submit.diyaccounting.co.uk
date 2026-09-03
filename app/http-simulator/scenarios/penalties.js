// SPDX-License-Identifier: AGPL-3.0-only
// Copyright (C) 2025-2026 DIY Accounting Ltd

// app/http-simulator/scenarios/penalties.js
// Gov-Test-Scenario handlers for VAT penalties endpoint

/**
 * Shape returned when there are no penalties on the account (HMRC's own NO_PENALTIES
 * scenario, and also this app's own choice of default when no scenario is supplied - see
 * getPenaltiesForScenario below).
 */
function noPenaltiesShape() {
  return {
    totalisations: {
      lateSubmissionPenaltyTotalValue: 0,
      penalisedPrincipalTotal: 0,
      latePaymentPenaltyPostedTotal: 0,
      latePaymentPenaltyEstimateTotal: 0,
    },
    lateSubmissionPenalty: {
      summary: {
        activePenaltyPoints: 0,
        inactivePenaltyPoints: 0,
        periodOfComplianceAchievement: "9999-12-31",
        regimeThreshold: 6,
        penaltyChargeAmount: 0,
      },
      details: [],
    },
    latePaymentPenalty: {
      details: [],
    },
  };
}

/**
 * Named Gov-Test-Scenario penalty sets, matching HMRC's VAT (MTD) 1.0 sandbox scenarios.
 */
const scenarioPenalties = {
  DEFAULT: {
    totalisations: {
      lateSubmissionPenaltyTotalValue: 200,
      penalisedPrincipalTotal: 2000,
      latePaymentPenaltyPostedTotal: 100,
      latePaymentPenaltyEstimateTotal: 50,
    },
    lateSubmissionPenalty: {
      summary: {
        activePenaltyPoints: 2,
        inactivePenaltyPoints: 0,
        periodOfComplianceAchievement: "2025-04-01",
        regimeThreshold: 4,
        penaltyChargeAmount: 200,
      },
      details: [
        {
          penaltyNumber: "PEN001",
          penaltyOrder: "01",
          penaltyCategory: "point",
          penaltyStatus: "active",
          penaltyCreationDate: "2024-07-01",
          penaltyExpiryDate: "2026-07-01",
        },
        {
          penaltyNumber: "PEN002",
          penaltyOrder: "02",
          penaltyCategory: "charge",
          penaltyStatus: "active",
          penaltyCreationDate: "2024-10-01",
          penaltyExpiryDate: "2026-10-01",
          chargeReference: "XR001",
          chargeAmount: 200,
          chargeOutstandingAmount: 200,
          chargeDueDate: "2024-11-01",
        },
      ],
    },
    latePaymentPenalty: {
      details: [
        {
          principalChargeReference: "PC001",
          penaltyCategory: "LPP1",
          penaltyStatus: "posted",
          penaltyAmountAccruing: 0,
          penaltyAmountPosted: 100,
          penaltyAmountPaid: 0,
          penaltyAmountOutstanding: 100,
          principalChargeBillingFrom: "2024-01-01",
          principalChargeBillingTo: "2024-03-31",
          principalChargeDueDate: "2024-05-07",
          principalChargeDocNumber: "DOC001",
          penaltyChargeReference: "PCR001",
          penaltyChargeDueDate: "2024-06-07",
        },
      ],
    },
  },
  NO_PENALTIES: noPenaltiesShape(),
  LATE_SUBMISSION: {
    totalisations: {
      lateSubmissionPenaltyTotalValue: 200,
      penalisedPrincipalTotal: 0,
      latePaymentPenaltyPostedTotal: 0,
      latePaymentPenaltyEstimateTotal: 0,
    },
    lateSubmissionPenalty: {
      summary: {
        activePenaltyPoints: 1,
        inactivePenaltyPoints: 0,
        periodOfComplianceAchievement: "2025-04-01",
        regimeThreshold: 4,
        penaltyChargeAmount: 0,
      },
      details: [
        {
          penaltyNumber: "PEN001",
          penaltyOrder: "01",
          penaltyCategory: "point",
          penaltyStatus: "active",
          penaltyCreationDate: "2024-07-01",
          penaltyExpiryDate: "2026-07-01",
        },
      ],
    },
    latePaymentPenalty: { details: [] },
  },
  LATE_PAYMENT: {
    totalisations: {
      lateSubmissionPenaltyTotalValue: 0,
      penalisedPrincipalTotal: 1000,
      latePaymentPenaltyPostedTotal: 100,
      latePaymentPenaltyEstimateTotal: 0,
    },
    lateSubmissionPenalty: {
      summary: {
        activePenaltyPoints: 0,
        inactivePenaltyPoints: 0,
        periodOfComplianceAchievement: "9999-12-31",
        regimeThreshold: 4,
        penaltyChargeAmount: 0,
      },
      details: [],
    },
    latePaymentPenalty: {
      details: [
        {
          principalChargeReference: "PC001",
          penaltyCategory: "LPP1",
          penaltyStatus: "posted",
          penaltyAmountAccruing: 0,
          penaltyAmountPosted: 100,
          penaltyAmountPaid: 0,
          penaltyAmountOutstanding: 100,
          principalChargeBillingFrom: "2024-01-01",
          principalChargeBillingTo: "2024-03-31",
          principalChargeDueDate: "2024-05-07",
          principalChargeDocNumber: "DOC001",
          penaltyChargeReference: "PCR001",
          penaltyChargeDueDate: "2024-06-07",
        },
      ],
    },
  },
  MULTIPLE_PENALTIES: {
    totalisations: {
      lateSubmissionPenaltyTotalValue: 200,
      penalisedPrincipalTotal: 1000,
      latePaymentPenaltyPostedTotal: 100,
      latePaymentPenaltyEstimateTotal: 0,
    },
    lateSubmissionPenalty: {
      summary: {
        activePenaltyPoints: 1,
        inactivePenaltyPoints: 0,
        periodOfComplianceAchievement: "2025-04-01",
        regimeThreshold: 4,
        penaltyChargeAmount: 0,
      },
      details: [
        {
          penaltyNumber: "PEN001",
          penaltyOrder: "01",
          penaltyCategory: "point",
          penaltyStatus: "active",
          penaltyCreationDate: "2024-07-01",
          penaltyExpiryDate: "2026-07-01",
        },
      ],
    },
    latePaymentPenalty: {
      details: [
        {
          principalChargeReference: "PC001",
          penaltyCategory: "LPP1",
          penaltyStatus: "posted",
          penaltyAmountAccruing: 0,
          penaltyAmountPosted: 100,
          penaltyAmountPaid: 0,
          penaltyAmountOutstanding: 100,
          principalChargeBillingFrom: "2024-01-01",
          principalChargeBillingTo: "2024-03-31",
          principalChargeDueDate: "2024-05-07",
          principalChargeDocNumber: "DOC001",
          penaltyChargeReference: "PCR001",
          penaltyChargeDueDate: "2024-06-07",
        },
      ],
    },
  },
  MULTIPLE_LATE_PAYMENT_PENALTIES: {
    totalisations: {
      lateSubmissionPenaltyTotalValue: 0,
      penalisedPrincipalTotal: 2000,
      latePaymentPenaltyPostedTotal: 200,
      latePaymentPenaltyEstimateTotal: 50,
    },
    lateSubmissionPenalty: {
      summary: {
        activePenaltyPoints: 0,
        inactivePenaltyPoints: 0,
        periodOfComplianceAchievement: "9999-12-31",
        regimeThreshold: 4,
        penaltyChargeAmount: 0,
      },
      details: [],
    },
    latePaymentPenalty: {
      details: [
        {
          principalChargeReference: "PC001",
          penaltyCategory: "LPP1",
          penaltyStatus: "posted",
          penaltyAmountAccruing: 0,
          penaltyAmountPosted: 100,
          penaltyAmountPaid: 0,
          penaltyAmountOutstanding: 100,
          principalChargeBillingFrom: "2024-01-01",
          principalChargeBillingTo: "2024-03-31",
          principalChargeDueDate: "2024-05-07",
          principalChargeDocNumber: "DOC001",
          penaltyChargeReference: "PCR001",
          penaltyChargeDueDate: "2024-06-07",
        },
        {
          principalChargeReference: "PC002",
          penaltyCategory: "LPP2",
          penaltyStatus: "accruing",
          penaltyAmountAccruing: 50,
          penaltyAmountPosted: 0,
          principalChargeBillingFrom: "2024-04-01",
          principalChargeBillingTo: "2024-06-30",
          principalChargeDueDate: "2024-08-07",
          principalChargeDocNumber: "DOC002",
        },
      ],
    },
  },
  MULTIPLE_LATE_SUBMISSION_PENALTIES: {
    totalisations: {
      lateSubmissionPenaltyTotalValue: 400,
      penalisedPrincipalTotal: 0,
      latePaymentPenaltyPostedTotal: 0,
      latePaymentPenaltyEstimateTotal: 0,
    },
    lateSubmissionPenalty: {
      summary: {
        activePenaltyPoints: 2,
        inactivePenaltyPoints: 0,
        periodOfComplianceAchievement: "2025-04-01",
        regimeThreshold: 4,
        penaltyChargeAmount: 0,
      },
      details: [
        {
          penaltyNumber: "PEN001",
          penaltyOrder: "01",
          penaltyCategory: "point",
          penaltyStatus: "active",
          penaltyCreationDate: "2024-07-01",
          penaltyExpiryDate: "2026-07-01",
        },
        {
          penaltyNumber: "PEN002",
          penaltyOrder: "02",
          penaltyCategory: "point",
          penaltyStatus: "active",
          penaltyCreationDate: "2024-10-01",
          penaltyExpiryDate: "2026-10-01",
        },
      ],
    },
    latePaymentPenalty: { details: [] },
  },
  MULTIPLE_INACTIVE_LATE_SUBMISSION_PENALTIES: {
    totalisations: {
      lateSubmissionPenaltyTotalValue: 0,
      penalisedPrincipalTotal: 0,
      latePaymentPenaltyPostedTotal: 0,
      latePaymentPenaltyEstimateTotal: 0,
    },
    lateSubmissionPenalty: {
      summary: {
        activePenaltyPoints: 0,
        inactivePenaltyPoints: 2,
        periodOfComplianceAchievement: "9999-12-31",
        regimeThreshold: 4,
        penaltyChargeAmount: 0,
      },
      details: [
        {
          penaltyNumber: "PEN001",
          penaltyOrder: "01",
          penaltyCategory: "point",
          penaltyStatus: "inactive",
          penaltyCreationDate: "2022-07-01",
          penaltyExpiryDate: "2024-07-01",
          expiryReason: "SUBMISSION_ON_TIME",
        },
        {
          penaltyNumber: "PEN002",
          penaltyOrder: "02",
          penaltyCategory: "point",
          penaltyStatus: "inactive",
          penaltyCreationDate: "2022-10-01",
          penaltyExpiryDate: "2024-10-01",
          expiryReason: "SUBMISSION_ON_TIME",
        },
      ],
    },
    latePaymentPenalty: { details: [] },
  },
  THRESHOLD_LATE_SUBMISSION_PENALTIES: {
    totalisations: {
      lateSubmissionPenaltyTotalValue: 200,
      penalisedPrincipalTotal: 0,
      latePaymentPenaltyPostedTotal: 0,
      latePaymentPenaltyEstimateTotal: 0,
    },
    lateSubmissionPenalty: {
      summary: {
        activePenaltyPoints: 4,
        inactivePenaltyPoints: 0,
        periodOfComplianceAchievement: "9999-12-31",
        regimeThreshold: 4,
        penaltyChargeAmount: 200,
      },
      details: [
        {
          penaltyNumber: "PEN001",
          penaltyOrder: "01",
          penaltyCategory: "threshold",
          penaltyStatus: "active",
          penaltyCreationDate: "2024-07-01",
          penaltyExpiryDate: "2026-07-01",
          chargeReference: "XR001",
          chargeAmount: 200,
          chargeOutstandingAmount: 200,
          chargeDueDate: "2024-08-01",
        },
      ],
    },
    latePaymentPenalty: { details: [] },
  },
  CHARGE_LATE_SUBMISSION_PENALTIES: {
    totalisations: {
      lateSubmissionPenaltyTotalValue: 200,
      penalisedPrincipalTotal: 0,
      latePaymentPenaltyPostedTotal: 0,
      latePaymentPenaltyEstimateTotal: 0,
    },
    lateSubmissionPenalty: {
      summary: {
        activePenaltyPoints: 0,
        inactivePenaltyPoints: 0,
        periodOfComplianceAchievement: "9999-12-31",
        regimeThreshold: 4,
        penaltyChargeAmount: 200,
      },
      details: [
        {
          penaltyNumber: "PEN001",
          penaltyOrder: "01",
          penaltyCategory: "charge",
          penaltyStatus: "active",
          penaltyCreationDate: "2024-07-01",
          penaltyExpiryDate: "2026-07-01",
          chargeReference: "XR001",
          chargeAmount: 200,
          chargeOutstandingAmount: 200,
          chargeDueDate: "2024-08-01",
        },
      ],
    },
    latePaymentPenalty: { details: [] },
  },
};

/**
 * Error scenarios - no date params to be invalid for this endpoint, so only VRN/lookup errors.
 */
const errorScenarios = {
  NOT_FOUND: {
    status: 404,
    body: {
      code: "NOT_FOUND",
      message: "The requested resource could not be found",
    },
  },
  INSOLVENT_TRADER: {
    status: 403,
    body: {
      code: "RULE_INSOLVENT_TRADER",
      message: "The remote endpoint has indicated that the client or agent is not authorised because the trader is insolvent",
    },
  },
  VRN_INVALID: {
    status: 400,
    body: {
      code: "VRN_INVALID",
      message: "The provided VAT registration number is invalid",
    },
  },
  // HTTP 500 error scenarios for testing error handling
  SUBMIT_API_HTTP_500: {
    status: 500,
    body: {
      code: "SERVER_ERROR",
      message: "Internal server error",
    },
  },
  SUBMIT_HMRC_API_HTTP_500: {
    status: 500,
    body: {
      code: "SERVER_ERROR",
      message: "Internal server error",
    },
  },
};

/**
 * Get penalties based on Gov-Test-Scenario header.
 * HMRC's own DEFAULT scenario has data, but an app-level "no scenario supplied" default
 * returning the zeroed NO_PENALTIES shape is the safer choice for a page a developer might
 * hit accidentally without picking a scenario - matches the "no data by default" choice
 * made for liabilities/payments.
 * @param {string|undefined} scenario - Gov-Test-Scenario header value
 * @returns {Object} - the penalties response body, or {status: number, body: {...}} for errors
 */
export function getPenaltiesForScenario(scenario) {
  if (!scenario) {
    return noPenaltiesShape();
  }

  const scenarioUpper = scenario.toUpperCase();

  if (errorScenarios[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying error scenario: ${scenario}`);
    return errorScenarios[scenarioUpper];
  }

  if (scenarioPenalties[scenarioUpper]) {
    console.log(`[http-simulator:scenarios] Applying penalty scenario: ${scenario}`);
    return scenarioPenalties[scenarioUpper];
  }

  return noPenaltiesShape();
}
