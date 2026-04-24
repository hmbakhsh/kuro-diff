import type { FileDiffMetadata } from '@pierre/diffs'
import { cn } from '@renderer/lib/cn'

interface DiffsSidebarProps {
  readonly files: FileDiffMetadata[]
  readonly activeIndex: number | null
  readonly onSelect: (index: number) => void
  readonly binaryCount?: number
}

export function DiffsSidebar({
  files,
  activeIndex,
  onSelect,
  binaryCount = 0,
}: DiffsSidebarProps) {
  return (
    <div
      className={cn(
        'flex h-full w-[260px] shrink-0 flex-col border-r border-black/10',
        'dark:border-white/10',
      )}
    >
      <div className="shrink-0 border-b border-black/5 px-3 py-2 text-[11px] text-zinc-500 dark:border-white/5">
        {files.length} file{files.length === 1 ? '' : 's'}
        {binaryCount > 0 && (
          <span className="ml-1 text-zinc-400 dark:text-zinc-500">
            (+{binaryCount} binary)
          </span>
        )}
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {files.length === 0 ? (
          <div className="px-2 py-8 text-center text-[11px] text-zinc-500">
            No changes.
          </div>
        ) : (
          files.map((file, i) => (
            <FileRow
              key={file.cacheKey ?? `${file.name}-${i}`}
              file={file}
              selected={activeIndex === i}
              onSelect={() => onSelect(i)}
            />
          ))
        )}
      </div>
    </div>
  )
}

interface FileRowProps {
  readonly file: FileDiffMetadata
  readonly selected: boolean
  readonly onSelect: () => void
}

function FileRow({ file, selected, onSelect }: FileRowProps) {
  const { label, className } = statusBadge(file.type)
  const title =
    file.prevName && file.prevName !== file.name
      ? `${file.prevName} → ${file.name}`
      : file.name

  return (
    <button
      type="button"
      onClick={onSelect}
      title={title}
      className={cn(
        'flex w-full items-center gap-2 rounded-md px-2 py-1 text-left text-[11.5px]',
        'hover:bg-black/5 dark:hover:bg-white/10',
        selected && 'bg-black/10 dark:bg-white/15',
      )}
    >
      <span
        className={cn(
          'inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-sm text-[9.5px] font-semibold',
          className,
        )}
      >
        {label}
      </span>
      <span
        className="min-w-0 flex-1 truncate text-zinc-700 dark:text-zinc-200"
        // Truncating a path from the end hides the filename, which is the part
        // users actually scan for. Use rtl + ltr embedding to keep the text
        // visually ltr while ellipsizing from the left.
        style={{ direction: 'rtl', textAlign: 'left' }}
      >
        <bdi>{file.name}</bdi>
      </span>
    </button>
  )
}

function statusBadge(type: FileDiffMetadata['type']): {
  label: string
  className: string
} {
  switch (type) {
    case 'new':
      return {
        label: 'A',
        className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      }
    case 'deleted':
      return {
        label: 'D',
        className: 'bg-red-500/15 text-red-600 dark:text-red-400',
      }
    case 'rename-pure':
    case 'rename-changed':
      return {
        label: 'R',
        className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
      }
    case 'change':
    default:
      return {
        label: 'M',
        className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
      }
  }
}
