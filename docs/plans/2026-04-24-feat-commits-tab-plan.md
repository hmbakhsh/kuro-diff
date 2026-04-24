---
title: Commits Tab — Branch Inspector
type: feat
status: active
date: 2026-04-24
origin: docs/brainstorms/2026-04-24-commits-tab-brainstorm.md
---

# Commits Tab — Branch Inspector

## Overview

A fourth tab in the worktree layout (`Files | Diffs | Commits | PRs`) that presents a branch as a sequence of deltas — one row per commit, plus a "working tree" pseudo-row at the top when the worktree is dirty. Clicking a row loads that delta's diff inline on the right using the existing `DiffView` component. Default scope is `base..HEAD` against the same shared compare-base the Diffs tab uses; a "Show full history" toggle switches to the full log reachable from `HEAD`. Copy-for-agent works per-row.

See brainstorm: `docs/brainstorms/2026-04-24-commits-tab-brainstorm.md`. Every decision there is carried forward below; this plan adds HOW.

## Problem Statement

The Diffs tab collapses a branch into a single `base..head` patch. That's the right view for "what changed overall" but wrong for reviewing an agent's work step by step. The user also wants uncommitted/untracked changes visible in the same list — the PR-review shape: each row = one delta, top row = what's not yet committed.

No commit-log capability exists today. `gitRouter` (`src/main/trpc/procedures/git.ts`) exposes only `refs` and `diff`. There is no route, no component, and no preference wiring for per-commit navigation.

## Proposed Solution

New route `/repos/$repoId/wt/$worktreeId/commits` with a two-pane layout:

- **Left sidebar:** scrollable list. Optional top row for the working tree (shown when dirty). Commit rows render short SHA + subject + relative date. Header contains a "Show full history" checkbox.
- **Right pane:** metadata header (full SHA with copy affordance, full commit message, changed-file summary) + the existing `DiffView` scoped to that delta.

Backend surface grows by three procedures in `gitRouter`:

1. `git.log` — paginated commit list for `base..HEAD` or full history.
2. `git.status` — cheap dirty-check + changed-file summary.
3. `git.commitDiff` — per-commit patch via `git show` (handles root-commit case).

`git.diff` is extended with `includeUntracked?: boolean` so the working-tree row can show tracked + untracked as one concatenated patch.

The Commits tab reads the same per-worktree `compareBases` preference as the Diffs tab (no new picker; change the base in Diffs and Commits follows). Copy-for-agent plugs in via the existing palette — selection state updates the capture store with a commit-scoped context.

## Technical Approach

### Architecture

```
┌─ src/main/trpc/procedures/git.ts ────────────────────────────────┐
│  • extend diffInput with includeUntracked                        │
│  • + git.log         ({repoId, worktreeId, base?, cursor?, limit?}│
│                       → {commits[], nextCursor?})                │
│  • + git.status      ({repoId, worktreeId}                       │
│                       → {isDirty, untracked[], staged[], modified[]})
│  • + git.commitDiff  ({repoId, worktreeId, sha}                  │
│                       → {patch, meta})                           │
└────────────────────────┬─────────────────────────────────────────┘
                         │
┌─ src/main/services/git-service.ts ─ extensions ──────────────────┐
│  • runGit options: + allowedExitCodes?: number[]                 │
│  • composeWorkingTreeDiff(cwd)  // tracked + untracked patches   │
└──────────────────────────────────────────────────────────────────┘
                         │
┌─ src/renderer/src/routes/repos.$repoId.wt.$worktreeId.commits.tsx
│  validateSearch { sha?: string, full?: boolean }                  │
│  layout: flex-row, sidebar + detail                              │
└─── uses:                                                         │
     • components/commits/CommitsSidebar.tsx                       │
     • components/commits/CommitRow.tsx                            │
     • components/commits/WorkingTreeRow.tsx                       │
     • components/commits/CommitDetail.tsx                         │
     • components/diffs/DiffView.tsx (reused unchanged)            │
     • lib/relative-date.ts (new helper)                           │
     • hooks/useCopyForAgent.ts (existing, consumed unchanged)     │
     • stores/captureStore (existing, targeted via new setter)     │
```

