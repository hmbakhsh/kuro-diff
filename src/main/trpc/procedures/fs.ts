import { z } from 'zod'
import { publicProcedure, router } from '../trpc.js'
import { resolveWorktree } from '../../services/workspace-lookup.js'
import {
  listRepoFiles,
  readRepoFile,
  type FileRead,
  type TreeResult,
} from '../../services/fs-service.js'

// All fs ops run inside a specific worktree. `worktreeId` is optional — when
// omitted the primary worktree is used. That preserves older callers while
// giving worktree-aware routes a way to target the checkout they're viewing.
const repoFileInput = z.object({
  repoId: z.string().uuid(),
  worktreeId: z.string().min(1).nullable().optional(),
  path: z.string().min(1),
  force: z.boolean().optional(),
})

const repoIdInput = z.object({
  repoId: z.string().uuid(),
  worktreeId: z.string().min(1).nullable().optional(),
  includeIgnored: z.boolean().optional(),
})

export const fsRouter = router({
  readFile: publicProcedure
    .input(repoFileInput)
    .query(async ({ input }): Promise<FileRead> => {
      const { worktree } = await resolveWorktree(input.repoId, input.worktreeId)
      return readRepoFile(worktree.path, input.path, { force: input.force ?? false })
    }),

  listTree: publicProcedure
    .input(repoIdInput)
    .query(async ({ input }): Promise<TreeResult> => {
      const { worktree } = await resolveWorktree(input.repoId, input.worktreeId)
      return listRepoFiles(worktree.path, {
        includeIgnored: input.includeIgnored ?? false,
      })
    }),
})
