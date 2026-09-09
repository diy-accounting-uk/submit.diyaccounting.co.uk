/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.utils;

import static org.junit.jupiter.api.Assertions.*;

import java.util.List;
import org.junit.jupiter.api.Test;
import software.amazon.awscdk.services.s3.LifecycleRule;
import software.amazon.awscdk.services.s3.StorageClass;
import software.amazon.awscdk.services.s3.Transition;

class S3Test {

    @Test
    void createLifecycleRules_hasExpectedTransitionsAndExpiration() {
        int retentionDays = 365 * 7; // 7 years
        List<LifecycleRule> rules = S3.createLifecycleRules(retentionDays);
        assertEquals(1, rules.size());
        LifecycleRule rule = rules.get(0);
        assertTrue(rule.getEnabled());

        List<Transition> trans = rule.getTransitions();
        assertEquals(3, trans.size());

        assertEquals(StorageClass.INFREQUENT_ACCESS, trans.get(0).getStorageClass());
        assertEquals(30, trans.get(0).getTransitionAfter().toDays().intValue());

        assertEquals(StorageClass.GLACIER, trans.get(1).getStorageClass());
        assertEquals(90, trans.get(1).getTransitionAfter().toDays().intValue());

        assertEquals(StorageClass.DEEP_ARCHIVE, trans.get(2).getStorageClass());
        assertEquals(365, trans.get(2).getTransitionAfter().toDays().intValue());

        assertEquals(retentionDays, rule.getExpiration().toDays().intValue());
    }
}
