<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN — work classes on the board: machine-only, machine-ask, human-driven

## Operator's words (2026-09-16)

> Please update the board skill to seperate human-only tasks into machine-ask (where a human is
> expected to be present and authenticte either by policy or physical enforcement such as 2fa)
> and human-driven (which require a human to physically drive the navigation also either by llm
> practical limitations for a coding assistant, physical restrictions through the process beyond
> a one time auth (e.g. sit a proctored AWS certification), or policy). Include the detail on O48
> as you suggested as the first machine-ask on NEXT.md, then update the skills in ../spreadsheets
> to have this ability in the /board skill and also copy the /iterate skill into spreadsheets and
> see what other skills have been refined in the submit repository and uplift the spreadsheets
> skills to match where appropriate.

> Then run the new improved /board where also if not obvious the ordering should be machine-only,
> machine-ask, human-driven etc...

## Shape

Sections, in order: `## In flight`, `## Machine-only`, `## Machine-ask`, `## Human-driven`,
`## Blocked`. `Human and machine` folds into `machine-ask`: its human half was always an
authentication or an approval of something the session then drives.

## Items

1. `NEXT.md` restructured on `main`, O48 first under Machine-ask with its CLI steps.
2. `.claude/skills/board/SKILL.md` and `app/unit-tests/nextShape.test.js` carry the five
   sections; `BACKLOG.md`'s vocabulary follows. Branch `claude/docs-board-classes`, one PR.
3. `../spreadsheets.diyaccounting.co.uk/.claude/skills/`: `board` gains the classes, `iterate`
   and `clean` arrive, `watch`, `do-next`, `auto-merge`, `cool-down`, `plain-prose` and
   `session-report` take submit's refinements where they are not spreadsheets-specific.
4. A `/board` render under the new skill.

## Verification

- `npx vitest run app/unit-tests/nextShape.test.js` passes on the PR head against `main`'s `NEXT.md`.
- Both repositories' `/board` renders show the same five sections in the same order.
