import { accessSync, constants } from 'node:fs'
import { delimiter, join } from 'node:path'

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
 * One-time startup initializer. Resolves the real login-shell env + git path.
 * GUI-launched macOS apps don't inherit the shell's PATH, so this fixes the
 * spawn('git') ENOENT footgun (electron/electron#5626).
 *
 * Must be called during app.whenReady. Subsequent calls to `gitEnv()` /
 * `resolveGitBinary()` read the cached result synchronously.
 */
export async function initGitBinary(): Promise<void> {
  if (cached) return

  const inherited: NodeJS.ProcessEnv = { ...process.env }

  try {
    // shell-env v4 is ESM-only; dynamic import keeps the CJS main compatible.
    const { shellEnvSync } = (await import('shell-env')) as typeof import('shell-env')
    const shell = shellEnvSync()
    if (shell && typeof shell.PATH === 'string' && shell.PATH.length > 0) {
      inherited.PATH = shell.PATH
    }
    for (const key of Object.keys(shell ?? {})) {
      if (key === 'PATH') continue
      if (key.startsWith('GIT_') || key === 'SSH_AUTH_SOCK') {
        inherited[key] = shell[key]
      }
    }
  } catch {
    // Fall through to the hardcoded fallback path below.
  }

  const existingPath = inherited.PATH ?? ''
  const augmented =
    existingPath.length > 0
      ? `${existingPath}${delimiter}${FALLBACK_PATHS.join(delimiter)}`
      : FALLBACK_PATHS.join(delimiter)
  inherited.PATH = augmented

  const gitPath = findGitOnPath(augmented)
  if (!gitPath) {
    throw new GitBinaryNotFoundError()
  }

  cached = { path: gitPath, env: inherited }
}

export function resolveGitBinary(): ResolvedBinary {
  if (!cached) {
    throw new Error('git binary not initialized — call initGitBinary() first')
  }
  return cached
}

export class GitBinaryNotFoundError extends Error {
  readonly code = 'GIT_BINARY_NOT_FOUND'
  constructor() {
    super('git binary not found on PATH')
    this.name = 'GitBinaryNotFoundError'
  }
}

function findGitOnPath(path: string): string | null {
  for (const dir of path.split(delimiter)) {
    if (!dir) continue
    const candidate = join(dir, 'git')
    try {
      accessSync(candidate, constants.X_OK)
      return candidate
    } catch {
      // keep looking
    }
  }
  return null
}

/**
 * Env that should be merged into every git spawn call.
 * Also adds GIT_OPTIONAL_LOCKS=0 to prevent transient lockfile races with
 * other tools that may run on the same repo (editors, watchers).
 */
export function gitEnv(): NodeJS.ProcessEnv {
  return {
    ...resolveGitBinary().env,
    GIT_OPTIONAL_LOCKS: '0',
    GIT_TERMINAL_PROMPT: '0',
  }
}
