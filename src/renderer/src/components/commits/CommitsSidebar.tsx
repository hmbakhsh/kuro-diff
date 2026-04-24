import { cn } from '@renderer/lib/cn'
import { CommitRow, type CommitRowCommit } from './CommitRow'
import { WorkingTreeRow, type WorkingTreeSummary } from './WorkingTreeRow'

interface CommitsSidebarProps {
  readonly commits: CommitRowCommit[]
  readonly selectedId: string | null
  readonly onSelect: (id: string) => void
  readonly workingTree: WorkingTreeSummary | null
  readonly fullHistory: boolean
  readonly onToggleFullHistory: (next: boolean) => void
  readonly rangeLabel: string
  readonly hasNextPage: boolean
  readonly onLoadMore: () => void
  readonly isLoadingMore: boolean
  readonly isPending: boolean
  readonly fellBackToHead: boolean
}

export function CommitsSidebar({
  commits,
  selectedId,
  onSelect,
  workingTree,
  fullHistory,
  onToggleFullHistory,
  rangeLabel,
  hasNextPage,
  onLoadMore,
  isLoadingMore,
  isPending,
  fellBackToHead,
}: CommitsSidebarProps) {
  return (
    <div className="flex h-full w-[320px] shrink-0 flex-col border-r border-black/10 dark:border-white/10">
      <div className="shrink-0 space-y-1 border-b border-black/5 px-3 py-2 dark:border-white/5">
        <label className="flex cursor-pointer items-center gap-2 text-[11px] text-zinc-600 dark:text-zinc-300">
          <input
            type="checkbox"
            checked={fullHistory}
            onChange={(e) => onToggleFullHistory(e.target.checked)}
          />
          Show full history
        </label>
        <div className="flex items-center justify-between text-[11px] text-zinc-500">
          <span>{rangeLabel}</span>
          <span>
            {commits.length}
            {hasNextPage ? '+' : ''} commit{commits.length === 1 ? '' : 's'}
          </span>
        </div>
        {fellBackToHead && (
          <div className="text-[10.5px] text-amber-600 dark:text-amber-400">
            Base ref not reachable — showing full HEAD history.
          </div>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {workingTree && (
          <WorkingTreeRow
            summary={workingTree}
            selected={selectedId === 'wt'}
            onSelect={() => onSelect('wt')}
          />
        )}
        {commits.map((c) => (
          <CommitRow
            key={c.sha}
            commit={c}
            selected={selectedId === c.sha}
            onSelect={() => onSelect(c.sha)}
          />
        ))}
        {!isPending && commits.length === 0 && !workingTree && (
          <div className="px-2 py-8 text-center text-[11px] text-zinc-500">
            No commits on this branch yet.
          </div>
        )}
        {hasNextPage && (
          <button
            type="button"
            onClick={onLoadMore}
            disabled={isLoadingMore}
            className={cn(
              'mt-1 w-full rounded-md px-2 py-1.5 text-[11px] text-zinc-600',
              'hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10',
              isLoadingMore && 'opacity-60',
            )}
          >
            {isLoadingMore ? 'Loading…' : 'Load more'}
          </button>
        )}
      </div>
    </div>
  )
}
