import { Link } from '@tanstack/react-router'
import { GitBranch, GitMerge, GitPullRequest, GitPullRequestDraft } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../../main/trpc/router'

type PRSummary = inferRouterOutputs<AppRouter>['github']['prsList'][number]

interface PRListProps {
  repoId: string
  prs: PRSummary[]
  activeNumber: number | null
}

/**
 * Renders the PR list returned by `gh pr list --json`. Rows link to the
 * detail route; the active row is highlighted so the split-pane context is
 * obvious.
 */
export function PRList({ repoId, prs, activeNumber }: PRListProps) {
  if (prs.length === 0) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-500">
        No PRs match these filters.
      </div>
    )
  }

  return (
    <ul className="flex flex-col">
      {prs.map((pr) => {
        const active = pr.number === activeNumber
        return (
          <li key={pr.number}>
            <Link
              to="/repos/$repoId/prs/$number"
              params={{ repoId, number: String(pr.number) }}
              className={cn(
                'flex items-start gap-2 border-b border-black/5 px-3 py-2 text-[12px] transition-colors',
                'hover:bg-black/5 dark:border-white/5 dark:hover:bg-white/5',
                active && 'bg-black/5 dark:bg-white/10',
              )}
            >
              <PRStateIcon state={pr.state} isDraft={pr.isDraft} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate font-medium text-zinc-900 dark:text-zinc-100">
                    {pr.title}
                  </span>
                  <span className="shrink-0 font-mono text-[11px] text-zinc-400">
                    #{pr.number}
                  </span>
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-zinc-500">
                  <span className="truncate">
                    {pr.author?.login ?? 'unknown'}
                  </span>
                  <span aria-hidden>·</span>
                  <span className="flex items-center gap-1 font-mono">
                    <GitBranch className="size-3" strokeWidth={2} />
                    <span className="truncate">{pr.headRefName}</span>
                  </span>
                  <span aria-hidden>·</span>
                  <span className="shrink-0">{formatRelative(pr.updatedAt)}</span>
                </div>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}

function PRStateIcon({
  state,
  isDraft,
}: {
  state: PRSummary['state']
  isDraft: boolean
}) {
  if (state === 'MERGED') {
    return (
      <GitMerge className="mt-0.5 size-4 shrink-0 text-purple-500" strokeWidth={2} />
    )
  }
  if (state === 'CLOSED') {
    return (
      <GitPullRequest className="mt-0.5 size-4 shrink-0 text-red-500" strokeWidth={2} />
    )
  }
  if (isDraft) {
    return (
      <GitPullRequestDraft
        className="mt-0.5 size-4 shrink-0 text-zinc-500"
        strokeWidth={2}
      />
    )
  }
  return (
    <GitPullRequest
      className="mt-0.5 size-4 shrink-0 text-emerald-500"
      strokeWidth={2}
    />
  )
}

const UNITS: [string, number][] = [
  ['y', 60 * 60 * 24 * 365],
  ['mo', 60 * 60 * 24 * 30],
  ['d', 60 * 60 * 24],
  ['h', 60 * 60],
  ['m', 60],
]

function formatRelative(iso: string): string {
  const t = Date.parse(iso)
  if (Number.isNaN(t)) return ''
  const diff = Math.max(0, (Date.now() - t) / 1000)
  for (const [label, seconds] of UNITS) {
    if (diff >= seconds) return `${Math.floor(diff / seconds)}${label} ago`
  }
  return 'just now'
}
