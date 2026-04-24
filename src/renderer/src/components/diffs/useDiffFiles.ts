import { useMemo } from 'react'
import { parsePatchFiles } from '@pierre/diffs'
import type { FileDiffMetadata } from '@pierre/diffs'
import { stripBinaryFiles } from '@renderer/lib/patch-utils'

export interface ParsedDiff {
  files: FileDiffMetadata[]
  binaryCount: number
  binaryPaths: string[]
  rawSize: number
}

export function useDiffFiles(patch: string, cacheKey?: string): ParsedDiff {
  const filtered = useMemo(() => stripBinaryFiles(patch), [patch])
  const files = useMemo<FileDiffMetadata[]>(() => {
    if (!filtered.patch) return []
    const parsed = parsePatchFiles(filtered.patch, cacheKey ?? 'kuro-patch')
    return parsed.flatMap((p) => p.files)
  }, [filtered.patch, cacheKey])

  return {
    files,
    binaryCount: filtered.binaryCount,
    binaryPaths: filtered.binaryPaths,
    rawSize: patch.length,
  }
}
