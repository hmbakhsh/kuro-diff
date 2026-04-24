---
title: kuro-diff — macOS Electron AI Code Review Workstation
type: feat
status: active
date: 2026-04-24
origin: docs/brainstorms/2026-04-24-kuro-diff-brainstorm.md
---

# kuro-diff — macOS Electron AI Code Review Workstation

## Overview

kuro-diff is a macOS desktop application (Electron 35+ / TanStack Router / TanStack Query / React 19 / shadcn/ui / Tailwind 4) that replaces a traditional code editor with a **read-only review-and-extract** workflow for developers who have stopped writing code themselves and now iterate with AI agents. The user opens a local repo (or browses GitHub PRs), inspects diffs and files in a polished viewer built on Pierre's `@pierre/diffs` and `@pierre/file-tree` components, and uses a first-class "Copy for agent" action to hand hunks/paths/context back to Claude/Cursor/etc. Git worktrees are auto-discovered and grouped under the base repo in the workspace sidebar.

The app ships as a notarized `.dmg` with auto-update via GitHub Releases. No editing, no agent execution, no review-state persistence — scope is deliberately narrow.

## Problem Statement

Existing code editors (VS Code, Cursor, Zed) are built for writers. When your workflow is 100% "review what an agent produced and react," the editor UX fights you: edit affordances are everywhere, diff viewers are second-class, PR review requires browser context-switching, and there's no single action that gives you "a pastable block representing this chunk of the change."

GitHub's web UI is the closest adjacent tool, but it requires a browser, loads slowly, has no local-filesystem awareness, can't see uncommitted working-tree state, and has no concept of the multiple git worktrees power users use to run parallel agent sessions.

We need a native-feeling macOS app purpose-built for the "read, understand, copy back to agent" loop — with a cohesive, shadcn-grade UI that feels like a real product, not a dev tool. _(See brainstorm: [docs/brainstorms/2026-04-24-kuro-diff-brainstorm.md](../brainstorms/2026-04-24-kuro-diff-brainstorm.md))_

## Proposed Solution

A single-window Electron app with a three-pane layout:

```
┌──────────────────────────────────────────────────────────────────┐
│ [macOS traffic lights]   [route / breadcrumb]        [theme][≡]  │  titlebar (hiddenInset)
├──────────────┬───────────────────────────────────────────────────┤
│ Workspace    │                                                   │
│  ▸ kuro-diff │              Main View                            │
│    ▸ main    │                                                   │
│    ▸ wt/exp  │   ┌─ Files ─┬─ Diffs ─┬─ PRs ─┐                   │
│  ▸ webapp    │   │                                               │
│    ▸ main    │   │   @pierre/file-tree   @pierre/diffs           │
│              │   │                                               │
├──────────────┤   │                                               │
│ + Add repo   │   │                                               │
└──────────────┴───────────────────────────────────────────────────┘
```

- **Left sidebar** — `<Workspace>` component listing all added repos, each expanded to show its worktrees (auto-discovered via `git worktree list --porcelain -z`). Sidebar uses macOS vibrancy.
- **Main area** — routed tab surface with three primary modes:
  - **Files** — split pane: `@pierre/file-tree` on left, Shiki-highlighted read-only file on right
  - **Diffs** — base/head ref picker + `@pierre/diffs` `<PatchDiff>` view (unified + split toggle)
  - **PRs** — GitHub PR list with search/filter + drill-into a single PR (diff + metadata)
- **Floating "Copy for agent" palette** — accessible via `Cmd+Shift+C` on any selection; produces a structured Markdown block with repo, path, line range, and hunk content.

The app is strictly read-only to disk: no edits, no `git write` commands, no mutation of the repos it opens. This is both a product principle and a security posture.

## Technical Approach

### Architecture

**Process model** (Electron 35+, hardened defaults):

```
┌─────────────────────────────────────────────────────────────┐
│                   MAIN PROCESS (Node)                        │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐   │
│  │   git    │  │ octokit  │  │safeStore │  │  windows   │   │
│  │ service  │  │ service  │  │ tokens   │  │  menu      │   │
│  └────┬─────┘  └────┬─────┘  └────┬─────┘  └──────┬─────┘   │
│       └─────────────┴─────────────┴────────────────┘        │
│                     │                                        │
│                tRPC Router                                   │
│                     │                                        │
│          ipcMain.handle('trpc', …)                           │
└─────────────────────┼────────────────────────────────────────┘
                      │
              contextBridge (preload)
                      │
┌─────────────────────┼────────────────────────────────────────┐
│                     │     RENDERER (sandboxed)               │
│                tRPC Client (trpc-electron)                   │
│                     │                                        │
│          @tanstack/react-query ⇄ @tanstack/react-router      │
│                     │                                        │
│           React 19 + shadcn/ui + Tailwind 4                  │
│     ┌───────────┬───────────┬───────────┬────────────┐       │
│     │ Workspace │  Files    │   Diffs   │    PRs     │       │
│     └───────────┴───────────┴───────────┴────────────┘       │
│                     │                                        │
│        @pierre/diffs   @pierre/file-tree   shiki             │
└──────────────────────────────────────────────────────────────┘
```

- **Main process** owns: `git` subprocesses, Octokit client, safeStorage for tokens, filesystem watchers (`chokidar`) for repo state invalidation, app lifecycle/windows/menu.
- **Renderer process** is sandboxed (`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`) and talks to main only through a typed tRPC bridge.
- **Preload** exposes a single `window.trpc` surface via `contextBridge` — nothing else. All IPC flows through one channel.

### Directory Layout

