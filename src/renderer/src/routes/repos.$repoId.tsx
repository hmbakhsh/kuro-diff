import { useEffect } from 'react'
import { createFileRoute, Outlet, useNavigate } from '@tanstack/react-router'
import { trpc } from '@renderer/trpc'

export const Route = createFileRoute('/repos/$repoId')({
  component: RepoLayout,
})

// Visiting a repo without picking a worktree redirects to the primary
// worktree's files view. Keeping the layout as a plain `<Outlet />` means
// nested worktree routes do all the UI work.
function RepoLayout() {
  const { repoId } = Route.useParams()
  const navigate = useNavigate()
  const worktrees = trpc.workspace.listWorktrees.useQuery(
    { repoId },
    { staleTime: 30_000 },
  )

  useEffect(() => {
    if (!worktrees.data || worktrees.data.length === 0) return
    // Only redirect when we land *exactly* on /repos/:repoId — nested
    // /wt/:id routes have their own matches and shouldn't be bounced.
    if (typeof location !== 'undefined' && /\/repos\/[^/]+\/?$/.test(location.hash)) {
      const primary =
        worktrees.data.find((w) => w.isPrimary) ?? worktrees.data[0]!
      void navigate({
        to: '/repos/$repoId/wt/$worktreeId/files',
        params: { repoId, worktreeId: primary.id },
        replace: true,
      })
    }
  }, [worktrees.data, navigate, repoId])

  return <Outlet />
}
