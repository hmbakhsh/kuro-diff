import { useEffect, useState } from 'react'
import { Command } from 'cmdk'
import { Clipboard, FileCode, Files, GitCompareArrows } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@renderer/trpc'
import { useCopyForAgent, type CopyAction } from '@renderer/hooks/useCopyForAgent'
import { cn } from '@renderer/lib/cn'
import type { CopyPreset } from '@shared/copy-template'

interface CopyForAgentPaletteProps {
  open: boolean
  onOpenChange(open: boolean): void
}

const ICONS: Record<CopyAction['id'], React.ComponentType<{ className?: string }>> = {
  'copy-selection': Clipboard,
  'copy-path': Files,
  'copy-content': FileCode,
  'copy-diff': GitCompareArrows,
}

export function CopyForAgentPalette({ open, onOpenChange }: CopyForAgentPaletteProps) {
  const prefs = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 })
  const preset: CopyPreset = prefs.data?.copyPreset ?? 'markdown-fence'
  const { actions } = useCopyForAgent({ preset })
  const [search, setSearch] = useState('')

  useEffect(() => {
    if (!open) setSearch('')
  }, [open])

  const run = async (action: CopyAction): Promise<void> => {
    if (!action.available) return
    onOpenChange(false)
    try {
      await action.run()
      toast.success(action.label, {
        description: `${preset} · ${action.description}`,
      })
    } catch (err) {
      toast.error('Copy failed', {
        description: err instanceof Error ? err.message : 'Unknown error',
      })
    }
  }

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Copy for agent"
      contentClassName={cn(
        'fixed left-1/2 top-[18vh] z-50 w-[min(560px,92vw)] -translate-x-1/2',
        'rounded-xl border border-black/10 bg-white/95 shadow-2xl backdrop-blur',
        'dark:border-white/10 dark:bg-zinc-900/95',
      )}
      overlayClassName="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
    >
      <div className="border-b border-black/5 px-3 dark:border-white/5">
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder="Copy for agent…"
          className={cn(
            'h-11 w-full bg-transparent text-sm outline-none',
            'placeholder:text-zinc-400 dark:placeholder:text-zinc-500',
          )}
        />
      </div>
      <Command.List className="max-h-[52vh] overflow-y-auto p-1">
        <Command.Empty className="px-4 py-6 text-center text-xs text-zinc-500">
          Nothing matches.
        </Command.Empty>
        <Command.Group>
          {actions.map((action) => {
            const Icon = ICONS[action.id]
            return (
              <Command.Item
                key={action.id}
                value={`${action.id} ${action.label} ${action.description}`}
                disabled={!action.available}
                onSelect={() => void run(action)}
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm',
                  'aria-selected:bg-black/5 dark:aria-selected:bg-white/10',
                  'data-[disabled=true]:cursor-not-allowed data-[disabled=true]:opacity-40',
                )}
              >
                <Icon className="size-4 shrink-0 text-zinc-500" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{action.label}</span>
                  <span className="truncate text-[11px] text-zinc-500">
                    {action.description}
                  </span>
                </span>
              </Command.Item>
            )
          })}
        </Command.Group>
      </Command.List>
      <div className="border-t border-black/5 px-3 py-1.5 text-[10px] text-zinc-500 dark:border-white/5">
        <span className="font-mono">{preset}</span>
        <span className="mx-2">·</span>
        <span>Enter to copy · Esc to close</span>
      </div>
    </Command.Dialog>
  )
}
