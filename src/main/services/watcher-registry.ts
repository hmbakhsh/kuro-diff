import { WatcherRegistry } from './fs-watcher.js'

// Singleton owned by the main process. Procedures reach for this directly
// rather than threading it through tRPC context because it has no per-call
// state and registering is rare.
export const watcherRegistry = new WatcherRegistry()
