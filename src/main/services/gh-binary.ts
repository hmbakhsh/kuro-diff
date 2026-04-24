import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'
import { gitEnv } from './git-binary.js'

interface ResolvedBinary {
  readonly path: string
  readonly env: NodeJS.ProcessEnv
}

let cached: ResolvedBinary | null = null

const FALLBACK_PATHS = [
  '/opt/homebrew/bin',
  '/usr/local/bin',
  '/usr/bin',
  '/bin',
]

/**
 * Resolve the `gh` binary on demand. Unlike git, gh is optional — callers
 * decide whether a missing binary is fatal. Reuses the shell-env-augmented
 * PATH already established by `initGitBinary()` (via `gitEnv()`), so this is
 * a pure lookup on disk.
 */
export function resolveGhBinary(): ResolvedBinary {
  if (cached) return cached

  const base: NodeJS.ProcessEnv = { ...gitEnv() }
  const path = base.PATH ?? ''
  const augmented =
    path.length > 0
      ? `${path}${delimiter}${FALLBACK_PATHS.join(delimiter)}`
      : FALLBACK_PATHS.join(delimiter)

  const ghPath = findOnPath(augmented, 'gh')
  if (!ghPath) throw new GhBinaryNotFoundError()

  cached = {
    path: ghPath,
    env: {
      ...base,
      PATH: augmented,
      // gh emits ANSI colour codes by default; strip so stdout stays
      // parseable. GH_PROMPT_DISABLED short-circuits any interactive prompt
      // (auth login, confirm-merge) so spawn() can never hang on a TTY.
      NO_COLOR: '1',
      GH_PROMPT_DISABLED: '1',
      CLICOLOR: '0',
    },
  }
  return cached
}

export function hasGhBinary(): boolean {
  try {
    resolveGhBinary()
    return true
  } catch {
    return false
  }
}

export function ghEnv(): NodeJS.ProcessEnv {
  return resolveGhBinary().env
}

export class GhBinaryNotFoundError extends Error {
  readonly code = 'GH_BINARY_NOT_FOUND'
  constructor() {
    super('gh binary not found on PATH')
    this.name = 'GhBinaryNotFoundError'
  }
}

function findOnPath(path: string, name: string): string | null {
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, name)
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // keep looking
    }
  }
  return null
}
