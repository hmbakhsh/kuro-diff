# T3 Code + Claude Agent SDK Integration

Research notes on how `pingdotgg/t3code` integrates with the Anthropic Claude Agent SDK — for use as a reference when building a wrapper around the SDK layer.

## 1. Repo identity

The repo is **[`pingdotgg/t3code`](https://github.com/pingdotgg/t3code)** — Theo's (ping.gg / t3.gg) desktop GUI for managing AI coding agents. It integrates with the Claude Agent SDK (renamed from Claude Code SDK), not the bare Anthropic Messages API.

Course corrections to rule out:

- `t3-oss/*` (e.g. `create-t3-app`, `create-t3-turbo`) — unrelated TypeScript app starter; no Claude Code SDK integration.
- `t3.chat` — Theo's web chatbot; talks to many models via its own router, not the Claude Code SDK. (`vibheksoni/t3router` is a third-party Rust client to t3.chat's API; also unrelated.)
- `T3-Content/claude-blocker`, `zortos293/t3code-copilot` — community/related repos, not the target.

Stack: Bun + Effect-TS Turborepo monorepo. Integration lives in the `apps/server` workspace.

## 2. SDK integration layer

**Package imported:** `@anthropic-ai/claude-agent-sdk` (the new name for the Claude Code SDK).

```json
// apps/server/package.json
"@anthropic-ai/claude-agent-sdk": "^0.2.111"
// scripts/package.json
"@anthropic-ai/claude-agent-sdk": "^0.2.77"
```

**How sessions are spawned.** Each session is started by calling the SDK's `query({ prompt, options })`. The SDK itself spawns the `claude` CLI as a subprocess; T3 Code does not spawn it directly. T3 passes `pathToClaudeCodeExecutable` (resolved from user settings) so the SDK launches the user's installed CLI binary.

Per-thread/per-session: one `query()` instance per logical "thread" (user conversation). Sessions are kept in a `Map<ThreadId, ClaudeSessionContext>` in process memory.

The "prompt" is a streaming async iterable (`Stream.fromQueue(promptQueue).pipe(...).toAsyncIterable`) so the same `query()` lifecycle stays open across multiple user turns — T3 enqueues new `SDKUserMessage` items for each turn rather than spinning up a new subprocess.

**Concurrent isolation.** Each thread gets its own:

- `Queue.unbounded<PromptQueueItem>` (the prompt iterable)
- `ClaudeQueryRuntime` (one `query()` instance / one CLI subprocess)
- in-flight tool / pending-approval / pending-user-input maps
- streaming Fiber forked via `runFork`

Sessions never share state; the SDK subprocess provides the strong isolation boundary.

**Capabilities probe (interesting trick).** Before any user prompt, T3 spawns a *throwaway* Claude session that yields nothing on its prompt iterable, calls `query.initializationResult()` to get account info + slash commands, then aborts the process. No tokens consumed. See `probeClaudeCapabilities` (`ClaudeProvider.ts:583-620`). Result is cached for 5 minutes via `Cache.make({ capacity: 1, timeToLive: Duration.minutes(5) })`.

## 3. State management

State lives in **three layers**:

1. **In-memory `ClaudeSessionContext`** (`ClaudeAdapter.ts:152-174`) — the runtime truth: turns, in-flight tools, pending approvals, prompt queue, last-known token usage, last assistant UUID.

2. **Resume cursor on the session object** — small persisted struct with the data needed to *re-attach* to a Claude session next time: `{ threadId, resume (sessionId UUID), resumeSessionAt, turnCount }`. Built in `updateResumeCursor` (`ClaudeAdapter.ts:1058`) and passed into the SDK as `options.resume` when re-opening:

   ```ts
   ...(existingResumeSessionId ? { resume: existingResumeSessionId } : {}),
   ...(newSessionId ? { sessionId: newSessionId } : {}),
   ```

3. **SQLite event store** (`apps/server/src/persistence/`) — event-sourced. There are 26+ migrations, including `OrchestrationEvents`, `Projections`, `ProviderSessionRuntime`. Canonical runtime events from the adapter (`session.started`, `turn.started`, `content.delta`, `item.completed`, `request.opened`, `thread.token-usage.updated`, `turn.completed`, `session.exited`, etc.) are projected into SQLite tables — NOT raw SDK messages.

   In addition, raw native SDK messages are optionally tee'd to an NDJSON file via `EventNdjsonLogger` (`logNativeSdkMessage`, `ClaudeAdapter.ts:1001`) for debugging.

