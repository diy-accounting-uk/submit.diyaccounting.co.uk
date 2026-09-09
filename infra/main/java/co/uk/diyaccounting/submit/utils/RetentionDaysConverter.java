/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import software.amazon.awscdk.services.logs.RetentionDays;

/**
 * Utility class to convert day values to RetentionDays enum values.
 */
public class RetentionDaysConverter {

    /**
     * Converts a number of days to the corresponding RetentionDays enum value.
     *
     * @param days The number of days for retention period
     * @return The corresponding RetentionDays enum value
     */
    public static RetentionDays daysToRetentionDays(int days) {
        switch (days) {
            case 1:
                return RetentionDays.ONE_DAY;
            case 3:
                return RetentionDays.THREE_DAYS;
            case 5:
                return RetentionDays.FIVE_DAYS;
            case 7:
                return RetentionDays.ONE_WEEK;
            case 14:
                return RetentionDays.TWO_WEEKS;
            case 30:
                return RetentionDays.ONE_MONTH;
            case 60:
                return RetentionDays.TWO_MONTHS;
            case 90:
                return RetentionDays.THREE_MONTHS;
            case 120:
                return RetentionDays.FOUR_MONTHS;
            case 150:
                return RetentionDays.FIVE_MONTHS;
            case 180:
                return RetentionDays.SIX_MONTHS;
            case 365:
                return RetentionDays.ONE_YEAR;
            case 400:
                return RetentionDays.THIRTEEN_MONTHS;
            case 545:
                return RetentionDays.EIGHTEEN_MONTHS;
            case 731:
                return RetentionDays.TWO_YEARS;
            case 1827:
                return RetentionDays.FIVE_YEARS;
            case 3653:
                return RetentionDays.TEN_YEARS;
            case 0:
                return RetentionDays.INFINITE;
            default:
                // Default to ONE_WEEK if an unsupported value is provided
                return RetentionDays.ONE_WEEK;
        }
    }
}
