import { useEffect, useRef } from 'react'
import type { FileDiffMetadata } from '@pierre/diffs'
import { cn } from '@renderer/lib/cn'
import { statusBadge, UNTRACKED_BADGE } from './statusBadge'

interface DiffsSidebarProps {
  readonly files: FileDiffMetadata[]
  readonly activeIndex: number | null
  readonly onSelect: (index: number) => void
  readonly binaryCount?: number
  /**
   * Paths (relative to the repo root) of files that are untracked — not
   * staged, not in any commit. Rows whose `file.name` is in this set render
   * a distinct `U` badge instead of the change-type badge, so users can
   * distinguish "never-been-in-git" from "new file added on this branch".
   */
  readonly untrackedPaths?: ReadonlySet<string>
}

export function DiffsSidebar({
  files,
  activeIndex,
  onSelect,
  binaryCount = 0,
  untrackedPaths,
}: DiffsSidebarProps) {
  // Keep the active row visible as scroll-spy updates activeIndex. `nearest`
  // is a no-op when the row is already in view, so clicking a visible row
  // doesn't jump the sidebar.
  const rowRefs = useRef<Map<number, HTMLButtonElement>>(new Map())
  useEffect(() => {
    if (activeIndex === null) return
    const el = rowRefs.current.get(activeIndex)
    el?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex])

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
              untracked={untrackedPaths?.has(file.name) ?? false}
              rowRef={(el) => {
                if (el) rowRefs.current.set(i, el)
                else rowRefs.current.delete(i)
              }}
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
  readonly untracked: boolean
  readonly rowRef: (el: HTMLButtonElement | null) => void
}

function FileRow({ file, selected, onSelect, untracked, rowRef }: FileRowProps) {
  const { label, className } = untracked ? UNTRACKED_BADGE : statusBadge(file.type)
  const baseTitle =
    file.prevName && file.prevName !== file.name
      ? `${file.prevName} → ${file.name}`
      : file.name
  const title = untracked ? `${baseTitle} (untracked)` : baseTitle

  return (
    <button
      ref={rowRef}
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