### New Files

| Path                                                               | Purpose                                                                                                     |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `src/renderer/src/routes/repos.$repoId.wt.$worktreeId.commits.tsx` | Route, URL-state, layout, query orchestration                                                               |
| `src/renderer/src/components/commits/CommitsSidebar.tsx`           | Scrollable list, header toggle, load-more, selection state                                                  |
| `src/renderer/src/components/commits/CommitRow.tsx`                | One commit row (SHA + subject + date)                                                                       |
| `src/renderer/src/components/commits/WorkingTreeRow.tsx`           | Top-of-list pseudo-row; visible when `git.status` reports dirty                                             |
| `src/renderer/src/components/commits/CommitDetail.tsx`             | Right pane: metadata header + `DiffView`                                                                    |
| `src/renderer/src/lib/relative-date.ts`                            | Single helper: `formatRelative(date: Date \| string): string` → `"2h"`, `"3d"`, `"Apr 10"` past a threshold |

### Modified Files

| Path                                                             | Change                                                                                                                                                            |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/trpc/procedures/git.ts`                                | Extend `diffInput`; add `log`, `status`, `commitDiff` procedures                                                                                                  |
| `src/main/services/git-service.ts`                               | Add `allowedExitCodes` option to `runGit`; add `composeWorkingTreeDiff` helper                                                                                    |
| `src/renderer/src/routes/repos.$repoId.wt.$worktreeId.tsx`       | Add `<Link>` for Commits tab between Diffs and PRs                                                                                                                |
| `src/renderer/src/routes/__root.tsx`                             | Add `"commits"` to `TABS` so menu/command shortcuts include it                                                                                                    |
| `src/renderer/src/hooks/useCopyForAgent.ts`                      | Recognize commit / working-tree capture scopes from `useCaptureStore` (no new palette entries — existing actions already operate on `target.diff` + `target.sha`) |
| `src/renderer/src/routes/repos.$repoId.wt.$worktreeId.diffs.tsx` | No change expected; Commits reads its state                                                                                                                       |

### Backend Design

#### `git.log`

```ts
const logInput = z.object({
  repoId: z.string().uuid(),
  worktreeId: z.string(),
  base: z.string().optional(), // when set, list base..HEAD; otherwise full HEAD log
  limit: z.number().int().min(1).max(200).optional(), // default 50
  cursor: z.number().int().min(0).optional(), // skip count for pagination
});

// Response shape
type LogCommit = {
  sha: string; // full
  shortSha: string; // 7-char
  subject: string;
  authorName: string; // kept in response but not rendered in v1 (cheap, future-proof)
  authorDate: string; // ISO
  parents: string[]; // 0–2 SHAs
};
type LogResponse = { commits: LogCommit[]; nextCursor: number | null };
```

Implementation: `git log --no-color --format='%H%x1f%h%x1f%P%x1f%an%x1f%aI%x1f%s' [base..HEAD] --max-count=<limit+1> --skip=<cursor>` using the ASCII unit-separator (`%x1f`) between fields and newlines between records. Over-fetch by 1 to detect a next page. Parents is space-split. `base..HEAD` is used when `base` is provided; otherwise just `HEAD`. Fallback on "unknown revision" errors: retry without the range (full HEAD log), matching the `diff` procedure's `HEAD` fallback.

#### `git.status`

```ts
const statusInput = z.object({
  repoId: z.string().uuid(),
  worktreeId: z.string(),
});

type StatusResponse = {
  isDirty: boolean;
  staged: string[]; // paths with staged changes
  modified: string[]; // tracked, unstaged changes
  untracked: string[]; // not in index, not ignored
};
```

Implementation: `git status --porcelain=v1 -z --untracked-files=all`. Parse per-record XY pair → categorize. Dirty = any non-empty list.

#### `git.commitDiff`

```ts
const commitDiffInput = z.object({
  repoId: z.string().uuid(),
  worktreeId: z.string(),
  sha: z.string().regex(/^[0-9a-f]{4,40}$/),
});

