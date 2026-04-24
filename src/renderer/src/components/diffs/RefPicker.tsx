import { useEffect, useMemo, useRef, useState } from 'react'
import { cn } from '@renderer/lib/cn'
import type { GitRef } from '@shared/types'

interface RefPickerProps {
  label: string
  refs: readonly GitRef[]
  /**
   * `null` is treated as the special "Working tree" sentinel — only meaningful
   * for the head side, never for base.
   */
  value: string | null
  onChange(value: string | null): void
  allowWorkingTree?: boolean
  className?: string
}

const WORKING_TREE_SENTINEL = '__working_tree__'

export function RefPicker({
  label,
  refs,
  value,
  onChange,
  allowWorkingTree = false,
  className,
}: RefPickerProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const items = useMemo(() => {
    const base: Array<{ id: string; label: string; kind: string }> = []
    if (allowWorkingTree) {
      base.push({ id: WORKING_TREE_SENTINEL, label: 'Working tree', kind: 'special' })
    }
    // Deduplicate by name across local + remote + tag while preserving kind
    // labels for the most-specific source.
    for (const r of refs) {
      base.push({ id: r.name, label: r.name, kind: r.kind })
    }
    return base
  }, [refs, allowWorkingTree])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return items
    return items.filter((it) => it.label.toLowerCase().includes(q))
  }, [items, query])

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return
    function onDown(e: MouseEvent): void {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('mousedown', onDown)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onDown)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  useEffect(() => {
    if (open) inputRef.current?.focus()
    else setQuery('')
  }, [open])

  const displayLabel =
    value === null
      ? allowWorkingTree
        ? 'Working tree'
        : '—'
      : value

  return (
    <div ref={rootRef} className={cn('relative inline-flex flex-col', className)}>
      <span className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
        {label}
      </span>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-7 min-w-[10rem] items-center justify-between gap-2 rounded-md border border-black/15 bg-white/40 px-2 text-[12px]',
          'hover:bg-black/5 dark:border-white/15 dark:bg-white/5 dark:hover:bg-white/10',
        )}
      >
        <span className="truncate font-mono">{displayLabel}</span>
        <span className="text-zinc-400">▾</span>
      </button>

      {open && (
        <div
          className={cn(
            'absolute left-0 top-full z-20 mt-1 w-72 overflow-hidden rounded-md border border-black/10 bg-white shadow-lg',
            'dark:border-white/10 dark:bg-zinc-900',
          )}
        >
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Filter refs…"
            className={cn(
              'w-full border-b border-black/10 bg-transparent px-2 py-1.5 text-[12px] outline-none',
              'dark:border-white/10',
            )}
          />
          <ul className="max-h-72 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <li className="px-2 py-1.5 text-[12px] text-zinc-500">No matches</li>
            )}
            {filtered.map((it) => (
              <li key={`${it.kind}:${it.id}`}>
                <button
                  type="button"
                  onClick={() => {
                    onChange(it.id === WORKING_TREE_SENTINEL ? null : it.id)
                    setOpen(false)
                  }}
                  className={cn(
                    'flex w-full items-center justify-between gap-2 px-2 py-1 text-left font-mono text-[12px]',
                    'hover:bg-black/5 dark:hover:bg-white/10',
                    it.id === (value === null ? WORKING_TREE_SENTINEL : value) &&
                      'bg-black/5 dark:bg-white/10',
                  )}
                >
                  <span className="truncate">{it.label}</span>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-zinc-500">
                    {it.kind}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
