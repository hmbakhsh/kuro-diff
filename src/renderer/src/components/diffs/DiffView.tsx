import { useMemo, useState } from 'react'
import { FileDiff, Virtualizer } from '@pierre/diffs/react'
import { parsePatchFiles } from '@pierre/diffs'
import type { FileDiffMetadata } from '@pierre/diffs'
import { cn } from '@renderer/lib/cn'
import { stripBinaryFiles } from '@renderer/lib/patch-utils'
import type { DiffMode } from './DiffModeToggle'

const LARGE_DIFF_THRESHOLD_BYTES = 512 * 1024

interface DiffViewProps {
  patch: string
  mode: DiffMode
  cacheKey?: string
  className?: string
}

export function DiffView({ patch, mode, cacheKey, className }: DiffViewProps) {
  const [forceLarge, setForceLarge] = useState(false)
  const filtered = useMemo(() => stripBinaryFiles(patch), [patch])

  const options = useMemo(
    () => ({
      diffStyle: mode,
      diffIndicators: 'bars' as const,
      theme: { dark: 'github-dark', light: 'github-light' } as const,
    }),
    [mode],
  )

  // `<PatchDiff>` only accepts single-file patches at runtime, despite the
  // plan note to the contrary — the actual Pierre source throws on >1 file
  // (see `utils/getSingularPatch.js`). Parse ourselves and render one
  // `<FileDiff>` per entry; `parsePatchFiles` handles git + unified formats
  // and multi-file patches.
  const files: FileDiffMetadata[] = useMemo(() => {
    if (!filtered.patch) return []
    const parsed = parsePatchFiles(filtered.patch, cacheKey ?? 'kuro-patch')
    return parsed.flatMap((p) => p.files)
  }, [filtered.patch, cacheKey])

  if (!patch) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center text-xs text-zinc-500',
          className,
        )}
      >
        No changes.
      </div>
    )
  }

  const size = patch.length
  if (size > LARGE_DIFF_THRESHOLD_BYTES && !forceLarge) {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-xs',
          className,
        )}
      >
        <p>
          This diff is large ({formatBytes(size)}). Rendering it may slow the
          app down.
        </p>
        <button
          type="button"
          onClick={() => setForceLarge(true)}
          className="rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Render anyway
        </button>
      </div>
    )
  }

  if (files.length === 0 && filtered.binaryCount === 0) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center text-xs text-zinc-500',
          className,
        )}
      >
        No changes.
      </div>
    )
  }

  return (
    <div className={cn('flex h-full min-h-0 flex-col', className)}>
      {filtered.binaryCount > 0 && (
        <div
          className={cn(
            'shrink-0 border-b border-black/10 px-3 py-1 text-[11px] text-zinc-500',
            'dark:border-white/10',
          )}
          title={filtered.binaryPaths.join('\n')}
        >
          {filtered.binaryCount} binary file
          {filtered.binaryCount === 1 ? '' : 's'} hidden
        </div>
      )}
      <Virtualizer
        className="flex-1 overflow-auto"
        config={{ overscrollSize: 800 }}
      >
        <div className="flex flex-col gap-2 py-2">
          {files.map((fileDiff, i) => (
            <FileDiff
              key={fileDiff.cacheKey ?? `${fileDiff.name}-${i}`}
              fileDiff={fileDiff}
              options={options}
              // Metrics drive virtualizer placeholder heights for off-screen
              // files. `hunkLineCount` is per-file and mode-dependent — Pierre
              // pre-computes both unified and split totals on the parsed
              // metadata so we just pick the right one. The layout constants
              // match Pierre's defaults for our theme; changing them requires
              // a matching CSS override, so keep them aligned with the
              // rendered values rather than the plan's figures.
              metrics={{
                hunkLineCount:
                  mode === 'split'
                    ? fileDiff.splitLineCount
                    : fileDiff.unifiedLineCount,
                lineHeight: 20,
                diffHeaderHeight: 44,
                hunkSeparatorHeight: 32,
                fileGap: 8,
              }}
            />
          ))}
        </div>
      </Virtualizer>
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}
