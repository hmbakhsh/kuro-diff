import { useEffect, useMemo, useRef } from 'react'
import { FileTree as PierreFileTree } from '@pierre/file-tree'
import type { FileTreeOptions } from '@pierre/file-tree'
import { cn } from '@renderer/lib/cn'

interface FileTreeProps {
  /** Flat, repo-relative, forward-slash paths. */
  files: string[]
  selectedPath: string | null
  onSelect(path: string): void
  className?: string
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

  const options = useMemo<FileTreeOptions>(() => {
    return {
      files,
      flattenEmptyDirectories: true,
      config: {
        onPrimaryAction: (item) => {
          if (!item.isFolder()) onSelectRef.current(item.getId())
        },
        setSelectedItems: (ids) => {
          if (ids.length !== 1) return
          const id = ids[0]!
          if (id === selectedPathRef.current) return
          if (files.includes(id)) onSelectRef.current(id)
        },
      },
    }
  }, [files])

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

  return (
    <div ref={containerRef} className={cn('file-tree h-full', className)} />
  )
}
