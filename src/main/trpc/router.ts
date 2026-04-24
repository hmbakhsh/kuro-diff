import { router } from './trpc.js'
import { systemRouter } from './procedures/system.js'
import { workspaceRouter } from './procedures/workspace.js'
import { fsRouter } from './procedures/fs.js'
import { gitRouter } from './procedures/git.js'
import { preferencesRouter } from './procedures/preferences.js'
import { githubRouter } from './procedures/github.js'

export const appRouter = router({
  system: systemRouter,
  workspace: workspaceRouter,
  fs: fsRouter,
  git: gitRouter,
  preferences: preferencesRouter,
  github: githubRouter,
})

export type AppRouter = typeof appRouter
