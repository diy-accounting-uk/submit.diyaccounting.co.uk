<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: the submission record house style

## User assertions

> One document style for every filing Submit makes, so a VAT return, an Income Tax update or
> final declaration, a confirmation statement, accounts and a CT600 all read as the same kind of
> record

## The design

Every filing has one record and, on the site, one customer copy of that record.

1. **The record** is the plain statutory or submitted content. It has the layout of printed
   accounts and nothing else. The filed iXBRL uses it, and a printed record shows it.
2. **The customer copy** is the same record, unchanged, with DIY Accounting's frame around it:
   the brand, the submission number, status and date, a plain explanation beside each section,
   and links back into the journey. Nothing in the frame goes inside the record.

The first instance is the accounts layout of PR #530 (the micro-entity, small company and CT
computations iXBRL). The record layer is that layout, generalised.

### The parts

| Part | File | What it does |
|---|---|---|
| Stylesheet (the source) | `web/public/submission-record.css` | The record, its site-page isolation, the customer copy |
| Render helper | `app/lib/submissionRecord.js` | Record headings, tables, figures; `customerCopyHtml` |
| Browser copy of the helper | `web/public/lib/submission-record.js` | Generated; an ES module for site pages |
| Inline style for filed documents | `app/lib/submissionRecordStyle.js` | Generated; `RECORD_STYLE` |
| Generator | `scripts/generate-submission-record.mjs` | `npm run generate:submission-record`; `--check` |
| Test | `app/unit-tests/lib/submissionRecord.test.js` | Both copies current; every filed document carries `RECORD_STYLE` |

The stylesheet is its own file, beside `submit.css`, because a page links it only where a record
shows, and because its record section is the source of the inline copy. A section of
`submit.css` would put the generator's input inside a 2,000-line file that every page loads.

The record section of the stylesheet scopes every rule under `.submission-record`. The generator
removes that scope, reads the bare scope as `body`, and writes one rule per line into
`RECORD_STYLE`. The accounts and computations builders put `RECORD_STYLE` in the document's
`<style>`, because a filed document can link to no stylesheet. A JavaScript module carries the
copy, so the builders read no file at run time and the same import works in a browser bundle.

The helper imports nothing, so the Lambda image (which copies `app/lib` and not `web/public`) and
a site page run the same code. The generator copies it to `web/public/lib/`.

### The record

The record's vocabulary, as the stylesheet names it:

| Class | Holds |
|---|---|
| `.submission-record` | The record's root; `body` in a filed document |
| `.page` | One printed page: at most 180 mm wide, a page break after it |
| `.cover`, `.cover-name`, `.cover-title`, `.cover-line` | A cover page, where the filing has one |
| `.entity` | The entity's name, at the top of each page |
| `.reference` | One reference line under the name |
| `h2`, `.subtitle` | The page's title and the period line under it |
| `h3` | A section or note heading |
| `table.statement` | The figures (see below) |
| `.approval`, `.signature` | The declaration or approval line, and who signs it |

A `table.statement` has a label column, an optional note column and one column per year or
period. Each figure column has its heading and a `£` under it. Figures are right-aligned with
thousands separators. A deduction or a negative amount shows in brackets (`recordFigure`,
`recordAmount`), and a figure without brackets keeps a bracket's width of padding so the
digits align. A `subtotal` row has a rule above its figures. A `total` row has a rule above and
a double rule below. A `heading` row is a label with no figures. Notes carry their statutory
numbers in the note column.

How each filing fills the record:

| Filing | Entity and references | Period line | Figure columns | Closing line |
|---|---|---|---|---|
| VAT return | Business name; VAT number | The VAT period | One: the period | The declaration confirmed |
| Income Tax update | Name; NI number; the business | The update period | One: the period | The declaration confirmed |
| Final declaration | Name; NI number; UTR | The tax year | One: the year | The final declaration |
| Confirmation statement | Company; registered number | The confirmation date | None: statements as text | The confirmation |
| Accounts | Company; registered number | The period of account | This year and last year | Approval and signature |
| CT600 | Company; registered number; UTR | The return period | One: the period | The declaration |

A VAT return or an Income Tax update puts the box or field number at the start of its label, as
HMRC prints it. VAT boxes 1 to 5 show pence (`recordAmount(value, { decimals: 2 })`), and boxes
6 to 9 show whole pounds.

### The customer copy

