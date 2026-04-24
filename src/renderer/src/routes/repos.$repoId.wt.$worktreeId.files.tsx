import { useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { trpc } from '@renderer/trpc'
import { FileTree } from '@renderer/components/files/FileTree'
import { FileContent } from '@renderer/components/files/FileContent'
import { cn } from '@renderer/lib/cn'

const searchSchema = z.object({
  p: z.string().optional(),
})

export const Route = createFileRoute('/repos/$repoId/wt/$worktreeId/files')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  component: FilesView,
})

function FilesView() {
  const { repoId, worktreeId } = Route.useParams()
  const { p: selectedPath } = Route.useSearch()
  const navigate = useNavigate({ from: '/repos/$repoId/wt/$worktreeId/files' })
  const utils = trpc.useUtils()

  const prefs = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 })
  const showIgnored = prefs.data?.showIgnoredFiles ?? false

  const setPrefs = trpc.preferences.set.useMutation({
    onSuccess: (next) => {
      utils.preferences.get.setData(undefined, next)
    },
  })

  // Fire both variants in parallel on mount. The non-ignored query is fast
  // (tracked + untracked); the ignored query runs in the background so
  // toggling `.ignored` on finds data already cached. React Query keeps both
  // entries separately keyed by input.
  const treeVisible = trpc.fs.listTree.useQuery(
    { repoId, worktreeId, includeIgnored: false },
    { staleTime: 60_000 },
  )
  const treeWithIgnored = trpc.fs.listTree.useQuery(
    { repoId, worktreeId, includeIgnored: true },
    { staleTime: 60_000 },
  )
  const tree = showIgnored ? treeWithIgnored : treeVisible

  // Pierre compares `files` element-wise via `areOptionsEqual` — returning a
  // stable identity when the contents haven't changed prevents the tree from
  // tearing down on every parent re-render.
  const files = useMemo(() => tree.data?.files ?? [], [tree.data])
  const ignoredPrefixes = useMemo(
    () => (showIgnored ? treeWithIgnored.data?.ignoredPrefixes ?? [] : []),
    [showIgnored, treeWithIgnored.data],
  )

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-64 shrink-0 flex-col border-r border-black/10 text-[12px] dark:border-white/10">
        <div className="flex items-center justify-between gap-2 border-b border-black/5 px-2 py-1.5 dark:border-white/5">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            Files
          </span>
          <button
            type="button"
            onClick={() =>
              setPrefs.mutate({ showIgnoredFiles: !showIgnored })
            }
            title={
              showIgnored
                ? 'Hide gitignored files'
                : 'Show gitignored files'
            }
            aria-pressed={showIgnored}
            className={cn(
              'rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors',
              showIgnored
                ? 'bg-zinc-900 text-white dark:bg-white dark:text-zinc-900'
                : 'text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10',
            )}
          >
            .ignored
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tree.isPending && (
            <div className="p-3 text-xs text-zinc-500">Loading tree…</div>
          )}
          {tree.isError && (
            <div className="p-3 text-xs text-red-500">
              Failed to list files: {tree.error.message}
            </div>
          )}
          {tree.data && (
            <FileTree
              files={files}
              ignoredPrefixes={ignoredPrefixes}
              selectedPath={selectedPath ?? null}
              onSelect={(path) =>
                navigate({
                  to: '/repos/$repoId/wt/$worktreeId/files',
                  params: { repoId, worktreeId },
                  search: { p: path },
                  replace: true,
                })
              }
            />
          )}
        </div>
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <FileContent
          repoId={repoId}
          worktreeId={worktreeId}
          path={selectedPath ?? null}
        />
      </div>
    </div>
  )
}
