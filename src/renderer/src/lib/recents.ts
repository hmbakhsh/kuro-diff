/**
 * Per-repo recents for the command palette. Stored in localStorage — small,
 * sandbox-safe, and the query-cache persister already uses it. Mozilla's
 * frecency formula is `hits * log(now - lastAt)` inverted; we compute
 * score = hits / sqrt(ageHours + 1) so recency dominates when two items
 * share a hit count.
 */
const KEY = 'kuro-diff-recents-v1'
const TTL_MS = 30 * 24 * 60 * 60 * 1000

interface RecentEntry {
  readonly hits: number
  readonly lastAt: number
}

type RecentsMap = Record<string, Record<string, RecentEntry>>

function load(): RecentsMap {
  try {
    const raw = window.localStorage.getItem(KEY)
    if (!raw) return {}
    return JSON.parse(raw) as RecentsMap
  } catch {
    return {}
  }
}

function save(map: RecentsMap): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    // localStorage quota / JSON failures are non-fatal — recents are a
    // nice-to-have, not a correctness requirement.
  }
}

function pruneScope(scope: Record<string, RecentEntry>): Record<string, RecentEntry> {
  const cutoff = Date.now() - TTL_MS
  const out: Record<string, RecentEntry> = {}
  for (const [key, entry] of Object.entries(scope)) {
    if (entry.lastAt >= cutoff) out[key] = entry
  }
  return out
}

export function bumpRecent(scopeKey: string, item: string): void {
  const map = load()
  const scope = pruneScope(map[scopeKey] ?? {})
  const existing = scope[item]
  scope[item] = {
    hits: (existing?.hits ?? 0) + 1,
    lastAt: Date.now(),
  }
  map[scopeKey] = scope
  save(map)
}

export function listRecents(scopeKey: string): string[] {
  const map = load()
  const scope = pruneScope(map[scopeKey] ?? {})
  const now = Date.now()
  return Object.entries(scope)
    .map(([key, entry]) => {
      const ageHours = Math.max(0, (now - entry.lastAt) / (60 * 60 * 1000))
      const score = entry.hits / Math.sqrt(ageHours + 1)
      return { key, score }
    })
    .sort((a, b) => b.score - a.score)
    .map((e) => e.key)
}
