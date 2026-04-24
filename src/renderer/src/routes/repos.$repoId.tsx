import { createFileRoute, Outlet } from '@tanstack/react-router'

export const Route = createFileRoute('/repos/$repoId')({
  component: RepoLayout,
})

function RepoLayout() {
  return <Outlet />
}