`customerCopyHtml({ title, reference, status, date, sections, links })` writes:

- a header: the brand line, the title, and the submission's number, status and date as a list
  of terms;
- one section per part of the record: its heading, its explanation, and the record's markup
  inside a `.submission-record` sheet, unchanged;
- the links back into the journey.

The status shows in words ("Accepted by HMRC") and has a coloured left border for its kind
(`accepted`, `sent`, `pending`, `rejected`). On a wide screen, the explanation sits in a column
beside its sheet. On a narrow screen, the explanation comes above its sheet. A sheet that is
wider than the screen scrolls inside itself, and it takes keyboard focus so a keyboard can
scroll it. Printing the customer copy prints the title, the number, status and date, and the
record. The brand, the explanations and the links do not print.

The isolation section of the stylesheet undoes `submit.css` inside the record: content-box
sizing, paragraph margins, heading colour and `th` weight. With it, the record on a site page
renders as the standalone document does.

The customer copy uses the `submit.css` tokens with fallbacks. When DS2 (the site-wide design
review) lands, the customer copy section adopts DS2's tokens. The record layer keeps its own
values, because a filed document carries no site tokens.

### Design reviews

The `ui-ux-pro-max` skill (its UX guideline search) and the `frontend-design` skill, applied to
this design:

| Review | Finding | Design change |
|---|---|---|
| ui-ux-pro-max: table handling | A wide table must not break the layout on mobile; use a scroll wrapper | Each sheet has `overflow-x: auto` |
| ui-ux-pro-max: horizontal scroll | No content wider than the viewport | The page never scrolls sideways; only a sheet scrolls, inside itself |
| ui-ux-pro-max: screen reader | Semantic HTML, ARIA used correctly | A sheet is a labelled `region` with `tabindex="0"`; number, status and date are a `<dl>` |
| ui-ux-pro-max: line length | 65 to 75 characters a line | Explanations have `max-width: 65ch` |
| ui-ux-pro-max: line height | 1.5 to 1.75 for body text | Explanations use 1.5; the record keeps the printed accounts' spacing |
| ui-ux-pro-max: colour contrast | At least 4.5:1 for normal text | The record is black on white; the frame uses `submit.css` text tokens |
| ui-ux-pro-max: colour only | Do not show a state by colour alone | The status is a phrase; the border colour only repeats it |
| ui-ux-pro-max: heading hierarchy | Sequential heading levels | The copy's title is `h2` under the page's `h1`; sections are `h3` |
| ui-ux-pro-max: tabular figures | Tabular figures in data columns | The number, status and date use `tabular-nums`; Times New Roman figures are tabular already |
| ui-ux-pro-max: touch targets | At least 44 by 44 px | The journey links are 44 px high |
| ui-ux-pro-max: reduced motion | Honour `prefers-reduced-motion` | The design has no motion |
| ui-ux-pro-max: print | No match in the guideline data; built-in defaults used | A print rule hides the brand, explanations and links |
| frontend-design: ground it in the subject | The subject is a statutory paper record | The record is a sheet of paper on the site background; that sheet is the one bold element |
| frontend-design: typography | Choose faces for the subject | The record keeps Times New Roman, the face of printed accounts; the frame keeps the site's face |
| frontend-design: restraint | Spend boldness in one place | `submit.css` tokens only; no new fonts, colours, shadows or motion |
| frontend-design: template tells | No middle-dot meta strings, all-caps labels, eyebrows or arrow links | Number, status and date are a term list; labels are sentence case; links are plain text |
| frontend-design: structure is information | Numbers only for a true sequence | Note numbers are statutory references; the customer copy has no step numbers |
| frontend-design: words | Name actions by what happens | Links name their place ("Back to your receipts"); status names the outcome and the authority |
| frontend-design: layout | Decide the alignment | The frame is left-aligned; the record keeps its centred headings and right-aligned figures |

## Open tasks

| Task | What it takes from this design |
|---|---|
| AX5: the accounts pages | Frame the filed iXBRL preview as a customer copy with explanations and links |
| VR1: the VAT receipt | Render the nine boxes as a record with `recordHeading` and `recordTable`; frame it with `customerCopyHtml` |
| IR1: the Income Tax receipts | Render each update and the final declaration as records; frame them |
| DS2 tokens | Move the customer copy section to DS2's tokens when DS2 lands |

Each task that changes a page runs the visual definition of done in `CLAUDE.md`.
