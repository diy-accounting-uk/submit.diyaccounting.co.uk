<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PARKED

Discoveries made while cool-down is on that are not degradations and so may not join the board.
One line each, enough to pick up later. The operator triages these when cool-down lifts: each line
picked becomes a board row in tier order, each line dropped is deleted. When the file is empty it
goes.

- **The ci last-known-good pointer goes stale between sweeps.** After a set self-destructs the
  parameter still names it — at 18:38 UTC it read `ci-claud6807` with zero ci stacks standing, last
  modified 17:39. B95's sentinel fixed the *missing* parameter, which crashed `ObservabilityStack`
  at changeset creation; a *stale* one does not crash, it scopes the dashboard's widget prefix to a
  deployment that no longer exists and shows nothing, silently. `destroy-ci.yml` clears it on the
  sweep, but the 18:34 slot had not fired, and GitHub's scheduling delay is measured in hours. Not a
  degradation: nothing that worked has stopped, and the sweep does eventually clear it.
