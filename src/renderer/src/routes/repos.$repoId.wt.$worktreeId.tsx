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
        <WorktreeTab
          to="/repos/$repoId/wt/$worktreeId/files"
          label="Files"
          repoId={repoId}
          worktreeId={worktreeId}
        />
        <WorktreeTab
          to="/repos/$repoId/wt/$worktreeId/diffs"
          label="Diffs"
          repoId={repoId}
          worktreeId={worktreeId}
        />
      </nav>
      <div className="min-h-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}

interface WorktreeTabProps {
  to: '/repos/$repoId/wt/$worktreeId/files' | '/repos/$repoId/wt/$worktreeId/diffs'
  label: string
  repoId: string
  worktreeId: string
}

function WorktreeTab({ to, label, repoId, worktreeId }: WorktreeTabProps) {
  return (
    <Link
      to={to}
      params={{ repoId, worktreeId }}
      className={cn(
        'rounded-md px-2.5 py-1 text-zinc-500 hover:bg-black/5 hover:text-zinc-900',
        'dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100',
      )}
      activeProps={{
        className: cn(
          'rounded-md bg-black/10 px-2.5 py-1 text-zinc-900',
          'dark:bg-white/15 dark:text-zinc-100',
        ),
      }}
    >
      {label}
    </Link>
  )
}
