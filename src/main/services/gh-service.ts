import { spawn } from 'node:child_process'
import { ghEnv, resolveGhBinary, GhBinaryNotFoundError } from './gh-binary.js'

const DEFAULT_TIMEOUT_MS = 30_000

export type GhErrorKind =
  | 'binary-missing'
  | 'unauthenticated'
  | 'rate-limited'
  | 'not-found'
  | 'network'
  | 'timeout'
  | 'command'

export class GhError extends Error {
  readonly code = 'GH_ERROR'
  constructor(
    readonly kind: GhErrorKind,
    message: string,
    readonly stderr: string,
    readonly exitCode: number | null,
  ) {
    super(message)
    this.name = 'GhError'
  }
}

export interface GhSpawnOptions {
  readonly cwd?: string
  readonly timeoutMs?: number
  readonly maxBuffer?: number
  readonly signal?: AbortSignal
}

interface GhResult {
  readonly stdout: string
  readonly stderr: string
  readonly exitCode: number
}

/**
 * Low-level gh invocation — buffered stdout. For long streaming diffs prefer
 * `runGhStream`; anything under a few MB is fine here.
 */
export async function runGh(
  args: readonly string[],
  opts: GhSpawnOptions = {},
): Promise<GhResult> {
  const binary = (() => {
    try {
      return resolveGhBinary().path
    } catch (err) {
      if (err instanceof GhBinaryNotFoundError) {
        throw new GhError('binary-missing', 'gh CLI not installed', '', null)
      }
      throw err
    }
  })()

  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const maxBuffer = opts.maxBuffer ?? 64 * 1024 * 1024

  return new Promise<GhResult>((resolve, reject) => {
    const child = spawn(binary, [...args], {
      cwd: opts.cwd,
      env: ghEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const outChunks: Buffer[] = []
    const errChunks: Buffer[] = []
    let outSize = 0
    let timedOut = false

    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    const onAbort = (): void => {
      child.kill('SIGTERM')
    }
    if (opts.signal) {
      if (opts.signal.aborted) {
        child.kill('SIGTERM')
      } else {
        opts.signal.addEventListener('abort', onAbort, { once: true })
      }
    }

    child.stdout.on('data', (c: Buffer) => {
      outSize += c.length
      if (outSize > maxBuffer) {
        child.kill('SIGTERM')
        clearTimeout(timer)
        opts.signal?.removeEventListener('abort', onAbort)
        reject(
          new GhError(
            'command',
            `gh ${args[0] ?? ''} output exceeded ${maxBuffer} bytes`,
            '',
            null,
          ),
        )
        return
      }
      outChunks.push(c)
    })
    child.stderr.on('data', (c: Buffer) => errChunks.push(c))

    child.on('error', (err) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      reject(
        new GhError(
          'command',
          `gh ${args.join(' ')}: ${err.message}`,
          '',
          null,
        ),
      )
    })

    child.on('close', (exitCode) => {
      clearTimeout(timer)
      opts.signal?.removeEventListener('abort', onAbort)
      const stdout = Buffer.concat(outChunks).toString('utf8')
      const stderr = Buffer.concat(errChunks).toString('utf8')
      if (timedOut) {
        reject(
          new GhError(
            'timeout',
            `gh ${args.join(' ')} timed out after ${timeoutMs}ms`,
            stderr,
            null,
          ),
        )
        return
      }
      if (exitCode === 0) {
        resolve({ stdout, stderr, exitCode: 0 })
        return
      }
      reject(classifyFailure(args, stderr, exitCode ?? -1))
    })
  })
}

/**
 * JSON-flavoured gh invocation. Callers pass args that include `--json …` and
 * we parse the resulting stdout. Returns `null` when stdout is empty (gh
 * sometimes emits nothing for empty collections when `--jq` is used).
 */
export async function runGhJson<T = unknown>(
  args: readonly string[],
  opts: GhSpawnOptions = {},
): Promise<T> {
  const { stdout } = await runGh(args, opts)
  const trimmed = stdout.trim()
  if (!trimmed) return null as T
  try {
    return JSON.parse(trimmed) as T
  } catch (err) {
    throw new GhError(
      'command',
      `gh ${args.join(' ')}: invalid JSON (${err instanceof Error ? err.message : 'unknown'})`,
      trimmed.slice(0, 512),
      0,
    )
  }
}

/**
 * Map gh's stderr + exit code to one of our typed kinds. gh documents:
 *   exit 0 — success
 *   exit 1 — generic failure
 *   exit 2 — command error (bad flags)
 *   exit 4 — authentication required
 *   (rate limits surface as exit 1 with HTTP 403 / X-RateLimit-Remaining: 0
 *   in stderr; match by message rather than code).
 * Strings are matched case-insensitively against stderr.
 */
function classifyFailure(
  args: readonly string[],
  stderr: string,
  exitCode: number,
): GhError {
  const msg = stderr.toLowerCase()
  const head = `gh ${args[0] ?? ''}`

  if (exitCode === 4 || /not logged|authentication required|gh auth login/.test(msg)) {
    return new GhError('unauthenticated', 'Not signed in to GitHub CLI', stderr, exitCode)
  }
  if (/rate limit|api rate limit exceeded|secondary rate limit/.test(msg)) {
    return new GhError('rate-limited', 'GitHub API rate limit exceeded', stderr, exitCode)
  }
  if (
    /could not resolve host|dial tcp|network is unreachable|connection refused|getaddrinfo|connect etimedout/.test(
      msg,
    )
  ) {
    return new GhError('network', `${head}: network error`, stderr, exitCode)
  }
  if (/could not resolve to a repository|http 404|not found/.test(msg)) {
    return new GhError('not-found', `${head}: not found`, stderr, exitCode)
  }
  return new GhError(
    'command',
    `${head} exited ${exitCode}`,
    stderr.slice(0, 2048),
    exitCode,
  )
}
