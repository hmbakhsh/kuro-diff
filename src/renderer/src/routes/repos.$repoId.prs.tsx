import { useEffect, useMemo } from 'react'
import { createFileRoute, Link, Outlet, useNavigate } from '@tanstack/react-router'
import { keepPreviousData } from '@tanstack/react-query'
import { z } from 'zod'
import { trpc } from '@renderer/trpc'
import { cn } from '@renderer/lib/cn'
import { PRFilters, type PRState } from '@renderer/components/prs/PRFilters'
import { PRList } from '@renderer/components/prs/PRList'
import { PRErrorState } from '@renderer/components/prs/PRErrorState'

const searchSchema = z.object({
  state: z.enum(['open', 'closed', 'merged', 'all']).optional(),
  q: z.string().optional(),
})

export const Route = createFileRoute('/repos/$repoId/prs')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  component: PRsRoute,
})

function PRsRoute() {
  const { repoId } = Route.useParams()
  const search = Route.useSearch()
  const navigate = useNavigate({ from: '/repos/$repoId/prs' })
  const utils = trpc.useUtils()

  const state: PRState = search.state ?? 'open'
  const q = search.q ?? ''

  // Backfill github metadata once per repo for stores migrated from pre-Phase-5
  // (where `github` was always `null`). Repos added after Phase 5 already have
  // this populated at resolve-time, so we skip the mutation entirely in that
  // case — no redundant `git remote -v` spawn on every PR route visit.
  const repos = trpc.workspace.list.useQuery(undefined, { staleTime: Infinity })
  const repo = repos.data?.find((r) => r.id === repoId) ?? null
  const needsGithubBackfill = repo !== null && repo.github === null

  const ensureGitHub = trpc.github.ensureGitHub.useMutation({
    onSuccess: () => {
      void utils.workspace.list.invalidate()
    },
  })
  useEffect(() => {
    if (needsGithubBackfill) ensureGitHub.mutate({ repoId })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [repoId, needsGithubBackfill])

  const worktrees = trpc.workspace.listWorktrees.useQuery(
    { repoId },
    { staleTime: 60_000 },
  )
  const primaryWorktreeId = useMemo(() => {
    const w = worktrees.data ?? []
    return (w.find((t) => t.isPrimary) ?? w[0])?.id ?? null
  }, [worktrees.data])

  const prs = trpc.github.prsList.useQuery(
    { repoId, state, search: q || undefined, limit: 100 },
    {
      // 2 minutes stale — fresh enough for daily workflows, slow enough that
      // users who tab between PRs/Diffs/Files 30 times in a minute don't hit
      // the GitHub API 30 times. Pair with `keepPreviousData` so changing
      // state/search keeps the old list visible until the new one arrives
      // (no spinner flash).
      staleTime: 2 * 60 * 1000,
      placeholderData: keepPreviousData,
      retry: (count, err) => {
        const kind = (err as { data?: { kind?: string } })?.data?.kind
        if (kind === 'unauthenticated' || kind === 'not-found' || kind === 'binary-missing') {
          return false
        }
        return count < 2
      },
      // Run even while the sidebar-backfill mutation is in flight: the server
      // resolves GitHub metadata lazily in `ensureGitHubRepo`, so prsList
      // will work on the first visit without waiting on the mutation.
      enabled: !ensureGitHub.isError,
    },
  )

  // Track the active PR from the nested route match so the list row can
  // highlight. Parse it from the URL rather than drilling router matches —
  // cheaper and less coupled.
  const activeNumber = readActiveNumberFromHash()

  return (
    <div className="flex h-full min-h-0 flex-col">
      <nav className="flex shrink-0 items-center gap-1 border-b border-black/10 px-3 py-1.5 text-[12px] dark:border-white/10">
        {primaryWorktreeId && (
          <>
            <Link
              to="/repos/$repoId/wt/$worktreeId/files"
              params={{ repoId, worktreeId: primaryWorktreeId }}
              className={tabIdleClass}
            >
              Files
            </Link>
            <Link
              to="/repos/$repoId/wt/$worktreeId/diffs"
              params={{ repoId, worktreeId: primaryWorktreeId }}
              className={tabIdleClass}
            >
              Diffs
            </Link>
          </>
        )}
        <Link
          to="/repos/$repoId/prs"
          params={{ repoId }}
          className={tabIdleClass}
          activeOptions={{ exact: false }}
          activeProps={{ className: tabActiveClass }}
        >
          PRs
        </Link>
      </nav>
      <div className="flex min-h-0 flex-1">
      <div className="flex w-[420px] shrink-0 flex-col border-r border-black/10 dark:border-white/10">
        <div
          className={cn(
            'flex shrink-0 flex-col gap-2 border-b border-black/10 px-3 py-2',
            'dark:border-white/10',
          )}
        >
          <PRFilters
            state={state}
            search={q}
            onStateChange={(next) =>
              void navigate({
                to: '/repos/$repoId/prs',
                params: { repoId },
                search: { ...search, state: next },
                replace: true,
              })
            }
            onSearchChange={(next) =>
              void navigate({
                to: '/repos/$repoId/prs',
                params: { repoId },
                search: { ...search, q: next || undefined },
                replace: true,
              })
            }
          />
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {ensureGitHub.isError && (
            <div className="p-4 text-xs text-zinc-500">
              This repo has no GitHub remote, so PR browsing is unavailable.
            </div>
          )}
          {!ensureGitHub.isError && prs.isPending && (
            <div className="p-4 text-xs text-zinc-500">Loading PRs…</div>
          )}
          {!ensureGitHub.isError && prs.isError && (
            <PRErrorState
              error={prs.error}
              onRefresh={() => void prs.refetch()}
            />
          )}
          {prs.data && (
            <PRList repoId={repoId} prs={prs.data} activeNumber={activeNumber} />
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <Outlet />
      </div>
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

function readActiveNumberFromHash(): number | null {
  if (typeof location === 'undefined') return null
  const match = location.hash.match(/\/prs\/(\d+)/)
  return match ? Number(match[1]) : null
}
