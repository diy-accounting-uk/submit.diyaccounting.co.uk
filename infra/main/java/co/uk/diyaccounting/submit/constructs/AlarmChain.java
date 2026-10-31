/*
 * SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
 * Copyright (C) 2006-2026 DIY Accounting Limited
 */

package co.uk.diyaccounting.submit.constructs;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.WeakHashMap;
import software.amazon.awscdk.Stack;
import software.amazon.awscdk.services.cloudwatch.Alarm;

/**
 * Orders the alarm creates of one stack into chains so that CloudFormation never starts a burst
 * of about 200 {@code PutMetricAlarm} calls at once. Alarm N depends on alarm N minus
 * {@link #MAX_IN_FLIGHT}, so at most that many alarm creates run at the same time.
 */
public final class AlarmChain {

    /** The number of alarm creates of one stack that can be in flight together. */
    public static final int MAX_IN_FLIGHT = 10;

    private static final Map<Stack, List<Alarm>> ALARMS_BY_STACK = new WeakHashMap<>();

    private AlarmChain() {}

    /** Adds the dependency that places the alarm in its stack's chain, and returns the alarm. */
    public static synchronized Alarm chained(Alarm alarm) {
        List<Alarm> created = ALARMS_BY_STACK.computeIfAbsent(Stack.of(alarm), stack -> new ArrayList<>());
        if (created.size() >= MAX_IN_FLIGHT) {
            alarm.getNode().addDependency(created.get(created.size() - MAX_IN_FLIGHT));
        }
        created.add(alarm);
        return alarm;
    }
}
