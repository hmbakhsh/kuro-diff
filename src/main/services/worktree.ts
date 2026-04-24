import { existsSync } from 'node:fs'
import { runGit } from './git-service.js'
import type { Worktree } from '@shared/types'

/**
 * Parse `git worktree list --porcelain -z` output.
 *
 * Records are separated by `\0\0`, attribute lines within a record by `\0`.
 * Attributes:
 *   - `worktree <path>`   (always first)
 *   - `HEAD <sha>`
 *   - `branch <full ref>`
 *   - `detached`          (label, no value)
 *   - `bare`              (label)
 *   - `locked [reason]`
 *   - `prunable [reason]`
 *
 * The first record is the primary worktree.
 */
export function parseWorktreePorcelain(raw: string): Worktree[] {
  if (raw.length === 0) return []

  // Trim a trailing record separator if present.
  let body = raw
  if (body.endsWith('\0\0')) body = body.slice(0, -2)
  if (body.endsWith('\0')) body = body.slice(0, -1)

  const records = body.split('\0\0')
  return records
    .map((record, idx) => parseRecord(record, idx === 0))
    .filter((w): w is Worktree => w !== null)
    // Filter out worktrees whose path has been deleted from disk (git reports
    // them until `git worktree prune` runs).
    .filter((w) => existsSync(w.path))
}

function parseRecord(record: string, isPrimary: boolean): Worktree | null {
  const lines = record.split('\0').filter((l) => l.length > 0)
  if (lines.length === 0) return null

  let path: string | null = null
  let head: string | null = null
  let branch: string | null = null
  let detached = false
  let bare = false
  let locked: string | null = null
  let prunable: string | null = null

  for (const line of lines) {
    const spaceIdx = line.indexOf(' ')
    const label = spaceIdx === -1 ? line : line.slice(0, spaceIdx)
    const value = spaceIdx === -1 ? '' : line.slice(spaceIdx + 1)

    switch (label) {
      case 'worktree':
        path = value
        break
      case 'HEAD':
        head = value
        break
      case 'branch':
        branch = value
        break
      case 'detached':
        detached = true
        break
      case 'bare':
        bare = true
        break
      case 'locked':
        locked = value
        break
      case 'prunable':
        prunable = value
        break
    }
  }

  if (!path || !head) return null

  return {
    path,
    head,
    branch,
    detached,
    bare,
    locked,
    prunable,
    isPrimary,
  }
}

export async function listWorktrees(repoPath: string): Promise<Worktree[]> {
  const raw = await runGit(['worktree', 'list', '--porcelain', '-z'], {
    cwd: repoPath,
  })
  return parseWorktreePorcelain(raw)
}
