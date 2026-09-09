<!-- SPDX-License-Identifier: LicenseRef-PolyForm-Internal-Use-1.0.0 -->
<!-- Copyright (C) 2006-2026 DIY Accounting Limited -->

# PLAN: claude-context-gardener

## User Assertions (non-negotiable)

- Plan only — no code on this branch
- Phase 1 is a Claude Code plugin (MCP server + hooks) buildable today
- Phases 2-3 elaborate what needs Anthropic cooperation or internal changes
- The design should be portable to open-source LLM tooling (e.g. Aider, Continue, Open Interpreter) as a demonstration

## Problem Statement

Claude Code's compaction is a single catastrophic event — when the context window fills to ~98%, the entire conversation is summarised in one LLM call. This is slow (30-120s wall-clock), lossy (the LLM decides what to keep under pressure), and unpredictable (no content-aware heuristics). The user experiences a long pause followed by degraded recall.

The alternative model is **incremental garbage collection**: continuously maintain compressed representations alongside originals, classify content by type, apply type-specific compression, and swap originals for summaries when context pressure rises — so that when compaction is finally needed, most of the work is already done.

---

## Phase 1: claude-context-gardener (Buildable Today)

### 1.1 Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│  Claude Code Agent Loop                             │
│                                                     │
│  User prompt ──► LLM ──► Tool call ──► Tool result  │
│       ▲                                     │       │
│       │              ┌──────────────────────┘       │
│       │              ▼                              │
│  ┌─────────┐   ┌───────────┐   ┌────────────────┐  │
│  │PreCompact│   │PostToolUse│   │UserPromptSubmit│  │
│  │  hook    │   │  hook     │   │  hook          │  │
│  └────┬─────┘   └─────┬─────┘   └──────┬────────┘  │
│       │               │                │            │
└───────┼───────────────┼────────────────┼────────────┘
        │               │                │
        ▼               ▼                ▼
   ┌────────────────────────────────────────────┐
   │  Gardener MCP Server (stdio)               │
   │                                            │
   │  ┌────────────┐  ┌─────────────────────┐   │
   │  │ Classifier  │  │ Compressors         │   │
   │  │ (content    │  │  log-compressor     │   │
   │  │  type       │  │  code-compressor    │   │
   │  │  detection) │  │  prose-compressor   │   │
   │  └──────┬──────┘  │  structured-comp.   │   │
   │         │         └──────────┬──────────┘   │
   │         ▼                    ▼              │
   │  ┌──────────────────────────────────────┐   │
   │  │  Store (SQLite)                      │   │
   │  │  - originals (full text, ttl, class) │   │
   │  │  - summaries (compressed, ratio)     │   │
   │  │  - FTS5 index (full-text search)     │   │
   │  │  - embeddings (vector similarity)    │   │
   │  └──────────────────────────────────────┘   │
   │                                            │
   │  MCP Tools exposed to Claude:              │
   │    recall(query, class?, limit?)           │
   │    context_pressure()                      │
   │    forget(id)                              │
   └────────────────────────────────────────────┘
```

### 1.2 Content Classification

Every piece of content entering the context window is classified. Classification is fast and algorithmic (no LLM call).

| Class | Detection Heuristics | Examples |
|-------|---------------------|----------|
| `log` | Timestamp patterns, repeated structure, ANSI codes, `stdout`/`stderr` markers | Test output, build logs, git log |
| `code` | File extension from tool metadata, shebang lines, AST-parseable | File reads, code in tool results |
| `structured` | JSON/YAML/TOML/CSV detection, consistent field patterns | API responses, config files |
| `prose` | Default fallback; sentence structure, paragraph breaks | LLM responses, documentation, user messages |
| `prompt` | Source is `UserPromptSubmit` hook | User's own words — highest priority, never compressed |
| `error` | Stack traces, error code patterns, `Error:` / `Exception` / `FAILED` | Exceptions, test failures |

**Classifier implementation:**

```
classifier.js:
  1. Check hook metadata for source (UserPromptSubmit → prompt)
  2. Check tool name context (Bash → likely log, Read → likely code)
  3. Regex battery:
     - /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/m → log
     - /^[\{\[][\s\S]*[\}\]]$/ → structured
     - /^#!\/|^(import|from|const|function|class|def|public) /m → code
     - /Error:|Exception|FAILED|stack trace/i → error
  4. Fallback: prose
```

### 1.3 Content-Class Compressors

Each class has a dedicated compressor. All compressors are **algorithmic** (no LLM needed) for speed. An optional LLM refinement pass can run async.

#### 1.3.1 Log Compressor

**Goal:** 90%+ reduction. Logs are high-volume, low-density.

**Algorithm:**
1. Parse into log entries (by timestamp or line)
2. Deduplicate: collapse N consecutive similar lines into `[repeated N times]`
3. Retain: first 3 lines (header/context), last 3 lines (final state), all error/warning lines
4. Summary line: `{N} log lines, {M} errors, {K} warnings, timespan {start}..{end}`
5. For test output specifically: extract pass/fail counts, list only failing test names

**Example:**
```
Input (847 lines):
  PASS src/auth.test.js (23 tests)
  PASS src/billing.test.js (15 tests)
  FAIL src/vat.test.js
    ✕ should calculate VAT for period (45ms)
      Expected: 1250.00
      Received: 1249.99
  ... (843 more lines of passing tests)

Output (6 lines):
  [Test run: 847 lines, 156 tests, 155 passed, 1 failed]
  FAIL src/vat.test.js
    ✕ should calculate VAT for period (45ms)
      Expected: 1250.00
      Received: 1249.99
  [Full log stored: id=a3f2, recall("vat test failure")]
```

#### 1.3.2 Code Compressor

**Goal:** 60-70% reduction. Preserve structure, collapse implementation.

**Algorithm:**
1. Detect language from file extension or content
2. For supported languages (JS/TS/Java/Python): parse AST
   - Keep: imports, exports, function/method signatures, class declarations, type definitions
   - Collapse: function bodies → `{ ... N lines ... }`
   - Keep inline: single-line functions, constants, configuration objects
3. For unsupported languages: indent-based folding
   - Keep lines at indent level 0-1
   - Collapse deeper blocks → `  ... N lines ...`
4. Always retain: the specific lines the user asked about or recently edited (tracked by store)

**Example:**
```
Input (45 lines):
  export class VatCalculator {
    constructor(rates) {
      this.rates = rates;
      this.cache = new Map();
      // ... setup logic
    }
    calculate(amount, period) {
      const rate = this.rates.get(period);
      if (!rate) throw new Error(`No rate for ${period}`);
      const vat = amount * rate;
      const total = amount + vat;
      return { net: amount, vat, total, rate, period };
    }
    clearCache() {
      this.cache.clear();
    }
  }

