import {
  createRootRoute,
  Outlet,
  useMatches,
  useNavigate,
} from '@tanstack/react-router'
import { WorkspaceSidebar } from '@renderer/components/workspace/WorkspaceSidebar'
import { Titlebar } from '@renderer/components/layout/Titlebar'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const matches = useMatches()
  const navigate = useNavigate()

  const activeRepoId =
    matches
      .map((m) => (m.params as { repoId?: string }).repoId)
      .find((v): v is string => typeof v === 'string') ?? null
  const activeWorktreeId =
    matches
      .map((m) => (m.params as { worktreeId?: string }).worktreeId)
      .find((v): v is string => typeof v === 'string') ?? null

  return (
    <div className="flex h-full min-h-0">
      <WorkspaceSidebar
        activeRepoId={activeRepoId}
        activeWorktreeId={activeWorktreeId}
        onSelectWorktree={(repoId, worktreeId) =>
          void navigate({
            to: '/repos/$repoId/wt/$worktreeId/files',
            params: { repoId, worktreeId },
          })
        }
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <Titlebar repoId={activeRepoId} worktreeId={activeWorktreeId} />
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
