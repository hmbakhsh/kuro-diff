import { useEffect, useRef, useState } from 'react'
import {
  ChevronDown,
  ChevronRight,
  FolderOpen,
  GitBranch,
  Terminal,
} from 'lucide-react'
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
      <div className="ml-auto flex items-center gap-2">
        <OpenInMenu repoId={repoId} worktreeId={worktreeId} />
        <RateLimitPill />
      </div>
    </div>
  )
}

type OpenTarget = 'ghostty' | 'finder'

const OPEN_TARGET_STORAGE_KEY = 'kuro.openInTarget'

interface OpenTargetDef {
  key: OpenTarget
  label: string
  short: string
  icon: typeof Terminal
}

const OPEN_TARGETS: Record<OpenTarget, OpenTargetDef> = {
  ghostty: { key: 'ghostty', label: 'Open in Ghostty', short: 'Ghostty', icon: Terminal },
  finder: { key: 'finder', label: 'Reveal in Finder', short: 'Finder', icon: FolderOpen },
}

const OPEN_TARGET_ORDER: OpenTarget[] = ['ghostty', 'finder']

function loadLastTarget(): OpenTarget {
  const raw = localStorage.getItem(OPEN_TARGET_STORAGE_KEY)
  return raw === 'finder' ? 'finder' : 'ghostty'
}

/**
 * Split button: clicking the main surface fires the last-chosen target
 * immediately; the chevron reveals the menu to switch target. Selection
 * persists in localStorage, so the default "one-click" action is whatever
 * the user picked last. Menu closes on outside click, Escape, or success.
 */
function OpenInMenu({
  repoId,
  worktreeId,
}: {
  repoId: string
  worktreeId: string
}) {
  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<OpenTarget>(loadLastTarget)
  const rootRef = useRef<HTMLDivElement>(null)
  const openPath = trpc.system.openPath.useMutation({
    onSuccess: () => setOpen(false),
  })

  useEffect(() => {
    if (!open) return
    const onPointer = (e: PointerEvent): void => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('pointerdown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('pointerdown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const pick = (next: OpenTarget): void => {
    setTarget(next)
    localStorage.setItem(OPEN_TARGET_STORAGE_KEY, next)
    openPath.mutate({ repoId, worktreeId, target: next })
  }

  const active = OPEN_TARGETS[target]
  const ActiveIcon = active.icon

  return (
    <div ref={rootRef} className="drag-none relative flex items-stretch">
      <button
        type="button"
        onClick={() => openPath.mutate({ repoId, worktreeId, target })}
        disabled={openPath.isPending}
        title={openPath.error?.message ?? active.label}
        aria-label={active.label}
        className={cn(
          'flex h-6 items-center rounded-l-md border-r border-transparent px-1.5 text-zinc-500',
          'hover:bg-black/5 hover:text-zinc-900 disabled:opacity-50',
          'dark:hover:bg-white/10 dark:hover:text-zinc-100',
        )}
      >
        <ActiveIcon className="size-3.5" strokeWidth={2} />
      </button>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title={`Change target (currently ${active.short})`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change open target"
        className={cn(
          'flex h-6 items-center rounded-r-md px-1 text-zinc-500',
          'hover:bg-black/5 hover:text-zinc-900',
          'dark:hover:bg-white/10 dark:hover:text-zinc-100',
        )}
      >
        <ChevronDown className="size-3" strokeWidth={2} />
      </button>
      {open && (
        <div
          role="menu"
          className={cn(
            'absolute right-0 top-full z-50 mt-1 min-w-[180px] overflow-hidden rounded-md border',
            'border-black/10 bg-white py-1 text-[13px] shadow-lg',
            'dark:border-white/10 dark:bg-zinc-900',
          )}
        >
          {OPEN_TARGET_ORDER.map((key) => {
            const { label, icon: Icon } = OPEN_TARGETS[key]
            return (
              <button
                key={key}
                type="button"
                role="menuitem"
                onClick={() => pick(key)}
                disabled={openPath.isPending}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-1.5 text-left text-zinc-700',
                  'hover:bg-black/5 disabled:opacity-50',
                  'dark:text-zinc-200 dark:hover:bg-white/10',
                  key === target && 'font-medium text-zinc-900 dark:text-zinc-100',
                )}
              >
                <Icon className="size-3.5 shrink-0" strokeWidth={2} />
                <span>{label}</span>
              </button>
            )
          })}
        </div>
      )}
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
