// SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0
// Copyright (C) 2006-2026 DIY Accounting Limited

// app/lib/operatorSnapshot/donationFilters.js

// The four donation Payment Links' bundle ids (infra/stripe/stripe.toml). v_revenue_daily
// labels each Stripe charge with its bundle id; PayPal donations are separate rows.
export const STRIPE_DONATION_PRODUCT_FILTER = "product IN ('donation-10', 'donation-20', 'donation-45', 'donation-custom')";
// The PayPal pull labels a donation receipt donation-paypal (see paypalDonationsPull.js).
export const PAYPAL_DONATION_PRODUCT_FILTER = "product = 'donation-paypal'";