type CommitDiffResponse = {
  patch: string;
  meta: {
    sha: string;
    shortSha: string;
    subject: string;
    body: string;
    authorName: string;
    authorEmail: string;
    authorDate: string;
    parents: string[];
  };
};
```

Implementation: two git calls (parallel via `Promise.all`):

- Patch: `git show --no-color -M --format= <sha>` — empty `--format=` suppresses the commit header so only the patch comes back; handles root commit natively.
- Meta: `git show --no-patch --format='%H%x1f%h%x1f%P%x1f%an%x1f%ae%x1f%aI%x1f%s%x1f%b' <sha>`.

`maxBuffer: 128 * 1024 * 1024` to match the existing `diff` procedure.

#### Extended `git.diff`

Add `includeUntracked?: boolean` (default `false`) to `diffInput`. When `true` AND `head === null` AND `staged === false`, call a new helper `composeWorkingTreeDiff(cwd)` instead of the plain `git diff` path. Otherwise behaviour is unchanged.

```ts
// src/main/services/git-service.ts — new helper
export async function composeWorkingTreeDiff(cwd: string): Promise<string> {
  const tracked = await runGit(["diff", "--no-color", "-M", "HEAD"], {
    cwd,
    maxBuffer: 128 * 1024 * 1024,
  });
  const untrackedList = await runGit(
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { cwd },
  );
  const paths = untrackedList.split("\0").filter(Boolean);
  if (paths.length === 0) return tracked;
  const fragments: string[] = [];
  for (const p of paths) {
    const frag = await runGit(
      ["diff", "--no-color", "--no-index", "--", "/dev/null", p],
      { cwd, maxBuffer: 64 * 1024 * 1024, allowedExitCodes: [1] }, // 1 = differences found
    );
    fragments.push(frag);
  }
  return tracked + fragments.join("");
}
```

`runGit` gains an `allowedExitCodes?: number[]` option that short-circuits the `GitCommandError` throw when the child's exit code is in the list. This keeps the one "normal to exit non-zero" call site explicit.

### Frontend Design

#### Route

`src/renderer/src/routes/repos.$repoId.wt.$worktreeId.commits.tsx` mirrors the Diffs tab's structure.

```ts
const searchSchema = z.object({
  sha: z.string().optional(), // commit SHA (short or full), or 'wt' for working tree, or undefined
  full: z.boolean().optional(), // true = full history, undefined/false = base..HEAD
});

