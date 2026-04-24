import { useMemo, useState } from 'react'
import { ExternalLink, GitBranch, GitMerge, GitPullRequest, GitPullRequestDraft } from 'lucide-react'
import { cn } from '@renderer/lib/cn'
import { trpc } from '@renderer/trpc'
import { DiffView } from '@renderer/components/diffs/DiffView'
import { DiffModeToggle, type DiffMode } from '@renderer/components/diffs/DiffModeToggle'
import { PRErrorState } from '@renderer/components/prs/PRErrorState'
import type { inferRouterOutputs } from '@trpc/server'
import type { AppRouter } from '../../../../main/trpc/router'

type PRDetail = inferRouterOutputs<AppRouter>['github']['prGet']

interface PRDetailProps {
  repoId: string
  number: number
}

/**
 * Two parallel queries — metadata (`gh pr view --json`) and the unified diff
 * (`gh pr diff`). Both flow through the existing PatchDiff renderer, so
 * highlighting, virtualization, and large-diff guards come for free.
 */
export function PRDetail({ repoId, number }: PRDetailProps) {
  const preferences = trpc.preferences.get.useQuery(undefined, { staleTime: Infinity })
  const mode: DiffMode = preferences.data?.diffMode ?? 'unified'
  const utils = trpc.useUtils()
  const setPreferences = trpc.preferences.set.useMutation({
    onSuccess: () => void utils.preferences.get.invalidate(),
  })

  // PR content rarely changes mid-session: author rarely force-pushes, diff
  // is keyed to a specific head OID. 10-minute staleTime keeps the data
  // fresh for practical purposes; the 24h gcTime default (set in main.tsx)
  // keeps it in memory across view switches so navigating PR → list → PR is
  // instant.
  const pr = trpc.github.prGet.useQuery(
    { repoId, number },
    {
      staleTime: 10 * 60 * 1000,
      retry: (count, err) => ghRetryPolicy(count, err),
    },
  )
  const diff = trpc.github.prDiff.useQuery(
    { repoId, number },
    {
      staleTime: 10 * 60 * 1000,
      retry: (count, err) => ghRetryPolicy(count, err),
    },
  )

  const openExternal = trpc.github.openExternal.useMutation()

  const err = pr.error ?? diff.error
  if (err) {
    return (
      <PRErrorState
        error={err}
        onRefresh={() => {
          void pr.refetch()
          void diff.refetch()
        }}
      />
    )
  }

  if (!pr.data || !diff.data) {
    return (
      <div className="flex h-full items-center justify-center text-xs text-zinc-500">
        Loading PR #{number}…
      </div>
    )
  }

  const data = pr.data
  const diffData = diff.data

  return (
    <div className="flex h-full min-h-0 flex-col">
      <PRHeader
        pr={data}
        mode={mode}
        onModeChange={(next) => setPreferences.mutate({ diffMode: next })}
        onOpenInBrowser={() => {
          if (data.url && isGithubUrl(data.url)) {
            void openExternal.mutate({ url: data.url })
          }
        }}
        canOpenExternal={isGithubUrl(data.url)}
      />
      <div className="min-h-0 flex-1">
        <DiffView
          patch={diffData.patch}
          mode={mode}
          cacheKey={`pr:${repoId}:${number}:${data.headRefOid}`}
        />
      </div>
    </div>
  )
}