**What the SDK gives back vs. what T3 stores.** The SDK returns `SDKMessage` objects (`assistant`, `user`, `stream_event`, `system`, `result`). T3 normalizes these into a *canonical* event vocabulary in `runtimeEventQueue` (a `Queue.unbounded<ProviderRuntimeEvent>`). Downstream consumers (web UI, persistence) only see canonical events. The raw SDK payload is attached as `raw: { source: "claude.sdk.message", method, payload }` for traceability.

**Tool-call streaming.** Partial tool input is buffered in `inFlightTools: Map<number, ToolInFlight>` keyed by content-block index. Tool-result blocks are matched back via `tool_use_id` (`toolResultBlocksFromUserMessage`). Assistant text streams are reconstructed from `content_block_delta` (`text_delta` / `thinking_delta`) into `AssistantTextBlockState` records and finalized when the block closes or the turn ends.

## 4. Lifecycle

- **Spawn** — `startSession` (`ClaudeAdapter.ts:2478`):
  1. If a session already exists for the threadId, stop the old one (best-effort).
  2. Read resume state from the persisted cursor.
  3. Build `ClaudeQueryOptions` (see §5).
  4. Call `createQuery({ prompt, options })` (defaults to SDK's `query()`).
  5. Fork a Fiber running `runSdkStream` which is `Stream.fromAsyncIterable(context.query, ...).runForEach(handleSdkMessage)`.
  6. Emit `session.started`, `session.configured`, `session.state.changed: ready`.

- **Send turn** — `sendTurn` (`ClaudeAdapter.ts:3044`):
  1. If a stale `turnState` exists, auto-complete it.
  2. If model changed, call `context.query.setModel(apiModelId)`.
  3. If `interactionMode === "plan"`, call `context.query.setPermissionMode("plan")`.
  4. Build `SDKUserMessage` (text + base64 image attachments) and enqueue it onto the promptQueue. The streaming `query()` consumes the next message.
  5. Emit `turn.started`.

- **Streaming response handling** — `handleSdkMessage` switches on SDK message type and emits canonical events. `stream_event` deltas → `content.delta`. `assistant` → text-block bookkeeping. `user` (tool_result) → `item.completed` for command/file outputs. `result` → `turn.completed` with usage / cost / status (`completed | interrupted | cancelled | failed`).

- **Interrupt** — `interruptTurn` calls `context.query.interrupt()` (SDK API).

- **Shutdown** — `stopSessionInternal` (`ClaudeAdapter.ts:2381`):
  1. Cancel all pending approvals (resolve as `"cancel"`).
  2. Complete any active turn as `"interrupted"`.
  3. `Queue.shutdown(context.promptQueue)` — closes the prompt async-iterable, which lets the SDK exit cleanly.
  4. Interrupt the streaming Fiber.
  5. Call `context.query.close()` (try/catch — surfaces as `runtime.error`).
  6. Mark session `closed`, emit `session.exited`.
  - A scope finalizer (`Effect.addFinalizer`) stops *all* sessions on layer teardown.

- **Errors / timeouts.** `handleStreamExit` distinguishes interrupt-only causes (treated as "interrupted") from real failures (emit `runtime.error` + complete turn as failed). Provider health probes use explicit `Effect.timeoutOption(DEFAULT_TIMEOUT_MS)` and `AUTH_PROBE_TIMEOUT_MS`.

## 5. Auth / config

T3 Code is **CLI-relay**, not API-key-direct. The auth model is: user runs `claude auth login` once in their terminal, T3 just shells out via the SDK.

- **Auth status** detected by spawning `claude auth status` (`runClaudeCommand(["auth", "status"])`, `ClaudeProvider.ts:622-631`) and parsing its (sometimes JSON) output for `subscriptionType` / `authMethod` / login state.
- **API keys** are not handled in the adapter. `env: process.env` is forwarded to the subprocess, so `ANTHROPIC_API_KEY` etc. flow through if set.
- **Working directory.** From `input.cwd` → passed as `cwd` and also `additionalDirectories: [input.cwd]`.
- **Allowed tools.** Not allowlisted in normal sessions — instead, every tool call goes through the SDK's `canUseTool` callback (`canUseToolEffect`). The capability probe uses `allowedTools: []`.
- **Permission mode.** Mapped from T3's `runtimeMode`:

  ```
  "auto-accept-edits" → "acceptEdits"
  "full-access"       → "bypassPermissions" (+ allowDangerouslySkipPermissions: true)
  ```

  At turn time, `interactionMode: "plan"` switches the live session via `query.setPermissionMode("plan")`.
- **Setting sources.** Always passes `settingSources: ["user", "project", "local"]` so user/project `.claude` config is honored.
- **MCP servers.** Not configured by T3 — they're pulled in via the `settingSources` (i.e. `~/.claude/settings.json` and project `.claude/settings.json`). T3 Code intentionally defers MCP config to the underlying Claude config files.
- **Extra args.** `claudeSettings.launchArgs` is parsed via `parseCliArgs` and forwarded as `extraArgs`.
- **Effort/reasoning.** Maps T3's UI selection to SDK `effort`. `xhigh` is rewritten to `max` for the CLI. `ultrathink` is filtered out and instead injected as a prompt prefix (`applyClaudePromptEffortPrefix`).
- **1M context.** Encoded by suffixing the model id (`claude-opus-4-7[1m]`) — `resolveClaudeApiModelId`.
- **Image attachments.** Read from `attachmentsDir` and base64-embedded as `{type:"image", source:{type:"base64", media_type, data}}` content blocks. MIME types restricted to `image/{gif,jpeg,png,webp}`.

The full `ClaudeQueryOptions` construction is at `ClaudeAdapter.ts:2867-2891` — single most important snippet for a wrapper author:

```ts
const queryOptions: ClaudeQueryOptions = {
  ...(input.cwd ? { cwd: input.cwd } : {}),
  ...(apiModelId ? { model: apiModelId } : {}),
  pathToClaudeCodeExecutable: claudeBinaryPath,
  settingSources: [...CLAUDE_SETTING_SOURCES], // ["user","project","local"]
  ...(effectiveEffort ? { effort: effectiveEffort } : {}),
  ...(permissionMode ? { permissionMode } : {}),
  ...(permissionMode === "bypassPermissions"
    ? { allowDangerouslySkipPermissions: true } : {}),
  ...(Object.keys(settings).length > 0 ? { settings } : {}),
  ...(existingResumeSessionId ? { resume: existingResumeSessionId } : {}),
  ...(newSessionId ? { sessionId: newSessionId } : {}),
  includePartialMessages: true,
  canUseTool,
  env: process.env,
  ...(input.cwd ? { additionalDirectories: [input.cwd] } : {}),
  ...(Object.keys(extraArgs).length > 0 ? { extraArgs } : {}),
};
```

## 6. Key files

All paths relative to repo root, `pingdotgg/t3code`:

- `apps/server/src/provider/Layers/ClaudeAdapter.ts` (3263 lines) — **the integration** (session lifecycle, SDK message normalization, tool approvals, attachments, errors). Hot zones:
  - `ClaudeAdapter.ts:9-21` — SDK type imports (`query`, `Options`, `PermissionMode`, `SDKMessage`, `CanUseTool`, etc.).
  - `ClaudeAdapter.ts:152-174` — `ClaudeSessionContext` shape.
  - `ClaudeAdapter.ts:979-988` — default `createQuery` factory; injectable for tests.
  - `ClaudeAdapter.ts:2478-3040` — `startSession` (the heart of spawn).
  - `ClaudeAdapter.ts:2867-2891` — `ClaudeQueryOptions` build.
  - `ClaudeAdapter.ts:2665-2818` — `canUseToolEffect` (`AskUserQuestion`, `ExitPlanMode`, approval flow).
  - `ClaudeAdapter.ts:3044-3135` — `sendTurn`.
  - `ClaudeAdapter.ts:2381-2455` — `stopSessionInternal`.
  - `ClaudeAdapter.ts:2342-2348` — `runSdkStream` (the SDK consumption loop).
  - `ClaudeAdapter.ts:1058-1076` — `updateResumeCursor` (resume token shape).
  - `ClaudeAdapter.ts:1390-1563` — `completeTurn` (token-usage normalization, in-flight tool flush, `turn.completed`).

- `apps/server/src/provider/Layers/ClaudeProvider.ts` (929 lines) — provider health/probe layer:
  - `ClaudeProvider.ts:583-620` — `probeClaudeCapabilities` (the never-yielding-prompt trick).
  - `ClaudeProvider.ts:622-631` — `runClaudeCommand` shells `claude` directly for `--version` and `auth status`.
  - `ClaudeProvider.ts:56-184` — built-in model catalog (Opus 4.7/4.6/4.5, Sonnet 4.6, Haiku 4.5) with capability descriptors.
  - `ClaudeProvider.ts:890-929` — `ClaudeProviderLive` Effect Layer.

- `apps/server/src/provider/Layers/ClaudeAdapter.test.ts` — exercise of the adapter; great reading for "how is `createQuery` mocked".
- `apps/server/src/provider/Services/ClaudeAdapter.ts`, `ClaudeProvider.ts` — Effect Service (interface) declarations.
- `apps/server/src/provider/Layers/EventNdjsonLogger.ts` — raw SDK message tee.
- `apps/server/src/persistence/Migrations/` — SQLite schema for canonical events.
- `apps/server/package.json` — pins `@anthropic-ai/claude-agent-sdk@^0.2.111`.

## 7. Gotchas / wrapper advice

- **It uses `@anthropic-ai/claude-agent-sdk`, not `@anthropic-ai/claude-code`.** That's the renamed SDK. T3 Code requires the user to have the standalone `claude` CLI installed and authenticated — T3 does not bundle it. A wrapper can either (a) inherit this BYO-CLI model (dodges Anthropic ToS issues that bit OpenCode), or (b) embed the SDK and ship a CLI itself.
- **Sessions are kept open across turns.** The streaming `query()` does NOT return after a turn completes; T3 holds the prompt async-iterable open and feeds it more `SDKUserMessage`s. Don't call `query()` per turn — you'll lose state and reauth/spawn every time.
- **Resume tokens are *Claude session UUIDs* + a cursor**, not opaque tokens. Validated with a UUID regex; "synthetic" thread IDs (`claude-thread-*`) are rejected. If you store resume cursors, expect SDK-version drift.
- **The capabilities probe trick** (yield-never prompt + `initializationResult()` + abort) is the cleanest way to get account/plan info and slash-command catalog without burning tokens. Worth lifting verbatim.
- **`canUseTool` is a userspace callback; the SDK awaits it.** Long approval waits hold up the SDK's tool-execution turn. T3 wires it through Effect's `Deferred` so abort signals propagate cleanly. Don't block forever without honoring `callbackOptions.signal.aborted`.
- **`ExitPlanMode` is intercepted** — T3 captures the plan, denies the tool, and tells Claude to stop. If you want plan-mode to actually proceed (apply changes), you'll have to remove that interception.
- **`AskUserQuestion` is a special-cased tool** — surfaces as a `user-input.requested` runtime event with structured options/multi-select. Plan mode relies on it heavily.
- **Token usage in `result.usage` is *cumulative*, not current context.** T3 uses `lastKnownTokenUsage` from `task_progress` events as the authoritative current-context-window number and treats `result.usage` totals as `totalProcessedTokens`. This is documented in a long comment at `completeTurn`.
- **`includePartialMessages: true` is on.** You get `stream_event` messages with deltas — but they have non-monotonic indices when blocks reorder, so synthetic-block-index bookkeeping (`nextSyntheticAssistantBlockIndex`) is required.
- **MCP servers are NOT configured programmatically.** They come from `~/.claude/settings.json` via `settingSources`. If a wrapper wants to inject an MCP server, it must either write to those files or extend `ClaudeQueryOptions` with `mcpServers` (the SDK supports this; T3 just doesn't use it).
- **Concurrency.** Multiple sessions = multiple `claude` subprocesses. Each spawns a Node-on-Node CLI; memory cost is real. T3 has a `ProviderSessionReaper` (see `ProviderSessionReaper.ts`) to GC idle sessions — worth replicating.
- **Model-switch mid-session** uses `query.setModel(apiModelId)`. Effort changes do NOT — they're computed at session start and require a new session to change in the CLI flag, but the *prompt-injected* effort (`ultrathink`) is per-turn.
- **Permission-mode mid-session** uses `query.setPermissionMode(...)`. T3 stores `basePermissionMode` so it can restore on `interactionMode === "default"`.
- **Cleanup ordering matters.** `stopSessionInternal` drains pending approvals → completes turn → shuts down promptQueue (this is what makes the SDK exit gracefully) → interrupts the stream Fiber → calls `query.close()`. Skipping the queue shutdown can leave the subprocess hanging.
- **Effect-TS coupling.** The whole module is written in Effect-TS with Layers, Fibers, Queues, Refs, Streams, Deferred. Lifting the logic into a plain Node/Promise wrapper is feasible but non-trivial — the bookkeeping for assistant-text blocks and tool-result correlation is the hardest part to port.
- **Native event log.** `EventNdjsonLogger` writes raw SDK messages to NDJSON if a path is configured. Excellent debug aid; recommend keeping in any wrapper.
- **Testability hook.** `makeClaudeAdapterLive({ createQuery: customMock })` lets you swap in a fake `query()` factory. T3 uses this for unit tests; a wrapper can use the same shape to record/replay or to A/B SDK versions.

## Sources

- [GitHub — pingdotgg/t3code](https://github.com/pingdotgg/t3code)
- [T3 Code: An Open-Source GUI for Managing AI Coding Agents — Better Stack](https://betterstack.com/community/guides/ai/t3-code/)
- [Theo on X: T3 Code now supports Claude](https://x.com/theo/status/2034831968463200359)
