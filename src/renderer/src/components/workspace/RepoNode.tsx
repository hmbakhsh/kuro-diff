import { useState } from 'react'
import { ChevronRight, Folder, GitBranch, GitCommit, X } from 'lucide-react'
import { trpc } from '@renderer/trpc'
import { cn } from '@renderer/lib/cn'
import type { WorkspaceRepo } from '@shared/types'

interface RepoNodeProps {
  repo: WorkspaceRepo
  isActive: boolean
  onSelect(repoId: string): void
}

export function RepoNode({ repo, isActive, onSelect }: RepoNodeProps) {
  const [expanded, setExpanded] = useState(true)
  const worktrees = trpc.workspace.listWorktrees.useQuery(
    { repoId: repo.id },
    { enabled: expanded, staleTime: 30_000 },
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

  return (
    <div className="select-none">
      <div
        role="button"
        tabIndex={0}
        onClick={() => onSelect(repo.id)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            onSelect(repo.id)
          }
        }}
        className={cn(
          'drag-none group flex items-center gap-1.5 rounded-md px-2 py-1 text-xs',
          'cursor-pointer',
          isActive
            ? 'bg-black/10 dark:bg-white/10 font-medium'
            : 'hover:bg-black/5 dark:hover:bg-white/5',
        )}
      >
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setExpanded((v) => !v)
          }}
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
            if (confirm(`Remove “${repo.name}” from the workspace?`)) {
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
        <ul className="ml-6 mt-0.5 space-y-0.5">
          {worktrees.data.map((w) => (
            <li
              key={w.path}
              className="flex items-center gap-1.5 rounded px-2 py-0.5 text-[11px] text-zinc-600 dark:text-zinc-400"
              title={w.path}
            >
              {w.detached ? (
                <GitCommit className="size-3" strokeWidth={2} />
              ) : (
                <GitBranch className="size-3" strokeWidth={2} />
              )}
              <span className="truncate">
                {w.detached
                  ? `(detached @ ${w.head.slice(0, 7)})`
                  : (w.branch?.replace('refs/heads/', '') ?? '(unknown)')}
              </span>
              {w.isPrimary && (
                <span className="rounded bg-black/5 px-1 text-[9px] uppercase tracking-wider dark:bg-white/10">
                  main
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
