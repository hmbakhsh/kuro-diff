import type { WorkspaceRepo } from '@shared/types'

// electron-store v11 is ESM-only; our main is CJS, so we dynamic-import it
// once at first use. The store itself is a thin sync API once the module is
// loaded.
type StoreSchema = {
  repos: WorkspaceRepo[]
  githubAccounts: Record<
    string,
    { token: string; refreshToken?: string; expiresAt?: number; host: string }
  >
  preferences: {
    theme: 'light' | 'dark' | 'system'
    diffMode: 'unified' | 'split'
    font: string
    copyPreset: 'markdown-fence' | 'claude-xml'
    showIgnoredFiles: boolean
    /** Per-worktree compare base. Key: `${repoId}:${worktreeId}`. */
    compareBases: Record<string, string>
  }
  window: {
    bounds?: { x?: number; y?: number; width: number; height: number }
    maximized?: boolean
    sidebarWidth?: number
    diffSplitRatio?: number
  }
  gitBinaryPath?: string
}

const DEFAULTS: StoreSchema = {
  repos: [],
  githubAccounts: {},
  preferences: {
    theme: 'system',
    diffMode: 'unified',
    font: 'JetBrains Mono',
    copyPreset: 'markdown-fence',
    showIgnoredFiles: false,
    compareBases: {},
  },
  window: {
    sidebarWidth: 240,
    diffSplitRatio: 0.5,
  },
}

// electron-store's generic type is loose on exports — we keep the instance
// typed as an `unknown` shape internally and expose a narrow accessor surface.
type StoreInstance = {
  get<K extends keyof StoreSchema>(key: K): StoreSchema[K]
  set<K extends keyof StoreSchema>(key: K, value: StoreSchema[K]): void
  delete(key: keyof StoreSchema): void
  readonly path: string
}

let instance: StoreInstance | null = null

async function load(): Promise<StoreInstance> {
  if (instance) return instance
  const mod = await import('electron-store')
  // v11 default export is the class.
  const Ctor: new (opts?: unknown) => StoreInstance =
    (mod as unknown as { default: new (opts?: unknown) => StoreInstance }).default
  instance = new Ctor({
    name: 'config',
    defaults: DEFAULTS,
    clearInvalidConfig: false,
    // Migrations map — keep this even when empty so future shape changes
    // don't require a backfill.
    migrations: {},
  })
  return instance
}

export async function getRepos(): Promise<WorkspaceRepo[]> {
  return (await load()).get('repos') ?? []
}

export async function setRepos(repos: WorkspaceRepo[]): Promise<void> {
  ;(await load()).set('repos', repos)
}

export async function upsertRepo(repo: WorkspaceRepo): Promise<void> {
  const repos = await getRepos()
  const next = repos.filter((r) => r.id !== repo.id)
  next.push(repo)
  await setRepos(next)
}

export async function removeRepoById(id: string): Promise<void> {
  const repos = await getRepos()
  await setRepos(repos.filter((r) => r.id !== id))
}

export async function getPreferences(): Promise<StoreSchema['preferences']> {
  return (await load()).get('preferences')
}

export async function setPreferences(
  patch: Partial<StoreSchema['preferences']>,
): Promise<StoreSchema['preferences']> {
  const store = await load()
  const current = { ...DEFAULTS.preferences, ...store.get('preferences') }
  const next = { ...current, ...patch }
  store.set('preferences', next)
  return next
}

export async function setCompareBase(
  key: string,
  base: string,
): Promise<StoreSchema['preferences']> {
  const store = await load()
  const current = { ...DEFAULTS.preferences, ...store.get('preferences') }
  const compareBases = { ...(current.compareBases ?? {}), [key]: base }
  const next = { ...current, compareBases }
  store.set('preferences', next)
  return next
}

export async function getGitBinaryPath(): Promise<string | undefined> {
  return (await load()).get('gitBinaryPath')
}

export async function setGitBinaryPath(path: string): Promise<void> {
  ;(await load()).set('gitBinaryPath', path)
}

export async function getWindowState(): Promise<StoreSchema['window']> {
  return (await load()).get('window') ?? {}
}

export async function setWindowState(
  patch: Partial<StoreSchema['window']>,
): Promise<void> {
  const store = await load()
  const current = store.get('window') ?? {}
  store.set('window', { ...current, ...patch })
}

export async function storePath(): Promise<string> {
  return (await load()).path
}
