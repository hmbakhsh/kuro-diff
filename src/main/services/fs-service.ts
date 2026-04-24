import { readFile as readFileAsync, stat } from 'node:fs/promises'
import { extname, join, relative, resolve, sep } from 'node:path'
import { runGit } from './git-service.js'

export const TEXT_FILE_SIZE_LIMIT = 2 * 1024 * 1024 // 2MB — plan §7

const IMAGE_EXTS = new Set([
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.svg',
  '.ico',
  '.bmp',
])

const IMAGE_MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.bmp': 'image/bmp',
}

export type FileRead =
  | {
      kind: 'text'
      path: string
      size: number
      contents: string
      lang: string
    }
  | {
      kind: 'image'
      path: string
      size: number
      dataUri: string
    }
  | {
      kind: 'binary'
      path: string
      size: number
    }
  | {
      kind: 'too-large'
      path: string
      size: number
      limit: number
    }

/**
 * Reject traversal — an absolute `filePath` must land inside `repoPath`.
 * Uses `path.relative` and asserts the result doesn't escape via `..`.
 */
export function assertInsideRepo(repoPath: string, filePath: string): string {
  const repoAbs = resolve(repoPath)
  const fileAbs = resolve(filePath.startsWith(sep) ? filePath : join(repoAbs, filePath))
  const rel = relative(repoAbs, fileAbs)
  if (rel.startsWith('..') || rel === '') {
    throw new FsAccessError(`refusing to read outside repo: ${filePath}`)
  }
  return fileAbs
}

export async function readRepoFile(
  repoPath: string,
  relOrAbsPath: string,
  { force = false }: { force?: boolean } = {},
): Promise<FileRead> {
  const abs = assertInsideRepo(repoPath, relOrAbsPath)
  const s = await stat(abs)
  if (!s.isFile()) {
    throw new FsAccessError(`not a regular file: ${abs}`)
  }

  const ext = extname(abs).toLowerCase()
  const size = s.size

  if (IMAGE_EXTS.has(ext)) {
    // Refuse to inline gigantic images — 4MB cap for inline preview.
    if (size > 4 * 1024 * 1024) {
      return { kind: 'too-large', path: abs, size, limit: 4 * 1024 * 1024 }
    }
    const buf = await readFileAsync(abs)
    const mime = IMAGE_MIME[ext] ?? 'application/octet-stream'
    return {
      kind: 'image',
      path: abs,
      size,
      dataUri: `data:${mime};base64,${buf.toString('base64')}`,
    }
  }

  if (!force && size > TEXT_FILE_SIZE_LIMIT) {
    return { kind: 'too-large', path: abs, size, limit: TEXT_FILE_SIZE_LIMIT }
  }

  // Sniff the first 8KB for NUL bytes (same heuristic git uses in
  // `buffer_is_binary`). Matches our "binary file" UX contract.
  const peek = await readFileAsync(abs, { flag: 'r' })
  if (looksBinary(peek)) {
    return { kind: 'binary', path: abs, size }
  }

  return {
    kind: 'text',
    path: abs,
    size,
    contents: peek.toString('utf8'),
    lang: langFromExt(ext, abs),
  }
}

function looksBinary(buf: Buffer): boolean {
  const n = Math.min(buf.length, 8192)
  for (let i = 0; i < n; i++) {
    if (buf[i] === 0) return true
  }
  return false
}

const EXT_LANG: Record<string, string> = {
  '.ts': 'ts',
  '.tsx': 'tsx',
  '.js': 'js',
  '.jsx': 'jsx',
  '.mjs': 'js',
  '.cjs': 'js',
  '.json': 'json',
  '.md': 'md',
  '.mdx': 'md',
  '.css': 'css',
  '.scss': 'scss',
  '.html': 'html',
  '.htm': 'html',
  '.py': 'py',
  '.rb': 'rb',
  '.go': 'go',
  '.rs': 'rust',
  '.java': 'java',
  '.c': 'c',
  '.h': 'c',
  '.cpp': 'cpp',
  '.hpp': 'cpp',
  '.sh': 'shell',
  '.bash': 'shell',
  '.zsh': 'shell',
  '.yml': 'yaml',
  '.yaml': 'yaml',
  '.toml': 'toml',
  '.xml': 'xml',
  '.sql': 'sql',
  '.swift': 'swift',
  '.kt': 'kotlin',
  '.lua': 'lua',
  '.php': 'php',
  '.dockerfile': 'docker',
}

function langFromExt(ext: string, abs: string): string {
  const base = abs.split('/').pop() ?? ''
  if (base === 'Dockerfile') return 'docker'
  return EXT_LANG[ext] ?? 'text'
}

/**
 * Enumerate tracked + untracked files in the repo via git. We deliberately
 * reuse `git ls-files` (tracked) + `git ls-files --others --exclude-standard`
 * (untracked but honoring .gitignore) — it's what the viewer should see.
 *
 * Paths are returned as repo-relative with forward slashes (git's native form).
 */
export async function listRepoFiles(repoPath: string): Promise<string[]> {
  const [tracked, untracked] = await Promise.all([
    runGit(['ls-files', '-z'], { cwd: repoPath }),
    runGit(['ls-files', '--others', '--exclude-standard', '-z'], {
      cwd: repoPath,
    }),
  ])

  const split = (s: string): string[] =>
    s.split('\0').filter((x) => x.length > 0)

  const all = new Set<string>([...split(tracked), ...split(untracked)])
  return [...all].sort()
}

export class FsAccessError extends Error {
  readonly code = 'FS_ACCESS_DENIED'
  constructor(message: string) {
    super(message)
    this.name = 'FsAccessError'
  }
}