export const Route = createFileRoute("/repos/$repoId/wt/$worktreeId/commits")({
  validateSearch: (s: Record<string, unknown>) => searchSchema.parse(s),
  component: CommitsView,
});
```

`CommitsView` orchestrates:

1. `refsQuery = trpc.git.refs.useQuery({ repoId }, { staleTime: 60_000 })` (reuse).
2. `preferencesQuery = trpc.preferences.get.useQuery(undefined, { staleTime: Infinity })` (reuse).
3. Resolved base = `preferences.compareBases[key] ?? refs.mainBranch ?? null`. Key = `${repoId}:${worktreeId}`.
4. `statusQuery = trpc.git.status.useQuery({ repoId, worktreeId }, { staleTime: 5_000, refetchOnWindowFocus: true })`.
5. `logQuery = trpc.git.log.useInfiniteQuery({ repoId, worktreeId, base: full ? undefined : resolvedBase, limit: 50 }, { getNextPageParam, staleTime: 10_000 })`.
6. Selection normalization: if `search.sha` is unset and rows exist, `navigate({ search: { ...search, sha: firstRow.id }, replace: true })` on mount/ref change. "First row" = working-tree row if `status.isDirty` else first commit.
7. Derived queries driven by selection:
   - `sha === 'wt'` → `trpc.git.diff.useQuery({ repoId, worktreeId, base: 'HEAD', head: null, staged: false, includeUntracked: true }, { staleTime: 2_000 })`.
   - else → `trpc.git.commitDiff.useQuery({ repoId, worktreeId, sha }, { staleTime: 5 * 60_000 })`.
8. Copy-for-agent: on selection change, update the capture store with `{ kind, repoName, sha, subject, diff: { base, head, patch } }`.

Layout uses `flex h-full min-h-0`. Sidebar = `w-[320px] shrink-0 border-r`; detail = `flex-1 min-h-0`. No resizer in v1.

#### Components

**`CommitsSidebar`** (`components/commits/CommitsSidebar.tsx`)

- Props: `{ workingTreeStatus, commits, selectedSha, onSelect, showFullHistory, onToggleFullHistory, hasNextPage, fetchNextPage, isFetchingNextPage }`.
- Header: `[x] Show full history` checkbox (dirty-looking + tiny), and a count ("12 commits" / "base..HEAD" label).
- Body (scrollable):
  - If `workingTreeStatus.isDirty`: render `<WorkingTreeRow selected={selectedSha === 'wt'} onClick={() => onSelect('wt')} files={workingTreeStatus}/>` at the top.
  - For each commit: `<CommitRow ... />`.
  - If `hasNextPage`: "Load more" button at the bottom that calls `fetchNextPage`.
- Keyboard: captures `ArrowUp`/`ArrowDown` when sidebar has focus (via `onKeyDown`) and advances selection. Enter does nothing for v1 (click is already the primary action); Space reserved for Phase 3.

**`CommitRow`** (`components/commits/CommitRow.tsx`)

- Props: `{ commit: LogCommit, selected: boolean, onClick: () => void }`.
- Layout: single line, monospace short SHA, subject (truncated, title-attr'd to full subject), relative date right-aligned.
- States: selected → `bg-black/10 dark:bg-white/15`; hover → `bg-black/5 dark:bg-white/10`. Matches the tab-nav active/idle tokens for visual cohesion.

**`WorkingTreeRow`** (`components/commits/WorkingTreeRow.tsx`)

- Props: `{ status: StatusResponse, selected: boolean, onClick: () => void }`.
- Shows "Working tree" in place of SHA, and a file-count summary (e.g. `2 modified · 1 untracked`).
- Visible only when `status.isDirty`.

**`CommitDetail`** (`components/commits/CommitDetail.tsx`)

- Props: `{ scope: 'commit' | 'wt', meta?, patch?, mode: DiffMode, isLoading, error, cacheKey: string }`.
- Header:
  - For a commit: short SHA (monospace) with click-to-copy, subject, author + relative date, `{N} files` badge. Full body collapsible via a `<details>` (default closed).
  - For the working tree: title "Working tree", subtitle "Uncommitted changes" with counts.
- Body: `<DiffView patch={patch} mode={mode} cacheKey={cacheKey}/>` (reused).
- Loading/error/empty states mirror the Diffs tab's copy.

#### URL and navigation

| Event                                           | URL effect                                                                                                                                       |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Initial mount, no `sha` set, list resolves      | Replace-navigate to the first-row id (`wt` or first commit)                                                                                      |
| Click a row                                     | Replace-navigate to `?sha=<id>`                                                                                                                  |
| Toggle "Show full history"                      | Navigate to `?full=true&sha=<current or undefined>` and let normalization re-select first row if the current `sha` is missing in the new dataset |
| Arrow-key navigation                            | Replace-navigate to adjacent row's id                                                                                                            |
| External change (Diffs tab mutates compareBase) | `logQuery` refetches; if current `sha` vanishes, re-select first                                                                                 |

#### Tab nav (modified)

`src/renderer/src/routes/repos.$repoId.wt.$worktreeId.tsx` gains a third `<Link>` between Diffs and PRs:

```tsx
<Link
  to="/repos/$repoId/wt/$worktreeId/commits"
  params={{ repoId, worktreeId }}
  className={tabIdleClass}
  activeProps={{ className: tabActiveClass }}
>
  Commits
