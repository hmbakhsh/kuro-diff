import { useEffect, useMemo, useRef, useState } from 'react'
import { File as PierreFile } from '@pierre/diffs/react'
import type { FileContents } from '@pierre/diffs'
import { trpc } from '@renderer/trpc'
import { cn } from '@renderer/lib/cn'
import { ensureLangLoaded } from '@renderer/lib/highlighter'
import {
  useRegisterCapture,
  type CaptureTarget,
} from '@renderer/lib/capture-context'
import { FindInFileOverlay } from './FindInFileOverlay'

interface FileContentProps {
  repoId: string
  worktreeId?: string
  path: string | null
  className?: string
}

export function FileContent({
  repoId,
  worktreeId,
  path,
  className,
}: FileContentProps) {
  const [force, setForce] = useState(false)
  const [showFind, setShowFind] = useState(false)
  const viewerRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    setForce(false)
    setShowFind(false)
  }, [repoId, worktreeId, path])

  // Cmd+F opens the find overlay — only relevant while viewing text.
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === 'f') {
        e.preventDefault()
        setShowFind(true)
      }
      if (e.key === 'Escape') setShowFind(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const query = trpc.fs.readFile.useQuery(
    path ? { repoId, worktreeId, path, force } : (undefined as never),
    {
      enabled: !!path,
      staleTime: 30_000,
      // File bodies can be large (hundreds of KB each) — excluded from the
      // localStorage persister in main.tsx. In-memory retention follows the
      // global gcTime (24h), so quickly toggling between files stays snappy.
      meta: { persist: false },
    },
  )

  // Ensure the language's grammar is attached to Pierre's shared highlighter
  // before handing the file off. `<File>` falls back to plain text if the
  // grammar is missing — explicit is better than silent.
  useEffect(() => {
    if (query.data?.kind === 'text') {
      void ensureLangLoaded(query.data.lang)
    }
  }, [query.data])

  const pierreFile: FileContents | null = useMemo(() => {
    if (!query.data || query.data.kind !== 'text' || !path) return null
    return {
      name: path,
      contents: query.data.contents,
      cacheKey: `${path}@${query.data.size}`,
    }
  }, [query.data, path])

  // Surface what the user is viewing to the capture context so Cmd+Shift+C
  // can read file metadata without prop-drilling. Only registers for text
  // files — binary/image/too-large views have no copy-for-agent value.
  const repoName = useRepoName(repoId)
  const worktreeMeta = useWorktreeMeta(repoId, worktreeId)
  const captureTarget = useMemo<CaptureTarget | null>(() => {
    if (!path) return null
    if (!query.data || query.data.kind !== 'text') return null
    return {
      repoId,
      repoName,
      worktreeId: worktreeId ?? null,
      relativePath: path,
      contents: query.data.contents,
      sha: worktreeMeta.sha,
      branch: worktreeMeta.branch,
      language: query.data.lang,
      lineCount: countLines(query.data.contents),
      diff: null,
    }
  }, [path, query.data, repoId, repoName, worktreeId, worktreeMeta])
  useRegisterCapture(captureTarget)

  if (!path) {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center text-xs text-zinc-500',
          className,
        )}
      >
        Select a file from the tree.
      </div>
    )
  }

  if (query.isPending) {
    return (
      <div className={cn('p-4 text-xs text-zinc-500', className)}>
        Loading {path}…
      </div>
    )
  }

  if (query.isError) {
    return (
      <div className={cn('p-4 text-xs text-red-500', className)}>
        Failed to read file: {query.error.message}
      </div>
    )
  }

  const data = query.data
  if (!data) return null

  if (data.kind === 'too-large') {
    return (
      <div
        className={cn(
          'flex h-full flex-col items-center justify-center gap-3 p-8 text-center',
          className,
        )}
      >
        <p className="text-sm">
          This file is large ({formatBytes(data.size)}). Loading it may slow
          the app down.
        </p>
        <button
          type="button"
          onClick={() => setForce(true)}
          className="rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
        >
          Load anyway
        </button>
      </div>
    )
  }

  if (data.kind === 'binary') {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center p-8 text-xs text-zinc-500',
          className,
        )}
      >
        Binary file ({formatBytes(data.size)})
      </div>
    )
  }

  if (data.kind === 'image') {
    return (
      <div
        className={cn(
          'flex h-full items-center justify-center overflow-auto p-4',
          className,
        )}
      >
        <img
          src={data.dataUri}
          alt={path}
          className="max-h-full max-w-full object-contain"
        />
      </div>
    )
  }

  return (
    <div ref={viewerRef} className={cn('relative h-full overflow-auto', className)}>
      {pierreFile && (
        <PierreFile
          file={pierreFile}
          disableWorkerPool
          className="px-2 py-2 text-[13px] leading-5"
        />
      )}
      {showFind && data.kind === 'text' && (
        <FindInFileOverlay
          contents={data.contents}
          onClose={() => setShowFind(false)}
          scope={viewerRef.current}
        />
      )}
    </div>
  )
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1024 / 1024).toFixed(2)} MB`
}

function countLines(s: string): number {
  if (s.length === 0) return 0
  let n = 1
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 10) n++
  return n
}

function useRepoName(repoId: string): string {
  const repos = trpc.workspace.list.useQuery(undefined, { staleTime: 60_000 })
  return repos.data?.find((r) => r.id === repoId)?.name ?? ''
}

function useWorktreeMeta(
  repoId: string,
  worktreeId: string | undefined,
): { sha: string | null; branch: string | null } {
  const query = trpc.workspace.listWorktrees.useQuery(
    { repoId },
    { staleTime: 30_000 },
  )
  const worktree = query.data?.find((w) => w.id === worktreeId)
  if (!worktree) return { sha: null, branch: null }
  return {
    sha: worktree.head ? worktree.head.slice(0, 7) : null,
    branch: worktree.branch?.replace('refs/heads/', '') ?? null,
  }
}
