import { join } from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'

/**
 * Watch the ref-metadata corners of a repo's `.git/` for cheap "something
 * changed" signals (branch switch, commit, fetch, merge/rebase). Never watch
 * `.git/objects/` or `.git/lfs/` — both flood with events.
 *
 * Emits a per-repo debounced "changed" event.
 */
export interface RepoWatcherHandle {
  close(): Promise<void>
}

export function watchRepo(
  repoPath: string,
  onChanged: () => void,
  { debounceMs = 150 }: { debounceMs?: number } = {},
): RepoWatcherHandle {
  const git = join(repoPath, '.git')
  const paths = [
    join(git, 'HEAD'),
    join(git, 'packed-refs'),
    join(git, 'refs'),
    join(git, 'FETCH_HEAD'),
    join(git, 'ORIG_HEAD'),
    join(git, 'MERGE_HEAD'),
    join(git, 'index'),
  ]

  const watcher: FSWatcher = chokidar.watch(paths, {
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 150, pollInterval: 50 },
    followSymlinks: false,
    // FSEvents is the default on macOS in chokidar v4+.
  })

  let timer: NodeJS.Timeout | null = null
  const schedule = (): void => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      onChanged()
    }, debounceMs)
  }

  watcher.on('all', schedule)
  watcher.on('error', (err) => {
    console.error(`[fs-watcher] ${repoPath}`, err)
  })

  return {
    async close() {
      if (timer) clearTimeout(timer)
      await watcher.close()
    },
  }
}

/**
 * Multi-repo watcher registry. Main owns one instance; procedures register
 * repos into it as they are added/removed.
 */
export class WatcherRegistry {
  #watchers = new Map<string, RepoWatcherHandle>()

  register(repoId: string, repoPath: string, onChanged: () => void): void {
    this.unregister(repoId)
    const handle = watchRepo(repoPath, onChanged)
    this.#watchers.set(repoId, handle)
  }

  unregister(repoId: string): void {
    const existing = this.#watchers.get(repoId)
    if (!existing) return
    void existing.close()
    this.#watchers.delete(repoId)
  }

  async closeAll(): Promise<void> {
    const all = [...this.#watchers.values()]
    this.#watchers.clear()
    await Promise.all(all.map((h) => h.close()))
  }
}
