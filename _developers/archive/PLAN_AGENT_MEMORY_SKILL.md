<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# Feature: Agent Memory Skill (Context Survival System)

## Origin

User observation (Feb 14 2026): Claude Code compacts everything — 90% of which is logs and code output — but doesn't harvest user requests and map them to goals. Compaction takes several minutes (remote calls) and consistently loses direction. The user's frustration increases with each compaction because requirements are dropped and work repeats.

## Problem Statement

Claude Code's compaction summarizes *what happened* but loses *what was asked for and why*. User prompts get compressed into narrative, losing imperative force. A 3-line demand becomes a sentence buried in a summary. This causes:
- Repeated work across sessions
- Drift from stated priorities
- User frustration from re-stating requirements
- False completion (declaring things "done" that aren't working)

## Proposed Architecture

A skill (or set of skills) that stitches together existing tools into a coherent memory system:

### 1. Harvester (runs during work)
- Extracts user prompts from conversation
- Classifies each as: requirement, question, feedback, assertion
- Maps to goals with status: not started → in progress → done
- Writes structured output to `PLAN_*.md` files and/or MCP memory server

### 2. Gardener (runs periodically or on-demand)
- De-duplicates goals across plan files
- Archives completed goals to `_developers/archive/`
- Identifies conflicting or superseded requirements
- Prunes stale context from memory
- Could be triggered by `/garden` skill command

### 3. Warmer (runs at session start or after compaction)
- Reads all `PLAN_*.md` files
- Queries MCP memory server for recent entities/relations
- Reads `TaskList` for tracked work
- Synthesizes a concise context buffer: "Here's what matters right now"
- Proactively sniffs current tasks and drops them into an easily-digestible summary
- Could be triggered by `/warm` skill command

### 4. Text Dump + Indexer (filesystem-based persistence)
- Dumps full conversation segments to `target/context-dumps/` (cheap, huge storage)
- Indexes by: date, topic, user-request, goal-id
- Searchable via grep/ripgrep for recovery after compaction
- Not loaded into context by default — pulled on demand

### 5. Graph DB Layer (optional, via MCP)
- `@modelcontextprotocol/server-memory` provides entity/relation storage
- Entities: goals, requirements, decisions, blockers
- Relations: blocks, depends-on, supersedes, implements
- Queryable for "what's blocking X?" or "what did the user say about Y?"

## What Exists Today

| Component | Tool | Status |
|-----------|------|--------|
| Persistent memory | `@modelcontextprotocol/server-memory` (MCP) | Installed, configured |
| Auto memory | `CLAUDE_CODE_DISABLE_AUTO_MEMORY=0` | Enabled in ~/.zshrc |
| Plan files | `PLAN_*.md` at project root | Manual, working well |
| Task tracking | `TaskCreate/TaskUpdate/TaskList` | In-memory, may not survive compaction |
| Compact instructions | CLAUDE.md "Context Survival" section | Configured |
| Conversation dumps | Not built | — |
| Gardener skill | Not built | — |
| Warmer skill | Not built | — |

## Implementation Approach

Build as Claude Code skills (shell scripts + CLAUDE.md instructions):

1. **Phase 1**: CLAUDE.md instructions (done) + MCP memory server (done) + plan file pattern (done)
2. **Phase 2**: `/warm` skill — reads plan files, task list, MCP memory, prints summary
3. **Phase 3**: `/garden` skill — de-dupes, archives, prunes plan files
4. **Phase 4**: Conversation dump indexer (writes to `target/context-dumps/`)
5. **Phase 5**: Harvester that auto-extracts goals from user prompts (most ambitious)

## Success Criteria

- After compaction, Claude resumes work on the correct task within 1 prompt
- User never has to re-state a requirement that was previously acknowledged
- No goal is silently dropped between sessions
- Context warm-up takes < 10 seconds
