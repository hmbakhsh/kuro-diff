import {
  preloadHighlighter,
  getSharedHighlighter,
} from '@pierre/diffs'

// Hard rule (plan §risk table + §A.6): Pierre owns the Shiki highlighter
// singleton. Never call `createHighlighter` / `createHighlighterCore` from our
// own code — doing so would create a second 500KB+ instance with inconsistent
// theming.
//
// `preloadHighlighter` at boot warms the grammars/themes we expect to hit
// most; subsequent `getSharedHighlighter` calls are idempotent and may request
// additional langs — they attach to the same instance.

const BASE_LANGS = [
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'md',
  'css',
  'html',
  'yaml',
  'toml',
  'shell',
  'py',
  'rb',
  'go',
  'rust',
  'java',
  'c',
  'cpp',
  'swift',
  'kotlin',
  'sql',
  'docker',
] as const

const BASE_THEMES = [
  'github-dark',
  'github-light',
  'pierre-dark',
  'pierre-light',
] as const

let primed: Promise<void> | null = null

export function primeHighlighter(): Promise<void> {
  primed ??= preloadHighlighter({
    themes: [...BASE_THEMES],
    langs: [...BASE_LANGS],
  }).catch((err: unknown) => {
    console.error('[highlighter] preload failed:', err)
    // Don't propagate — the File component re-invokes getSharedHighlighter
    // on demand and can still succeed lazily.
  })
  return primed
}

export async function ensureLangLoaded(lang: string): Promise<void> {
  await getSharedHighlighter({
    themes: [...BASE_THEMES],
    langs: [...BASE_LANGS, lang],
  })
}

export { BASE_THEMES, BASE_LANGS }
