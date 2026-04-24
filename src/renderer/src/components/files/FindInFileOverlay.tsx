import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Regex as RegexIcon, CaseSensitive } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface FindInFileOverlayProps {
  contents: string
  onClose(): void
}

interface Hit {
  lineIndex: number // 0-based
  charStart: number
  charEnd: number
  snippet: string
}

const MAX_HITS = 500

/**
 * Lightweight find-in-file. Computes hits on the raw text and, on
 * navigate, scrolls to the matching `[data-line="..."]` node Pierre emits on
 * each rendered line (verified in `@pierre/diffs/dist/utils/processLine.js`).
 *
 * DOM wrapping of matches with `<mark data-search-hit>` (plan §A.10) is
 * deferred — Pierre renders into a Shadow DOM and re-renders on scroll, so a
 * more invasive approach is needed. Line-level jump covers the 95% case.
 */
export function FindInFileOverlay({
  contents,
  onClose,
}: FindInFileOverlayProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { hits, error } = useMemo(() => {
    if (query.length === 0) return { hits: [] as Hit[], error: null as string | null }
    try {
      const flags = (caseSensitive ? 'g' : 'gi') + 'u'
      const pattern = useRegex ? query : escapeRegExp(query)
      const re = new RegExp(pattern, flags)
      const out: Hit[] = []
      const lines = contents.split(/\r?\n/)
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i]!
        re.lastIndex = 0
        // eslint-disable-next-line no-constant-condition
        while (true) {
          const m = re.exec(line)
          if (!m) break
          out.push({
            lineIndex: i,
            charStart: m.index,
            charEnd: m.index + m[0].length,
            snippet: line,
          })
          if (out.length >= MAX_HITS) break
          // Protect against zero-length matches.
          if (m.index === re.lastIndex) re.lastIndex++
        }
        if (out.length >= MAX_HITS) break
      }
      return { hits: out, error: null }
    } catch (e: unknown) {
      return {
        hits: [] as Hit[],
        error: e instanceof Error ? e.message : 'invalid pattern',
      }
    }
  }, [query, contents, caseSensitive, useRegex])

  useEffect(() => {
    setIndex(0)
  }, [query, caseSensitive, useRegex])

  useEffect(() => {
    const hit = hits[index]
    if (!hit) return
    scrollToLine(hit.lineIndex + 1)
  }, [index, hits])

  const go = (delta: number): void => {
    if (hits.length === 0) return
    setIndex((i) => (i + delta + hits.length) % hits.length)
  }

  return (
    <div
      className={cn(
        'absolute right-4 top-3 z-10 flex w-80 flex-col gap-1',
        'rounded-md border border-black/10 bg-white/95 p-2 shadow-md backdrop-blur',
        'dark:border-white/10 dark:bg-zinc-900/95',
      )}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          go(e.shiftKey ? -1 : 1)
        }
      }}
    >
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Find in file"
          className="flex-1 rounded bg-black/5 px-2 py-1 text-xs outline-none dark:bg-white/10"
          aria-label="Find"
        />
        <button
          type="button"
          onClick={() => setCaseSensitive((v) => !v)}
          title="Case sensitive"
          aria-pressed={caseSensitive}
          className={cn(
            'rounded p-1 hover:bg-black/5 dark:hover:bg-white/10',
            caseSensitive && 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
          )}
        >
          <CaseSensitive className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setUseRegex((v) => !v)}
          title="Regex"
          aria-pressed={useRegex}
          className={cn(
            'rounded p-1 hover:bg-black/5 dark:hover:bg-white/10',
            useRegex && 'bg-blue-500/20 text-blue-700 dark:text-blue-300',
          )}
        >
          <RegexIcon className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={onClose}
          title="Close (Esc)"
          className="rounded p-1 hover:bg-black/5 dark:hover:bg-white/10"
        >
          <X className="size-3.5" />
        </button>
      </div>

      <div className="flex items-center justify-between px-1 text-[11px] text-zinc-500">
        <span>
          {error
            ? `regex: ${error}`
            : hits.length === 0 && query.length > 0
              ? 'No matches'
              : hits.length > 0
                ? `${index + 1} / ${hits.length}${hits.length >= MAX_HITS ? '+' : ''}`
                : ''}
        </span>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => go(-1)}
            disabled={hits.length === 0}
            className="rounded px-1.5 py-0.5 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
            aria-label="Previous match"
          >
            ↑
          </button>
          <button
            type="button"
            onClick={() => go(1)}
            disabled={hits.length === 0}
            className="rounded px-1.5 py-0.5 hover:bg-black/5 disabled:opacity-40 dark:hover:bg-white/10"
            aria-label="Next match"
          >
            ↓
          </button>
        </div>
      </div>
    </div>
  )
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Pierre renders each code row with `data-line="<n>"` (1-based) on a nested
 * element inside its Shadow DOM. Scroll the first match we can find.
 * Falls back silently if the element isn't present (virtualized / off-screen).
 */
function scrollToLine(lineNumber: number): void {
  const hosts = document.querySelectorAll('pierre-file, pierre-file-diff')
  for (const host of hosts) {
    const root = (host as HTMLElement).shadowRoot
    if (!root) continue
    const el = root.querySelector(`[data-line="${lineNumber}"]`)
    if (el) {
      ;(el as HTMLElement).scrollIntoView({
        block: 'center',
        behavior: 'smooth',
      })
      return
    }
  }
}
