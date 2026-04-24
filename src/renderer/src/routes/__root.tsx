import { createRootRoute, Link, Outlet } from '@tanstack/react-router'
import { cn } from '@renderer/lib/cn'

export const Route = createRootRoute({
  component: RootLayout,
})

function RootLayout() {
  return (
    <div className="flex h-full flex-col">
      <header
        className={cn(
          'titlebar-drag flex h-11 shrink-0 items-center gap-2 border-b border-black/10 px-3 pl-20 text-xs dark:border-white/10',
        )}
      >
        <div className="text-muted-foreground font-medium tracking-wide">
          kuro-diff
        </div>
        <nav className="drag-none ml-6 flex items-center gap-4">
          <Link
            to="/"
            activeProps={{ className: 'text-foreground font-medium' }}
            className="text-muted-foreground hover:text-foreground"
          >
            Welcome
          </Link>
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">
        <Outlet />
      </main>
    </div>
  )
}
