import { router } from './trpc.js'
import { systemRouter } from './procedures/system.js'
import { workspaceRouter } from './procedures/workspace.js'
import { fsRouter } from './procedures/fs.js'

export const appRouter = router({
  system: systemRouter,
  workspace: workspaceRouter,
  fs: fsRouter,
})

export type AppRouter = typeof appRouter
