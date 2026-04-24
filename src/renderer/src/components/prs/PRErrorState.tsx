import { AlertCircle, Terminal } from 'lucide-react'
import { trpc } from '@renderer/trpc'
import { cn } from '@renderer/lib/cn'
import type { GhErrorKind } from '@shared/types'

interface PRErrorStateProps {
  error: unknown
  onRefresh(): void
}

/**
 * Renders a contextual recovery UI for each GhError kind — auth prompts a
 * terminal copy flow, rate-limit shows the reset window, network/timeout
 * shows a plain retry affordance.
 */
export function PRErrorState({ error, onRefresh }: PRErrorStateProps) {
  const kind = readKind(error)
  const message = readMessage(error)

  const openHelp = trpc.github.openExternal.useMutation()

  if (kind === 'binary-missing') {
    return (
      <Shell
        title="GitHub CLI not installed"
        message="kuro-diff uses `gh` to talk to GitHub. Install it with Homebrew:"
        commandLine="brew install gh"
      />
    )
  }

  if (kind === 'unauthenticated') {
    return (
      <Shell
        title="Not signed in to GitHub"
        message="Sign in by running this in your terminal, then click Refresh:"
        commandLine="gh auth login"
        actions={
          <>
            <button
              type="button"
              onClick={() => onRefresh()}
              className="rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={() =>
                openHelp.mutate({ url: 'https://cli.github.com/manual/gh_auth_login' })
              }
              className="rounded-md px-3 py-1 text-xs text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10"
            >
              Help ↗
            </button>
          </>
        }
      />
    )
  }

  if (kind === 'rate-limited') {
    return (
      <Shell
        title="GitHub API rate limit exceeded"
        message="Wait for the window to reset, or sign in if you're using anonymous credentials."
        actions={<RefreshButton onClick={onRefresh} />}
      />
    )
  }

  if (kind === 'network') {
    return (
      <Shell
        title="Can't reach GitHub"
        message={message ?? 'Network error.'}
        actions={<RefreshButton onClick={onRefresh} />}
      />
    )
  }

  return (
    <Shell
      title="Couldn't load PRs"
      message={message ?? 'Unknown error.'}
      actions={<RefreshButton onClick={onRefresh} />}
    />
  )
}

function Shell({
  title,
  message,
  commandLine,
  actions,
}: {
  title: string
  message: string
  commandLine?: string
  actions?: React.ReactNode
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
      <AlertCircle className="size-6 text-zinc-400" strokeWidth={1.5} />
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{title}</p>
        <p className="mt-1 text-xs text-zinc-500">{message}</p>
      </div>
      {commandLine && (
        <div
          className={cn(
            'flex items-center gap-2 rounded-md border border-black/10 px-3 py-1.5 font-mono text-[12px]',
            'dark:border-white/10',
          )}
        >
          <Terminal className="size-3.5 text-zinc-400" strokeWidth={2} />
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(commandLine)}
            className="select-text"
            title="Click to copy"
          >
            {commandLine}
          </button>
        </div>
      )}
      {actions && <div className="flex items-center gap-2 pt-1">{actions}</div>}
    </div>
  )
}

function RefreshButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
    >
      Retry
    </button>
  )
}

function readKind(err: unknown): GhErrorKind | null {
  const kind = (err as { data?: { kind?: GhErrorKind } } | null)?.data?.kind
  return kind ?? null
}

function readMessage(err: unknown): string | null {
  if (err instanceof Error) return err.message
  return null
}
