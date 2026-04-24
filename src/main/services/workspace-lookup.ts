import { getRepos } from './workspace-store.js'
import { listWorktrees } from './worktree.js'
import type { WorkspaceRepo, Worktree } from '@shared/types'

/**
 * Resolve a repoId to its stored repo record. Throws if missing.
 */
export async function resolveRepo(repoId: string): Promise<WorkspaceRepo> {
  const repos = await getRepos()
  const repo = repos.find((r) => r.id === repoId)
  if (!repo) throw new Error(`repo not found: ${repoId}`)
  return repo
}

/**
 * Resolve a worktree within a repo by its short id. When `worktreeId` is
 * undefined, returns the primary worktree (= the main repo directory).
 *
 * We list worktrees on each call to stay correct when the user creates or
 * prunes one outside the app. For read-heavy paths, wrap in TanStack Query
 * at the renderer; we don't cache here.
 */
export async function resolveWorktree(
  repoId: string,
  worktreeId?: string | null,
): Promise<{ repo: WorkspaceRepo; worktree: Worktree }> {
  const repo = await resolveRepo(repoId)
  const worktrees = await listWorktrees(repo.path)
  if (!worktreeId) {
    const primary = worktrees.find((w) => w.isPrimary) ?? worktrees[0]
    if (!primary) throw new Error(`no worktrees for repo: ${repoId}`)
    return { repo, worktree: primary }
  }
  const worktree = worktrees.find((w) => w.id === worktreeId)
  if (!worktree) throw new Error(`worktree not found: ${worktreeId}`)
  return { repo, worktree }
}

/**
 * Detect the repo's canonical "main branch" — the branch we want to diff
 * against by default. Prefers `main`, falls back to `master`, then to HEAD
 * as a last resort for pre-initial-commit repos.
 */
export async function detectMainBranch(repoPath: string): Promise<string> {
  const { runGit } = await import('./git-service.js')
  for (const candidate of ['main', 'master']) {
    try {
      await runGit(['rev-parse', '--verify', '--quiet', `refs/heads/${candidate}`], {
        cwd: repoPath,
      })
      return candidate
    } catch {
      // not found
    }
  }
  return 'HEAD'
}
