import { z } from 'zod'
import { publicProcedure, router } from '../trpc.js'
import { runGit } from '../../services/git-service.js'
import {
  detectMainBranch,
  resolveRepo,
  resolveWorktree,
} from '../../services/workspace-lookup.js'
import type { GitRef } from '@shared/types'

const repoIdInput = z.object({ repoId: z.string().uuid() })

// `null` head = working tree. `worktreeId` optionally pins the diff to a
// specific checkout; otherwise we use the primary worktree.
const diffInput = z.object({
  repoId: z.string().uuid(),
  worktreeId: z.string().min(1).nullable().optional(),
  base: z.string().min(1),
  head: z.string().nullable(),
  /** When head is null (working tree), include staged changes (`--cached`). */
  staged: z.boolean().optional(),
  /** Optional path filter (relative); when set, diff only those paths. */
  paths: z.array(z.string().min(1)).optional(),
})

async function listLocalBranches(cwd: string): Promise<GitRef[]> {
  const out = await runGit(
    ['for-each-ref', '--format=%(refname:short)%09%(objectname)', 'refs/heads/'],
    { cwd },
  )
  return parseRefLines(out, 'branch')
}

async function listRemoteBranches(cwd: string): Promise<GitRef[]> {
  const out = await runGit(
    ['for-each-ref', '--format=%(refname:short)%09%(objectname)', 'refs/remotes/origin/'],
    { cwd },
  )
  return parseRefLines(out, 'remote').filter((r) => !r.name.endsWith('/HEAD'))
}

async function listTags(cwd: string): Promise<GitRef[]> {
  const out = await runGit(
    ['for-each-ref', '--format=%(refname:short)%09%(objectname)', 'refs/tags/'],
    { cwd },
  )
  return parseRefLines(out, 'tag')
}

function parseRefLines(raw: string, kind: GitRef['kind']): GitRef[] {
  if (!raw) return []
  return raw
    .split('\n')
    .filter((l) => l.length > 0)
    .map((line) => {
      const tab = line.indexOf('\t')
      if (tab === -1) return null
      return {
        name: line.slice(0, tab),
        sha: line.slice(tab + 1),
        kind,
      } satisfies GitRef
    })
    .filter((r): r is GitRef => r !== null)
}

export const gitRouter = router({
  refs: publicProcedure.input(repoIdInput).query(async ({ input }) => {
    const repo = await resolveRepo(input.repoId)
    const [local, remote, tags, mainBranch] = await Promise.all([
      listLocalBranches(repo.path),
      listRemoteBranches(repo.path),
      listTags(repo.path),
      detectMainBranch(repo.path),
    ])
    return {
      mainBranch,
      refs: [...local, ...remote, ...tags],
    }
  }),

  diff: publicProcedure.input(diffInput).query(async ({ input }) => {
    const { worktree } = await resolveWorktree(input.repoId, input.worktreeId)
    const cwd = worktree.path
    const pathArgs = input.paths && input.paths.length > 0 ? ['--', ...input.paths] : []

    // Common flags: rename detection on, no colour, no pager. Binary entries
    // are stripped on the renderer side when a file has no hunks.
    const common = ['--no-color', '-M']

    let args: string[]
    if (input.head === null) {
      // Working-tree diff of the selected worktree vs the chosen base.
      // Two flavours: `staged` = only index changes; otherwise HEAD of the
      // worktree + index + untracked-to-be-tracked.
      if (input.staged) {
        args = ['diff', ...common, '--cached', input.base, ...pathArgs]
      } else {
        args = ['diff', ...common, input.base, ...pathArgs]
      }
    } else {
      // Commit/branch range. Two-dot so the diff reflects "what head has on
      // top of base" directly; three-dot would hide head-side history.
      args = ['diff', ...common, `${input.base}..${input.head}`, ...pathArgs]
    }

    try {
      return { patch: await runGit(args, { cwd, maxBuffer: 128 * 1024 * 1024 }) }
    } catch (err) {
      // Fallback: if base can't be resolved inside this worktree (fresh clone
      // before fetch), retry with `HEAD` so the user at least sees a diff
      // rather than a cryptic stderr.
      if (
        err instanceof Error &&
        /unknown revision|bad revision/i.test(err.message) &&
        input.base !== 'HEAD'
      ) {
        const retryArgs = args.map((a) => (a === input.base ? 'HEAD' : a))
        const patch = await runGit(retryArgs, { cwd, maxBuffer: 128 * 1024 * 1024 })
        return { patch }
      }
      throw err
    }
  }),
})
