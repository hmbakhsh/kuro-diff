import { cn } from '@renderer/lib/cn'

export type PRState = 'open' | 'closed' | 'merged' | 'all'

interface PRFiltersProps {
  state: PRState
  search: string
  onStateChange(next: PRState): void
  onSearchChange(next: string): void
}

const STATES: { id: PRState; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'merged', label: 'Merged' },
  { id: 'closed', label: 'Closed' },
  { id: 'all', label: 'All' },
]

/**
 * Server-side filter controls for the PR list. All filter work is done by
 * `gh pr list`, so changes re-trigger the query.
 */
export function PRFilters({ state, search, onStateChange, onSearchChange }: PRFiltersProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="inline-flex overflow-hidden rounded-md border border-black/10 text-[12px] dark:border-white/10">
        {STATES.map((s, i) => {
          const active = s.id === state
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onStateChange(s.id)}
              className={cn(
                'px-2.5 py-1 transition-colors',
                active
                  ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                  : 'text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10',
                i > 0 && 'border-l border-black/10 dark:border-white/10',
              )}
              aria-pressed={active}
            >
              {s.label}
            </button>
          )
        })}
      </div>
      <input
        type="search"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder="Search title (GitHub syntax supported)"
        className={cn(
          'h-7 w-72 rounded-md border border-black/15 bg-white/40 px-2 text-[12px]',
          'placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-black/20',
          'dark:border-white/15 dark:bg-white/5 dark:focus:ring-white/20',
        )}
      />
    </div>
  )
}
