import { z } from 'zod'
import { publicProcedure, router } from '../trpc.js'
import { getRepos } from '../../services/workspace-store.js'
import {
  listRepoFiles,
  readRepoFile,
  type FileRead,
} from '../../services/fs-service.js'

const repoFileInput = z.object({
  repoId: z.string().uuid(),
  path: z.string().min(1),
  force: z.boolean().optional(),
})

const repoIdInput = z.object({ repoId: z.string().uuid() })

async function resolveRepoPath(repoId: string): Promise<string> {
  const repos = await getRepos()
  const repo = repos.find((r) => r.id === repoId)
  if (!repo) throw new Error(`repo not found: ${repoId}`)
  return repo.path
}

export const fsRouter = router({
  readFile: publicProcedure
    .input(repoFileInput)
    .query(async ({ input }): Promise<FileRead> => {
      const repoPath = await resolveRepoPath(input.repoId)
      return readRepoFile(repoPath, input.path, { force: input.force ?? false })
    }),

  listTree: publicProcedure
    .input(repoIdInput)
    .query(async ({ input }): Promise<string[]> => {
      const repoPath = await resolveRepoPath(input.repoId)
      return listRepoFiles(repoPath)
    }),
})
