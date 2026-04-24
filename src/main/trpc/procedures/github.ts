import { z } from 'zod'
import { shell } from 'electron'
import { publicProcedure, router } from '../trpc.js'
import { hasGhBinary } from '../../services/gh-binary.js'
import { runGh, runGhJson, GhError } from '../../services/gh-service.js'
import { resolveRepo } from '../../services/workspace-lookup.js'
import { mapRepoToGitHub } from '../../services/github-mapping.js'
import { getRepos, setRepos } from '../../services/workspace-store.js'

const repoIdInput = z.object({ repoId: z.string().uuid() })

const prListInput = z.object({
  repoId: z.string().uuid(),
  state: z.enum(['open', 'closed', 'merged', 'all']).default('open'),
  search: z.string().max(200).optional(),
  author: z.string().max(64).optional(),
  label: z.string().max(64).optional(),
  limit: z.number().int().min(1).max(500).default(100),
})

const prNumberInput = z.object({
  repoId: z.string().uuid(),
  number: z.number().int().positive(),
})

const ALLOWED_EXTERNAL_HOSTS = new Set([
  'github.com',
  'cli.github.com',
  'docs.github.com',
])

// Shape returned by `gh pr list … --json number,title,…`.
export interface GhPRSummary {
  readonly number: number
  readonly title: string
  readonly state: 'OPEN' | 'CLOSED' | 'MERGED'
  readonly isDraft: boolean
  readonly author: { login: string } | null
  readonly labels: Array<{ name: string; color?: string }>
  readonly createdAt: string
  readonly updatedAt: string
  readonly headRefName: string
  readonly baseRefName: string
  readonly url: string
}

export interface GhPRDetail extends GhPRSummary {
  readonly body: string
  readonly mergeable: string | null
  readonly additions: number
  readonly deletions: number
  readonly headRefOid: string
}

export interface GhAuthStatus {
  readonly installed: boolean
  readonly authenticated: boolean
  readonly login: string | null
  readonly host: string
  readonly error: string | null
}

export interface GhRateLimit {
  readonly limit: number
  readonly used: number
  readonly remaining: number
  readonly resetAt: number
}

/**
 * Turn a `GhError` into a plain object the renderer can read. tRPC v11 strips
 * error fields other than message/code/data by default, so we embed everything
 * we care about in `data`.
 */
function projectGhError(err: GhError): { kind: string; stderr: string; message: string } {
  return { kind: err.kind, stderr: err.stderr, message: err.message }
}

async function ensureGitHubRepo(
  repoId: string,
): Promise<{ owner: string; repo: string; host: string }> {
  const repo = await resolveRepo(repoId)
  if (repo.github) return repo.github

  // Backfill for repos added before Phase 5 landed (github always null).
  const mapped = await mapRepoToGitHub(repo.path).catch(() => null)
  if (!mapped) {
    throw new Error(`Repo has no GitHub remote: ${repo.name}`)
  }

  const repos = await getRepos()
  const next = repos.map((r) =>
    r.id === repoId
      ? { ...r, github: { owner: mapped.owner, repo: mapped.repo, host: mapped.host } }
      : r,
  )
  await setRepos(next)
  return { owner: mapped.owner, repo: mapped.repo, host: mapped.host }
}

function nwo(info: { owner: string; repo: string }): string {
  return `${info.owner}/${info.repo}`
}

