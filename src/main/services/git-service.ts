import { spawn } from 'node:child_process'
import { simpleGit, type SimpleGit } from 'simple-git'
import { gitEnv, resolveGitBinary } from './git-binary.js'

const DEFAULT_TIMEOUT_MS = 30_000

export class GitCommandError extends Error {
  readonly code = 'GIT_COMMAND_FAILED'
  constructor(
    message: string,
    readonly stderr: string,
    readonly exitCode: number,
  ) {
    super(message)
    this.name = 'GitCommandError'
  }
}

export function createGit(cwd: string): SimpleGit {
  const { path: binary } = resolveGitBinary()
  return simpleGit(cwd, {
    binary,
    maxConcurrentProcesses: 4,
    trimmed: true,
  }).env(gitEnv())
}

export interface SpawnGitOptions {
  readonly cwd: string
  readonly timeoutMs?: number
  readonly maxBuffer?: number
  readonly input?: string
}

/**
 * Run git with raw spawn + buffered stdout. Use for commands where simple-git
 * lacks a parser (custom porcelain, large streaming diffs via streamGit).
 */
export function runGit(
  args: readonly string[],
  { cwd, timeoutMs = DEFAULT_TIMEOUT_MS, maxBuffer = 64 * 1024 * 1024, input }: SpawnGitOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { path: binary } = resolveGitBinary()
    const child = spawn(binary, [...args], {
      cwd,
      env: gitEnv(),
      stdio: ['pipe', 'pipe', 'pipe'],
    })

    const chunks: Buffer[] = []
    const errChunks: Buffer[] = []
    let size = 0
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.on('data', (c: Buffer) => {
      size += c.length
      if (size > maxBuffer) {
        child.kill('SIGTERM')
        reject(new GitCommandError(`git ${args[0]} output exceeded ${maxBuffer} bytes`, '', -1))
        return
      }
      chunks.push(c)
    })
    child.stderr.on('data', (c: Buffer) => errChunks.push(c))

    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      const stderr = Buffer.concat(errChunks).toString('utf8')
      if (timedOut) {
        reject(new GitCommandError(`git ${args[0]} timed out after ${timeoutMs}ms`, stderr, -1))
        return
      }
      if (exitCode !== 0) {
        reject(new GitCommandError(`git ${args.join(' ')} exited ${exitCode}`, stderr, exitCode ?? -1))
        return
      }
      resolve(Buffer.concat(chunks).toString('utf8'))
    })

    if (input !== undefined) {
      child.stdin.write(input)
      child.stdin.end()
    }
  })
}

/**
 * Spawn git with a streaming stdout callback. For diffs that can run into
 * hundreds of MB — don't buffer.
 */
export function streamGit(
  args: readonly string[],
  opts: SpawnGitOptions,
  onChunk: (chunk: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { path: binary } = resolveGitBinary()
    const child = spawn(binary, [...args], {
      cwd: opts.cwd,
      env: gitEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    const errChunks: Buffer[] = []
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      child.kill('SIGTERM')
    }, timeoutMs)

    child.stdout.setEncoding('utf8')
    child.stdout.on('data', (s: string) => onChunk(s))
    child.stderr.on('data', (c: Buffer) => errChunks.push(c))
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (exitCode) => {
      clearTimeout(timer)
      const stderr = Buffer.concat(errChunks).toString('utf8')
      if (timedOut) {
        reject(new GitCommandError(`git ${args[0]} timed out after ${timeoutMs}ms`, stderr, -1))
        return
      }
      if (exitCode !== 0) {
        reject(new GitCommandError(`git ${args.join(' ')} exited ${exitCode}`, stderr, exitCode ?? -1))
        return
      }
      resolve()
    })
  })
}
