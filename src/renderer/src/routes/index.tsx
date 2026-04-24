import { createFileRoute } from '@tanstack/react-router'
import { trpc } from '@renderer/trpc'

export const Route = createFileRoute('/')({
  component: Welcome,
})

function Welcome() {
  const ping = trpc.system.ping.useQuery('hello from renderer')
  const repos = trpc.workspace.list.useQuery()

  return (
    <div className="flex h-full items-center justify-center p-8">
      <div className="max-w-md space-y-4 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">kuro-diff</h1>
        <p className="text-sm text-zinc-500">
          A read-only code review workstation.
        </p>

        <div className="rounded-md bg-black/5 p-3 font-mono text-xs dark:bg-white/5">
          {ping.isPending && 'pinging main…'}
          {ping.isError && `error: ${ping.error.message}`}
          {ping.data && (
            <>
              <div>pong: {ping.data.pong}</div>
              <div>v{ping.data.appVersion}</div>
            </>
          )}
        </div>

        <div className="rounded-md bg-black/5 p-3 font-mono text-xs dark:bg-white/5">
          {repos.isPending && 'loading repos…'}
          {repos.data && repos.data.length === 0 && (
            <span>Add a repository from the sidebar to get started.</span>
          )}
          {repos.data && repos.data.length > 0 && (
            <span>{repos.data.length} repos in workspace</span>
          )}
        </div>
      </div>
    </div>
  )
}
