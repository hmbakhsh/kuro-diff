import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/repos/$repoId/wt/$worktreeId/')({
  component: WorktreeIndexRedirect,
})

function WorktreeIndexRedirect() {
  const { repoId, worktreeId } = Route.useParams()
  return (
    <Navigate
      to="/repos/$repoId/wt/$worktreeId/files"
      params={{ repoId, worktreeId }}
      replace
    />
  )
}
