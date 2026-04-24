// Pierre's worker pool setup. We use the `worker-portable.js` entry rather
// than `worker.js` — portable has the shiki deps inlined, which avoids
// electron-vite having to resolve `shiki/core` / `shiki/engine/*` from inside
// a module worker (Phase 4 notes flag this as the first fallback).
//
// `new URL(…, import.meta.url)` is the Vite-native pattern for worker asset
// resolution; dev and build both rewrite the specifier to a hashed asset URL.

import { BASE_LANGS } from './highlighter'

export const workerPoolConfig = {
  poolOptions: {
    workerFactory: () =>
      new Worker(
        new URL('@pierre/diffs/worker/worker-portable.js', import.meta.url),
        { type: 'module' },
      ),
    poolSize: 4,
    totalASTLRUCacheSize: 2_000_000,
  },
  highlighterOptions: {
    theme: { dark: 'github-dark', light: 'github-light' } as const,
    langs: [...BASE_LANGS],
  },
}
