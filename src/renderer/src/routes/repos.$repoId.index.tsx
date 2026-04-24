import { createFileRoute, Navigate } from '@tanstack/react-router'

export const Route = createFileRoute('/repos/$repoId/')({
  component: RepoIndexRedirect,
})

function RepoIndexRedirect() {
  const { repoId } = Route.useParams()
  return <Navigate to="/repos/$repoId/files" params={{ repoId }} replace />
}
