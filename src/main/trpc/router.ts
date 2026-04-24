import { router } from './trpc.js'
import { systemRouter } from './procedures/system.js'
import { workspaceRouter } from './procedures/workspace.js'

export const appRouter = router({
  system: systemRouter,
  workspace: workspaceRouter,
})

export type AppRouter = typeof appRouter
