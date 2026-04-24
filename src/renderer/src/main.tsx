import React from 'react'
import ReactDOM from 'react-dom/client'
import { createHashHistory, createRouter, RouterProvider } from '@tanstack/react-router'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { httpLink } from '@trpc/client'
import { ipcLink } from 'trpc-electron/renderer'
import { trpc } from './trpc'
import { routeTree } from './routeTree.gen'
import './styles/globals.css'

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

ReactDOM.createRoot(rootEl).render(
  <React.StrictMode>
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>
    </trpc.Provider>
  </React.StrictMode>,
)
