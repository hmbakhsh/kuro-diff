import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { TanStackRouterVite } from '@tanstack/router-plugin/vite'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    // Sandboxed preloads can't resolve from node_modules at runtime, so
    // bundle everything except `electron` itself into the preload output.
    build: {
      rollupOptions: {
        external: ['electron'],
      },
    },
  },
  renderer: {
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer/src'),
        '@shared': resolve('src/shared'),
      },
    },
    // Pierre's diff worker is a `type: 'module'` worker loaded via
    // `new URL(…, import.meta.url)`. Vite defaults worker.format to 'iife',
    // which is incompatible with code-splitting (shiki imports chunk out of
    // the portable worker). ES modules are the correct format for module
    // workers and keep the CSP `worker-src 'self'` working.
    worker: {
      format: 'es',
    },
    plugins: [
      TanStackRouterVite({
        target: 'react',
        autoCodeSplitting: true,
        // Paths are resolved relative to the renderer's vite root (src/renderer).
        routesDirectory: 'src/routes',
        generatedRouteTree: 'src/routeTree.gen.ts',
      }),
      react(),
      tailwindcss(),
    ],
    build: {
      rollupOptions: {
        input: resolve('src/renderer/index.html'),
      },
    },
  },
})
