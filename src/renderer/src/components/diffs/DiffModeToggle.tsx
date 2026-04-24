import { cn } from '@renderer/lib/cn'

export type DiffMode = 'unified' | 'split'

interface DiffModeToggleProps {
  value: DiffMode
  onChange(value: DiffMode): void
  className?: string
}

export function DiffModeToggle({ value, onChange, className }: DiffModeToggleProps) {
  return (
    <div
      role="group"
      aria-label="Diff mode"
      className={cn(
        'inline-flex overflow-hidden rounded-md border border-black/15 text-[11px] dark:border-white/15',
        className,
      )}
    >
      {(['unified', 'split'] as const).map((mode) => (
        <button
          key={mode}
          type="button"
          onClick={() => onChange(mode)}
          aria-pressed={value === mode}
          className={cn(
            'px-2 py-1 capitalize',
            value === mode
              ? 'bg-black/10 dark:bg-white/15'
              : 'hover:bg-black/5 dark:hover:bg-white/10',
          )}
        >
          {mode}
        </button>
      ))}
    </div>
  )
}