function PRHeader({
  pr,
  mode,
  onModeChange,
  onOpenInBrowser,
  canOpenExternal,
}: {
  pr: PRDetail
  mode: DiffMode
  onModeChange(next: DiffMode): void
  onOpenInBrowser(): void
  canOpenExternal: boolean
}) {
  const [bodyOpen, setBodyOpen] = useState(false)
  const truncatedBody = useMemo(() => {
    if (!pr.body) return null
    if (pr.body.length <= 280) return pr.body
    return bodyOpen ? pr.body : `${pr.body.slice(0, 280).trimEnd()}…`
  }, [pr.body, bodyOpen])

  return (
    <div
      className={cn(
        'shrink-0 border-b border-black/10 bg-white/40 px-4 py-3',
        'dark:border-white/10 dark:bg-white/5',
      )}
    >
      <div className="flex items-start gap-2">
        <PRStateIcon state={pr.state} isDraft={pr.isDraft} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <h1 className="truncate text-base font-semibold text-zinc-900 dark:text-zinc-100">
              {pr.title}
            </h1>
            <span className="shrink-0 font-mono text-[12px] text-zinc-400">#{pr.number}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-zinc-500">
            <span>{pr.author?.login ?? 'unknown'}</span>
            <span className="flex items-center gap-1 font-mono">
              <GitBranch className="size-3" strokeWidth={2} />
              {pr.baseRefName} ← {pr.headRefName}
            </span>
            <span>
              +{pr.additions} −{pr.deletions}
            </span>
            {pr.labels.length > 0 && (
              <span className="flex items-center gap-1">
                {pr.labels.slice(0, 3).map((label) => (
                  <LabelChip key={label.name} name={label.name} color={label.color} />
                ))}
                {pr.labels.length > 3 && (
                  <span className="text-[11px] text-zinc-400">
                    +{pr.labels.length - 3}
                  </span>
                )}
              </span>
            )}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <DiffModeToggle value={mode} onChange={onModeChange} />
          {canOpenExternal && (
            <button
              type="button"
              onClick={onOpenInBrowser}
              className={cn(
                'flex h-7 items-center gap-1 rounded-md border border-black/15 px-2 text-[12px]',
                'hover:bg-black/5 dark:border-white/15 dark:hover:bg-white/10',
              )}
            >
              Open on GitHub
              <ExternalLink className="size-3" strokeWidth={2} />
            </button>
          )}
        </div>
      </div>
      {truncatedBody && (
        <div className="mt-3 whitespace-pre-wrap text-[12px] text-zinc-600 dark:text-zinc-400">
          {truncatedBody}
          {pr.body && pr.body.length > 280 && (
            <button
              type="button"
              onClick={() => setBodyOpen((v) => !v)}
              className="ml-1 text-[11px] text-zinc-500 hover:underline"
            >
              {bodyOpen ? 'show less' : 'show more'}
            </button>
          )}
        </div>
      )}
    </div>
  )
}

function PRStateIcon({
  state,
  isDraft,
}: {
  state: PRDetail['state']
  isDraft: boolean
}) {
  if (state === 'MERGED') {
    return <GitMerge className="mt-0.5 size-5 shrink-0 text-purple-500" strokeWidth={2} />
  }
  if (state === 'CLOSED') {
    return <GitPullRequest className="mt-0.5 size-5 shrink-0 text-red-500" strokeWidth={2} />
  }
  if (isDraft) {
    return (
      <GitPullRequestDraft
        className="mt-0.5 size-5 shrink-0 text-zinc-500"
        strokeWidth={2}
      />
    )
  }
  return <GitPullRequest className="mt-0.5 size-5 shrink-0 text-emerald-500" strokeWidth={2} />
}

function LabelChip({ name, color }: { name: string; color?: string }) {
  // GitHub hex colors are raw strings (`e0e0e0`). Background with low opacity
  // reads consistently over both themes; black foreground is fine for most
  // colours.
  const bg = color ? `#${color}20` : 'rgba(0,0,0,0.08)'
  const border = color ? `#${color}60` : 'rgba(0,0,0,0.1)'
  return (
    <span
      className="rounded-sm border px-1.5 py-0.5 text-[10px] font-medium"
      style={{ background: bg, borderColor: border }}
    >
      {name}
    </span>
  )
}

function isGithubUrl(url: string | undefined): boolean {
  if (!url) return false
  try {
    const parsed = new URL(url)
    return parsed.hostname === 'github.com' && parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function ghRetryPolicy(count: number, err: unknown): boolean {
  const kind = (err as { data?: { kind?: string } })?.data?.kind
  if (kind === 'unauthenticated' || kind === 'not-found' || kind === 'binary-missing') {
    return false
  }
  return count < 2
}