export const githubRouter = router({
  authStatus: publicProcedure.query(async (): Promise<GhAuthStatus> => {
    if (!hasGhBinary()) {
      return {
        installed: false,
        authenticated: false,
        login: null,
        host: 'github.com',
        error: 'gh CLI not installed',
      }
    }
    try {
      // `gh auth status` exits 0 when logged in, non-zero otherwise. We parse
      // the plain-text output — `--json` lands in gh ≥ 2.65 but we want to
      // work with older installs too.
      const { stdout } = await runGh(['auth', 'status', '--hostname', 'github.com'])
      const loginMatch = stdout.match(/account\s+(\S+)|Logged in to github\.com (?:account )?(\S+)/i)
      const login = loginMatch ? (loginMatch[1] ?? loginMatch[2] ?? null) : null
      return {
        installed: true,
        authenticated: true,
        login,
        host: 'github.com',
        error: null,
      }
    } catch (err) {
      if (err instanceof GhError) {
        return {
          installed: err.kind !== 'binary-missing',
          authenticated: false,
          login: null,
          host: 'github.com',
          error: err.kind === 'unauthenticated' ? 'Not signed in' : err.message,
        }
      }
      throw err
    }
  }),

  rateLimit: publicProcedure.query(async (): Promise<GhRateLimit | null> => {
    if (!hasGhBinary()) return null
    try {
      const core = await runGhJson<{
        limit: number
        used: number
        remaining: number
        reset: number
      } | null>(['api', 'rate_limit', '--jq', '.resources.core'])
      if (!core) return null
      return {
        limit: core.limit,
        used: core.used,
        remaining: core.remaining,
        resetAt: core.reset * 1000,
      }
    } catch (err) {
      // Surface rate-limit + auth errors by throwing — everything else is
      // swallowed: the pill just goes missing when we can't poll.
      if (err instanceof GhError) {
        if (err.kind === 'rate-limited' || err.kind === 'unauthenticated') {
          throw Object.assign(new Error(err.message), { data: projectGhError(err) })
        }
        return null
      }
      throw err
    }
  }),

  ensureGitHub: publicProcedure
    .input(repoIdInput)
    .mutation(async ({ input }) => {
      return ensureGitHubRepo(input.repoId)
    }),

  prsList: publicProcedure
    .input(prListInput)
    .query(async ({ input }): Promise<GhPRSummary[]> => {
      const info = await ensureGitHubRepo(input.repoId)
      const args = [
        'pr',
        'list',
        '--repo',
        nwo(info),
        '--state',
        input.state,
        '--limit',
        String(input.limit),
        '--json',
        'number,title,author,labels,state,isDraft,createdAt,updatedAt,headRefName,baseRefName,url',
      ]
      if (input.search && input.search.trim().length > 0) {
        args.push('--search', input.search.trim())
      }
      if (input.author && input.author.trim().length > 0) {
        args.push('--author', input.author.trim())
      }
      if (input.label && input.label.trim().length > 0) {
        args.push('--label', input.label.trim())
      }
      try {
        const prs = await runGhJson<GhPRSummary[] | null>(args)
        return prs ?? []
      } catch (err) {
        throw wrapGhError(err)
      }
    }),

  prGet: publicProcedure
    .input(prNumberInput)
    .query(async ({ input }): Promise<GhPRDetail> => {
      const info = await ensureGitHubRepo(input.repoId)
      const args = [
        'pr',
        'view',
        String(input.number),
        '--repo',
        nwo(info),
        '--json',
        'number,title,body,author,state,isDraft,mergeable,additions,deletions,baseRefName,headRefName,headRefOid,labels,url,createdAt,updatedAt',
      ]
      try {
        const pr = await runGhJson<GhPRDetail | null>(args)
        if (!pr) throw new Error(`PR ${input.number} not found`)
        return pr
      } catch (err) {
        throw wrapGhError(err)
      }
    }),

  prDiff: publicProcedure
    .input(prNumberInput)
    .query(async ({ input }): Promise<{ patch: string }> => {
      const info = await ensureGitHubRepo(input.repoId)
      try {
        const { stdout } = await runGh(
          ['pr', 'diff', String(input.number), '--repo', nwo(info)],
          { maxBuffer: 128 * 1024 * 1024 },
        )
        return { patch: stdout }
      } catch (err) {
        throw wrapGhError(err)
      }
    }),

  openExternal: publicProcedure
    .input(z.object({ url: z.string().url() }))
    .mutation(async ({ input }) => {
      // Host allowlist prevents a compromised renderer from pointing
      // shell.openExternal at arbitrary URLs (file://, custom-protocol
      // handlers, phishing domains).
      let parsed: URL
      try {
        parsed = new URL(input.url)
      } catch {
        throw new Error(`Invalid URL: ${input.url}`)
      }
      if (parsed.protocol !== 'https:' || !ALLOWED_EXTERNAL_HOSTS.has(parsed.hostname)) {
        throw new Error(`URL host not on allowlist: ${parsed.hostname}`)
      }
      await shell.openExternal(parsed.toString())
      return { ok: true }
    }),
})

function wrapGhError(err: unknown): Error {
  if (err instanceof GhError) {
    const wrapped = new Error(err.message)
    Object.assign(wrapped, { data: projectGhError(err) })
    return wrapped
  }
  return err instanceof Error ? err : new Error(String(err))
}
