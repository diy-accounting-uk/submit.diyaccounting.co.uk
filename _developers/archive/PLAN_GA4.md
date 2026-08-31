# GA4 and Marketing Plan

**Status**: Complete (2026-08-31). All three streams collect (consent banner restored
collection on gateway and spreadsheets); `purchase` and `begin_checkout` are key events;
the BigQuery daily export runs to `analytics_523400333` (London); the Stripe reports are
scheduled monthly in the Stripe dashboard; both Google Ads accounts are confirmed
cancelled; retirement of the old property was withdrawn — it is dormant and kept for
history, recorded in `google-analytics.toml`.

Live sites:
- https://diyaccounting.co.uk/ (gateway)
- https://spreadsheets.diyaccounting.co.uk/
- https://submit.diyaccounting.co.uk/

## Done

- GA4 property "DIY Accounting" (ID `523400333`) with three data streams
- Measurement IDs in `google-analytics.toml`
- gtag.js on all three sites
- Ecommerce events: `view_item_list`, `view_item`, `begin_checkout`, `add_to_cart`, `purchase` on spreadsheets; `login`, `begin_checkout`, `purchase` on submit; `select_content` on gateway
- Cross-domain tracking
- CSP headers for analytics (`*.google-analytics.com`, `www.googletagmanager.com`)
- Privacy policy with GA4 section
- Default consent mode: `analytics_storage: 'denied'`

