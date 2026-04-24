import { useState } from 'react'
import { createRootRoute, Outlet } from '@tanstack/react-router'
import { WorkspaceSidebar } from '@renderer/components/workspace/WorkspaceSidebar'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  const [activeRepoId, setActiveRepoId] = useState<string | null>(null)

  return (
    <div className="flex h-full min-h-0">
      <WorkspaceSidebar
        activeRepoId={activeRepoId}
        onSelectRepo={setActiveRepoId}
      />
      <main className="flex min-w-0 flex-1 flex-col">
        <header className="titlebar-drag h-11 shrink-0 border-b border-black/10 dark:border-white/10" />
        <div className="flex-1 overflow-hidden">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
