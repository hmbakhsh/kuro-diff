import hostedGitInfo from 'hosted-git-info'
import { runGit } from './git-service.js'

export interface GitHubRepoMapping {
  readonly owner: string
  readonly repo: string
  /** Host from the URL — `github.com` or a GHE host. */
  readonly host: string
  /** Which remote the mapping was derived from. */
  readonly remote: string
}

/**
 * Inspect a repo's remotes and return the best GitHub mapping, or null if
 * none of the configured remotes point at a GitHub host. Preference order:
 * `origin` → `upstream` → first remote whose host is `github.com`.
 *
 * We use `hosted-git-info@7` rather than a hand-rolled regex so the full set
 * of URL shapes is handled: `https://github.com/o/r[.git][/]`,
 * `git@github.com:o/r.git`, `ssh://git@github.com/o/r.git`, `git://…`, plus
 * cgit and arbitrary trailing suffixes. It also detects GHE hosts.
 */
export async function mapRepoToGitHub(
  cwd: string,
): Promise<GitHubRepoMapping | null> {
  let raw: string
  try {
    raw = await runGit(['remote', '-v'], { cwd })
  } catch {
    return null
  }

  const remotes = parseRemotes(raw)
  if (remotes.length === 0) return null

  const preferredOrder = ['origin', 'upstream']
  const byName = new Map<string, string>()
  for (const { name, url } of remotes) {
    if (!byName.has(name)) byName.set(name, url)
  }

  const tryRemote = (name: string): GitHubRepoMapping | null => {
    const url = byName.get(name)
    if (!url) return null
    const info = hostedGitInfo.fromUrl(url)
    if (!info || info.type !== 'github') return null
    const domain = info.domain ?? 'github.com'
    return {
      owner: info.user ?? '',
      repo: info.project ?? '',
      host: domain,
      remote: name,
    }
  }

  for (const name of preferredOrder) {
    const mapped = tryRemote(name)
    if (mapped && mapped.owner && mapped.repo) return mapped
  }

  // Fallback: any remote whose URL parses as a GitHub host.
  for (const name of byName.keys()) {
    if (preferredOrder.includes(name)) continue
    const mapped = tryRemote(name)
    if (mapped && mapped.owner && mapped.repo && mapped.host === 'github.com') {
      return mapped
    }
  }

  return null
}

function parseRemotes(raw: string): Array<{ name: string; url: string }> {
  // `git remote -v` emits:
  //   origin\tgit@github.com:o/r.git (fetch)
  //   origin\tgit@github.com:o/r.git (push)
  // Split on whitespace, drop the trailing (fetch|push) column.
  const out: Array<{ name: string; url: string }> = []
  for (const line of raw.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) continue
    const match = trimmed.match(/^(\S+)\s+(\S+)\s+\((?:fetch|push)\)$/)
    if (!match) continue
    out.push({ name: match[1]!, url: match[2]! })
  }
  return out
}
