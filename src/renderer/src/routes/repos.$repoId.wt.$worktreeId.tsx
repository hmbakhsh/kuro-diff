import { createFileRoute, Link, Outlet } from '@tanstack/react-router'
import { cn } from '@renderer/lib/cn'

export const Route = createFileRoute('/repos/$repoId/wt/$worktreeId')({
  component: WorktreeLayout,
})

function WorktreeLayout() {
  const { repoId, worktreeId } = Route.useParams()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex shrink-0 items-center gap-1 border-b border-black/10 px-3 py-1.5 text-[12px] dark:border-white/10">
        <Link
          to="/repos/$repoId/wt/$worktreeId/files"
          params={{ repoId, worktreeId }}
          className={tabIdleClass}
          activeProps={{ className: tabActiveClass }}
        >
          Files
        </Link>
        <Link
          to="/repos/$repoId/wt/$worktreeId/diffs"
          params={{ repoId, worktreeId }}
          className={tabIdleClass}
          activeProps={{ className: tabActiveClass }}
        >
          Diffs
        </Link>
        <Link
          to="/repos/$repoId/prs"
          params={{ repoId }}
          className={tabIdleClass}
          activeProps={{ className: tabActiveClass }}
        >
          PRs
        </Link>
      </nav>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}

const tabIdleClass = cn(
  'rounded-md px-2.5 py-1 text-zinc-500 hover:bg-black/5 hover:text-zinc-900',
  'dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100',
)

const tabActiveClass = cn(
  'rounded-md bg-black/10 px-2.5 py-1 text-zinc-900',
  'dark:bg-white/15 dark:text-zinc-100',
)
