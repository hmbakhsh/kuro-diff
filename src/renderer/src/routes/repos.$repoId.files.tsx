import { useMemo } from 'react'
import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { z } from 'zod'
import { trpc } from '@renderer/trpc'
import { FileTree } from '@renderer/components/files/FileTree'
import { FileContent } from '@renderer/components/files/FileContent'

const searchSchema = z.object({
  p: z.string().optional(),
})

export const Route = createFileRoute('/repos/$repoId/files')({
  validateSearch: (search: Record<string, unknown>) => searchSchema.parse(search),
  component: FilesView,
})

function FilesView() {
  const { repoId } = Route.useParams()
  const { p: selectedPath } = Route.useSearch()
  const navigate = useNavigate({ from: '/repos/$repoId/files' })

  const tree = trpc.fs.listTree.useQuery(
    { repoId },
    { staleTime: 60_000 },
  )

  // Pierre compares `files` element-wise via `areOptionsEqual` — returning a
  // stable identity when the contents haven't changed prevents the tree from
  // tearing down on every parent re-render.
  const files = useMemo(() => tree.data ?? [], [tree.data])

  return (
    <div className="flex h-full min-h-0">
      <div className="w-64 shrink-0 overflow-y-auto border-r border-black/10 text-[12px] dark:border-white/10">
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
            selectedPath={selectedPath ?? null}
            onSelect={(path) =>
              navigate({
                to: '/repos/$repoId/files',
                params: { repoId },
                search: { p: path },
                replace: true,
              })
            }
          />
        )}
      </div>
      <div className="min-w-0 flex-1 overflow-hidden">
        <FileContent repoId={repoId} path={selectedPath ?? null} />
      </div>
    </div>
  )
}
