// Strip binary-file sections from a raw unified/git diff so Pierre's parser
// doesn't render empty hunks for them. `@pierre/diffs` emits a file entry
// with zero hunks when git reports `Binary files a/x and b/y differ` — we
// filter those out entirely up-front. The count of stripped files is surfaced
// so the UI can note them.

export interface FilteredPatch {
  patch: string
  binaryCount: number
  binaryPaths: string[]
}

const FILE_SPLIT_RE = /(?=^diff --git )/m

export function stripBinaryFiles(raw: string): FilteredPatch {
  if (!raw) return { patch: '', binaryCount: 0, binaryPaths: [] }
  const sections = raw.split(FILE_SPLIT_RE)
  const kept: string[] = []
  const binaryPaths: string[] = []

  for (const section of sections) {
    if (!section.startsWith('diff --git ')) {
      kept.push(section)
      continue
    }
    if (!/^Binary files .* and .* differ$/m.test(section)) {
      kept.push(section)
      continue
    }
    // Record the target path for the UI note. `diff --git a/<path> b/<path>`
    // is the canonical first line.
    const match = /^diff --git a\/(.+?) b\/.+$/m.exec(section)
    binaryPaths.push(match?.[1] ?? '<unknown>')
  }

  return {
    patch: kept.join(''),
    binaryCount: binaryPaths.length,
    binaryPaths,
  }
}
