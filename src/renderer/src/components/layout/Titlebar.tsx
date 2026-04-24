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
      <div className="titlebar-drag flex h-11 shrink-0 items-center justify-end border-b border-black/10 px-3 dark:border-white/10">
        <RateLimitPill />
      </div>
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
      <div className="ml-auto">
        <RateLimitPill />
      </div>
    </div>
  )
}

/**
 * Quota indicator. No polling — the query refreshes on its stale schedule
 * and we rely on other PR queries to bust the cache when they hit a
 * `rate-limited` error. Only visible when `gh` is installed, authed, and
 * the remaining quota is below 1000; above that, silence is a better
 * signal than noise.
 */
function RateLimitPill() {
  const auth = trpc.github.authStatus.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  })
  const rateLimit = trpc.github.rateLimit.useQuery(undefined, {
    // 5 minutes — plenty for a quota display without polling.
    staleTime: 5 * 60 * 1000,
    enabled: auth.data?.authenticated ?? false,
  })
  if (!auth.data?.authenticated) return null
  if (!rateLimit.data) return null
  if (rateLimit.data.remaining > 1000) return null

  const exhausted = rateLimit.data.remaining === 0
  return (
    <span
      className={cn(
        'drag-none rounded-full border px-2 py-0.5 font-mono text-[10px]',
        exhausted
          ? 'border-red-500/40 bg-red-500/10 text-red-500'
          : 'border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400',
      )}
      title={`GitHub API quota · resets ${new Date(rateLimit.data.resetAt).toLocaleTimeString()}`}
    >
      {rateLimit.data.remaining}/{rateLimit.data.limit}
    </span>
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
