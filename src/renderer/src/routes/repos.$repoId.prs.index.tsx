import { createFileRoute } from '@tanstack/react-router'
import { GitPullRequest } from 'lucide-react'

export const Route = createFileRoute('/repos/$repoId/prs/')({
  component: PRsIndex,
})

function PRsIndex() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 p-8 text-center text-zinc-500">
      <GitPullRequest className="size-5" strokeWidth={1.5} />
      <p className="text-xs">Select a PR to view its diff.</p>
    </div>
  )
}