Output (12 lines):
  export class VatCalculator {
    constructor(rates) { ... 4 lines ... }
    calculate(amount, period) → { net, vat, total, rate, period }
    clearCache() { this.cache.clear(); }
  }
  [Full source stored: id=b7c1, recall("VatCalculator")]
```

#### 1.3.3 Prose Compressor

**Goal:** 40-50% reduction. Preserve meaning, collapse verbosity.

**Algorithm (extractive — no LLM):**
1. Split into sentences
2. Score each sentence using TextRank (graph-based importance):
   - Build similarity graph between sentences (Jaccard similarity on word sets)
   - Run PageRank to find central sentences
3. Keep top 40% of sentences by score
4. Preserve first and last sentence of each paragraph (framing)
5. Preserve sentences containing: proper nouns, numbers, URLs, code references

**Optional LLM refinement (async):**
- After the algorithmic pass, queue an LLM call to produce an abstractive summary
- When it returns, replace the extractive summary if it's shorter and covers the same key terms
- This runs in the background — never blocks the main conversation

#### 1.3.4 Structured Data Compressor

**Goal:** 70-80% reduction for large payloads.

**Algorithm:**
1. Parse as JSON/YAML/TOML
2. For arrays: keep first 2 items + `... and N more items with same shape`
3. For deeply nested objects: collapse beyond depth 3 → `{ ... N keys ... }`
4. For known patterns (API responses, CloudFormation, package.json): schema-aware compression that keeps the fields that matter
5. Preserve: any field referenced by name in the last 5 user messages

#### 1.3.5 Error Compressor

**Goal:** 20-30% reduction only. Errors are high-value.

**Algorithm:**
1. Keep the full error message and type
2. Keep the top 5 stack frames (most relevant to user code)
3. Collapse framework/library frames → `... N framework frames ...`
4. Keep any file paths that are within the project directory
5. Keep the full causal chain (`Caused by:`)

### 1.4 The Store (SQLite)

```sql
CREATE TABLE entries (
  id          TEXT PRIMARY KEY,      -- nanoid
  session_id  TEXT NOT NULL,         -- Claude Code session
  created_at  INTEGER NOT NULL,      -- unix ms
  class       TEXT NOT NULL,         -- log|code|prose|structured|prompt|error
  source_tool TEXT,                  -- which tool produced it (Read, Bash, etc.)
  source_path TEXT,                  -- file path if applicable
  original    TEXT NOT NULL,         -- full original content
  summary     TEXT NOT NULL,         -- compressed version
  ratio       REAL NOT NULL,         -- compression ratio (summary_tokens / original_tokens)
  tokens_orig INTEGER NOT NULL,      -- original token count (tiktoken estimate)
  tokens_sum  INTEGER NOT NULL,      -- summary token count
  priority    INTEGER DEFAULT 50,    -- 0-100, higher = keep longer
  last_access INTEGER,               -- unix ms, updated on recall()
  ttl         INTEGER,               -- auto-expire after N ms (null = permanent)
  active      BOOLEAN DEFAULT 1      -- soft delete
);

-- Full-text search on both original and summary
CREATE VIRTUAL TABLE entries_fts USING fts5(
  original, summary, source_path,
  content=entries, content_rowid=rowid
);

-- Optional: vector embeddings for semantic search
-- Uses sqlite-vss or similar extension
CREATE VIRTUAL TABLE entries_vec USING vss0(
  embedding(384)  -- all-MiniLM-L6-v2 dimension
);

CREATE TABLE session_state (
  key   TEXT PRIMARY KEY,
  value TEXT
);
-- Stores: total_tokens_tracked, compression_achieved, classes_seen, etc.
```

**Priority scoring:**

```
priority = base_priority(class)
         + recency_bonus(last_access)
         + reference_bonus(mentioned_in_recent_messages)
         - staleness_penalty(age)