</Link>
```

`src/renderer/src/routes/__root.tsx` — the `TABS` array (used by menu/command shortcuts per research) adds `'commits'` between `'diffs'` and `'prs'`.

#### Relative-date helper

`src/renderer/src/lib/relative-date.ts`:

```ts
export function formatRelative(input: string | Date, now = new Date()): string {
  const d = typeof input === "string" ? new Date(input) : input;
  const diffMs = now.getTime() - d.getTime();
  const mins = Math.max(0, Math.round(diffMs / 60_000));
  if (mins < 1) return "now";
  if (mins < 60) return `${mins}m`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}
```

#### Copy-for-agent integration

The existing `useCopyForAgent` hook (per research: `src/renderer/src/hooks/useCopyForAgent.ts`) reads from `useCaptureStore`, whose target shape already has `sha`, `branch`, and `diff: { base, head, patch }`. No palette changes needed — we just keep that store in sync from `CommitsView`:

- When a commit row is selected (and `commitDiffQuery` has data): set `{ repoName, sha: meta.sha, branch: undefined, diff: { base: meta.parents[0] ?? '∅', head: meta.sha, patch } }`.
- When the working-tree row is selected (and working-tree-diff query has data): set `{ repoName, sha: undefined, branch: currentBranch, diff: { base: 'HEAD', head: '__wt__', patch } }`.

A single `useEffect` in `CommitsView` watches the resolved selection + patch and calls `captureStore.setTarget(...)` (or the existing setter). Cleanup on unmount clears the target so Files/Diffs tabs regain ownership.

### Implementation Phases

#### Phase 1 — Backend plumbing (~0.5 day)

- Extend `runGit` with `allowedExitCodes?: number[]`.
- Add `composeWorkingTreeDiff` helper in `git-service.ts`.
- Extend `diffInput` with `includeUntracked?: boolean` and branch on it.
- Add `git.log`, `git.status`, `git.commitDiff` procedures.
- Tests: exercise each procedure against a fixture repo with (a) a clean worktree, (b) a dirty worktree with one modified + one untracked, (c) a branch with 3 commits ahead of main, (d) a root commit.

**Success criteria:** tRPC types flow through to the renderer; hand-testing the procedures via a scratch page returns expected shapes.

#### Phase 2 — Route and list (~0.5 day)

- Create route + sidebar + row + empty states.
- Wire log + status queries, selection URL-state, first-row normalization.
- Add the `Commits` tab link in the worktree layout and `TABS` entry in `__root.tsx`.

**Success criteria:** navigating to the tab shows a populated sidebar, arrow-key and click selection both update the URL, and the "Show full history" toggle flips the dataset.

#### Phase 3 — Detail pane (~0.5 day)

- `CommitDetail` component with header + DiffView integration.
- Wire `git.commitDiff` and `git.diff` (with `includeUntracked: true`) queries based on selection.
- Wire capture-store updates for copy-for-agent.
- Handle large-diff path (reuse existing `DiffView` confirmation).

**Success criteria:** clicking through rows loads each delta in the right pane; Cmd-K copy-for-agent copies the expected scope; empty / loading / error states render.

#### Phase 4 — Polish (~0.5 day)

- [x] `formatRelative` helper (landed in Phase 2).
- [ ] fs-watcher invalidation (deferred; short `staleTime` + focus refetch covers v1).
- [x] Keyboard focus ring on the sidebar + arrow-key / j/k navigation.
- [x] Pagination "Load more" wired to `fetchNextPage`.

**Success criteria:** saving a file in the worktree causes the working-tree row + its diff to update without a manual refresh; the "Load more" button extends long histories smoothly.

## Alternative Approaches Considered

**Fold the commit list into the Diffs tab (rejected in brainstorm).** Mixes two fundamentally different diff queries (range vs per-commit) in one view; forces a mode toggle or silent mutation of the Base/Head pickers. Separate tab preserves the clean "one question per tab" model.

**Use `git log -p` to stream commit + patch in one call (rejected).** Simpler to implement, but couples list and detail into one query — pagination becomes messy, and per-commit caching gets worse. Splitting `git.log` from `git.commitDiff` is strictly better: the log call is cheap and scannable, the per-commit call is only paid when you click.

**Background-poll `git.status` every 2s (rejected for long-term, accepted as fallback).** A real filesystem-watcher-driven invalidation is cheaper and snappier, but Phase 1–3 ship fine with `staleTime: 5_000 + refetchOnWindowFocus`. Phase 4 upgrades to watcher-driven.

**New `git.workingTreeDiff` procedure instead of extending `git.diff` (rejected).** Duplicates argument handling (base ref, paths, `-M`, retries). Extending `git.diff` with a single flag reuses the existing fallback logic and keeps the renderer's diff fetching unified.

## System-Wide Impact

### Interaction Graph

- User opens Commits tab → `CommitsView` mounts → `refs` + `preferences` + `git.status` + `git.log` fire in parallel.
- `git.log` spawns `git log` in the worktree's `cwd`; `git.status` spawns `git status --porcelain=v1`. Both use the shared `runGit` helper with its 30s default timeout.
- User clicks a commit row → URL `?sha=` updates → `git.commitDiff` fires → renderer passes `patch` into `DiffView` → `@pierre/diffs` parses and renders → renderer updates `captureStore.target` so `useCopyForAgent` picks up the new scope.
- User invokes Cmd-K → `CopyForAgentPalette` opens → actions read `captureStore.target.diff` → `formatForAgent` composes the output → clipboard write.
- Diffs tab mutates `compareBases` via `preferences.setCompareBase` → `preferences.get` invalidates → `CommitsView`'s `resolvedBase` recomputes → `git.log` query key changes → new dataset → first-row re-normalization (if current `sha` not in the new list).

### Error & Failure Propagation

- `runGit` throws `GitCommandError{ exitCode, stderr }` on non-zero exit outside of `allowedExitCodes`.
- `git.log`: "unknown revision" (missing base) → procedure retries without the range; surfaces to UI only if the retry also fails.
- `git.commitDiff`: invalid SHA → throws; UI shows a "commit not found" empty state and clears selection.
- Working-tree diff: `git diff --no-index` exits 1 for "differences found" — explicitly whitelisted via `allowedExitCodes`. Any other exit code still throws.
- Large patches: existing `DiffView` warns at 512 KB; preserved.
- Shallow clone: `git log` may not reach `base`. The same retry-without-range path catches it. We add a small warning banner when the retry path activates so the user knows they're seeing full history instead of the range.

### State Lifecycle Risks

- `captureStore.target` is shared across tabs. Commits tab writes on selection, clears on unmount. If the user navigates away mid-update, a stale target could leak briefly — mitigated by clearing in the `useEffect` cleanup.
- Preferences `compareBases` are the single source of truth — no second copy in Commits. No drift risk.
- `git.log` infinite-query cache must key on `{ repoId, worktreeId, base, full }` so the toggle and base changes both invalidate cleanly.
- Selecting a `sha` that no longer exists (after force-push or rebase) — the detail query 404s; UI falls back to first row on next render.

### API Surface Parity

- Agents already consume tRPC procedures. The three new procedures (`log`, `status`, `commitDiff`) are tools an agent can call directly — no UI-only privilege. Copy-for-agent output for a commit-scoped selection uses the same `formatForAgent` templates, so what a user copies is what an agent could read programmatically.
- No other interfaces expose commit history today; this is purely additive.

### Integration Test Scenarios

1. **Dirty worktree with untracked:** create a file in a clean worktree, open Commits tab → working-tree row appears at top, clicking it shows the untracked file as a new-file patch. Confirms `composeWorkingTreeDiff` + `WorkingTreeRow` visibility + `DiffView` integration.
2. **Base change propagates:** in the Diffs tab, change Base to `origin/main`; switch to Commits → list refreshes with commits relative to `origin/main` (not `main`). Confirms shared-preference wiring.
3. **Full-history toggle survives re-mount:** toggle on, navigate to Files, come back → still full-history. Confirms URL-state persistence.
4. **Root commit:** check out a ref whose HEAD is the repo's root commit → `git.commitDiff` returns the commit's full introduction patch via `git show`. Confirms no `sha^` crash.
5. **Copy-for-agent scope:** select a commit, Cmd-K → "Copy diff" → clipboard contains the per-commit patch, not the range diff. Select working-tree row, repeat → clipboard contains the tracked+untracked composed patch.

## Acceptance Criteria

### Functional

- [x] A `Commits` tab appears between `Diffs` and `PRs` on the worktree layout.
- [x] The tab's URL is `/repos/$repoId/wt/$worktreeId/commits` with `?sha=` and `?full=` search params.
- [x] Sidebar shows commits in `base..HEAD` by default, in reverse chronological order, with short SHA + subject + relative date per row.
- [x] A "Working tree" row appears at the top of the sidebar when and only when `git.status` reports a dirty worktree.
- [x] "Show full history" toggles between `base..HEAD` and full HEAD log; state is reflected in `?full=`.
- [x] Clicking a row loads its delta in the right pane using the existing `DiffView`.
- [x] Selecting a row updates the copy-for-agent capture scope so `Cmd-K` → copy-diff copies that row's patch.
- [x] The tab's compare-base reads from and mutates the same `preferences.compareBases` store as the Diffs tab.
- [x] Deep-linking to `?sha=<valid-sha>` selects that commit on mount.
- [x] `?sha=<missing-sha>` falls back to the first row without crashing.
- [x] Root-commit diffs render correctly. (via `git show --format=`)
- [x] Untracked files appear in the working-tree row's diff as new-file patches.

### Non-Functional

- [ ] Log query for a branch of 50 commits returns in < 500 ms on a warm cache.
- [ ] Per-commit diff query returns in < 1 s for commits under 10 MB of diff.
- [ ] Sidebar scrolls smoothly at 10 k commits (virtualization not required for v1 if the list caps at 50 + load-more; otherwise add).
- [ ] No regression in Files/Diffs/PRs tab performance (tab switch still instantaneous).

### Quality Gates

- [ ] Unit tests for `formatRelative`.
- [ ] Unit tests for `composeWorkingTreeDiff` with (a) only tracked changes, (b) only untracked, (c) both, (d) binary untracked.
- [ ] tRPC procedure tests for `log` (range + full + unknown-base fallback), `status`, `commitDiff` (including root commit).
- [ ] Manual smoke test: the 5 integration scenarios above.
- [ ] Typescript + lint clean.

## Success Metrics

- Qualitative: user can review an agent's branch commit-by-commit without leaving the Commits tab; copy-for-agent per-commit feels identical to existing flows.
- Quantitative: measured by dogfooding — how many sessions include navigating to `/commits` at least once, and how often per-commit copy-for-agent is used vs range copy.

## Dependencies & Prerequisites

- No new npm dependencies.
- No new system dependencies (`git` already required).
- No migrations (preferences schema unchanged).

## Risk Analysis & Mitigation

| Risk                                                                                           | Severity | Mitigation                                                                                                                                                     |
| ---------------------------------------------------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Untracked binary files or huge untracked directories blow up `composeWorkingTreeDiff`'s buffer | Medium   | Per-file `maxBuffer: 64 MB` cap; if exceeded, fall back to listing the path without a patch body (show "too large to preview"). Add in Phase 4 if encountered. |
| `git show` on a merge commit shows the combined diff; user expects "vs first parent"           | Low      | Document; pass `-m --first-parent` only if the user reports the default feels wrong. Deferred.                                                                 |
| Selection state desync between URL and sidebar focus after Ref changes                         | Medium   | Single effect in `CommitsView` owns the reconciliation; sidebar never holds its own selection state.                                                           |
| Shallow clones show surprising logs                                                            | Medium   | Banner when the `base..HEAD` retry-without-range fallback triggers.                                                                                            |
| `captureStore` write/clear races between tab unmount and a pending diff query                  | Low      | Guard the `useEffect` cleanup with a cancelled-flag; set target only when the query's data matches the currently-selected scope.                               |
| Polling `git.status` on a large repo churns CPU                                                | Low      | `staleTime: 5_000` + `refetchOnWindowFocus`; Phase 4 replaces polling with watcher-driven invalidation.                                                        |

## Edge Cases (for SpecFlow coverage)

- **Empty branch + clean worktree:** sidebar shows an empty state ("No commits on this branch yet").
- **Empty branch + dirty worktree:** only the working-tree row is visible; selecting it shows the uncommitted changes.
- **Branch = base:** log returns []; empty state as above.
- **Head points at a tag, not a branch:** works; we use `HEAD`.
- **Rebase / force-push while tab is open:** `fs-watcher` bump (Phase 4) invalidates log; current selection may vanish → first-row fallback.
- **Detached HEAD:** works; `git log HEAD` is the same.
- **Submodule changes:** `git diff` already surfaces `--- a/sub` style entries; no special handling in v1.
- **Very long commit messages:** right-pane header collapses body by default; `<details>` expands.
- **Binary diffs:** `DiffView` already filters these — reused.
- **Window focus regained after long idle:** `refetchOnWindowFocus` pulls fresh `status` + `log`.

## Future Considerations

- **Virtualized sidebar list** when full-history mode commonly exceeds 500 rows.
- **Keyboard `j`/`k` global with focus management** once the app adds a broader keybinding pass.
- **Merge-commit diff mode toggle** (combined vs first-parent).
- **Commit graph glyphs** showing parent relationships in the sidebar.
- **Per-commit "copy file list" action** — trivial once the meta is already on hand.
- **Ref comparison within Commits tab** (a base picker that doesn't sync with Diffs) if the shared-base constraint starts to chafe.

## Documentation Plan

- Update the top-level brainstorm/plan index in `docs/plans/` to list this plan.
- No README/user docs needed yet (app is pre-release, internal).

## Sources & References

### Origin

- **Brainstorm:** [docs/brainstorms/2026-04-24-commits-tab-brainstorm.md](../brainstorms/2026-04-24-commits-tab-brainstorm.md). Carried forward: (1) separate tab over folded-in, (2) working-tree row as part of the same list, (3) shared compare-base with Diffs tab, (4) copy-for-agent plugs in per-row, (5) `git.log`/`git.status`/`git.commitDiff` as the backend surface.

### Internal references

- tRPC pattern: `src/main/trpc/procedures/git.ts:15-124` (input schemas, fallback pattern).
- `runGit` signature + timeout/buffer semantics: `src/main/services/git-service.ts:27-58`.
- Route template: `src/renderer/src/routes/repos.$repoId.wt.$worktreeId.diffs.tsx:14-173`.
- Tab nav + tokens: `src/renderer/src/routes/repos.$repoId.wt.$worktreeId.tsx:4-54`.
- DiffView props + cacheKey semantics: `src/renderer/src/components/diffs/DiffView.tsx:25-146`.
- Compare-base persistence: `src/main/services/workspace-store.ts:19,109-119`; `src/main/trpc/procedures/preferences.ts` (`setCompareBase`).
- Copy-for-agent capture shape: `src/renderer/src/hooks/useCopyForAgent.ts:105-161`; palette: `src/renderer/src/components/copy/CopyForAgentPalette.tsx:48-101`.
- `TABS` registry for menu/commands: `src/renderer/src/routes/__root.tsx:35`.
- fs-watcher debounce + watched paths: `src/main/services/fs-watcher.ts:1-59`.

### External references

- `git log` pretty-format placeholders and record separators: https://git-scm.com/docs/git-log#_pretty_formats
- `git diff --no-index` exit-code semantics: https://git-scm.com/docs/git-diff
- `git show --format= <sha>` to emit a bare patch: https://git-scm.com/docs/git-show

### Related work

- No related PRs yet (feature is new surface).
