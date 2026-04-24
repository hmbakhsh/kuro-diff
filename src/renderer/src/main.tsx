import ReactDOM from 'react-dom/client'
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpLink } from '@trpc/client'
import { ipcLink } from 'trpc-electron/renderer'
import { WorkerPoolContextProvider } from '@pierre/diffs/react'
import { trpc } from './trpc'
import { routeTree } from './routeTree.gen'
import { primeHighlighter } from './lib/highlighter'
import { workerPoolConfig } from './lib/worker-pool'
import './styles/globals.css'

// Warm Pierre's Shiki singleton. Fire-and-forget — the File component will
// await it internally on first render.
void primeHighlighter()

// Hash history is mandatory for `file://` in packaged builds.
const hashHistory = createHashHistory()
const router = createRouter({
  routeTree,
  history: hashHistory,
  defaultPreload: 'intent',
})

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 5 * 60_000,
      retry: 2,
      refetchOnWindowFocus: false,
    },
  },
})

// tRPC client talks through the preload-exposed IPC bridge. httpLink is unused
// in production; ipcLink is the one that carries requests in Electron.
const trpcClient = trpc.createClient({
  links: [ipcLink()],
})

void httpLink // silence unused-import lint; kept for a future web surface

const rootEl = document.getElementById('root')
if (!rootEl) throw new Error('#root not found')

// StrictMode is intentionally omitted. Pierre's `@pierre/file-tree` bundles
// Preact 11 beta whose render-into-shadow-DOM flow doesn't survive
// StrictMode's double-mount cleanly (tree ends up empty on second mount).
// We accept the loss of dev-only warnings rather than patch around a
// beta-dependency's lifecycle.
ReactDOM.createRoot(rootEl).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <WorkerPoolContextProvider
        poolOptions={workerPoolConfig.poolOptions}
        highlighterOptions={workerPoolConfig.highlighterOptions}
      >
        <RouterProvider router={router} />
      </WorkerPoolContextProvider>
    </QueryClientProvider>
  </trpc.Provider>,
)
