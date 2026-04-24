import { Plus } from 'lucide-react'
import { trpc } from '@renderer/trpc'
import { cn } from '@renderer/lib/cn'

export function AddRepoButton() {
  const utils = trpc.useUtils()
  const add = trpc.workspace.addRepoFromDialog.useMutation({
    onSuccess: () => {
      void utils.workspace.list.invalidate()
    },
  })

  return (
    <button
      type="button"
      onClick={() => add.mutate()}
      disabled={add.isPending}
      className={cn(
        'drag-none flex w-full items-center gap-2 rounded-md px-2 py-1.5',
        'text-xs font-medium text-zinc-600 dark:text-zinc-300',
        'hover:bg-black/5 dark:hover:bg-white/5',
        'disabled:opacity-50',
      )}
    >
      <Plus className="size-3.5" strokeWidth={2.25} />
      <span>{add.isPending ? 'Opening…' : 'Add repository'}</span>
    </button>
  )
}
