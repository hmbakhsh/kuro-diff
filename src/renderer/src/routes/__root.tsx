import {
  createRootRoute,
  Outlet,
  useMatches,
  useNavigate,
} from '@tanstack/react-router'
import { WorkspaceSidebar } from '@renderer/components/workspace/WorkspaceSidebar'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const matches = useMatches()
  const navigate = useNavigate()

  // The active repo is whichever `/repos/$repoId/*` match is in the stack.
  const activeRepoId =
    matches
      .map((m) => (m.params as { repoId?: string }).repoId)
      .find((v): v is string => typeof v === 'string') ?? null

  return (
    <div className="flex h-full min-h-0">
      <WorkspaceSidebar
        activeRepoId={activeRepoId}
        onSelectRepo={(repoId) =>
          void navigate({ to: '/repos/$repoId', params: { repoId } })
        }
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="titlebar-drag h-11 shrink-0 border-b border-black/10 dark:border-white/10" />
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
