---
date: 2026-04-24
topic: kuro-diff
---

# kuro-diff — AI Code Review Workstation

## What We're Building

A macOS desktop application (Electron) that replaces a traditional code editor with a **read-only review-and-extract** workflow optimized for iterating with AI coding agents. The user no longer writes code themselves; their core loop is: an agent produces changes → they review them in kuro-diff → they copy hunks/filenames/context back to the agent as feedback.

The app is organized around three surfaces:

1. **Multi-repo workspace** — persistent sidebar listing added repos. Each repo auto-discovers its git worktrees (via `git worktree list` or `.git/worktrees/`) and groups them under the base repo.
2. **Read-only file viewer** — browse any file in the currently selected repo/worktree with a polished file tree (Pierre's [trees.software](https://trees.software) component) and syntax-highlighted content display.
3. **Diff viewer** — inspect working-tree changes, branch diffs, and PR diffs using Pierre's `@pierre/diffs` component. Unified and split modes.
4. **GitHub PR browser** — full-featured list of open/closed/merged PRs per repo via the GitHub API (Octokit), with filters, search, and inline diff view.

**Not building (explicitly YAGNI):** accept/reject/staging actions, inline comments, review-state persistence (read/unread), terminal integration, agent execution, AI chat panels.

## Why This Approach

Considered three approaches:

- **A — Focused MVP (chosen).** Fresh Electron + TanStack + shadcn app from a minimal starter (e.g. [`CarlosZiegler/electron-tanstack`](https://github.com/CarlosZiegler/electron-tanstack)). Small surface area, ships fast, architecture is shaped by the stated read-and-copy workflow.
- **B — Fork [`t3-oss/t3-code`](https://github.com/t3-oss/t3-code).** T3 Code is the closest adjacent app (agent GUI with worktree + diff viewer + PR workflow), but its UI/state model is built *around* running agents. Stripping agent logic while preserving its plumbing would fight the existing architecture more than it would accelerate us.
- **C — Full review workstation.** Adds annotations, recents, Cmd+P jump, custom copy templates, merged-PR timeline. Real risk of building features before knowing what the daily workflow actually needs.

A wins because the user's stated workflow is narrow (pure viewing + copy) and consciously stateless — no review state, no annotations. YAGNI applies strongly: ship A, use it, expand only once real gaps emerge.

## Key Decisions

- **Stack: Electron + TanStack Router + TanStack Query + React + shadcn/ui + Tailwind.** TypeScript throughout. Vite-based build.
  - **Rationale:** Matches user preference ("use what's being used for t3 code"). Mature, well-documented, good DX.
- **Starter template: [`CarlosZiegler/electron-tanstack`](https://github.com/CarlosZiegler/electron-tanstack).** Fresh project, not a fork of T3 Code.
  - **Rationale:** Already wires up Electron + React 19 + TanStack Router + shadcn — directly the target stack.
- **UI components: Pierre's `@pierre/diffs` + trees.software file tree.** Shiki-based theming, shared light/dark modes across both.
  - **Rationale:** Cohesive visual language (both by Pierre), already designed for code-review context.
- **Git data source: local `git` CLI (spawned from Electron main process) + Octokit for GitHub.** Not libgit2/isomorphic-git.
  - **Rationale:** Simpler, always correct, matches what worktrees/gitdir resolution actually needs. GitHub API covers PR browsing cleanly.
- **Worktree discovery: `git worktree list --porcelain` on repo open.** Group worktrees under their main repo in the workspace sidebar.
  - **Rationale:** Authoritative, handles both linked and primary worktrees.
- **Read-only by design.** No file edits, no `git` writes from within the app. Reduces risk, sharpens the product identity.
- **Copy-for-agent affordance.** First-class action (hotkey + context menu) that copies `{repo, file path, line range, hunk content}` in a format pastable into Claude/Cursor/similar. This is the one non-obvious feature that directly serves the stated workflow.
- **macOS first.** Electron still builds for all platforms, but UX polish (menubar, traffic lights, native feel) targets macOS in v1.

## Open Questions

Resolved in conversation — none outstanding on product direction. Questions that belong in the **plan** (HOW), not this brainstorm:

- **Pierre component licensing/availability.** Are `@pierre/diffs` and the trees.software component publicly published packages, or do they require access? Plan should verify installability and fall back to `git-diff-view` + a custom tree if not.
- **GitHub auth flow.** OAuth device flow vs. personal access token for the MVP.
- **Shiki theme parity.** Exact themes to ship (match Pierre's defaults).
- **Copy-for-agent format.** Exact text format (markdown fenced block with path + line range header is the obvious default).
- **Worktree edge cases.** Bare repos, submodules, detached worktrees — handle or defer.

## Next Steps

→ `/ce:plan` for implementation details (file structure, IPC boundaries, Octokit setup, Pierre component integration, PR browser UX, copy-for-agent format).
