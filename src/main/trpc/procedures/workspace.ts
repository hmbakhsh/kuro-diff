import { publicProcedure, router } from '../trpc.js'

// Phase 2 will land addRepo/removeRepo/listRepos/listWorktrees.
export const workspaceRouter = router({
  list: publicProcedure.query(() => [] as never[]),
})
