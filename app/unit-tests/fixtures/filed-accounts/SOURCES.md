# Sources of the register documents

The `register-*` files are filed accounts as Companies House holds them on the public register,
saved as fetched (no reformatting, trimming or edits). They are public register documents from
Companies House. The companies are ordinary small companies chosen for the filing software and the
accounts type; the company number is in each document.

All five were fetched on 2026-11-22 through the Document API, content type `application/xhtml+xml`.

| File | Company number | Made up to | Transaction id | Software (`bus:NameProductionSoftware`) |
|---|---|---|---|---|
| `register-micro-entity-companies-house-both-years.xhtml` | 14948707 | 2025-06-30 | MzUxMjI3NTEwN2FkaXF6a2N4 | Companies House |
| `register-micro-entity-filing-tool-both-years.xhtml` | 06487952 | 2025-01-31 | MzQ4NzEwMDIzNGFkaXF6a2N4 | v2025.70.1 micro_entity_frs_105_v1_1_3 filing |
| `register-small-company-filleted-iris-both-years.xhtml` | 04095977 | 2025-10-31 | MzUyMTUyODA4N2FkaXF6a2N4 | IRIS Accounts Production |
| `register-small-company-filleted-acorah-both-years.xhtml` | 14618153 | 2026-01-31 | MzUxNzcxNjE3NWFkaXF6a2N4 | Acorah Software Products - Accounts Production |
| `register-micro-entity-filleted-digita-current-year-only.xhtml` | 16140216 | 2025-12-31 | MzUzNzE5NjI4MGFkaXF6a2N4 | Digita Accounts Production Advanced |

`expected.json` holds the figures read from each document by hand. An entry with `unreadable` is a
document the reader refuses today: it holds the reader's message and, in `gap`, the line the
reader does not place and the figures that show the document is consistent.
