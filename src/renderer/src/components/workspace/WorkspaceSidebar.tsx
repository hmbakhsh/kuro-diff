import { useCallback, useEffect, type DragEvent } from 'react'
import { trpc } from '@renderer/trpc'
import { cn } from '@renderer/lib/cn'
import { RepoNode } from './RepoNode'
import { AddRepoButton } from './AddRepoButton'

interface WorkspaceSidebarProps {
  activeRepoId: string | null
  onSelectRepo(repoId: string): void
}

export function WorkspaceSidebar({
  activeRepoId,
  onSelectRepo,
}: WorkspaceSidebarProps) {
  const repos = trpc.workspace.list.useQuery()
  const utils = trpc.useUtils()
  const addRepo = trpc.workspace.addRepo.useMutation({
    onSuccess: () => void utils.workspace.list.invalidate(),
  })

  // Cmd+1..9 — quick repo switch
  useEffect(() => {
    const data = repos.data ?? []
    function handler(e: KeyboardEvent): void {
      if (!e.metaKey || e.shiftKey || e.altKey || e.ctrlKey) return
      const n = parseInt(e.key, 10)
      if (!Number.isInteger(n) || n < 1 || n > 9) return
      const target = data[n - 1]
      if (target) {
        e.preventDefault()
        onSelectRepo(target.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [repos.data, onSelectRepo])

  const handleDrop = useCallback(
    (e: DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      const files = Array.from(e.dataTransfer.files)
      for (const file of files) {
        // Electron exposes the absolute path for dropped files via the
        // webUtils.getPathForFile helper surfaced by @electron-toolkit/preload.
        const path =
          window.electron?.webUtils?.getPathForFile?.(file) ?? ''
        if (path) addRepo.mutate({ path })
      }
    },
    [addRepo],
  )

  const handleDragOver = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  return (
    <aside
      className={cn(
        'flex h-full w-60 shrink-0 flex-col border-r border-black/10 dark:border-white/10',
        'bg-transparent', // vibrancy shows through
      )}
      onDrop={handleDrop}
      onDragOver={handleDragOver}
      aria-label="Workspace"
    >
      <div className="titlebar-drag h-11 shrink-0" />
      <div className="flex items-center justify-between px-3 py-1">
        <span className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">
          Workspace
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-1.5 py-1">
        {repos.isPending && (
          <div className="px-2 py-1 text-xs text-zinc-500">Loading…</div>
        )}
        {repos.data && repos.data.length === 0 && (
          <div className="mx-2 my-4 rounded-md border border-dashed border-black/20 p-3 text-center text-[11px] text-zinc-500 dark:border-white/15">
            Drop a repo folder here, or click below.
          </div>
        )}
        {repos.data?.map((repo) => (
          <RepoNode
            key={repo.id}
            repo={repo}
            isActive={activeRepoId === repo.id}
            onSelect={onSelectRepo}
          />
        ))}
      </div>

      <div className="border-t border-black/10 p-1.5 dark:border-white/10">
        <AddRepoButton />
      </div>
    </aside>
  )
}
