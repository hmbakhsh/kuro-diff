import { useEffect, useMemo, useRef } from 'react'
import { FileTree as PierreFileTree } from '@pierre/file-tree'
import type { FileTreeOptions } from '@pierre/file-tree'
import { cn } from '@renderer/lib/cn'

interface FileTreeProps {
  /** Flat, repo-relative, forward-slash paths. */
  files: string[]
  /**
   * Paths (already collapsed at directory boundaries) that should be rendered
   * as gitignored. Items whose path equals, or sits under, any prefix are
   * visually dimmed and italicized.
   */
  ignoredPrefixes?: string[]
  selectedPath: string | null
  onSelect(path: string): void
  className?: string
}

/**
 * Sorts paths so that, within each directory level: non-dot folders, non-dot
 * files, dot folders/files, then ignored entries — each group alphabetical
 * (case-insensitive, natural numeric). Pierre walks this list in order and
 * inserts children into Sets, so input order dictates render order.
 */
function sortFoldersFirst(files: string[], ignored: Set<string>): string[] {
  return [...files].sort((a, b) => {
    const aParts = a.split('/')
    const bParts = b.split('/')
    const minLen = Math.min(aParts.length, bParts.length)
    for (let i = 0; i < minLen; i++) {
      if (aParts[i] === bParts[i]) continue
      const aPrefix = aParts.slice(0, i + 1).join('/')
      const bPrefix = bParts.slice(0, i + 1).join('/')
      const aIsIgnored = ignored.has(aPrefix)
      const bIsIgnored = ignored.has(bPrefix)
      if (aIsIgnored !== bIsIgnored) return aIsIgnored ? 1 : -1
      const aIsDot = aParts[i]!.startsWith('.')
      const bIsDot = bParts[i]!.startsWith('.')
      if (aIsDot !== bIsDot) return aIsDot ? 1 : -1
      const aIsFolder = i < aParts.length - 1
      const bIsFolder = i < bParts.length - 1
      if (aIsFolder !== bIsFolder) return aIsFolder ? -1 : 1
      return aParts[i]!.localeCompare(bParts[i]!, undefined, {
        sensitivity: 'base',
        numeric: true,
      })
    }
    return aParts.length - bParts.length
  })
}

/**
 * Wraps the vanilla Pierre `FileTree` class (not the React wrapper).
 *
 * Pierre's React wrapper is hydration-only: it relies on declarative
 * Shadow DOM (`<template shadowrootmode="open">`) which browsers only attach
 * during initial HTML parse, never after client-side `dangerouslySetInnerHTML`.
 * That makes it unusable for a CSR-only Electron renderer.
 *
 * The vanilla class has no such constraint — it creates a `<pierre-file-tree>`
 * element, opens a shadow root imperatively, and Preact-renders into it. We
 * drive it from React: mount-effect creates the instance, deps-effect calls
 * `.render()` again with new options, unmount-effect cleans up.
 *
 * Contract from Appendix A.8:
 *  - `config.onPrimaryAction(item)` fires on double-click / Enter.
 *  - `item.getId()` is the full path; `item.isFolder()` separates files.
 */
export function FileTree({
  files,
  ignoredPrefixes,
  selectedPath,
  onSelect,
  className,
}: FileTreeProps) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const instanceRef = useRef<PierreFileTree | null>(null)

  // onSelect can change across renders but we don't want to re-instantiate
  // the tree for that. Read through a ref.
  const onSelectRef = useRef(onSelect)
  useEffect(() => {
    onSelectRef.current = onSelect
  }, [onSelect])
  const selectedPathRef = useRef(selectedPath)
  useEffect(() => {
    selectedPathRef.current = selectedPath
  }, [selectedPath])

  const ignoredSet = useMemo(
    () => new Set(ignoredPrefixes ?? []),
    [ignoredPrefixes],
  )
  const sortedFiles = useMemo(
    () => sortFoldersFirst(files, ignoredSet),
    [files, ignoredSet],
  )

  const options = useMemo<FileTreeOptions>(() => {
    return {
      files: sortedFiles,
      flattenEmptyDirectories: true,
      config: {
        onPrimaryAction: (item) => {
          if (item.isFolder()) return
          const id = item.getId()
          if (ignoredSet.has(id)) return
          onSelectRef.current(id)
        },
        setSelectedItems: (ids) => {
          if (ids.length !== 1) return
          const id = ids[0]!
          if (id === selectedPathRef.current) return
          if (ignoredSet.has(id)) return
          if (sortedFiles.includes(id)) onSelectRef.current(id)
        },
      },
    }
  }, [sortedFiles, ignoredSet])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const tree = new PierreFileTree(options)
    instanceRef.current = tree
    tree.render({ containerWrapper: container })
    return () => {
      tree.cleanUp()
      instanceRef.current = null
      while (container.firstChild) container.removeChild(container.firstChild)
    }
  }, [options])

  // Dim items whose path equals, or sits under, any ignored prefix. We inject
  // a single stylesheet into Pierre's shadow root — CSS selectors survive
  // Preact re-renders (expand/collapse, selection) without DOM mutation.
  const ignoredCss = useMemo(
    () => buildIgnoredCss(ignoredPrefixes),
    [ignoredPrefixes],
  )
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const pierreEl = container.querySelector(
      'pierre-file-tree',
    ) as HTMLElement | null
    const shadow = pierreEl?.shadowRoot
    if (!shadow || !ignoredCss) return
    const sheet = new CSSStyleSheet()
    sheet.replaceSync(ignoredCss)
    shadow.adoptedStyleSheets = [...shadow.adoptedStyleSheets, sheet]
    return () => {
      shadow.adoptedStyleSheets = shadow.adoptedStyleSheets.filter(
        (s) => s !== sheet,
      )
    }
  }, [ignoredCss, options])

  return (
    <div ref={containerRef} className={cn('file-tree h-full', className)} />
  )
}

function buildIgnoredCss(prefixes: string[] | undefined): string | null {
  if (!prefixes || prefixes.length === 0) return null
  const selectors: string[] = []
  for (const p of prefixes) {
    const exact = CSS.escape(p)
    const prefix = CSS.escape(`${p}/`)
    selectors.push(`[data-item-id="${exact}"]`)
    selectors.push(`[data-item-id^="${prefix}"]`)
  }
  return `${selectors.join(',\n')} {
    opacity: 0.5;
    font-style: italic;
  }`
}