Greenfield project, derived from [`CarlosZiegler/electron-tanstack`](https://github.com/CarlosZiegler/electron-tanstack):

```
kuro-diff/
├── electron.vite.config.ts
├── electron-builder.yml
├── package.json
├── tsconfig.json
├── tsconfig.node.json
├── tsconfig.web.json
├── build/                              # builder assets
│   ├── entitlements.mac.plist
│   ├── icon.icns
│   └── notarize.js
├── src/
│   ├── main/
│   │   ├── index.ts                    # app.whenReady, BrowserWindow, security headers
│   │   ├── window.ts                   # titleBarStyle hiddenInset, vibrancy, traffic lights
│   │   ├── menu.ts                     # macOS native menu (App / File / Edit / View / Window / Help)
│   │   ├── trpc/
│   │   │   ├── router.ts               # root AppRouter (exported type)
│   │   │   ├── context.ts              # per-call ctx (services)
│   │   │   └── procedures/
│   │   │       ├── workspace.ts        # add-repo, remove-repo, list-repos, list-worktrees
│   │   │       ├── fs.ts               # read-file, list-tree
│   │   │       ├── git.ts              # diff, log, status, branches, refs
│   │   │       ├── github.ts           # auth, prs.list, prs.get, prs.diff
│   │   │       └── clipboard.ts        # copy-for-agent
│   │   ├── services/
│   │   │   ├── git-service.ts          # simple-git wrapper + spawn for large diffs
│   │   │   ├── git-binary.ts           # resolve git path via login shell (PATH fix)
│   │   │   ├── worktree.ts             # parse --porcelain -z
│   │   │   ├── github-service.ts       # octokit wrapper
│   │   │   ├── github-auth.ts          # device flow + safeStorage token persistence
│   │   │   ├── workspace-store.ts      # persisted list of repos (electron-store or JSON)
│   │   │   └── fs-watcher.ts           # chokidar over .git/HEAD and refs/
│   │   └── util/
│   │       ├── safe-storage.ts         # encrypt/decrypt wrappers
│   │       └── child-process.ts        # spawn helpers (streaming, timeouts, GIT_OPTIONAL_LOCKS=0)
│   ├── preload/
│   │   └── index.ts                    # contextBridge + exposeElectronTRPC
│   ├── renderer/
│   │   ├── index.html
│   │   └── src/
│   │       ├── main.tsx                # RouterProvider + QueryClientProvider + trpc Provider
│   │       ├── trpc.ts                 # createTRPCReact<AppRouter>
│   │       ├── routes/
│   │       │   ├── __root.tsx          # shell: sidebar + outlet
│   │       │   ├── index.tsx           # welcome / add-repo cta
│   │       │   ├── settings.tsx        # github auth, font, theme
│   │       │   ├── repos.$repoId.tsx   # repo default (redirects to /files or /diffs)
│   │       │   ├── repos.$repoId.files.tsx
│   │       │   ├── repos.$repoId.files.$path.tsx
│   │       │   ├── repos.$repoId.diffs.tsx      # ?base=&head=
│   │       │   ├── repos.$repoId.prs.tsx        # list
│   │       │   └── repos.$repoId.prs.$number.tsx
│   │       ├── routeTree.gen.ts        # generated
│   │       ├── components/
│   │       │   ├── workspace/
│   │       │   │   ├── WorkspaceSidebar.tsx
│   │       │   │   ├── RepoNode.tsx
│   │       │   │   └── AddRepoButton.tsx
│   │       │   ├── files/
│   │       │   │   ├── FileTree.tsx            # wraps @pierre/file-tree
│   │       │   │   └── FileContent.tsx         # Shiki render + line gutter
│   │       │   ├── diffs/
│   │       │   │   ├── DiffView.tsx            # wraps <PatchDiff>
│   │       │   │   ├── RefPicker.tsx           # base/head typeahead
│   │       │   │   └── DiffModeToggle.tsx      # unified/split
│   │       │   ├── prs/
│   │       │   │   ├── PRList.tsx
│   │       │   │   ├── PRFilters.tsx
│   │       │   │   └── PRDetail.tsx
│   │       │   ├── copy/
│   │       │   │   └── CopyForAgentPalette.tsx # Cmd+Shift+C overlay
│   │       │   ├── layout/
│   │       │   │   ├── Titlebar.tsx
│   │       │   │   └── CommandMenu.tsx         # cmdk (Cmd+P)
│   │       │   └── ui/                         # shadcn-generated components
│   │       ├── hooks/
│   │       │   ├── useShiki.ts
│   │       │   ├── useCopyForAgent.ts
│   │       │   └── useKeyboardShortcuts.ts
│   │       ├── lib/
│   │       │   ├── copy-format.ts              # agent clipboard format
│   │       │   └── cn.ts
│   │       └── styles/
│   │           └── globals.css                 # @import "tailwindcss"; @pierre/theme tokens
│   └── shared/
│       ├── ipc-contract.ts                     # zod schemas shared main<->renderer
│       ├── types.ts                            # WorkspaceRepo, Worktree, DiffRef, PRSummary
│       └── copy-template.ts                    # single source of truth for agent-copy format
└── docs/
    ├── brainstorms/
    └── plans/
```

### Implementation Phases

#### Phase 1 — Project Scaffold, Electron Security, IPC Contract (Days 1–3)

Scaffold the project from `CarlosZiegler/electron-tanstack` (pin Electron to a patched version: `35.7.5+` / `36.8.1+` / `37.3.1+` — never shipped at <35.7.5 due to ASAR integrity CVE GHSA-vmqv-hx8q-j7mg).

Tasks:
- `pnpm create electron-vite` or clone starter, rename to `kuro-diff`, strip demo routes. Requires Node 20.19+ / 22.12+ and Vite 5+.
- Apply hardened security baseline in `src/main/index.ts`:
  - `BrowserWindow` opts: `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`, `webSecurity: true`
  - CSP via `session.defaultSession.webRequest.onHeadersReceived` — **call inside `app.whenReady()`**, not before (pre-ready crash, electron/electron#42000)
  - Header value — `default-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https://avatars.githubusercontent.com; connect-src 'self' https://api.github.com; font-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'`. In dev, also allow `ws:` in `connect-src` and `'unsafe-eval'` in `script-src` for HMR (gate on `is.dev`).
  - `will-navigate` → `e.preventDefault()` for non-app origins; `setWindowOpenHandler` → return `{ action: 'deny' }` and conditionally `shell.openExternal(url)` for allowlisted hosts.
- Enable Electron Fuses (`@electron/fuses` with `FuseVersion.V1`, flipped via `afterPack` hook). Set:
  - `RunAsNode: false`, `EnableNodeOptionsEnvironmentVariable: false`, `EnableNodeCliInspectArguments: false`
  - `EnableCookieEncryption: true`, `OnlyLoadAppFromAsar: true`, `EnableEmbeddedAsarIntegrityValidation: true`
  - Re-sign after flipping; on ARM64 local builds pass `resetAdHocDarwinSignature: true`.
- Add macOS window chrome: `titleBarStyle: 'hiddenInset'`, `trafficLightPosition: { x: 12, y: 18 }`, `vibrancy: 'sidebar'`, `visualEffectState: 'active'`.
- Use `@electron-toolkit/preload`'s `electronAPI` wrapper (never expose raw `ipcRenderer`) + `@electron-toolkit/utils` (`is.dev`, `optimizer.watchWindowShortcuts`, `electronApp.setAppUserModelId`).
- Install `trpc-electron` (mat-sz fork for tRPC v11) + `@tanstack/react-query` + `@tanstack/react-router` + `@trpc/server` + `@trpc/client` + `@trpc/react-query` + `zod`.
- Wire tRPC:
  - Main: `createIPCHandler({ router: appRouter, windows: [mainWindow] })` after `app.whenReady()` and window creation
  - Preload: `process.once('loaded', () => exposeElectronTRPC())`
  - Renderer: `createTRPCClient<AppRouter>({ links: [ipcLink()] })` (tRPC v11 deprecated `createTRPCProxyClient`)
  - **Type-only export**: `export type AppRouter = typeof appRouter` from main; renderer uses `import type { AppRouter } from '../../main/router'` so no main code reaches the renderer bundle.
- Define initial IPC contract as empty procedure stubs in `src/main/trpc/procedures/*.ts` matching the `shared/ipc-contract.ts` zod schemas.
- TanStack Router config: `createHashHistory` (mandatory for `file://`), `@tanstack/router-plugin/vite` with `autoCodeSplitting: true`.
- Render a "Hello kuro-diff" root route and verify end-to-end type-safe IPC works with a single `ping` procedure.

**Exit:** blank app window opens with correct macOS chrome, tRPC echo works, security audit shows no warnings.

#### Phase 2 — Git Services & Workspace (Days 4–7)

Build the core git-backed data layer and the workspace sidebar.

Tasks:
- **`git-binary.ts`** — resolve the user's real git path. Use [`shell-env` v4.0.3](https://github.com/sindresorhus/shell-env) (`shellEnvSync()`) at startup with a 2s timeout; merge `PATH` into `process.env.PATH` only if non-empty. Fallback: append `/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin`. Cache the resolved path in `electron-store`. Pass `env: { ...process.env }` on every subsequent `spawn` call. Surface a clear modal if `which git` fails. **Not `fix-path`** — `shell-env` is polished superset that also captures `GIT_*`, `SSH_AUTH_SOCK`.
- **`git-service.ts`** — wrap `simple-git` for small ops (status, branch, log, diff-summary); use raw `child_process.spawn` with streaming for large `diff` and `log -p`. Always set `GIT_OPTIONAL_LOCKS=0` in env and pass explicit `cwd`. Timeout at 30s.
- **`worktree.ts`** — parse `git worktree list --porcelain -z`. Exact format (verified against git-scm docs):
  - Records separated by `\0\0`; attribute lines within a record separated by `\0`.
  - Attributes: `worktree <path>` (always first), `HEAD <sha>`, `branch <refname>` (full ref), `detached` (label, no value), `bare` (label), `locked [reason]`, `prunable [reason]`.
  - Primary worktree is always the first record — compare `worktree` to `git rev-parse --git-common-dir`'s parent to double-confirm.
  - Pseudo-parser: split on `\0\0` → records; split each on `\0` → lines; split each line on first space → `[label, rest]`.
- **Workspace store** — use `electron-store@^11.0.2` (ESM-only, Node 20+, Ajv JSON Schema draft-2020-12). Stores at `~/Library/Application Support/kuro-diff/config.json`. Atomic writes via tmp+rename (built-in). Schema validates `repos: WorkspaceRepo[]`, `githubAccounts: Record<login, {token, expiresAt, host}>`, `preferences: {theme, diffMode, font, copyPreset}`, `window: {bounds, sidebarWidth, diffSplitRatio}`. Include a `migrations` map from day 1 (even empty) so future shape changes don't require backfilling.
- **Add-repo flow** — accept both native dialog (`dialog.showOpenDialog` from File menu / `Cmd+O`) and drag-and-drop on the sidebar. Validate: path exists, is a dir, contains `.git` (dir or file). If the dropped path is itself a worktree (`.git` is a file pointing to a `worktrees/` entry), auto-resolve to the parent main repo via `git rev-parse --git-common-dir`.
- **Remove-repo** — right-click → "Remove from workspace" with confirm dialog. Does NOT touch disk.
- **`fs-watcher.ts`** — `chokidar@^5.0` (Nov 2025, ESM-only; v4 also fine). Watch `.git/HEAD`, `.git/packed-refs`, `.git/refs`, `.git/FETCH_HEAD`, `.git/ORIG_HEAD`, `.git/MERGE_HEAD`, `.git/index` as an explicit array (tighter than watching `.git/` with an ignore function). Options: `ignoreInitial: true`, `awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 }`, `followSymlinks: false`. FSEvents is auto-used on macOS in v4+ (no `useFsEvents` option). **Never watch `.git/objects/` or `.git/lfs/`** — floods events. Emit via tRPC subscription with per-repo debounce (100–200ms).
- **`<WorkspaceSidebar>`** — shadcn-styled collapsible tree. Repos grouped with their worktrees nested underneath. Active repo highlighted, badge shows "dirty" if working tree has uncommitted changes. `Cmd+1..9` switches repo.

**Exit:** user can add repos, see worktrees, switch between them. Sidebar state survives app restart.

#### Phase 3 — File Viewer (Days 8–11)

Selection semantics are now **known** (from deepened research — see Appendix A): no spike needed.

Tasks:
- **`FileTree.tsx`** — wraps `<FileTree from '@pierre/file-tree/react'`. Wire selection via `options.config.onPrimaryAction(item)` (fires on double-click / Enter): `if (!item.isFolder()) onSelect(item.getId())`. `item.getId()` is the full file path. For Finder-like single-click-to-open, also bind `options.config.setSelectedItems(ids)` and detect changes. **Memoize `options` via `useMemo`** — the internal `areOptionsEqual` uses reference equality and will tear down the tree on every render otherwise. The `files` array is compared element-wise; always return a new array when it changes.
- **Gitignore/dotfile filtering** — parse the repo's `.gitignore` with the `ignore` npm package and filter the paths array before passing to `<FileTree>`. Toggle for dotfiles. Toggle for "changed files only" when in diff context.
- **`FileContent.tsx`** — read file via IPC (`fs.readFile` procedure in main), render using the shared Pierre highlighter (see below). Line numbers in gutter. Line-range selection emits selection state consumed by copy-for-agent.
- **Shiki — shared singleton owned by Pierre** (critical decision, reverses original plan):
  - Pierre's `@pierre/diffs` internally uses `createHighlighter` (full bundled dist, not `shiki/core`). Calling `createHighlighterCore` from our own code creates a **second** highlighter — double memory, inconsistent theming.
  - Correct pattern:
    1. At app boot in `main.tsx`: `await preloadHighlighter({ themes: ['github-dark', 'github-light', 'pierre-dark', 'pierre-light'], langs: ['ts','tsx','js','jsx','json','md','css','html','py','rb','go'] })` from `@pierre/diffs`.
    2. In `FileContent.tsx`: `const h = await getSharedHighlighter({ themes: [...], langs: [...] })` — call is idempotent, additional langs/themes attach to the same instance.
    3. Lazy-load additional languages on first use via the same call.
    4. **Never** call `shiki`'s `createHighlighter`/`createHighlighterCore` directly.
    5. **Never** call `disposeHighlighter()` while any Pierre component is mounted.
- **Large-file guard** — files > 2MB show "This file is large (X MB). Load anyway?" prompt. Binary files show "Binary file (X bytes)" placeholder (no content render). Images (png/jpg/webp/svg) preview inline.
- **Find-in-file** — `Cmd+F` overlay with case-sensitive and regex toggles. Shiki's HAST preserves one `<span class="line">` per line with one span per token, so offsets are recoverable: compute matches on raw text → `{lineIndex, charStart, charEnd}`, walk token spans, wrap match slice in `<mark data-search-hit>` (splitting tokens if mid-token). Use regex flags `gi` for case-insensitive, always add `u` for Unicode correctness. Pierre's `<File>` component also exposes `onTokenClick`/`onTokenEnter` if token-precise selection is needed later.
- **Fallback (documented, not built)**: if Preact 11 beta inside `@pierre/file-tree` causes hydration issues, swap to `@headless-tree/react` directly. Migration is half a day — `TreeConfig` surface is identical; you lose only the auto-flatten-empty-dirs logic (reimplement in ~50 LOC from Pierre's `fileListToTree.js`, which is Apache-2.0).

**Exit:** user can browse any file in any repo, syntax-highlighted, with find-in-file.

#### Phase 4 — Diff Viewer (Days 12–15)

Integrate `@pierre/diffs` for all diff surfaces.

Tasks:
- **`RefPicker.tsx`** — typeahead-searchable dropdown of local branches + tags + `origin/*` remotes. Default base is `main`/`master`, default head is working tree (`null` = uncommitted).
- **Diff fetcher** — tRPC procedure `git.diff({ repo, base, head, files? })`. Returns unified/git-diff text (string). For working-tree: `git diff` (unstaged) + `git diff --cached` (staged), toggle or combine. For commit range: `git diff <base>..<head>`. Stream via `spawn` for large diffs; buffer small ones through simple-git.
- **`DiffView.tsx`** — pass the diff string to `<PatchDiff patch={diff} />` from `@pierre/diffs/react`. Pierre auto-detects git-vs-unified format and handles multi-file patches natively. Pass `options={{ diffStyle: 'unified' | 'split', theme: { dark: 'github-dark', light: 'github-light' }}}`.
- **Virtualization** — wrap the scroll area in `<Virtualizer>` (from `@pierre/diffs/react`); `<FileDiff>`/`<PatchDiff>` auto-detect the ancestor Virtualizer and render placeholders for off-screen files via IntersectionObserver. Pass `metrics={{ hunkLineCount, lineHeight, diffHeaderHeight, hunkSeparatorHeight, fileGap }}` on each diff for accurate placeholder heights.
- **Worker pool** — wrap renderer root with `<WorkerPoolContextProvider poolOptions={{ workerFactory: () => new Worker(new URL('@pierre/diffs/worker/worker.js', import.meta.url), { type: 'module' }), poolSize: 4 }} highlighterOptions={{ theme: {...}, langs: [...] }}>`. If electron-vite can't resolve the worker import, fall back to `@pierre/diffs/worker/worker-portable.js` (deps inlined). For very simple or CSP-restricted setups, pass `disableWorkerPool` on individual diff components — acceptable up to ~1–2k lines.
- **Render slots** — all diff components share `DiffBasePropsReact<LAnnotation>` with slots: `renderCustomHeader(fd)`, `renderHeaderPrefix(fd)`, `renderHeaderMetadata(fd)`, `renderGutterUtility(getHoveredLine)`, `renderAnnotation(a)`. Use `renderGutterUtility` to surface the "Copy for agent" button per-line on hover.
- **Mode toggle** — unified vs split via `options.diffStyle`. Persist preference globally. Pierre also supports `diffIndicators: 'classic' | 'bars' | 'none'`, `hunkSeparators`, `lineDiffType: 'word' | 'char' | 'word-alt'`, `expandUnchanged`, `collapsedContextThreshold`.
- **Binary file handling** — Pierre's parser emits file entries with empty hunks for `Binary files a/x and b/y differ` lines. Filter binaries out of the patch stream before passing to `<PatchDiff>` (or synthesize a placeholder `FileDiffMetadata`).
- **Large-diff guard** — diffs > 512KB show "This diff is large. Load anyway?" prompt. Use `<Virtualizer>` unconditionally — it's free when no virtualization is triggered.
- **Shared highlighter** — already preloaded in Phase 3; Pierre reuses `getSharedHighlighter()` internally.

**Exit:** user can view any diff (working-tree, commit range, branch-vs-branch) with Pierre's styling.

#### Phase 5 — GitHub Auth & PR Browser (Days 16–20)

**Auth app type decision**: use a **GitHub App** (not an OAuth App) despite the added UX step. GitHub Apps issue 8-hour user tokens + 6-month rotating refresh tokens; OAuth App tokens are non-expiring and don't rotate. Rotation matches 2026 security norms and GitHub's own recommendation. Client ID committed to repo; no client secret used in Device Flow.

Tasks:
- **`github-auth.ts`** — `@octokit/auth-oauth-device` v8.x, ESM-only, Node ≥ 20.
  - `createOAuthDeviceAuth({ clientType: 'github-app', clientId, scopes: ['repo', 'read:user'], onVerification })`
  - `onVerification(v)` fires exactly once with `{ device_code, user_code, verification_uri, expires_in, interval }`. Render modal from this callback: show `user_code`, call `shell.openExternal(verification_uri)`, start a countdown from `expires_in`. Polling happens internally at `interval` seconds.
  - `auth({ type: 'oauth', request: { signal: abortController.signal } })` resolves to `{ token, scopes }` when the user completes verification. Wire `AbortSignal` to the window close handler + a "Cancel" button.
  - Error mapping: `RequestError` `data.error === 'access_denied'` → user denied; `'expired_token'` → timeout; `FetchError` → network.
- **Token storage & lifecycle**:
  - Persist token via `safeStorage.encryptStringAsync` to `app.getPath('userData')/gh-account-<login>.enc`. Hard-fail if `safeStorage.isEncryptionAvailable()` is false; no plaintext fallback, ever.
  - **Multi-account-ready schema from day 1** (even for single-account MVP): `accounts: { [login]: { token, refreshToken, expiresAt, host } }`, `currentAccountId: string`. Migration later is renderer-only.
  - Revocation: attach an Octokit response interceptor that traps 401 `"Bad credentials"` and dispatches a `token-invalid` event via tRPC subscription → re-run device flow on next interaction.
  - Refresh: GitHub App refresh tokens rotate — always store the latest; on 401 with `expiresAt < now`, exchange refresh token automatically before re-prompting.
- **Octokit client** — umbrella `octokit@^4.0` (throttling + pagination + retry bundled).
  - Throttling config: `onRateLimit: (retryAfter, opts, ok, retryCount) => retryCount < 2`, `onSecondaryRateLimit: (retryAfter, opts, ok, retryCount) => retryCount < 1`, `fallbackSecondaryRateRetryAfter: 60`.
  - ETag persistence: sqlite table keyed by canonicalized URL, store ETag + last response. On cached endpoints, send `If-None-Match`; a 304 does **not** count against rate limit quota.
- **Repo-to-GitHub mapping** — use `hosted-git-info@^7` (not custom regex). Iterate all remotes (`git remote -v`), prefer `origin` → `upstream` → first GitHub-host remote. Handle: `https://github.com/o/r`, `https://github.com/o/r.git`, `https://github.com/o/r/`, `git@github.com:o/r.git`, `ssh://git@github.com/o/r.git`, `git://`. Detect `*.ghe.com` (GitHub Enterprise) and show "GHE not yet supported" toast; keep `host` field in the parsed object so future GHE support is additive.
- **`PRList.tsx`** — paginated via `octokit.paginate.iterator(octokit.rest.pulls.list, { owner, repo, state, per_page: 100 })`. Filters: state (open/closed/merged/all), author (typeahead), label, title substring. TanStack Query: `staleTime: 60_000`, `refetchOnWindowFocus: true` (per-query opt-in; global default is `false`).
- **`PRDetail.tsx`** — metadata via `octokit.rest.pulls.get({ owner, repo, pull_number })`, diff via a second call with `mediaType: { format: 'diff' }` returning a unified-diff string. Pass string to `<PatchDiff patch={...} />`. TanStack Query: `staleTime: 300_000` (PR details change slowly and ETag handles freshness).
- **Rate-limit UI** — pill in titlebar showing remaining quota. `staleTime: 30_000` on the rate-limit query. Banner when limit reached with "Retry in Xm" from `X-RateLimit-Reset`.
- **Offline mode** — if `fetch` fails or `navigator.onLine === false`, render cached data with a banner; disable refresh.
- **TanStack Query global defaults**: `{ staleTime: 60_000, gcTime: 5 * 60_000, retry: 2, refetchOnWindowFocus: false }`. Per-query overrides above.

**Exit:** user can sign in with GitHub, browse PRs for any added repo that has a GitHub origin, read diffs.

#### Phase 6 — Copy-for-Agent, Command Menu, Polish (Days 21–24)

Tasks:
- **Copy format — ship two presets** (user-selectable in Settings; default `markdown-fence`). Single source of truth in `src/shared/copy-template.ts`:

  **Preset 1: `markdown-fence`** (default, universal — Claude/Cursor/Codex/Gemini all accept):
  ```
  // <repo-name>/<relative/path/to/file> L42-L57 @ abc1234
  ```ts
  <hunk content>
  ```
  ```

  **Preset 2: `claude-xml`** (Anthropic's documented preferred format per their prompt-engineering docs):
  ```
  <file path="src/x.ts" lines="L42-L57" sha="abc1234" branch="main">
  <hunk content>
  </file>
  ```

  Rationale: Line notation `L42-L57` is GitHub's URL convention — agents have seen it in millions of training examples. Short language forms (`ts`, `tsx`, `py`) match GitHub and VS Code emission patterns. SHA (short, 7 chars) + branch improves agent reproducibility across iteration sessions.

- **`useCopyForAgent`** — hook triggered by `Cmd+Shift+C`. Captures current selection (pane + file + lines + hunk), formats per active preset, writes via `navigator.clipboard.writeText` (works from user-gesture click handlers with no macOS permission prompt for text writes). Main-process `clipboard.writeText` via tRPC as fallback for non-gesture triggers (e.g., "auto-copy after format"). **Plain text only** — Claude, Cursor, and Codex chat UIs strip HTML on paste; rich clipboard buys nothing.
- **`CopyForAgentPalette.tsx`** — shadcn `<Command>` that pops on `Cmd+Shift+C` offering: Copy selection / Copy entire hunk / Copy file path only / Copy file content / Copy diff for this file. Each option shows live preview. Toast on copy.
- **`CommandMenu.tsx`** (`Cmd+P`) — `cmdk` v1 palette. Scoped to current repo.
  - `cmdk`'s built-in `command-score` chokes beyond ~2k items — swap in `@leeoniya/uFuzzy` (~4KB, benchmark-leader, highlighted matches built-in) for file-search mode specifically.
  - Modes: default = file search; `>` prefix = commands (repo switch, route jump). Skip `#` symbol mode for MVP.
  - Recent items — persist to `electron-store` with 30-day TTL and frecency score (`frequency × recency`, Mozilla's algorithm). Session-only feels amnesiac.
  - Skip right-side preview panel for v1 — triples render cost, most palette sessions last < 2s.
- **macOS native menu** (`src/main/menu.ts`) — App / File (Open Repo, Close Window) / Edit (standard items) / View (Toggle Sidebar, Toggle Theme, Zoom In/Out) / Go (Repos, Files, Diffs, PRs) / Window / Help. Standard shortcuts — `Cmd+Q`, `Cmd+W`, `Cmd+,`, `Cmd+Shift+[`/`]`.
- **Font** — bundle JetBrains Mono (SIL OFL) as webfont. Fallback `ui-monospace, SFMono-Regular, Menlo, monospace`.
- **Theme** — light/dark/system via `next-themes`. Pierre theme tokens imported from `@pierre/theme`; Pierre's built-in `pierre-dark` / `pierre-light` themes available for the diff viewer.
- **Window state persistence** — per-display bounds + maximized state in `electron-store`. Sidebar width, diff split ratio.

**Exit:** Copy-for-agent works end-to-end; command menu + all keyboard shortcuts; polished look.

#### Phase 7 — Packaging & Distribution (Days 25–28)

Tasks:
- **electron-builder config** (`electron-builder.yml`) — **separate arm64 + x64 DMGs, NOT universal**. Universal DMG is ~1.6–1.9× the size (180–250 MB vs 110–140 MB single-arch). Apple Silicon is ~85% of new Mac sales; serving a fat binary to all users to accommodate the 15% is bad tradeoff. `electron-updater` picks the right DMG per host.
  ```yaml
  appId: com.kuro.diff
  mac:
    target:
      - target: dmg
        arch: [arm64]
      - target: dmg
        arch: [x64]
    category: public.app-category.developer-tools
    hardenedRuntime: true
    gatekeeperAssess: false
    entitlements: build/entitlements.mac.plist
    entitlementsInherit: build/entitlements.mac.plist
    notarize:
      teamId: "YOUR_TEAM_ID"
  ```
- **Entitlements** (`build/entitlements.mac.plist`):
  - `com.apple.security.cs.allow-jit` — **required**, forgetting causes V8 SIGSEGV at startup on Apple Silicon with no useful error.
  - `com.apple.security.cs.allow-unsigned-executable-memory` — required.
  - `com.apple.security.cs.disable-library-validation` — only if any native node module is used (try to avoid).
- **Signing & notarization** — requires paid Apple Developer Program ($99/yr). GitHub Actions secrets:
  - `CSC_LINK` — base64 of `Developer ID Application` `.p12`
  - `CSC_KEY_PASSWORD` — `.p12` password
  - `APPLE_API_KEY` — path/content of `.p8` from App Store Connect → Users and Access → Integrations → Team Keys. **Downloads only once** — store raw `.p8` **and** base64 as secrets.
  - `APPLE_API_KEY_ID` — 10-char alphanumeric (e.g. `ABCD123456`)
  - `APPLE_API_ISSUER` — UUID
  - electron-builder v26 automatically runs `stapler staple` after notarization (2024+ behavior; no manual `afterSign` hook needed).
  - `altool` is retired; notarytool is the only path.
- **Auto-update** via `electron-updater`:
  - GitHub Releases provider. Public repo needs no runtime token.
  - Staged rollouts via manual edit of `latest-mac.yml` `stagingPercentage: 25` → `50` → `100`. Uses stable machine-ID hash for inclusion; no paid service required.
  - **Skip delta updates** for v1 — `electron-delta-updater` adds build complexity for 200MB→5–20MB savings; reliability is good but not bulletproof in 2026.
  - Cert rotation: auto-update survives cert rotation as long as both certs chain to the same Developer ID team. Team change breaks auto-update entirely — users must manually download.
- **App icon** — `.icns` at 1024×1024. Designed separately.
- **GitHub Actions workflow**:
  - Runner: `macos-14` (M1, Apple Silicon) — builds arm64 natively, cross-builds x64 via electron-builder's bundled `lipo`. `macos-15` is stable but `macos-14` has more battle-tested notarization parity.
  - Trigger: **tag-push only** (not every PR) — macOS minutes are billed 10× Linux. 2026 pricing changes reduced this but it's still the cost center.
  - Cache `~/.npm` and `node_modules/.cache/electron` (~3 min saved per run).
  - Release automation: `softprops/action-gh-release@v2` creates **draft** on tag push; manually review artifacts and promote to published. Right balance of automation + last-mile safety for signed binaries.
- **Crash reporter** — Electron built-in `crashReporter`, no-op endpoint for MVP (YAGNI on real telemetry).

**Exit:** signed, notarized `.dmg` installs cleanly on a fresh Mac. Auto-update pulls new versions from GitHub Releases.

## Alternative Approaches Considered

- **B — Fork `t3-oss/t3-code`.** Rejected in brainstorm: T3 Code's architecture is built around running agents; stripping that would fight more than it saves. _(see brainstorm)_
- **C — Full review workstation with annotations, recents, custom copy templates.** Deferred for lack of evidence that daily workflow needs them. Revisit after 1 month of MVP usage.
- **libgit2 / isomorphic-git instead of git CLI.** Rejected: worktree semantics and edge cases track `git`'s behavior exactly only when using `git`. CLI is slower on huge repos but much more correct and requires zero maintenance for new git features.
- **Hand-rolled `contextBridge` + zod for IPC instead of tRPC.** Rejected: once you're past ~10 procedures, the tRPC end-to-end types + TanStack Query integration is worth the dependency.
- **Monaco Editor for file viewing.** Rejected: Shiki + `@pierre/file-tree` is the cohesive design language the brainstorm chose; Monaco would visually clash and add ~3MB bundle weight we don't need.
- **Browser history vs. hash history.** `createBrowserHistory` and `createMemoryHistory` break on `file://` in packaged builds; `createHashHistory` is mandatory.
- **OAuth App vs. GitHub App.** GitHub App has finer-grained permissions and higher rate limits but requires per-install approval UX that's overkill for a single-user read-only desktop tool. OAuth App + Device Flow is the documented standard for OSS desktop apps.

## System-Wide Impact

### Interaction Graph

User clicks a PR in the list:

```
PRList.tsx
  → trpc.github.prs.get.useSuspenseQuery({ owner, repo, number })
    → ipcLink → main → github procedure
      → github-service.octokit.rest.pulls.get({ mediaType: { format: 'diff' }})
        → HTTP to api.github.com (ETag-conditional)
          → 200 OK (patch text) / 304 Not Modified (use cache)
        → on 403 rate-limit: throttling plugin retries + surfaces to UI
      ← returns patch string
    ← tRPC response
  → react-query caches under ['github','pr',owner,repo,number]
  → PRDetail.tsx renders <PatchDiff patch={data} />
    → @pierre/diffs parses unified diff (diff 8.0.3)
    → preloadHighlighter() already ran → codeToHast per file
    → virtualized render (only visible files materialize)
```

User triggers Cmd+Shift+C on a selection in the file viewer:

```
CopyForAgentPalette
  → useCopyForAgent.format(selectionState, shared/copy-template)
  → navigator.clipboard.writeText(formatted)
    → on permission denial: fallback trpc.clipboard.copyText(formatted)
      → main → clipboard.writeText (Electron API)
  → toast.success("Copied")
```

User adds a repo via drag-and-drop:

```
window drop event → WorkspaceSidebar.onDrop
  → trpc.workspace.addRepo({ path })
    → validate path exists, is dir
    → git rev-parse --git-dir → path/.git exists
    → if path is a worktree (.git is a file): git rev-parse --git-common-dir → resolve main repo
    → list worktrees: git worktree list --porcelain -z
    → parse origin remote → {owner, repo}? or null
    → persist to workspace.json
    → register chokidar watcher on .git/HEAD + refs/
  → invalidate trpc.workspace.list query
  → sidebar re-renders with new entry
```

### Error & Failure Propagation

| Layer | Error class | Surface |
|---|---|---|
| `child_process.spawn('git')` | `ENOENT` | GitBinaryNotFoundError → modal "Git not found. Install via Homebrew or Xcode Tools." |
| `git` subprocess non-zero exit | `GitCommandError` with stderr | tRPC error → query errorBoundary → inline banner with stderr excerpt |
| `safeStorage.isEncryptionAvailable() === false` | `KeychainUnavailable` | Settings page shows "macOS Keychain unavailable. GitHub auth disabled." |
| Octokit 401 (bad token) | `AuthError` | Settings page prompts re-auth |
| Octokit 403 rate-limit | throttling plugin retries up to 3× then throws | titlebar pill goes red, PR list shows "Rate limited. Retry in Xm." |
| Octokit 404 (deleted repo) | `NotFound` | "Repository no longer exists on GitHub" inline |
| Network offline (`fetch` throws) | `NetworkError` | Global banner "Offline — showing cached data" |
| File > 2MB | no throw — gated by UI prompt | "Load anyway?" dialog |
| Binary file | detected in main, returned as `{ kind: 'binary', size }` | placeholder view |
| Pierre component crash | React error boundary per pane | fallback "Failed to render diff" + copy-patch button (so user can still copy for agent) |

Retry strategy: Octokit throttling plugin is authoritative; we do NOT wrap it in TanStack Query retries (would conflict — already saw this pattern bite in `docs/solutions/` absence; design defensively from day 1).

### State Lifecycle Risks

- **Partial `addRepo`**: if chokidar watcher registration fails after workspace.json write, repo exists in store but has no fs-watcher → stale worktree data. Mitigation: atomic transaction — register watcher first, then persist; on watcher failure, don't persist.
- **Orphaned tokens**: if user removes last repo, GitHub token still sits in safeStorage. Mitigation: leave it (they may re-add a repo); expose "Sign out of GitHub" in settings.
- **Stale ETag cache**: if ETag store drifts from actual API state (e.g., cache mutated externally), 304s return stale data. Mitigation: ETags are per-endpoint and invalidated naturally by state changes; also `refetchOnWindowFocus` eventually corrects.
- **Crash mid-write**: `workspace.json` write is not atomic. Mitigation: write to `.tmp` then rename. `electron-store` already does this.
- **Dangling worktrees**: if user `rm -rf`'d a worktree on disk, `git worktree list` still reports it until `git worktree prune`. Mitigation: verify each worktree path exists on disk; filter out missing.

### API Surface Parity

Three surfaces expose "view diff":
1. `/repos/:repoId/diffs` — arbitrary base/head picker
2. `/repos/:repoId/prs/:number` — pre-filled base/head from PR
3. File tree → right-click → "See this file's diff" — single-file diff for current base/head

All three must go through the same `<DiffView patch={…} />` component and the same `git.diff` / `github.prs.diff` procedures. Linked from a single `src/shared/types.ts#DiffRef`. Do not duplicate parsing logic.

### Integration Test Scenarios

Manual (no automated Electron harness for MVP — spec for human verification):

1. **Worktree discovery with non-ASCII path.** Create a worktree at `foo-测试/`, verify it renders correctly in sidebar with no encoding glitches.
2. **Large PR diff (1000+ files).** Find a public repo PR with many files; verify virtualization keeps UI responsive; scroll performance ≥ 50 fps.
3. **Token revoked externally.** Revoke the OAuth token at github.com/settings/apps; next API call should surface 401 and prompt re-auth without crashing.
4. **Repo deleted while open.** `rm -rf` the repo path; verify the sidebar shows "Repo not found" badge; no crash; other repos continue working.
5. **Network disconnected during PR fetch.** Airplane mode after loading a PR list; verify cached PR detail renders; refresh button disabled with tooltip.

## Acceptance Criteria

### Functional Requirements

- [ ] App launches in <2s on an M2 MacBook Air with 5 repos added
- [ ] `Cmd+O` and drag-and-drop both add a repo, with worktrees auto-discovered
- [ ] Sidebar groups worktrees under their main repo; active repo is visually distinguished
- [ ] File viewer renders any text file under 2MB with syntax highlighting in <200ms
- [ ] Files > 2MB and binary files show gated/placeholder views
- [ ] Diff viewer supports working-tree, commit-range, and PR diffs via one component
- [ ] Base/head picker typeahead-searches local branches, tags, and `origin/*` remotes
- [ ] Unified/split toggle persists globally
- [ ] `Cmd+Shift+C` copies selection in the documented format to the system clipboard
- [ ] GitHub Device Flow auth succeeds end-to-end; token stored encrypted via safeStorage
- [ ] PR list supports state, author, label, and title filters
- [ ] PR detail shows diff using `@pierre/diffs`
- [ ] `Cmd+P` command menu searches files in the current repo
- [ ] All critical paths keyboard-accessible with visible focus rings

### Non-Functional Requirements

- [x] Renderer has `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`; no `@electron/remote`
- [x] Electron pinned to a version with the ASAR-integrity CVE patch (≥35.7.5)
- [x] CSP blocks `unsafe-eval`; only self + api.github.com allowed in `connect-src`
- [ ] All main-process handlers validate inputs via zod
- [ ] DMG is signed with Developer ID Application cert and notarized via notarytool
- [ ] Cold start to workspace ready: <2s
- [ ] 100k-file tree renders without UI freeze (virtualization)
- [ ] 10k-line diff scrolls smoothly (virtualization)
- [ ] No memory leak over a 1-hour review session (RSS stable within 10%)

### Quality Gates

- [x] Every tRPC procedure has a zod input schema
- [ ] Every main-process error is mapped to a user-visible state (no silent failures)
- [ ] Every long-running subprocess has a 30s timeout
- [ ] TypeScript `strict: true` across all three tsconfigs
- [ ] `electron-builder` audit passes (no unsigned native deps)
- [ ] Manual test scenarios (above) executed and documented before v1.0 tag

## Success Metrics

- **Workflow replacement**: user stops opening GitHub.com or VS Code for code review within 2 weeks of MVP.
- **Copy-for-agent frequency**: measured by self-report — at least 10 uses per active session within a month.
- **Crash-free sessions**: ≥99% (manually observed; no telemetry in MVP).
- **Daily active use**: opened at least 5 days per week during the review-only period.

## Dependencies & Prerequisites

### Runtime dependencies (`package.json`)

```
"dependencies": {
  "electron": "^35.7.5",
  "@tanstack/react-router": "^1.168.0",
  "@tanstack/react-query": "^5.100.0",
  "@tanstack/zod-adapter": "^0.x",
  "react": "^19.1.0",
  "react-dom": "^19.1.0",
  "@pierre/diffs": "^1.1.19",
  "@pierre/file-tree": "^0.0.1-beta.1",
  "@pierre/theme": "^0.0.28",
  "shiki": "^3.0.0",
  "octokit": "^4.0.0",
  "@octokit/auth-oauth-device": "^8.0.0",
  "simple-git": "^3.36.0",
  "trpc-electron": "^x",
  "@trpc/server": "^11.0.0",
  "@trpc/client": "^11.0.0",
  "@trpc/react-query": "^11.0.0",
  "zod": "^3.24.0",
  "electron-store": "^11.0.2",
  "chokidar": "^5.0.0",
  "shell-env": "^4.0.3",
  "hosted-git-info": "^7.0.0",
  "parse-diff": "^0.x",
  "ignore": "^5.x",
  "cmdk": "^1.x",
  "@leeoniya/ufuzzy": "^1.x",
  "next-themes": "^0.4.x",
  "tailwindcss": "^4.0.17",
  "@electron-toolkit/preload": "^3.x",
  "@electron-toolkit/utils": "^4.x",
  "lucide-react": "^0.485",
  "class-variance-authority": "^0.7",
  "clsx": "^2",
  "tailwind-merge": "^3"
},
"devDependencies": {
  "electron-vite": "^3.1.0",
  "electron-builder": "^26.0.0",
  "@electron/fuses": "^1.x",
  "@electron/notarize": "^2.x",
  "@tanstack/router-plugin": "^1.167.0",
  "@tanstack/router-devtools": "^1.167.0",
  "@tailwindcss/vite": "^4.0.17",
  "@vitejs/plugin-react": "^4.3.4",
  "typescript": "^5.8",
  "vite": "^6.2"
}
```

### External prerequisites

- macOS 12+ (Monterey) — Apple Silicon or Intel
- Git ≥ 2.31 installed
- Apple Developer Program membership ($99/yr) for signed/notarized distribution
- GitHub account for PR browsing
- GitHub OAuth App registered with Device Flow enabled → committed client ID

## Risk Analysis & Mitigation

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| **Preact 11 beta inside `@pierre/file-tree`** | **Medium** | **High** | Preact 11.0.0-beta is bleeding-edge; if hydration bugs hit, swap to `@headless-tree/react` directly (half-day migration — `TreeConfig` surface is identical; port Pierre's `fileListToTree` in ~50 LOC). This is the largest real risk in the stack. |
| `@pierre/file-tree` selection API shape | Resolved | — | Confirmed: `options.config.onPrimaryAction(item)` via `@headless-tree/core`. Documented in Appendix A. |
| `@pierre/diffs` API churn (new release 9h ago) | Medium | Medium | Pin exact version (`1.1.19`); Appendix A documents current API surface from tarball inspection. Docs at diffs.com; no bundled README. |
| Electron ASAR-integrity regression | Low | Critical | Pin to ≥35.7.5 in CI; dependabot alerts enabled |
| macOS PATH not inherited → `git` not found | **Certain** | High | `shell-env` resolves at startup; surfaces clear error if missing. Known Electron footgun (issue #5626). |
| Notarization delays / rejections | Medium | High | Automate via App Store Connect API Key (not Apple ID); reproducible builds; electron-builder v26 staples automatically |
| Huge diffs OOM renderer | Medium | Medium | Streaming spawn + Pierre's `<Virtualizer>` auto-virtualization; 512KB diff-render gate |
| GitHub rate limits (5000/hr authed) | Low | Medium | ETag conditional requests (do not count against quota) + TanStack Query caching + throttling plugin |
| Tailwind v4 + electron-vite + shadcn CLI friction | Low | Low | Run shadcn CLI with `--cwd src/renderer` or thin root `vite.config.ts` re-export; documented in CarlosZiegler starter |
| Code-signing cert lapses | Low | High | Calendar reminder 30 days before expiry; CI uses renewable API key |
| CSP header registered before `app.whenReady()` | Low | High | Register inside `app.whenReady()` only (electron/electron#42000 silent crash otherwise) |
| Shiki double-highlighter memory waste | Medium | Low | **Hard rule**: use Pierre's `preloadHighlighter` + `getSharedHighlighter` as the only source. Never call `createHighlighter`/`createHighlighterCore` from our own code. |

## Resource Requirements

- **Time**: ~4 weeks (28 days) of focused work across 7 phases, solo.
- **Team**: single developer.
- **Infrastructure**: GitHub repo, GitHub Actions macOS runners (free tier sufficient for MVP), Apple Developer Program.
- **Hardware**: Apple Silicon Mac for development and testing.
- **Budget**: $99/yr Apple Developer + $0 everything else.

## Future Considerations

- Multi-window (one per repo) once single-window scale limits hit
- Annotation/notes layer (was Approach C — revisit after real-world usage)
- Non-GitHub providers (GitLab, Gitea) via pluggable provider interface in `src/main/services/providers/`
- Custom copy-for-agent templates (per-agent presets — Claude vs. Cursor vs. Codex)
- Commit history browser + blame view
- Submodule traversal (currently: show badge, don't recurse)
- LFS pointer resolution
- Accessibility audit beyond keyboard/focus baseline
- Windows/Linux ports (low priority — macOS first is a product identity choice)
- Native crash reporter + opt-in telemetry for deployed users beyond the author

## Documentation Plan

- `README.md` — install, first-run, screenshots
- `docs/architecture.md` — process model, IPC boundary, data flow (derived from this plan)
- `docs/security.md` — security posture statement (context isolation, sandbox, CSP, token storage)
- `docs/solutions/` — per-problem write-ups as they occur (e.g., "how we resolved git PATH on macOS", "@pierre/file-tree selection approach")
- `docs/copy-format.md` — canonical copy-for-agent template with examples and rationale
- In-app Help menu → "Keyboard shortcuts" overlay

## Decisions Resolved from SpecFlow Analysis

Decisions taken during planning (from the 17 questions surfaced by SpecFlow), owner: author — can be revisited:

1. **Add-repo UX**: both native dialog (`Cmd+O`, File → Open Repo) and drag-and-drop onto sidebar. Dropping a worktree resolves to its parent main repo via `git rev-parse --git-common-dir`.
2. **GitHub auth**: Device Flow primary, PAT paste as escape hatch in Settings.
3. **Copy-for-agent template**: see `src/shared/copy-template.ts` — markdown fence with path/line-range header comment.
4. **Default diff on repo open**: working tree (uncommitted changes) vs `HEAD`.
5. **Branch picker scope**: local branches + tags + `origin/*` remotes.
6. **PR diff source**: always via GitHub API (`mediaType: { format: 'diff' }`) — deterministic, no local-branch dependency.
7. **Large-file threshold**: 2MB for source view, 512KB for diff render gate.
8. **Binary file policy**: "Binary file (X bytes)" placeholder. Images (png/jpg/webp/svg) preview inline. No hex viewer in MVP.
9. **Deleted/renamed files**: honor git's rename detection (default 50% similarity); deletions collapsed by default.
10. **Merge-conflict state**: viewable (markers shown as-is); no resolution UI.
11. **Detached HEAD**: shown as pseudo-worktree labeled `(detached @ <sha>)`.
12. **Token storage**: safeStorage only, hard-fail if keychain unavailable. No plaintext fallback in any environment.
13. **Worktree grouping**: nested under main repo in sidebar, even for sibling-path worktrees.
14. **Repo removal**: right-click "Remove from workspace" with confirm; never touches disk.
15. **Empty states copy**: author-written placeholder for MVP, designer pass post-v1.
16. **Performance budget**: virtualization is MVP-critical for trees >10k files and diffs >1000 lines.
17. **Font**: bundled JetBrains Mono (OFL), fallback `ui-monospace, SFMono-Regular, Menlo, monospace`.

## Appendix A — Pierre API reference (verified from tarballs)

Extracted from `@pierre/diffs@1.1.19` and `@pierre/file-tree@0.0.1-beta.1` d.ts files. Pierre ships minimal public docs; this is the canonical on-disk API surface at implementation time.

### A.1 `@pierre/diffs` shared props

```ts
interface DiffBasePropsReact<LAnnotation> {
  options?: FileDiffOptions<LAnnotation>;
  metrics?: VirtualFileMetrics;                  // { hunkLineCount, lineHeight, diffHeaderHeight, hunkSeparatorHeight, fileGap }
  lineAnnotations?: DiffLineAnnotation<LAnnotation>[];   // { side: 'additions'|'deletions', lineNumber, metadata }
  selectedLines?: SelectedLineRange | null;       // { start, side?, end, endSide? }
  renderAnnotation?(a: DiffLineAnnotation<LAnnotation>): ReactNode;
  renderCustomHeader?(fd: FileDiffMetadata): ReactNode;
  renderHeaderPrefix?(fd: FileDiffMetadata): ReactNode;
  renderHeaderMetadata?(fd: FileDiffMetadata): ReactNode;
  renderGutterUtility?(getHoveredLine: () => GetHoveredLineResult<'diff'> | undefined): ReactNode;
  className?: string; style?: CSSProperties;
  prerenderedHTML?: string;                       // SSR hydration — unused in Electron file://
}
```

### A.2 Component-specific props

- `<PatchDiff patch: string; disableWorkerPool?: boolean />` — accepts raw unified or `git diff`. Auto-detects format. Multi-file patches handled natively.
- `<FileDiff fileDiff: FileDiffMetadata; disableWorkerPool?: boolean />` — pre-parsed single-file metadata.
- `<MultiFileDiff oldFile: FileContents; newFile: FileContents; disableWorkerPool?: boolean />` — diffs computed by jsdiff internally.
- `<File file: FileContents; options?: FileOptions<LAnnotation> />` — plain file viewer.
- `<UnresolvedFile file: FileContents; renderMergeConflictUtility?(...)>` — merge-conflict viewer with `UnresolvedFileReactOptions` (markers, `maxContextLines`).

### A.3 `FileDiffOptions` (subset worth knowing)

```ts
{
  diffStyle: 'unified' | 'split',
  diffIndicators: 'classic' | 'bars' | 'none',
  hunkSeparators: 'simple' | 'metadata' | 'line-info' | 'line-info-basic',
  lineDiffType: 'word-alt' | 'word' | 'char' | 'none',
  maxLineDiffLength: number,
  collapsedContextThreshold: number,
  expandUnchanged: boolean,
  expansionLineCount: number,
  overflow: 'scroll' | 'wrap',
  disableLineNumbers: boolean,
  useCSSClasses: boolean,
  useTokenTransformer: boolean,
  tokenizeMaxLineLength: number,
  enableGutterUtility: boolean,
  enableLineSelection: boolean,
  onLineSelected?: (range: SelectedLineRange) => void,
  onLineClick?: (line: LineInfo) => void,
  onTokenClick?: (e: TokenEvent) => void,
  onHunkExpand?: (info: HunkExpandInfo) => void,
  onPostRender?: () => void,
  theme?: DiffsThemeNames | { dark: DiffsThemeNames; light: DiffsThemeNames },
}
```

### A.4 Virtualization

- `<Virtualizer config?: Partial<{ overscrollSize, intersectionObserverMargin, resizeDebugging }> />` — scroll container; nested diff instances auto-virtualize.
- `useVirtualizer(): Virtualizer | undefined` — access the core class.
- No exported `<VirtualizedFileDiff>` React component; it's a class auto-selected when a Virtualizer ancestor is detected.

### A.5 Worker pool

```tsx
<WorkerPoolContextProvider
  poolOptions={{
    workerFactory: () => new Worker(
      new URL('@pierre/diffs/worker/worker.js', import.meta.url),
      { type: 'module' }
    ),
    poolSize: 4,
    totalASTLRUCacheSize: 2_000_000,
  }}
  highlighterOptions={{ theme: {...}, langs: [...] }}
>
```

Fallback for electron-vite resolution issues: `@pierre/diffs/worker/worker-portable.js` (deps inlined). Opt out per-component with `disableWorkerPool` when CSP forbids `worker-src blob:`.

### A.6 Highlighter API

```ts
type DiffsThemeNames = BundledTheme | 'pierre-dark' | 'pierre-light' | (string & {});
type HighlighterTypes = 'shiki-js' | 'shiki-wasm';
interface HighlighterOptions {
  themes: DiffsThemeNames[];
  langs: SupportedLanguages[];
  preferredHighlighter?: HighlighterTypes;
}

preloadHighlighter(opts: HighlighterOptions): Promise<void>;
getSharedHighlighter(opts: HighlighterOptions): Promise<DiffsHighlighter>;
disposeHighlighter(): Promise<void>;
isHighlighterLoaded(h?): h is DiffsHighlighter;
getHighlighterIfLoaded(): DiffsHighlighter | undefined;
registerCustomLanguage(lang, loader, extensionsOrFilenames?): void;
registerCustomTheme(name, loader): void;
```

**Singleton ownership rule**: Pierre uses `createHighlighter` (full bundled dist, ~500KB). Calling `createHighlighterCore` from our own code creates a second instance — doubled memory, inconsistent theming. Pierre is the single source; the file viewer calls `getSharedHighlighter()` and adds langs idempotently.

### A.7 Subpath exports

- `@pierre/diffs` — vanilla JS classes, utilities, highlighter singletons, web-component registration.
- `@pierre/diffs/react` — React wrappers + `Virtualizer`, `WorkerPoolContextProvider`, hooks.
- `@pierre/diffs/ssr` — `preloadDiffHTML`, `renderHTML` — **unused in Electron** (no file:// SSR).
- `@pierre/diffs/worker` — `WorkerPoolManager` + `getOrCreateWorkerPoolSingleton` for advanced use.
- `@pierre/diffs/worker/worker.js` — Web Worker entry.
- `@pierre/diffs/worker/worker-portable.js` — same but bundled, for environments that can't resolve `import` inside workers.

### A.8 `@pierre/file-tree` — selection pattern (verified)

The React wrapper is a thin shell around a Preact-rendered Shadow DOM component that wraps `@headless-tree/core@1.6.1`. Events flow through `options.config` (a `TreeConfig<FileTreeNode>` subset) — **not** as React props on the wrapper element.

```tsx
import { FileTree, FileTreeOptions } from '@pierre/file-tree/react';

function Sidebar({ files, onSelect }: {
  files: string[];
  onSelect: (path: string) => void
}) {
  const options: FileTreeOptions = React.useMemo(() => ({
    files,                              // flat path array
    flattenEmptyDirectories: true,      // collapse single-child chains (Pierre default UX)
    config: {
      onPrimaryAction: (item) => {
        // fires on DOUBLE-CLICK or ENTER; item.getId() is the full path
        if (!item.isFolder()) onSelect(item.getId());
      },
      setSelectedItems: (ids) => {
        // optional: for Finder-like single-click-to-open, mirror selection into host state
        // and treat a single-file selection change as an open action
      },
    },
  }), [files, onSelect]);

  return <FileTree options={options} className="file-tree" />;
}
```

Caveats:
- `options.config` compared by reference in `areOptionsEqual` → always `useMemo`.
- `files` array compared element-wise → always return a new array on change.
- Shadow DOM isolation → no React synthetic events bubble out. Do not try `onClick` on the `<FileTree>` element.
- No `onSelect`, `onDoubleClick`, `onKeyDown` props at the wrapper level. Everything goes through `config`.
- `onPrimaryAction` fires on double-click/Enter only. For single-click-to-open, use `setSelectedItems` + detect changes.
- `id` on `FileTreeOptions` — stable instance id for SSR hydration.

### A.9 Git diff → `<PatchDiff>` behaviors (verified via `parsePatchFiles.js`)

- Raw `git diff` or unified format — auto-detected (regex `/(?=^diff --git)/gm`).
- Multi-file patches handled natively.
- `ChangeTypes = 'change' | 'rename-pure' | 'rename-changed' | 'new' | 'deleted'`. Rename detection via `similarity index 100%`; additions via `new file mode`; deletions via `deleted file mode`. Both `prevName` and `name` populated; mode/objectId captured.
- **Binary files: no dedicated handling** — `Binary files a/x and b/y differ` produces a file entry with empty hunks. Filter binaries from the patch string before passing in, or synthesize a placeholder `FileDiffMetadata` for a nicer empty state.
- **Streaming: not natively supported** — the `patch` prop is read at render and re-parsed on change. LRU cache (`WorkerPoolManager.fileCache`/`diffCache`) dedupes work when the prop updates. For chunked arrival, parse yourself with `parsePatchFiles` and render one `<FileDiff>` per entry as chunks land.

### A.10 Find-in-file via Shiki HAST

Shiki's HAST output preserves one `<span class="line">` per logical line, with one span per token. Compute regex matches on raw text → `{lineIndex, charStart, charEnd}`, walk token spans for the line, wrap match slice in `<mark data-search-hit>` (splitting mid-token if necessary). Regex flags: `gi` for case-insensitive, always add `u` for Unicode correctness. Pierre's `<File>` exposes `onTokenClick`/`onTokenEnter` for token-precise interactions without re-tokenizing.

## Sources & References

### Origin

- **Brainstorm document:** [docs/brainstorms/2026-04-24-kuro-diff-brainstorm.md](../brainstorms/2026-04-24-kuro-diff-brainstorm.md)
  - Key decisions carried forward: Approach A (focused MVP, not T3 Code fork); Electron + TanStack + shadcn; Pierre's `@pierre/diffs` + `@pierre/file-tree`; local git CLI + Octokit; read-only by design; first-class copy-for-agent action.

### Internal References

- None (greenfield project).

### External References

- [Electron Security Best Practices](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron Fuses](https://www.electronjs.org/docs/latest/tutorial/fuses)
- [Electron ASAR Integrity](https://www.electronjs.org/docs/latest/tutorial/asar-integrity) — pin ≥35.7.5
- [Electron Custom Title Bar](https://www.electronjs.org/docs/latest/tutorial/custom-title-bar)
- [Electron Code Signing](https://www.electronjs.org/docs/latest/tutorial/code-signing)
- [@electron/notarize](https://github.com/electron/notarize)
- [electron-vite](https://electron-vite.org/)
- [electron-builder auto-update](https://www.electron.build/auto-update.html)
- [TanStack Router — Vite install](https://tanstack.com/router/latest/docs/installation/with-vite)
- [TanStack Router history types](https://tanstack.com/router/latest/docs/framework/react/guide/history-types)
- [TanStack Query v5](https://tanstack.com/query/latest)
- [trpc-electron (mat-sz fork)](https://github.com/mat-sz/trpc-electron) — tRPC v11 support
- [@octokit/auth-oauth-device](https://github.com/octokit/auth-oauth-device.js)
- [Octokit umbrella package](https://github.com/octokit/octokit.js)
- [simple-git](https://www.npmjs.com/package/simple-git)
- [git-worktree docs](https://git-scm.com/docs/git-worktree)
- [Shiki install guide](https://shiki.matsu.io/guide/install)
- [shadcn/ui — Vite install](https://ui.shadcn.com/docs/installation/vite)
- [@pierre/diffs (npm)](https://www.npmjs.com/package/@pierre/diffs) — Apache-2.0, docs at diffs.com
- [@pierre/file-tree (npm)](https://www.npmjs.com/package/@pierre/file-tree) — Apache-2.0, beta
- [trees.software](https://trees.software/) — Pierre's file tree product page
- [CarlosZiegler/electron-tanstack](https://github.com/CarlosZiegler/electron-tanstack) — starter
- [LuanRoger/electron-shadcn](https://github.com/LuanRoger/electron-shadcn) — reference
- [cawa-93/vite-electron-builder](https://github.com/cawa-93/vite-electron-builder) — security-focused reference
- [t3-oss/t3-code](https://github.com/t3-oss/t3-code) — adjacent/not-forked
- [sindresorhus/shell-env](https://github.com/sindresorhus/shell-env) — macOS PATH resolution
- [@headless-tree/core](https://github.com/TrueDarkDev/headless-tree) — underlying library for `@pierre/file-tree`
- [@leeoniya/uFuzzy](https://github.com/leeoniya/uFuzzy) — file-search fuzzy matcher
- [hosted-git-info](https://github.com/npm/hosted-git-info) — remote URL parser
- [Anthropic XML prompt tags](https://platform.claude.com/docs/en/build-with-claude/prompt-engineering/use-xml-tags) — Claude-preferred paste format
- [Simon Willison: sign + notarize via GitHub Actions](https://til.simonwillison.net/electron/sign-notarize-electron-macos)
- [GitHub credential revocation API (March 2026)](https://github.blog/changelog/2026-03-26-credential-revocation-api-now-supports-github-oauth-and-github-app-credentials/)
- [TanStack Query global defaults discussion](https://github.com/TanStack/query/discussions/7670)
- [Electron issue #42000 (CSP pre-ready crash)](https://github.com/electron/electron/issues/42000)
- [Electron issue #5626 (macOS PATH not inherited)](https://github.com/electron/electron/issues/5626)

### Related Work

- None (greenfield).
