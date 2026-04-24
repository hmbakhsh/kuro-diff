import { useEffect, useMemo, useRef, useState } from 'react'
import { X, Regex as RegexIcon, CaseSensitive } from 'lucide-react'
import { cn } from '@renderer/lib/cn'

interface FindInFileOverlayProps {
  contents: string
  onClose(): void
  /**
   * Scope used to find the `<diffs-container>` Pierre renders into. Defaults
   * to `document` but passing the nearest viewer node scopes searches to this
   * pane when multiple files are open.
   */
  scope?: HTMLElement | null
}

const MAX_HITS = 500
const HIGHLIGHT_ALL = 'kuro-search-hit'
const HIGHLIGHT_CURRENT = 'kuro-search-current'
const HIGHLIGHT_STYLES = `
::highlight(${HIGHLIGHT_ALL}) {
  background-color: rgba(250, 204, 21, 0.55);
  color: inherit;
}
::highlight(${HIGHLIGHT_CURRENT}) {
  background-color: rgba(249, 115, 22, 0.85);
  color: #000;
}
`

interface Hit {
  range: Range
  lineNumber: number
}

export function FindInFileOverlay({
  contents,
  onClose,
  scope,
}: FindInFileOverlayProps) {
  const [query, setQuery] = useState('')
  const [caseSensitive, setCaseSensitive] = useState(false)
  const [useRegex, setUseRegex] = useState(false)
  const [index, setIndex] = useState(0)
  const [domVersion, bumpDomVersion] = useReducerCounter()
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  // Pierre renders into a shadow DOM and re-renders on option/file changes.
  // Watch the content column so we can rebuild ranges when it gets replaced.
  useEffect(() => {
    const host = findPierreHost(scope)
    const root = host?.shadowRoot
    if (!root) return
    ensureHighlightStyles(root)
    const observer = new MutationObserver(() => bumpDomVersion())
    observer.observe(root, { childList: true, subtree: true, characterData: true })
    return () => observer.disconnect()
  }, [scope, bumpDomVersion])

  const { hits, error } = useMemo<{ hits: Hit[]; error: string | null }>(() => {
    if (query.length === 0) return { hits: [], error: null }
    const host = findPierreHost(scope)
    const content = host?.shadowRoot?.querySelector('[data-content]') as HTMLElement | null
    if (!content) return { hits: [], error: null }
    try {
      const flags = (caseSensitive ? 'g' : 'gi') + 'u'
      const pattern = useRegex ? query : escapeRegExp(query)
      const re = new RegExp(pattern, flags)
      return { hits: collectHits(content, re), error: null }
    } catch (e: unknown) {
      return {
        hits: [],
        error: e instanceof Error ? e.message : 'invalid pattern',
      }
    }
    // `contents` and `domVersion` force recomputation when the underlying
    // text or Pierre's rendered DOM changes.
  }, [query, caseSensitive, useRegex, scope, contents, domVersion])

  useEffect(() => {
    if (index >= hits.length) setIndex(0)
  }, [hits, index])

  // Paint every hit; separately paint the current hit on top.
  useEffect(() => {
    const HighlightCtor = (globalThis as unknown as { Highlight?: typeof Highlight }).Highlight
    const highlights = (CSS as unknown as { highlights?: HighlightRegistry }).highlights
    if (!HighlightCtor || !highlights) return
    if (hits.length === 0) {
      highlights.delete(HIGHLIGHT_ALL)
      highlights.delete(HIGHLIGHT_CURRENT)
      return () => {
        highlights.delete(HIGHLIGHT_ALL)
        highlights.delete(HIGHLIGHT_CURRENT)
      }
    }
    const all = new HighlightCtor(...hits.map((h) => h.range))
    highlights.set(HIGHLIGHT_ALL, all)
    const current = hits[index]
    if (current) {
      highlights.set(HIGHLIGHT_CURRENT, new HighlightCtor(current.range))
    } else {
      highlights.delete(HIGHLIGHT_CURRENT)
    }
    return () => {
      highlights.delete(HIGHLIGHT_ALL)
      highlights.delete(HIGHLIGHT_CURRENT)
    }
  }, [hits, index])

  // Scroll the active match into view.
  useEffect(() => {
    const hit = hits[index]
    if (!hit) return
    scrollRangeIntoView(hit.range)
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

function useReducerCounter(): [number, () => void] {
  const [n, setN] = useState(0)
  const bump = useRef(() => setN((v) => v + 1)).current
  return [n, bump]
}

function findPierreHost(scope: HTMLElement | null | undefined): HTMLElement | null {
  const root: ParentNode = scope ?? document
  const el = root.querySelector('diffs-container') as HTMLElement | null
  return el
}

/**
 * Inject the `::highlight(...)` rules into Pierre's shadow root so the CSS
 * Custom Highlight API can paint on nodes inside the shadow tree.
 */
function ensureHighlightStyles(root: ShadowRoot): void {
  type AdoptedShadow = ShadowRoot & {
    adoptedStyleSheets: CSSStyleSheet[]
    __kuroSearchStyles?: CSSStyleSheet
  }
  const r = root as AdoptedShadow
  if (r.__kuroSearchStyles) return
  const sheet = new CSSStyleSheet()
  sheet.replaceSync(HIGHLIGHT_STYLES)
  r.adoptedStyleSheets = [...r.adoptedStyleSheets, sheet]
  r.__kuroSearchStyles = sheet
}

/**
 * Walk line rows inside the content column, build ranges over text nodes for
 * each regex match. Using TreeWalker on the line row handles shiki's nested
 * spans transparently.
 */
function collectHits(content: HTMLElement, re: RegExp): Hit[] {
  const hits: Hit[] = []
  const lines = content.querySelectorAll<HTMLElement>('[data-line]')
  for (const line of lines) {
    const lineNumber = Number(line.dataset.line)
    if (Number.isNaN(lineNumber)) continue

    const segments = collectTextSegments(line)
    const text = segments.map((s) => s.text).join('')
    if (text.length === 0) continue

    re.lastIndex = 0
    // eslint-disable-next-line no-constant-condition
    while (true) {
      const m = re.exec(text)
      if (!m) break
      const start = m.index
      const end = start + m[0].length
      if (end > start) {
        const range = rangeFromSegments(segments, start, end)
        if (range) hits.push({ range, lineNumber })
      }
      if (hits.length >= MAX_HITS) return hits
      // Guard against zero-length matches.
      if (m.index === re.lastIndex) re.lastIndex++
    }
  }
  return hits
}

interface TextSegment {
  node: Text
  start: number // offset within the concatenated line text
  text: string
}

function collectTextSegments(line: HTMLElement): TextSegment[] {
  const walker = document.createTreeWalker(line, NodeFilter.SHOW_TEXT)
  const out: TextSegment[] = []
  let cursor = 0
  let node = walker.nextNode() as Text | null
  while (node) {
    const text = node.data
    out.push({ node, start: cursor, text })
    cursor += text.length
    node = walker.nextNode() as Text | null
  }
  // Pierre appends a trailing "\n" text node per line; strip it from match
  // space so a ^$ regex doesn't get confused.
  if (out.length > 0) {
    const last = out[out.length - 1]!
    if (last.text === '\n') out.pop()
  }
  return out
}

function rangeFromSegments(
  segments: TextSegment[],
  start: number,
  end: number,
): Range | null {
  const startSeg = findSegment(segments, start)
  const endSeg = findSegment(segments, end)
  if (!startSeg || !endSeg) return null
  const range = document.createRange()
  range.setStart(startSeg.node, start - startSeg.start)
  range.setEnd(endSeg.node, end - endSeg.start)
  return range
}

function findSegment(segments: TextSegment[], offset: number): TextSegment | null {
  // Inclusive on the right for the end position so offset === segment end works.
  for (const seg of segments) {
    if (offset >= seg.start && offset <= seg.start + seg.text.length) return seg
  }
  return segments[segments.length - 1] ?? null
}

/**
 * Scroll the range into view. The range lives inside Pierre's shadow DOM —
 * the scroll container is the nearest scrollable ancestor of the host element.
 */
function scrollRangeIntoView(range: Range): void {
  const container = findScrollableAncestor(getHostElement(range.startContainer))
  if (!container) return

  const rangeRect = range.getBoundingClientRect()
  if (rangeRect.width === 0 && rangeRect.height === 0) return
  const containerRect = container.getBoundingClientRect()
  const targetTop =
    container.scrollTop +
    (rangeRect.top - containerRect.top) -
    container.clientHeight / 2 +
    rangeRect.height / 2
  const targetLeft =
    container.scrollLeft +
    (rangeRect.left - containerRect.left) -
    container.clientWidth / 2 +
    rangeRect.width / 2
  container.scrollTo({
    top: Math.max(0, targetTop),
    left: Math.max(0, targetLeft),
    behavior: 'smooth',
  })
}

function getHostElement(node: Node): HTMLElement | null {
  let root: Node | null = node
  while (root) {
    if (root instanceof ShadowRoot) return root.host as HTMLElement
    root = root.parentNode ?? (root as { host?: Node }).host ?? null
  }
  return node instanceof HTMLElement ? node : null
}

function findScrollableAncestor(el: HTMLElement | null): HTMLElement | null {
  let cur: HTMLElement | null = el
  while (cur && cur !== document.body) {
    const style = getComputedStyle(cur)
    const canScroll =
      /(auto|scroll|overlay)/.test(style.overflowY) && cur.scrollHeight > cur.clientHeight
    if (canScroll) return cur
    cur = cur.parentElement
  }
  return document.scrollingElement as HTMLElement | null
}
