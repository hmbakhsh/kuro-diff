import { createFileRoute } from '@tanstack/react-router'
import { CheckCircle2, Copy, ExternalLink, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { trpc } from '@renderer/trpc'
import { cn } from '@renderer/lib/cn'

export const Route = createFileRoute('/settings')({
  component: Settings,
})

function Settings() {
  const utils = trpc.useUtils()
  const auth = trpc.github.authStatus.useQuery(undefined, {
    staleTime: 10 * 60 * 1000,
  })
  const rateLimit = trpc.github.rateLimit.useQuery(undefined, {
    staleTime: 5 * 60 * 1000,
    enabled: auth.data?.authenticated ?? false,
  })
  const openExternal = trpc.github.openExternal.useMutation()

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-8 px-6 py-10">
        <header>
          <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Local preferences and integration state.
          </p>
        </header>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
            GitHub
          </h2>
          <div
            className={cn(
              'rounded-lg border border-black/10 bg-white/40 p-4',
              'dark:border-white/10 dark:bg-white/5',
            )}
          >
            {auth.isPending && (
              <p className="text-sm text-zinc-500">Checking gh auth status…</p>
            )}

            {auth.data && !auth.data.installed && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <XCircle className="size-4 text-red-500" strokeWidth={2} />
                  <p className="text-sm font-medium">GitHub CLI not installed</p>
                </div>
                <p className="text-xs text-zinc-500">
                  kuro-diff uses `gh` to authenticate and talk to GitHub. Install
                  via Homebrew:
                </p>
                <CommandBlock command="brew install gh" />
              </div>
            )}

            {auth.data && auth.data.installed && auth.data.authenticated && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-4 text-emerald-500" strokeWidth={2} />
                  <p className="text-sm font-medium">
                    Signed in as{' '}
                    <span className="font-mono">{auth.data.login ?? 'unknown'}</span>
                  </p>
                </div>
                {rateLimit.data && (
                  <p className="font-mono text-[11px] text-zinc-500">
                    {rateLimit.data.remaining}/{rateLimit.data.limit} requests remaining
                    {' · resets '}
                    {new Date(rateLimit.data.resetAt).toLocaleTimeString()}
                  </p>
                )}
                <div className="flex items-center gap-2">
                  <RefreshButton
                    onClick={async () => {
                      await utils.github.authStatus.invalidate()
                      await utils.github.rateLimit.invalidate()
                    }}
                  />
                </div>
              </div>
            )}

            {auth.data && auth.data.installed && !auth.data.authenticated && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <XCircle className="size-4 text-amber-500" strokeWidth={2} />
                  <p className="text-sm font-medium">Not signed in</p>
                </div>
                <p className="text-xs text-zinc-500">
                  Sign in by running this in your terminal, then click Refresh:
                </p>
                <CommandBlock command="gh auth login" />
                <div className="flex items-center gap-2">
                  <RefreshButton
                    onClick={async () => {
                      await utils.github.authStatus.invalidate()
                    }}
                  />
                  <button
                    type="button"
                    onClick={() =>
                      openExternal.mutate({
                        url: 'https://cli.github.com/manual/gh_auth_login',
                      })
                    }
                    className={cn(
                      'inline-flex h-7 items-center gap-1 rounded-md px-2 text-xs text-zinc-500',
                      'hover:bg-black/5 dark:hover:bg-white/10',
                    )}
                  >
                    Docs
                    <ExternalLink className="size-3" strokeWidth={2} />
                  </button>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  )
}

function CommandBlock({ command }: { command: string }) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-2 rounded-md border border-black/10 px-3 py-1.5',
        'font-mono text-[12px] dark:border-white/10',
      )}
    >
      <span className="select-text">{command}</span>
      <button
        type="button"
        title="Copy"
        onClick={() => {
          void navigator.clipboard.writeText(command)
          toast.success('Copied')
        }}
        className="rounded p-1 text-zinc-400 hover:bg-black/5 hover:text-zinc-700 dark:hover:bg-white/10 dark:hover:text-zinc-200"
      >
        <Copy className="size-3.5" strokeWidth={2} />
      </button>
    </div>
  )
}

function RefreshButton({ onClick }: { onClick: () => Promise<void> | void }) {
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      className={cn(
        'h-7 rounded-md border border-black/15 px-3 text-xs',
        'hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10',
      )}
    >
      Refresh
    </button>
  )
}
