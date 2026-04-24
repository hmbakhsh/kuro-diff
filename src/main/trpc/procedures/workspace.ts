import { z } from 'zod'
import { dialog } from 'electron'
import { publicProcedure, router } from '../trpc.js'
import { resolveRepoPath } from '../../services/repo-resolver.js'
import {
  getRepos,
  removeRepoById,
  upsertRepo,
} from '../../services/workspace-store.js'
import { listWorktrees } from '../../services/worktree.js'
import { createGit } from '../../services/git-service.js'
import { watcherRegistry } from '../../services/watcher-registry.js'
import type { Worktree } from '@shared/types'

const pathInput = z.object({ path: z.string().min(1) })
const repoIdInput = z.object({ repoId: z.string().uuid() })

export const workspaceRouter = router({
  list: publicProcedure.query(async () => {
    return getRepos()
  }),

  addRepo: publicProcedure.input(pathInput).mutation(async ({ input }) => {
    const repo = await resolveRepoPath(input.path)

    // Reject duplicate paths outright — id will differ but path is the
    // canonical identity.
    const existing = await getRepos()
    const duplicate = existing.find((r) => r.path === repo.path)
    if (duplicate) return duplicate

    // Register watcher BEFORE persisting so a failure there doesn't leave an
    // orphaned repo in the store.
    watcherRegistry.register(repo.id, repo.path, () => {
      // Phase 2 MVP: log only. Phase 3+ will emit through a tRPC subscription
      // so the renderer can invalidate queries.
      console.log(`[workspace] ${repo.name} changed`)
    })

    try {
      await upsertRepo(repo)
    } catch (err) {
      watcherRegistry.unregister(repo.id)
      throw err
    }
    return repo
  }),

  addRepoFromDialog: publicProcedure.mutation(async () => {
    const result = await dialog.showOpenDialog({
      title: 'Add repository',
      properties: ['openDirectory', 'createDirectory', 'treatPackageAsDirectory'],
      buttonLabel: 'Add',
    })
    if (result.canceled || result.filePaths.length === 0) return null
    const path = result.filePaths[0]!
    const repo = await resolveRepoPath(path)
    const existing = await getRepos()
    const duplicate = existing.find((r) => r.path === repo.path)
    if (duplicate) return duplicate
    watcherRegistry.register(repo.id, repo.path, () => {
      console.log(`[workspace] ${repo.name} changed`)
    })
    try {
      await upsertRepo(repo)
    } catch (err) {
      watcherRegistry.unregister(repo.id)
      throw err
    }
    return repo
  }),

  removeRepo: publicProcedure.input(repoIdInput).mutation(async ({ input }) => {
    watcherRegistry.unregister(input.repoId)
    await removeRepoById(input.repoId)
    return { ok: true }
  }),

  listWorktrees: publicProcedure
    .input(repoIdInput)
    .query(async ({ input }): Promise<Worktree[]> => {
      const repos = await getRepos()
      const repo = repos.find((r) => r.id === input.repoId)
      if (!repo) return []
      return listWorktrees(repo.path)
    }),

  status: publicProcedure
    .input(repoIdInput)
    .query(async ({ input }) => {
      const repos = await getRepos()
      const repo = repos.find((r) => r.id === input.repoId)
      if (!repo) return { dirty: false, branch: null, ahead: 0, behind: 0 }
      try {
        const s = await createGit(repo.path).status()
        return {
          dirty: !s.isClean(),
          branch: s.current,
          ahead: s.ahead,
          behind: s.behind,
        }
      } catch {
        return { dirty: false, branch: null, ahead: 0, behind: 0 }
      }
    }),
})
