// Shared types used by both main and renderer. Must contain no runtime deps
// that target Node-only or DOM-only APIs.

export interface WorkspaceRepo {
  readonly id: string
  readonly path: string
  readonly name: string
  readonly defaultBranch: string | null
  readonly github: { owner: string; repo: string; host: string } | null
  readonly addedAt: string
}

export interface Worktree {
  /** Short stable id (first 10 chars of a sha1 of the path). URL-safe. */
  readonly id: string
  readonly path: string
  readonly head: string
  readonly branch: string | null
  readonly detached: boolean
  readonly bare: boolean
  readonly locked: string | null
  readonly prunable: string | null
  readonly isPrimary: boolean
}

export interface DiffRef {
  readonly repoId: string
  readonly base: string
  /** `null` = working tree (uncommitted). */
  readonly head: string | null
}

export interface GitRef {
  readonly name: string
  readonly sha: string
  readonly kind: 'branch' | 'remote' | 'tag'
}

export interface PRSummary {
  readonly number: number
  readonly title: string
  readonly state: 'open' | 'closed' | 'merged'
  readonly author: string
  readonly updatedAt: string
}