Base priorities:
  prompt  = 90   (user's words — almost never evict)
  error   = 80   (active debugging context)
  code    = 60   (referenced files)
  prose   = 40   (conversation history)
  structured = 30 (API responses, configs)
  log     = 20   (ephemeral by nature)
```

### 1.5 MCP Tools Exposed to Claude

#### `recall(query, class?, limit?)`

Hybrid search: FTS5 full-text match + vector cosine similarity, combined with priority weighting.

Returns summaries by default. If Claude needs the original, it calls `recall(query, { full: true })` — the gardener returns the original and resets its staleness timer.

**When Claude should call this:** Whenever it needs information from earlier in the session that may have been compacted away. The PreCompact hook injects a reminder: "Use recall() to retrieve earlier context if needed."

#### `context_pressure()`

Returns:
```json
{
  "entries_tracked": 142,
  "total_original_tokens": 89420,
  "total_summary_tokens": 18650,
  "compression_ratio": 0.21,
  "by_class": {
    "log": { "count": 45, "orig": 42000, "sum": 3200, "ratio": 0.08 },
    "code": { "count": 38, "orig": 28000, "sum": 9800, "ratio": 0.35 },
    "prose": { "count": 35, "orig": 14000, "sum": 4200, "ratio": 0.30 },
    "structured": { "count": 18, "orig": 4420, "sum": 1100, "ratio": 0.25 },
    "error": { "count": 6, "orig": 1000, "sum": 350, "ratio": 0.35 }
  },
  "eviction_candidates": 23,
  "recommendation": "45 log entries consuming 42k tokens could be compressed to 3.2k"
}
```

Claude can use this to decide whether to evict old entries or request summaries instead of originals.

#### `forget(id)`

Manually mark an entry for eviction. Claude calls this when it determines something is no longer relevant.

### 1.6 Hook Wiring

**hooks.json:**
```json
{
  "hooks": [
    {
      "event": "PostToolUse",
      "type": "command",
      "command": "node ./server/ingest.js",
      "timeout": 2000,
      "async": true
    },
    {
      "event": "PreCompact",
      "type": "command",
      "command": "node ./server/pre-compact.js",
      "timeout": 5000
    },
    {
      "event": "UserPromptSubmit",
      "type": "command",
      "command": "node ./server/ingest-prompt.js",
      "timeout": 1000,
      "async": true
    }
  ]
}
```

**PostToolUse (async):** Receives the tool result on stdin. Classifies it, compresses it, stores it. Async so it never blocks the conversation.

**PreCompact:** Injects a curated state summary into the compaction input:
```
[Context Gardener State]
This session has 142 tracked items (89k original tokens → 19k compressed).
Key items in memory:
- VatCalculator class (code, id=b7c1, accessed 2min ago)
- Test failure in vat.test.js (error, id=c9d2, accessed 5min ago)
- User's authentication flow requirements (prompt, id=a1b2)
- 45 log entries from build/test runs (compressed from 42k to 3.2k tokens)
Use recall(query) to retrieve any of these after compaction.
```

**UserPromptSubmit (async):** Stores the user's raw prompt at priority 90. These are almost never evicted.

### 1.7 Embedding Strategy

For `recall()` semantic search, embeddings are needed. Two options:

**Option A: Local model (preferred for privacy/speed)**
- `all-MiniLM-L6-v2` via `@xenova/transformers` (ONNX runtime, runs in Node.js)
- 384-dimension embeddings, ~50ms per encoding
- No external API calls, works offline
- Store in sqlite-vss

**Option B: API-based (higher quality)**
- Voyage AI or OpenAI embeddings API
- Better semantic matching but adds latency and cost
- Only justified if local quality is insufficient

### 1.8 The Gardener Loop (Background)

Beyond the hook-triggered ingestion, the gardener runs a background maintenance loop:

```
Every 30 seconds:
  1. Check for entries past TTL → soft-delete
  2. Re-score priorities based on recency decay
  3. For entries accessed in last 60s, ensure summary is fresh
  4. If optional LLM refinement is enabled:
     - Pick the highest-priority entry with only an algorithmic summary
     - Generate an LLM-refined summary (one at a time, rate-limited)
     - Replace if shorter and covers same key terms
```

### 1.9 File Structure

```
claude-context-gardener/
├── .claude-plugin/
│   └── plugin.json                 # Plugin manifest
├── hooks/
│   └── hooks.json                  # Event wiring
├── server/
│   ├── index.js                    # MCP server entry (stdio transport)
│   ├── tools.js                    # recall, context_pressure, forget
│   ├── ingest.js                   # PostToolUse hook handler
│   ├── ingest-prompt.js            # UserPromptSubmit hook handler
│   ├── pre-compact.js              # PreCompact hook handler
│   ├── classifier.js               # Content type detection
│   ├── compressors/
│   │   ├── index.js                # Dispatcher by class
│   │   ├── log-compressor.js       # Log reduction
│   │   ├── code-compressor.js      # AST-based code compression
│   │   ├── prose-compressor.js     # TextRank extractive summarization
│   │   ├── structured-compressor.js# JSON/YAML schema-aware compression
│   │   └── error-compressor.js     # Stack trace compression
│   ├── store.js                    # SQLite operations
│   ├── embeddings.js               # Local MiniLM encoding
│   ├── priority.js                 # Priority scoring
│   ├── gardener-loop.js            # Background maintenance
│   └── token-estimate.js           # Fast token counting (cl100k_base)
├── test/
│   ├── classifier.test.js
│   ├── log-compressor.test.js
│   ├── code-compressor.test.js
│   ├── prose-compressor.test.js
│   ├── store.test.js
│   └── recall.test.js
├── package.json
├── .mcp.json
└── README.md
```

### 1.10 Success Metrics

| Metric | Target | How to Measure |
|--------|--------|----------------|
| Compression ratio (logs) | < 0.10 | `context_pressure()` by class |
| Compression ratio (code) | < 0.35 | Same |
| Compression ratio (overall) | < 0.25 | Same |
| Ingestion latency | < 200ms p95 | Timer in PostToolUse hook |
| Recall latency | < 500ms p95 | Timer in recall() tool |
| Recall relevance | Top result is correct > 80% | Manual evaluation on 20 test queries |
| Session longevity | 2x longer before compaction | Compare token growth rate with/without gardener |
| Compaction speed | < 10s (vs 30-120s baseline) | PreCompact hook reduces input size, LLM has less to summarise |

---

## Phase 2: Buildable with Anthropic Cooperation

These features are architecturally sound but blocked by Claude Code's current extension points. They could be unlocked by relatively modest API additions.

### 2.1 Context Window Mutation API

**What's needed:** An API that lets an MCP server or hook replace a message in the conversation history with a shorter version.

**Current state:** The context window is append-only from the plugin perspective. You can add information via tool results and hook output, but you cannot remove or replace existing messages.

**What it would enable:**
- The gardener could swap a 500-line file read with its 50-line summary *in place*, reclaiming tokens immediately
- Items not under active manipulation (files read 20 minutes ago, old bash output) get replaced with their summaries automatically
- The agent wouldn't need to "recall" information — it would still be in context, just compressed

**Proposed API surface:**
```
// New hook capability: return a replacement for the tool result
// In PostToolUse hook response:
{
  "action": "replace_output",
  "delay_ms": 60000,        // replace after 60s of no access
  "replacement": "..."      // the summary
}
```

**Complexity for Anthropic:** Medium. Requires changes to the message history manager, but doesn't touch the LLM API itself. The replacement is local to Claude Code's message array before it's sent to the API.

### 2.2 Token Budget Awareness

**What's needed:** Hooks or MCP tools that can read the current context window utilisation (tokens used / tokens available).

**Current state:** Plugins have no visibility into how full the context window is. The gardener has to estimate based on what it's seen, but can't account for system prompts, thinking tokens, or Claude's own responses.

**What it would enable:**
- The gardener could switch from "store summaries" to "actively evict" mode at a precise threshold
- Priority-based eviction: when at 70%, start replacing low-priority items; at 85%, replace medium-priority
- Expose this as `context_pressure()` with real numbers instead of estimates

**Proposed API surface:**
```
// New built-in tool or MCP capability
{
  "context_tokens_used": 145000,
  "context_tokens_available": 200000,
  "utilization": 0.725,
  "messages_count": 47,
  "largest_messages": [
    { "index": 12, "tokens": 8500, "role": "tool", "tool": "Read" },
    { "index": 31, "tokens": 6200, "role": "tool", "tool": "Bash" }
  ]
}
```

**Complexity for Anthropic:** Low. This information already exists internally — it's how auto-compaction triggers at 98%. Exposing it read-only via a tool or hook environment variable is straightforward.

### 2.3 Streaming Priority / Fast Lane

**What's needed:** A way for MCP servers to annotate their tool results with priority metadata that affects how they're handled in the context window.

**Current state:** All tool results are equal. A 10,000-token log dump occupies the same space and has the same lifetime as a 50-token user prompt.

**What it would enable:**
- The gardener marks log output as `priority: low, ttl: 120s` — Claude Code auto-evicts it after 2 minutes
- User prompts are `priority: critical, ttl: null` — never evicted
- Large file reads are `priority: medium, summarize_after: 60s` — auto-replaced with summary

**Proposed API surface:**
```
// MCP tool result metadata (new field)
{
  "content": [{ "type": "text", "text": "..." }],
  "metadata": {
    "context_priority": "low",      // low | medium | high | critical
    "context_ttl_ms": 120000,       // auto-evict after this
    "context_summary": "Build passed, 156 tests, 0 failures"  // use this when evicting
  }
}
```

**Complexity for Anthropic:** Medium. Requires MCP protocol extension (or Claude Code-specific metadata handling) plus changes to the message lifecycle manager.

### 2.4 Noisy Neighbor Throttling

**What's needed:** A mechanism to limit how many tokens a single tool result can inject into the context window, with overflow going to the gardener's store.

**Current state:** Claude Code has a 10,000-token warning threshold for MCP tool output (configurable to 25,000), but this is a soft warning, not a hard limit. And built-in tools (Read, Bash) have no such limit.

**What it would enable:**
- A `Read` of a 2,000-line file would inject the first 500 lines + a summary, with the full file available via `recall()`
- Bash output from a long build would be truncated to errors + summary, with full output in the store
- No single tool result could consume more than N% of the context window

**Proposed API surface:**
```
// Claude Code setting (in .claude/settings.json)
{
  "context_gardener": {
    "max_tool_result_tokens": 4000,
    "overflow_handler": "mcp:context-gardener:store",
    "overflow_summary": true
  }
}
```

**Complexity for Anthropic:** Medium-High. Requires interception of tool results before they enter the message history, plus integration with the MCP overflow handler.

### 2.5 Compaction Algorithm Hooks

**What's needed:** The ability to provide a custom compaction function that runs *instead of* or *before* the default LLM-based compaction.

**Current state:** Compaction is a single LLM call. PreCompact can inject context but cannot replace the algorithm.

**What it would enable:**
- The gardener's pre-computed summaries become the *primary* compaction output
- The LLM compaction call becomes a refinement pass on already-compressed material, not a from-scratch summarisation
- Compaction drops from 30-120s to <5s (algorithmic) + optional 10-20s (LLM refinement)

**Proposed API surface:**
```
// PreCompact hook response (new action)
{
  "action": "provide_compacted",
  "messages": [
    { "role": "user", "content": "..." },
    { "role": "assistant", "content": "..." },
    // ... pre-compacted message history
  ],
  "skip_llm_compaction": false  // true = use only this, false = let LLM refine
}
```

**Complexity for Anthropic:** High. This is the most invasive change — it replaces a core behaviour. But it's also the highest-value change, because it eliminates the compaction pause entirely.

---

## Phase 3: Requires Internal Anthropic Changes (Server-Side)

These features cannot be built as plugins. They require changes to the Claude API or Claude Code's core architecture.

### 3.1 Server-Side RAG Integration

**What it is:** Instead of injecting retrieved context as tool results (which consume context window tokens), the API itself supports a retrieval-augmented context that sits alongside the conversation.

**Current state:** All context must be in the messages array. Retrieved information competes with conversation history for the same token budget.

**Architecture:**

```
┌─────────────────────────────┐
│  Claude Code Client         │
│                             │
│  messages: [...]            │
│  retrieval_context: {       │◄── New API field
│    provider: "gardener",    │
│    endpoint: "http://...",  │
│    query_budget: 10000      │  Tokens reserved for retrieval
│  }                          │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Claude API                 │
│                             │
│  1. Receive messages        │
│  2. Query retrieval_context │◄── Server-side retrieval call
│     endpoint with the       │
│     current query context   │
│  3. Inject retrieved chunks │
│     into a reserved token   │
│     budget (not competing   │
│     with messages)          │
│  4. Generate response       │
└─────────────────────────────┘
```

**What it would enable:**
- Retrieved context doesn't consume conversation token budget
- The server can cache and optimise retrieval across requests
- Retrieval happens at inference time with full query understanding (not pre-fetched by the client guessing what might be needed)
- The gardener's store becomes a first-class retrieval backend

**Relationship to MCP:** This is essentially "MCP Resources, but server-side with a dedicated token budget." Today, MCP resources are client-side and injected into messages.

### 3.2 Incremental Context Compilation

**What it is:** Instead of sending the full message history on every API call and then doing a catastrophic compaction, the API maintains a compiled context state that is incrementally updated.

**Current state:** Every API call sends the entire conversation. The context window is a flat array of messages. When it's too big, the client compresses it into a shorter array.

**Architecture:**

```
Request 1:  messages[0..5]   → API processes all 5
Request 2:  messages[0..10]  → API processes all 10 (including re-reading 0..5)
Request 3:  messages[0..15]  → API processes all 15

vs. Incremental:

Request 1:  messages[0..5]         → API creates state_id=abc
Request 2:  state_id=abc + [6..10] → API extends state, returns state_id=def
Request 3:  state_id=def + [11..15]→ API extends state, returns state_id=ghi

Compaction is internal: the API incrementally summarises old state as new
messages arrive, never needing a catastrophic client-side compression.
```

**What it would enable:**
- No client-side compaction at all
- API handles context management with full model awareness
- Conversation length is effectively unlimited (state is incrementally compressed server-side)
- Latency per request decreases (only new messages are processed)

**Complexity:** Very high. This is a fundamental change to the stateless API model. It requires server-side conversation state management, which has scaling, caching, and consistency implications. However, Google's Gemini already offers a variant of this with "context caching."

### 3.3 Content-Typed Messages

**What it is:** Messages in the API have a `content_type` field that tells the model how to weight and manage them.

**Current state:** All messages are untyped text or tool results. The model has to infer what's a log, what's code, what's important.

**Proposed API change:**
```json
{
  "role": "tool",
  "content": "...",
  "content_type": "log",
  "content_metadata": {
    "compressible": true,
    "summary": "Build passed, 156 tests",
    "priority": 20,
    "source": "bash:npm test"
  }
}
```

**What it would enable:**
- The model's attention mechanism could down-weight low-priority content
- Server-side compaction could use content type to decide compression strategy
- Analytics on what content types consume the most tokens
- Aligns with the gardener's classification — the client classifies, the server respects it

**Complexity:** Medium. The API already supports structured content blocks (text, image, tool_use, tool_result). Adding a metadata field is relatively non-invasive at the protocol level, though teaching the model to use it requires training.

### 3.4 Hybrid Search as a Native Capability

**What it is:** The Claude API natively supports a vector store / knowledge base that the model can query during inference.

**Precedent:** OpenAI's Assistants API has a "File Search" tool backed by a vector store. Amazon Bedrock has Knowledge Bases. This is the same concept applied to conversation-derived content rather than pre-uploaded files.

**What it would enable:**
- Session-derived knowledge (everything Claude has seen) is automatically indexed
- The model queries its own memory as part of inference, not as a separate tool call
- Cross-session memory becomes possible (the vector store persists)

**Complexity:** High, but well-understood. This is a standard RAG pattern; the novel part is auto-indexing from conversation content rather than requiring explicit document upload.

---

## Portability to Open-Source LLM Tooling

The Phase 1 architecture is designed to be portable. The key abstraction boundaries:

| Component | Claude Code Specific | Portable |
|-----------|---------------------|----------|
| Hook wiring | `hooks.json` format | Each tool has its own hook/event system |
| MCP server | MCP protocol (stdio) | MCP is an open standard; Aider/Continue/Cursor support it |
| Classifier | Pure algorithmic | Fully portable, no dependencies |
| Compressors | Pure algorithmic | Fully portable |
| Store (SQLite) | None | Fully portable |
| Embeddings | None | Fully portable |

**Aider** (most promising target):
- Supports MCP servers (as of late 2025)
- Has its own "repo map" concept (similar to code compression)
- Open source (Apache 2.0) — PRs welcome
- Python-based, so compressors would need porting or a subprocess bridge

**Continue** (VS Code / JetBrains):
- Supports MCP servers
- Has a context provider system that maps well to the gardener
- Open source (Apache 2.0)
- TypeScript-based — direct reuse of the gardener's Node.js code

**Open Interpreter:**
- More limited extension model
- Could integrate via its message hook system
- Open source (AGPL)

**Strategy:** Build the gardener as a standalone MCP server with no Claude Code dependencies in the core. The hooks.json is a thin adapter layer. For other tools, write equivalent thin adapters to their event systems.

---

## Implementation Roadmap

| Step | Scope | Effort |
|------|-------|--------|
| 1 | Classifier + log compressor + SQLite store | 1-2 days |
| 2 | MCP server with `recall()` + `context_pressure()` | 1 day |
| 3 | Hook wiring (PostToolUse, PreCompact) | 0.5 day |
| 4 | Code compressor (JS/TS AST via acorn/babel) | 1-2 days |
| 5 | Prose compressor (TextRank) | 1 day |
| 6 | Structured + error compressors | 0.5 day |
| 7 | Local embeddings (MiniLM) + vector search | 1 day |
| 8 | Gardener background loop | 0.5 day |
| 9 | Tests + evaluation harness | 1-2 days |
| 10 | Adapter for Aider or Continue | 1-2 days |

**Total Phase 1:** ~10-14 days for a working prototype with tests.

---

## Open Questions

1. **AST parser choice:** Acorn (fast, ES2024) vs Babel (slower, full TS/JSX) vs tree-sitter (polyglot, native binding)?
2. **Embedding model:** MiniLM-L6-v2 (384d, fast) vs BGE-small (384d, better quality) vs skip embeddings initially and rely on FTS5 only?
3. **LLM refinement:** Use the same Claude API the user is paying for, or a local model (e.g. Ollama with a small model)?
4. **Cross-session persistence:** Should the store persist across sessions (accumulating project knowledge) or reset each time?
5. **Privacy:** Should the store be encrypted at rest? It contains everything Claude has seen.

---

## Appendix A: Prototype Phases 2-3 on an Open-Source Platform

### A.1 Platform Selection

The goal is to demonstrate Phase 2-3 features (context mutation, token budgets, incremental compaction, server-side RAG) on a platform where we can modify the core agent loop. This rules out closed-source tools and narrows the field.

| Platform | License | Language | Agent Loop Access | MCP Support | Verdict |
|----------|---------|----------|-------------------|-------------|---------|
| **Aider** | Apache 2.0 | Python | Full — `coders/base_coder.py` | Yes (late 2025) | Best candidate |
| Continue | Apache 2.0 | TypeScript | Partial — IDE extension model | Yes | Good but IDE-bound |
| Open Interpreter | AGPL | Python | Full — `core/core.py` | Limited | Viable but smaller community |
| LangChain/LangGraph | MIT | Python/TS | Full — you build the loop | N/A (you are the loop) | Too low-level, no end-user product |
| Cursor | Proprietary | — | None | Yes | Can't modify internals |

**Decision: Aider.** It's the closest analogue to Claude Code (CLI-based, coding-focused, model-agnostic), it's Apache 2.0 so PRs are welcome, and its codebase is well-structured with clear extension points.

### A.2 Aider's Current Context Management

Aider's context model (as of v0.70+):

```
┌──────────────────────────────────────────┐
│  Aider Message Flow                      │
│                                          │
│  System prompt (repo map, conventions)   │
│  + Chat history (full messages)          │
│  + "cur_messages" (current turn)         │
│  ──────────────────────────────          │
│  When too large:                         │
│    1. Summarize old chat history         │  ◄── Single LLM call, same problem
│    2. Keep repo map + cur_messages       │
│    3. Prepend summary                    │
└──────────────────────────────────────────┘
```

Key files:
- `aider/coders/base_coder.py` — the agent loop, `run_one()` method
- `aider/history.py` — chat history management
- `aider/repomap.py` — the "repo map" (tree-sitter powered code summary)
- `aider/sendchat.py` — API call construction

Aider already has a primitive form of code compression (repo map), but no content classification, no incremental compaction, and the same catastrophic summarisation problem as Claude Code.

### A.3 Phase 2 Features — Implemented in Aider

#### A.3.1 Context Window Mutation (Phase 2.1 equivalent)

**Where to modify:** `aider/coders/base_coder.py` — the `done_messages` and `cur_messages` lists.

Aider stores messages in plain Python lists. Unlike Claude Code, these are directly mutable. The gardener can:

```python
# In base_coder.py, after each tool result:
class GardenerMixin:
    def maybe_compress_message(self, msg, index):
        """Replace a message with its summary if it's stale."""
        if msg.get("role") != "tool":
            return
        age = time.time() - msg.get("_timestamp", 0)
        if age < self.gardener.staleness_threshold:
            return
        summary = self.gardener.get_summary(msg["content"])
        if summary:
            self.done_messages[index]["content"] = summary
            self.done_messages[index]["_compressed"] = True
```

**This is the Phase 2.1 feature that Claude Code can't do** — direct message mutation. In Aider, it's ~30 lines of code because the message list is a plain Python array.

#### A.3.2 Token Budget Awareness (Phase 2.2 equivalent)

**Where to modify:** `aider/sendchat.py` and `aider/models.py`

Aider already tracks token counts per message for model context limits. Exposing this to the gardener:

```python
# Already exists in Aider (models.py):
self.max_context_tokens = ...
# And in base_coder.py:
tokens = self.main_model.token_count(messages)

# New: expose to gardener
def get_context_pressure(self):
    used = self.main_model.token_count(self.format_messages())
    available = self.main_model.info.get("max_input_tokens", 128000)
    return {
        "used": used,
        "available": available,
        "utilization": used / available,
        "by_message": [
            {"index": i, "tokens": self.main_model.token_count([m]), "role": m["role"]}
            for i, m in enumerate(self.done_messages)
        ]
    }
```

**This is the Phase 2.2 feature.** Aider already has the data — it just doesn't expose it to plugins or use it for incremental eviction.

#### A.3.3 Content-Priority Eviction (Phase 2.3 + 2.4 equivalent)

**Where to modify:** `aider/history.py` — replace the single `summarize()` call with incremental priority-based eviction.

```python
# Current Aider approach (history.py):
def summarize_chat_history(self, messages):
    # One LLM call to summarize everything
    summary = self.llm.chat(summarize_prompt + messages)
    return [{"role": "system", "content": summary}]

# Gardener replacement:
def incremental_compact(self, messages, target_tokens):
    """Evict lowest-priority messages until under target."""
    scored = [(self.gardener.priority(m), i, m) for i, m in enumerate(messages)]
    scored.sort(key=lambda x: x[0])  # lowest priority first

    current_tokens = self.token_count(messages)
    for priority, index, msg in scored:
        if current_tokens <= target_tokens:
            break
        summary = self.gardener.get_summary(msg["content"])
        if summary:
            saved = self.token_count([msg]) - self.token_count_str(summary)
            messages[index]["content"] = summary
            messages[index]["_compressed"] = True
            current_tokens -= saved

    return messages  # No LLM call needed
```

**This replaces the catastrophic LLM summarisation with algorithmic priority-based eviction.** The entire compaction pause disappears.

#### A.3.4 Compaction Algorithm Override (Phase 2.5 equivalent)

**Where to modify:** `aider/coders/base_coder.py` — the `check_and_manage_context()` method.

```python
# Current: triggers when context exceeds limit
def check_and_manage_context(self):
    if self.token_count(self.format_messages()) > self.max_context:
        self.done_messages = self.summarize_chat_history(self.done_messages)

# Gardener replacement: continuous, not catastrophic
def check_and_manage_context(self):
    pressure = self.get_context_pressure()
    if pressure["utilization"] > 0.7:
        self.done_messages = self.gardener.incremental_compact(
            self.done_messages,
            target_tokens=int(pressure["available"] * 0.6)
        )
    # LLM summarisation only as last resort at 95%+
    if pressure["utilization"] > 0.95:
        self.done_messages = self.summarize_chat_history(self.done_messages)
```

### A.4 Phase 3 Features — Prototyped in Aider

#### A.4.1 Session-Local RAG (Phase 3.1 equivalent)

Since we control Aider's agent loop, we can add a retrieval step before each API call:

```python
# In base_coder.py, before send_chat():
def augment_with_recall(self, messages):
    """Inject recalled context relevant to the current query."""
    current_query = messages[-1]["content"] if messages else ""
    recalled = self.gardener.recall(current_query, limit=5)
    if recalled:
        recall_msg = {
            "role": "system",
            "content": f"[Recalled from earlier in session]\n{recalled}"
        }
        # Insert before the last user message
        messages.insert(-1, recall_msg)
    return messages
```

This doesn't require a separate token budget (Phase 3.1's ideal), but it demonstrates the pattern. The recalled content competes with conversation history, but the gardener's compression means the total is still smaller than raw history.

#### A.4.2 Incremental Context Compilation (Phase 3.2 equivalent)

This is the most ambitious feature. In Aider, we can simulate stateful context:

```python
class IncrementalContext:
    """Maintains a compiled context state across turns."""

    def __init__(self, gardener, max_tokens):
        self.compiled_summary = ""       # Rolling summary of old turns
        self.recent_messages = []        # Last N turns (full fidelity)
        self.gardener = gardener
        self.max_tokens = max_tokens
        self.window_size = 10            # Keep last 10 turns full

    def add_turn(self, messages):
        """Add a new turn, compiling old ones."""
        self.recent_messages.extend(messages)

        # When recent exceeds window, compile oldest into summary
        while len(self.recent_messages) > self.window_size * 2:
            oldest = self.recent_messages[:2]  # user + assistant pair
            self.recent_messages = self.recent_messages[2:]

            # Algorithmic compilation (no LLM)
            for msg in oldest:
                summary = self.gardener.compress(msg["content"], msg.get("_class", "prose"))
                self.compiled_summary += f"\n[{msg['role']}]: {summary}"

            # Periodically re-compress the compiled summary itself
            if self.gardener.token_count(self.compiled_summary) > self.max_tokens * 0.3:
                self.compiled_summary = self.gardener.compress(
                    self.compiled_summary, "prose"
                )

    def get_messages(self):
        """Return messages for API call."""
        return [
            {"role": "system", "content": f"[Session history]\n{self.compiled_summary}"},
            *self.recent_messages
        ]
```

**Key insight:** This never sends old messages to the API again. Each turn only sends: compiled summary + recent window. API input tokens per request stay roughly constant regardless of session length.

### A.5 Aider PR Strategy

The contribution would be structured as a series of PRs, each self-contained and independently valuable:

| PR | Feature | Lines Changed | Dependencies |
|----|---------|--------------|--------------|
| 1 | Content classifier + compressors (standalone library) | ~800 new | None |
| 2 | SQLite store + recall + embeddings (standalone library) | ~600 new | PR 1 |
| 3 | Hook into Aider's `PostToolUse` equivalent (message append) | ~50 changed | PR 1, 2 |
| 4 | Token budget exposure (`/context-pressure` command) | ~30 changed | None |
| 5 | Priority-based incremental eviction (replace `summarize_chat_history`) | ~100 changed | PR 1, 2, 3 |
| 6 | Session-local RAG (recall injection before API calls) | ~40 changed | PR 2 |
| 7 | Incremental context compilation (optional, behind flag) | ~200 changed | PR 1, 2, 5 |

**PRs 1-2** are pure library additions — zero risk to existing functionality.
**PRs 3-5** improve existing behaviour — measurable with benchmarks.
**PRs 6-7** are new capabilities — behind feature flags.

### A.6 Evaluation Harness

To make the PRs compelling, each needs benchmarks:

```
Benchmark: "Long coding session" (50 turns, mixed file reads + edits + test runs)

| Metric                    | Aider baseline | + Gardener | Improvement |
|---------------------------|---------------|------------|-------------|
| Compaction events         | 3             | 0-1        | 66-100%     |
| Compaction wall-clock     | 90-360s total | 0-30s      | 92-100%     |
| Recall accuracy (turn 45  |               |            |             |
|   asking about turn 5)    | ~40%          | ~85%       | 2x          |
| Total tokens billed       | 1.2M          | ~600k      | 50%         |
| Session usable length     | ~40 turns     | ~80+ turns | 2x          |
```

The benchmark script replays a recorded session (50 turns of realistic coding) with and without the gardener, measuring token counts, compaction events, and recall accuracy at various distances.

---

## Appendix B: Claude Code Source Analysis and Upstream Proposal

### B.1 Objective

Download the Claude Code source from `github.com/anthropics/claude-code`, study the real compaction implementation, map the gardener's features to specific files and functions, and produce a polished proposal document (`PLAN_CLAUDE_CODE_INCREMENTAL_COMPACTION.md`) that:

1. References actual file paths and function names in the Claude Code codebase
2. Shows working code from the Phase 1 plugin as evidence
3. Includes benchmark data from the Aider prototype (Appendix A) as proof of concept
4. Proposes specific, minimal changes to Claude Code's internals
5. Is compact enough to be read in 10 minutes

### B.2 Steps

#### B.2.1 Clone and Study

```bash
git clone https://github.com/anthropics/claude-code.git
```

**Target files to study (expected locations — verify against real source):**

| Area | Likely Location | What to Look For |
|------|----------------|------------------|
| Message history | `src/messages/` or `src/conversation/` | How messages are stored, the array structure |
| Compaction trigger | `src/compaction/` or in the agent loop | The 98% threshold, the LLM call |
| Token counting | `src/tokens/` or `src/models/` | How context usage is calculated |
| Hook system | `src/hooks/` | PreCompact, PostToolUse dispatch |
| MCP integration | `src/mcp/` | How tool results enter the message history |
| Tool results | `src/tools/` | How Read, Bash, etc. return content |

#### B.2.2 Map Gardener to Claude Code Internals

For each Phase 2 feature, identify:
1. The exact file and function that would change
2. The minimal diff (pseudocode, not a real patch — respect the proprietary license)
3. Backwards compatibility: does this break anything for users who don't install the gardener?

**Template for each feature:**

```markdown
### Feature: Context Window Mutation

**File:** `src/conversation/history.ts` (line ~XXX)
**Function:** `appendToolResult()`
**Current behaviour:** Appends tool result to messages array, immutable after append.
**Proposed change:** Accept optional `metadata.replace_after_ms` and `metadata.replacement`.
  Schedule a timer. When it fires, replace `messages[index].content` with `replacement`.
**Backwards compatible:** Yes — metadata is optional, no change if absent.
**Evidence:** Aider prototype (Appendix A.3.1) shows 50% token reduction with this pattern.
**Diff size:** ~40 lines changed, ~20 lines new.
```

#### B.2.3 Produce the Proposal Document

**Target:** `PLAN_CLAUDE_CODE_INCREMENTAL_COMPACTION.md` — a standalone document.

Structure:

```
# Proposal: Incremental Context Compaction for Claude Code

## Executive Summary (5 lines)
## Problem (with token billing data from real sessions)
## Solution Overview (the gardener architecture)
## Evidence
  - Phase 1 plugin: working, published, N users
  - Aider prototype: benchmarks showing 2x session length, 50% token reduction
## Proposed Changes to Claude Code (5 features, each ~20 lines of pseudocode)
  1. Message mutation API (PostToolUse hook response)
  2. Token budget exposure (new environment variable in hooks)
  3. Content priority metadata (MCP tool result extension)
  4. Tool result size limits with overflow handler
  5. Custom compaction provider (PreCompact hook response)
## Migration Path (all changes are additive, behind flags)
## Risks and Mitigations
## Appendix: Full Plugin Source (link to repo)
## Appendix: Aider PR Chain (links to PRs)
```

#### B.2.4 Compaction Pass on the Proposal Itself

Before publishing, run the gardener's own prose compressor on the document. The proposal should demonstrate its own thesis — it should be the most efficiently written document in the repository.

Target: < 500 lines. Every sentence earns its place.

### B.3 Delivery

1. Publish the Phase 1 plugin to npm and GitHub (`claude-context-gardener`)
2. Submit the Aider PR chain (Appendix A.5)
3. Place `PLAN_CLAUDE_CODE_INCREMENTAL_COMPACTION.md` in the plugin repository
4. Open a GitHub Discussion on `anthropics/claude-code` linking to:
   - The working plugin
   - The Aider prototype with benchmarks
   - The proposal document
5. Post to the Claude Code community (Discord, GitHub Discussions) for visibility

### B.4 What Success Looks Like

| Outcome | Indicator |
|---------|-----------|
| **Minimum** | Plugin works, we use it daily, sessions are measurably longer |
| **Good** | Aider PRs merged, community adoption, forks/contributions |
| **Great** | Anthropic acknowledges the proposal, opens a dialogue |
| **Ideal** | Claude Code ships Phase 2 features natively, gardener becomes redundant |

The gardener's ultimate success is making itself unnecessary.

---

## Appendix C: Getting Anthropic's Attention

### C.1 Reality Check

Papers, followers, and open-source fame are vanity metrics. Anthropic's engineers don't decide what to build based on who's asking — they respond to **working code that solves a problem they know they have**. A veteran consultant who ships a working prototype is more credible than an influencer with a blog post.

The profile — 53, codes daily, 30+ year career, Equal Experts consultant — is fine. It signals reliability and practical engineering judgement, which is exactly what a proposal like this needs.

### C.2 Strategies (Ranked by Effectiveness)

#### 1. A working thing that people use (~80% of the strategy)

Everything else is distribution. The plugin works, it's on npm, it has a README with a before/after showing a 3-minute compaction pause becoming instant. Someone installs it, their sessions last twice as long, they tell someone.

Anthropic's DevRel and product team monitor npm packages in the Claude Code ecosystem, GitHub Discussions on their repo, and Discord. A package with 50+ weekly downloads gets noticed internally faster than any cold email.

#### 2. GitHub Discussion on anthropics/claude-code

Not an Issue (those are for bugs). A **Discussion** in the Ideas category. Title it as the problem, not the solution:

> "Context compaction takes 30-120s and loses information — here's a working alternative"

Structure:
- 5 lines: the problem (everyone who uses Claude Code feels this)
- 5 lines: what the plugin does
- Benchmark numbers (before/after)
- `npm install claude-context-gardener`
- Link to the Aider PRs as evidence it's not Claude-specific

A Discussion with 20+ upvotes and active comments becomes a product conversation internally.

#### 3. The Aider PR chain

The credibility anchor. It says: "I didn't just talk about it, I implemented it in a real codebase, it was reviewed by maintainers, and it was merged." If Paul Gauthier (Aider's creator) engages with the PRs, that's a signal Anthropic notices — they watch what competitors adopt.

Even if the PRs aren't merged, the discussion thread demonstrates technical depth.

#### 4. Equal Experts as a channel

The underused asset. Equal Experts has ~1,000 consultants across major enterprises. If the plugin works well:

- Write it up as an internal EE blog post or playbook entry
- Present it at an EE community of practice session
- If EE has an Anthropic commercial relationship (likely — they advise enterprises on AI adoption), the account team can mention it in a partner conversation

Enterprise adoption signal ("our consultants at Client X use this") carries more weight with Anthropic's business team than any number of Twitter followers.

#### 5. One blog post in the right place

Not Medium. Not a personal blog. Target:

- **dev.to** — high SEO, Anthropic's DevRel reads it
- **Hacker News** — submit as "Show HN: I built incremental context GC for Claude Code"

HN rewards the content, not the author. A well-written Show HN with a working demo from a clearly experienced engineer does well precisely because it's not marketing. Even 30 upvotes puts it on Anthropic's radar — their team monitors HN mentions of Claude.

#### 6. Direct contact (lowest effort, lowest odds, nonzero)

- Anthropic's Claude Code team has public GitHub profiles from their commits. A respectful, concise message linking to the Discussion and the npm package. Not a pitch — "built this, thought you might find the approach interesting"
- If Equal Experts has any Anthropic contacts through sales or partnerships, a warm introduction is worth 100 cold DMs

### C.3 What to Avoid

- **Don't oversell.** "Here's a plugin that helps, here are the numbers" beats "revolutionary paradigm shift"
- **Don't submit a PR to anthropics/claude-code.** It's proprietary — the PR will be closed and the signal is negative ("didn't read the licence")
- **Don't write a long proposal without working code.** The code is the proposal
- **Don't chase engagement metrics.** 50 real users who keep it installed > 5,000 stars from people who never use it

### C.4 The Sequence

```
1. Build Phase 1 plugin                          (~2-3 days)
2. Publish to npm + GitHub                        (1 hour)
3. Use it yourself for 1-2 weeks, fix rough edges (ongoing)
4. Submit Aider PRs                               (~1 week)
5. Open GitHub Discussion on anthropics/claude-code (1 hour)
6. Show HN post                                   (1 hour)
7. EE internal write-up / partner channel          (if applicable)
```

Steps 1-3 are the only ones that matter. Steps 4-7 are distribution — they amplify what's already working. Skip any of 4-7 and it doesn't change the outcome much. Skip step 1 and nothing else matters.

### C.5 The Uncomfortable Truth About Attention

The tech industry has a bias toward youth, novelty, and visibility. But it also has an older, quieter bias: **engineers trust engineers who ship**. The most effective signal isn't "look at me" — it's "look at this thing I built, it works, here are the numbers, you can install it right now."

That signal is profile-independent. It works whether you're 23 with 50k followers or 53 with none.

# Feedback

Let me see the truncated middle section too.Alright, I've read the whole thing. This is an exceptionally well-thought-out plan, Antony. Here's my honest assessment:

**What's genuinely strong:**

The core insight is spot-on. Framing compaction as garbage collection is exactly the right analogy — incremental GC replaced stop-the-world GC decades ago for the same reasons. The fact that context compaction is still a "stop the world" event in 2026 is a real gap. Everyone who uses Claude Code long enough has felt that 30-120 second pause and the amnesia that follows.

The Phase 1 architecture is credibly buildable. Content classification via regex battery, algorithmic compressors per type, SQLite with FTS5, local embeddings — none of this is exotic. It's the kind of boring, reliable engineering that actually ships. The compression ratios you're targeting (0.08 for logs, 0.35 for code) seem realistic given the algorithms described.

The phased structure is politically astute. Phase 1 proves the concept without needing anyone's permission. Phases 2-3 become a roadmap that Anthropic can evaluate *with evidence*. The Aider PR chain as a credibility anchor is clever — it forces the conversation from "interesting idea" to "here's what happens when you actually do this."

Appendix C is the most clear-eyed "how to get a platform company's attention" strategy I've read. The hierarchy — working thing > GitHub Discussion > PRs on a competitor > blog posts > cold outreach — is exactly right. The line "The code is the proposal" should be the project's motto.

**Where I'd push back or flag risks:**

The **prose compressor** is the weakest link. TextRank on short conversational fragments is going to produce choppy, incoherent output. LLM responses and documentation have discourse structure that Jaccard-similarity-on-word-sets doesn't capture well. You might get 40% compression but with 30% meaning loss. I'd either lower your expectations here or lean harder on the async LLM refinement pass being non-optional for prose.

The **10-14 day estimate** feels optimistic for something polished enough to publish. The core classifiers and compressors — sure, maybe a week. But the code compressor with AST parsing across languages, the embedding pipeline with sqlite-vss, the background gardener loop, tests, and a README good enough for npm adoption? I'd budget 3-4 weeks to get it to "someone else can install this and it works."

**PreCompact hook limitations** — you're depending on this hook being able to inject meaningful state into the compaction input. But if Claude Code's compaction prompt is already heavily structured, your injected block might get squeezed or ignored by the summarising model. Have you verified what the PreCompact hook can actually influence? If it can only append text that the LLM then summarises *along with everything else*, the benefit is smaller than the plan assumes.

**The "recall" UX gap** — Phase 1 requires Claude to *know* it should call `recall()`. But Claude doesn't know what it's forgotten. After compaction, the agent has a summary and no awareness of what details were lost. You mention injecting "Use recall() to retrieve earlier context if needed" via the PreCompact hook, but that's a generic nudge, not context-specific. The model won't know *what* to recall unless the user explicitly asks about something from earlier. This is the fundamental limitation of Phase 1 that Phase 2 (mutation API) solves — and it's worth being explicit about this gap in the README so users don't expect magic.

**Cross-session persistence** (your open question #4) — I'd say yes, default on, per-project. The store is essentially a project-specific knowledge base that accumulates over sessions. That's more valuable than a single-session cache. Privacy concerns (open question #5) are real but solvable — encrypt at rest, key derived from the user's system, and document it clearly.

**One thing missing:** There's no mention of how this interacts with Claude Code's existing `/compact` command or its configurable compaction settings. If a user has custom compaction prompts or has tweaked their settings, the gardener needs to play nicely with that. Worth a compatibility section.

**Overall verdict:** This is a serious piece of work. It reads like a plan written by someone who's going to actually build it rather than just talk about it, which is exactly what Appendix C says matters. The GC analogy, the phased strategy, and the "make itself unnecessary" design philosophy are all strong. The main risk is the prose compressor quality and the recall UX in Phase 1 being underwhelming enough to hurt first impressions. I'd nail the log and code compressors first — those have the clearest win — and ship a v0.1 without prose compression or embeddings, then iterate.

Build step 1. Everything else follows from that.

