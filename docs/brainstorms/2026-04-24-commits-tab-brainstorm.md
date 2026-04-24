---
date: 2026-04-24
topic: commits-tab
---

# Commits Tab — Branch Inspector

## What We're Building

A fourth tab in the worktree layout — **Commits** — between Diffs and PRs. Purpose: review a branch as a sequence of deltas (the PR-review shape), not one big base..head patch.

Layout is internal to the tab: a vertical sidebar on the left listing rows, and a detail pane on the right showing the selected row's diff inline. Each row is **one delta**:

- **Working-tree row** (top of list, only when dirty): diff = `HEAD → working tree` (staged + unstaged + untracked combined). Lets the user see what hasn't been committed yet without leaving this tab.
- **Commit rows**: diff = `parent..commit` for each commit. Default scope is `base..HEAD` (where `base` = the repo's compare-base, same value the Diffs tab reads — `main` by default). A "Show full history" toggle switches to the full log reachable from HEAD.

Clicking a row loads the delta's diff in the right pane using the same `DiffView` component the Diffs tab uses. Copy-for-agent is available on the selection, scoped to the current row's delta (same palette, same templates).

**Out of scope for this pass:**
- Graph rendering (branch topology lines)
- Merge-commit handling beyond showing them as one entry
- Staged-only vs unstaged-only split of the working-tree row (Diffs tab already has a `staged` toggle — use that for drilldown)
- Rebasing / cherry-picking / any write actions (app is read-only)
- Commit-level comments or review state

## Why This Approach

The user is already reviewing agent iterations commit-by-commit in practice — a commit is the natural unit of "one step the agent took." The Diffs tab collapses all commits into one patch, which is the right default for "what changed overall" but wrong for stepping through an iteration.

Separate tab (vs folding into Diffs):

- **Chosen: separate Commits tab.** Diffs keeps its job (range diff between two refs); Commits owns the per-delta stepping. Each tab's question is clean: Diffs = "what's different between base and head?", Commits = "what deltas make up this branch?" No mode toggles, no hidden picker mutations.
- **Rejected: fold into Diffs as a left rail / collapsible strip.** Mixes two diff queries (range vs per-commit) in one view. Either forces us to replace the current Diffs behaviour or adds a mode toggle — both widen surface area without a clear win.

Working-tree-as-row (vs showing it separately):

- The user explicitly called out wanting uncommitted changes visible here. Putting it as the top row of the same list keeps the "each row is a delta" model consistent and gives the PR-view feel across the whole branch including not-yet-committed work.

## Key Decisions

- **Placement: new `Commits` tab** in the worktree layout at `/repos/$repoId/wt/$worktreeId/commits`, inserted between Diffs and PRs.
- **Default scope: `base..HEAD`** where `base` reads from the existing per-worktree `compareBases` preference (same source as the Diffs tab's Base picker). Falls back to `refs.mainBranch`. No separate picker in the Commits tab — the Diffs tab remains the single place to change the compare-base.
- **Full-history toggle:** small checkbox in the Commits tab header ("Show full history"). Off = `base..HEAD`. On = full log reachable from HEAD with pagination.
- **Working-tree row at top of list** when the worktree is dirty. Its right-pane diff = `HEAD → working tree` (all uncommitted: staged + unstaged + untracked). Hidden when the worktree is clean.
- **Row content:** short SHA + subject line + relative date. No author (this is a solo + agent flow — noise). No merge-commit indicator in v1.
- **Right pane:** full SHA (with copy affordance), full commit message (collapsed to subject by default, expand for body), changed-file summary, and `DiffView` below. Reuses the same component + cache-key pattern as the Diffs tab.
- **Copy-for-agent integration:** the selected row is the copy scope. Existing palette + templates work unchanged; the context passed in is `{ base: sha^, head: sha }` for a commit row, `{ base: 'HEAD', head: '__wt__' }` for the working-tree row.
- **URL / state:** selected commit lives in the route search params (`?sha=abc1234` or `?sha=wt` for the working-tree row), so deep links + back/forward work.

## New Capabilities Needed

- **tRPC `git.log` procedure** in `src/main/trpc/procedures/git.ts` — takes `{ repoId, worktreeId, base?, limit?, cursor? }`, returns `{ commits: [{ sha, shortSha, subject, authorDate, parents }], nextCursor? }`. Spawned via the existing `runGit` helper (`git log --format=...`), no new dependency.
- **`git.status` procedure (or reuse)** to detect a dirty worktree for the working-tree row visibility. Cheap enough to poll / be invalidated by the existing `fs-watcher`.
- **`Commits` tab route + component** mirroring the Diffs tab's patterns (search-param validation, tRPC + React Query, reuse `DiffView`).

## Open Questions

None blocking. Minor follow-ups for plan phase:

- Pagination page size for full-history mode (suggest 100).
- Whether to prefetch the next/previous commit's diff on hover for snappy click-through.
- Keyboard navigation (j/k through the sidebar) — nice-to-have, probably Phase 2.

---

Next: `/ce:plan` to turn this into an implementation plan.
