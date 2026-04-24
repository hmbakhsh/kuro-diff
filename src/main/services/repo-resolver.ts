import { existsSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { runGit } from './git-service.js'
import { mapRepoToGitHub } from './github-mapping.js'
import type { WorkspaceRepo } from '@shared/types'

/**
 * Validate that a path is a git repo (or a worktree) and return a
 * WorkspaceRepo pointing at the primary work tree. If the input is a
 * worktree, resolves to the parent main repo via `git rev-parse
 * --git-common-dir`.
 */
export async function resolveRepoPath(inputPath: string): Promise<WorkspaceRepo> {
  const abs = resolve(inputPath)
  if (!existsSync(abs)) {
    throw new RepoValidationError(`path does not exist: ${abs}`)
  }
  const stat = statSync(abs)
  if (!stat.isDirectory()) {
    throw new RepoValidationError(`not a directory: ${abs}`)
  }

  // `git rev-parse --git-common-dir` returns the shared `.git` even if the
  // input is a secondary worktree. `--show-toplevel` returns the main repo's
  // working tree. We call both from the input path to cover all cases.
  let commonDir: string
  let topLevel: string
  try {
    commonDir = (
      await runGit(['rev-parse', '--git-common-dir'], { cwd: abs })
    ).trim()
    topLevel = (
      await runGit(['rev-parse', '--show-toplevel'], { cwd: abs })
    ).trim()
  } catch (err) {
    throw new RepoValidationError(
      `path is not inside a git repo: ${abs}${err instanceof Error ? ` (${err.message})` : ''}`,
    )
  }

  // common-dir is typically `<main-repo>/.git`. The main repo's working tree
  // is its parent. If we're inside a secondary worktree, `show-toplevel`
  // returns the worktree's root, not the main repo — we want the main repo as
  // the canonical WorkspaceRepo.
  const mainRepoPath = commonDir.endsWith('/.git')
    ? commonDir.slice(0, -'/.git'.length)
    : topLevel

  // origin remote → github info (best effort). `git remote get-url origin`
  // fails cleanly with non-zero if no origin.
  let defaultBranch: string | null = null
  try {
    const head = (
      await runGit(['symbolic-ref', '--short', 'HEAD'], { cwd: mainRepoPath })
    ).trim()
    defaultBranch = head.length > 0 ? head : null
  } catch {
    defaultBranch = null
  }

  const github = await mapRepoToGitHub(mainRepoPath).catch(() => null)

  return {
    id: randomUUID(),
    path: mainRepoPath,
    name: basename(mainRepoPath),
    defaultBranch,
    github: github ? { owner: github.owner, repo: github.repo, host: github.host } : null,
    addedAt: new Date().toISOString(),
  }
}

export class RepoValidationError extends Error {
  readonly code = 'REPO_VALIDATION_FAILED'
  constructor(message: string) {
    super(message)
    this.name = 'RepoValidationError'
  }
}
