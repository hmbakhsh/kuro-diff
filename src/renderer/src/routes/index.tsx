import { createFileRoute } from '@tanstack/react-router'
import { trpc } from '@renderer/trpc'

export const Route = createFileRoute('/')({
  component: Welcome,
})

function Welcome() {
  const ping = trpc.system.ping.useQuery('hello from renderer')

  return (
    <div className="flex h-full items-center justify-center">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">kuro-diff</h1>
        <p className="text-muted-foreground text-sm">
          A read-only code review workstation.
        </p>
        <div className="bg-black/5 dark:bg-white/5 rounded-md p-3 font-mono text-xs">
          {ping.isPending && 'pinging main...'}
          {ping.isError && `error: ${ping.error.message}`}
          {ping.data && (
            <>
              <div>pong: {ping.data.pong}</div>
              <div>v{ping.data.appVersion}</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
