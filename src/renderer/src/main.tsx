import ReactDOM from 'react-dom/client'
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient } from '@tanstack/react-query'
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client'
import { createSyncStoragePersister } from '@tanstack/query-sync-storage-persister'
import { httpLink } from '@trpc/client'
import { ipcLink } from 'trpc-electron/renderer'
import { WorkerPoolContextProvider } from '@pierre/diffs/react'
import { Toaster } from 'sonner'
import { trpc } from './trpc'
import { routeTree } from './routeTree.gen'
import { primeHighlighter } from './lib/highlighter'
import { workerPoolConfig } from './lib/worker-pool'
import { ThemeRoot } from './components/layout/ThemeSync'
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

// Long `gcTime` keeps results in memory across route transitions — the app
// shell switches views constantly and a short gc would throw PRs away only
// to re-fetch them when the user tabs back. `staleTime` controls when to
// background-revalidate; per-query overrides tune this (e.g. PR diffs have
// 10-minute staleTime since PR content rarely changes mid-session).
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      // 24 hours in memory — combined with the persister below this means
      // the cache survives background re-fetches AND app restarts. React
      // Query only evicts from memory when `gcTime` elapses with no active
      // observers; we still revalidate when stale.
      gcTime: 24 * 60 * 60 * 1000,
      retry: 2,
      refetchOnWindowFocus: false,
      // No automatic refetch on reconnect — network flaps on laptops would
      // otherwise hammer the GitHub API.
      refetchOnReconnect: false,
    },
  },
})

// Persist the query cache to the renderer's localStorage so closing and
// reopening the app doesn't wipe every PR list and file read. LocalStorage
// is the cheapest persister that works in a sandboxed renderer; for data
// over ~5 MB migrate to IndexedDB. `buster` bumps invalidate old caches
// when we change the query shape.
const persister = createSyncStoragePersister({
  storage: window.localStorage,
  key: 'kuro-diff-query-cache-v1',
  throttleTime: 2_000,
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
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister,
        // 14 days — long enough that infrequently-opened repos retain their
        // last-seen PR list, short enough that stale caches self-heal.
        maxAge: 14 * 24 * 60 * 60 * 1000,
        // Persist successful queries that haven't opted out via
        // `meta.persist === false`. File reads carry that opt-out because
        // their bodies can be large and localStorage caps at ~5 MB.
        dehydrateOptions: {
          shouldDehydrateQuery: (query) => {
            if (query.state.status !== 'success') return false
            if ((query.meta as { persist?: boolean } | undefined)?.persist === false) {
              return false
            }
            return true
          },
        },
      }}
    >
      <WorkerPoolContextProvider
        poolOptions={workerPoolConfig.poolOptions}
        highlighterOptions={workerPoolConfig.highlighterOptions}
      >
        <ThemeRoot>
          <RouterProvider router={router} />
          <Toaster position="bottom-right" richColors closeButton />
        </ThemeRoot>
      </WorkerPoolContextProvider>
    </PersistQueryClientProvider>
  </trpc.Provider>,
)

