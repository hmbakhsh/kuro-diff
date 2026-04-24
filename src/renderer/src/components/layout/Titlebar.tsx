import { ChevronRight, GitBranch } from 'lucide-react'
import { trpc } from '@renderer/trpc'
import { cn } from '@renderer/lib/cn'
import type { Worktree } from '@shared/types'

interface TitlebarProps {
  repoId: string | null
  worktreeId: string | null
}

/**
 * Drag strip that becomes a `workspace → branch` breadcrumb when the user is
 * viewing a worktree. Pure affordance — the base comparison lives in the
 * diffs toolbar, not here.
 */
export function Titlebar({ repoId, worktreeId }: TitlebarProps) {
  if (!repoId || !worktreeId) {
    return (
      <div className="titlebar-drag h-11 shrink-0 border-b border-black/10 dark:border-white/10" />
    )
  }
  return <WorktreeBreadcrumb repoId={repoId} worktreeId={worktreeId} />
}

interface WorktreeBreadcrumbProps {
  repoId: string
  worktreeId: string
}

function WorktreeBreadcrumb({ repoId, worktreeId }: WorktreeBreadcrumbProps) {
  const repos = trpc.workspace.list.useQuery(undefined, { staleTime: 60_000 })
  const worktrees = trpc.workspace.listWorktrees.useQuery(
    { repoId },
    { staleTime: 30_000 },
  )

  const repoName = repos.data?.find((r) => r.id === repoId)?.name ?? '…'
  const worktree = worktrees.data?.find((w) => w.id === worktreeId)

  return (
    <div
      className={cn(
        'titlebar-drag flex h-11 shrink-0 items-center gap-2 border-b border-black/10 px-3 text-[13px]',
        'dark:border-white/10',
      )}
    >
      <span className="drag-none truncate font-medium">{repoName}</span>
      <ChevronRight className="size-3.5 shrink-0 text-zinc-400" strokeWidth={2} />
      <BranchLabel worktree={worktree ?? null} />
    </div>
  )
}

function BranchLabel({ worktree }: { worktree: Worktree | null }) {
  const label = worktree
    ? worktree.detached
      ? `(detached @ ${worktree.head.slice(0, 7)})`
      : worktree.branch?.replace('refs/heads/', '') ?? '(unknown)'
    : '…'
  return (
    <span className="drag-none flex min-w-0 items-center gap-1.5 font-mono text-zinc-500">
      <GitBranch className="size-3.5 shrink-0" strokeWidth={2} />
      <span className="truncate">{label}</span>
    </span>
  )
}
