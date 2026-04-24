import { useState } from 'react'
import { ChevronRight, Folder, GitBranch, GitCommit, X } from 'lucide-react'
import { trpc } from '@renderer/trpc'
import { cn } from '@renderer/lib/cn'
import type { WorkspaceRepo, Worktree } from '@shared/types'

interface RepoNodeProps {
  repo: WorkspaceRepo
  activeWorktreeId: string | null
  onSelectWorktree(repoId: string, worktreeId: string): void
}

export function RepoNode({
  repo,
  activeWorktreeId,
  onSelectWorktree,
}: RepoNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const worktrees = trpc.workspace.listWorktrees.useQuery(
    { repoId: repo.id },
    { staleTime: 30_000 },
  )
  const status = trpc.workspace.status.useQuery(
    { repoId: repo.id },
    { staleTime: 30_000 },
  )
  const utils = trpc.useUtils()
  const remove = trpc.workspace.removeRepo.useMutation({
    onSuccess: () => {
      void utils.workspace.list.invalidate()
    },
  })

  const dirty = status.data?.dirty === true
  const selectedInRepo = (worktrees.data ?? []).some(
    (w) => w.id === activeWorktreeId,
  )

  return (
    <div className="select-none">
      <div
        className={cn(
          'drag-none group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
          selectedInRepo
            ? 'font-medium'
            : 'text-zinc-600 dark:text-zinc-400',
        )}
      >
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10"
          aria-label={expanded ? 'Collapse' : 'Expand'}
        >
          <ChevronRight
            className={cn(
              'size-3 transition-transform',
              expanded && 'rotate-90',
            )}
          />
        </button>
        <Folder className="size-3.5 text-zinc-500" strokeWidth={2} />
        <span className="flex-1 truncate">{repo.name}</span>
        {dirty && (
          <span
            aria-label="uncommitted changes"
            title="uncommitted changes"
            className="size-1.5 rounded-full bg-amber-500"
          />
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            if (confirm(`Remove "${repo.name}" from the workspace?`)) {
              remove.mutate({ repoId: repo.id })
            }
          }}
          className={cn(
            'opacity-0 transition-opacity group-hover:opacity-100',
            'rounded p-0.5 hover:bg-black/10 dark:hover:bg-white/10',
          )}
          aria-label="Remove repo"
          title="Remove from workspace"
        >
          <X className="size-3" />
        </button>
      </div>

      {expanded && worktrees.data && worktrees.data.length > 0 && (
        <ul className="ml-4 mt-0.5 space-y-0.5">
          {worktrees.data.map((w) => (
            <WorktreeRow
              key={w.id}
              worktree={w}
              isActive={activeWorktreeId === w.id}
              onSelect={() => onSelectWorktree(repo.id, w.id)}
            />
          ))}
        </ul>
      )}
    </div>
  )
}

interface WorktreeRowProps {
  worktree: Worktree
  isActive: boolean
  onSelect(): void
}

function WorktreeRow({ worktree, isActive, onSelect }: WorktreeRowProps) {
  const label = worktree.detached
    ? `(detached @ ${worktree.head.slice(0, 7)})`
    : worktree.branch?.replace('refs/heads/', '') ?? '(unknown)'

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        title={worktree.path}
        className={cn(
          'flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-[11px]',
          isActive
            ? 'bg-black/10 font-medium text-zinc-900 dark:bg-white/15 dark:text-zinc-100'
            : 'text-zinc-600 hover:bg-black/5 dark:text-zinc-400 dark:hover:bg-white/10',
        )}
      >
        {worktree.detached ? (
          <GitCommit className="size-3 shrink-0" strokeWidth={2} />
        ) : (
          <GitBranch className="size-3 shrink-0" strokeWidth={2} />
        )}
        <span className="truncate">{label}</span>
        {worktree.isPrimary && (
          <span
            className={cn(
              'ml-auto shrink-0 rounded px-1 text-[9px] uppercase tracking-wider',
              isActive
                ? 'bg-black/10 dark:bg-white/15'
                : 'bg-black/5 dark:bg-white/10',
            )}
          >
            main
          </span>
        )}
      </button>
    </li>
  )
}
