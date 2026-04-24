import { useCallback, useSyncExternalStore } from "react";
import { z } from "zod";

const stateSchema = z.object({
  files: z.object({
    openPaths: z.array(z.string()),
    activePath: z.string().nullable(),
  }),
  commits: z.object({
    selectedSha: z.string().nullable(),
  }),
  diffs: z.object({
    scroll: z.record(z.string(), z.number()),
  }),
});

export type WorktreeUIState = z.infer<typeof stateSchema>;

const EMPTY: WorktreeUIState = {
  files: { openPaths: [], activePath: null },
  commits: { selectedSha: null },
  diffs: { scroll: {} },
};

function keyFor(repoId: string, worktreeId: string): string {
  return `kuro-diff:ui:${repoId}:${worktreeId}`;
}

// In-memory cache is the source of truth for the running renderer. We seed
// it from localStorage on first read per key; after that, writes update the
// cache synchronously and localStorage asynchronously (see scheduleFlush).
//
// Do NOT revalidate the cache against localStorage on every read: writes
// notify subscribers before the rAF-queued localStorage flush, so a
// re-render would see cache.raw (new) !== localStorage (old), drop the
// cache, and revert the value the user just set — making clicks appear to
// do nothing until localStorage catches up on the next frame.
const cache = new Map<string, WorktreeUIState>();

function read(key: string): WorktreeUIState {
  const cached = cache.get(key);
  if (cached) return cached;
  let value: WorktreeUIState = EMPTY;
  try {
    const raw = window.localStorage.getItem(key);
    if (raw !== null) {
      const parsed = stateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) value = parsed.data;
    }
  } catch {
    // Unavailable storage or malformed JSON — fall through to EMPTY.
  }
  cache.set(key, value);
  return value;
}

// Throttled write queue — diff scrolling fires rapid updates and we don't
// want to hit localStorage on every scroll event. We coalesce pending writes
// per key and flush on the next animation frame.
const pendingWrites = new Map<string, WorktreeUIState>();
let flushScheduled = false;

function scheduleFlush(): void {
  if (flushScheduled) return;
  flushScheduled = true;
  const run = (): void => {
    flushScheduled = false;
    for (const [key, value] of pendingWrites) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
      } catch {
        // Quota or disabled storage — the in-memory cache still holds it for
        // the current session.
      }
    }
    pendingWrites.clear();
  };
  // Group rapid updates (a scroll burst) into a single write. rAF is cheap
  // and doesn't need a timer fallback since the renderer is always active.
  if (typeof requestAnimationFrame === "function") {
    requestAnimationFrame(run);
  } else {
    setTimeout(run, 16);
  }
}

const listeners = new Set<() => void>();

function notify(): void {
  for (const fn of listeners) fn();
}

function write(key: string, next: WorktreeUIState): void {
  pendingWrites.set(key, next);
  // Update in-memory cache synchronously so subscribers see the new value on
  // the next render even before the write hits disk.
  cache.set(key, next);
  notify();
  scheduleFlush();
}

export function getWorktreeUI(
  repoId: string,
  worktreeId: string,
): WorktreeUIState {
  return read(keyFor(repoId, worktreeId));
}

export function setWorktreeUI(
  repoId: string,
  worktreeId: string,
  updater:
    | Partial<WorktreeUIState>
    | ((prev: WorktreeUIState) => WorktreeUIState),
): void {
  const key = keyFor(repoId, worktreeId);
  const prev = read(key);
  const next =
    typeof updater === "function" ? updater(prev) : mergeState(prev, updater);
  write(key, next);
}

// Diff scroll positions fire dozens of times per second; routing them through
// `setWorktreeUI` would notify every subscriber (WorktreeLayout, other tabs
// via useWorktreeUI) and cause the parent tree to re-render mid-scroll —
// that in turn thrashes Pierre's Virtualizer and paints blank placeholders.
// Nothing reads scroll reactively (it's only pulled once on mount per
// cacheKey), so we update the cache + queue a localStorage flush without
// notifying. The next non-silent write will carry this value along to
// subscribers if they happen to read.
export function setWorktreeUIScroll(
  repoId: string,
  worktreeId: string,
  cacheKey: string,
  top: number,
): void {
  const key = keyFor(repoId, worktreeId);
  const prev = read(key);
  const next: WorktreeUIState = {
    ...prev,
    diffs: { scroll: { ...prev.diffs.scroll, [cacheKey]: top } },
  };
  pendingWrites.set(key, next);
  cache.set(key, next);
  scheduleFlush();
}

function mergeState(
  prev: WorktreeUIState,
  patch: Partial<WorktreeUIState>,
): WorktreeUIState {
  return {
    files: patch.files ? { ...prev.files, ...patch.files } : prev.files,
    commits: patch.commits
      ? { ...prev.commits, ...patch.commits }
      : prev.commits,
    diffs: patch.diffs ? { ...prev.diffs, ...patch.diffs } : prev.diffs,
  };
}

type Update = (
  updater:
    | Partial<WorktreeUIState>
    | ((prev: WorktreeUIState) => WorktreeUIState),
) => void;

export function useWorktreeUI(
  repoId: string,
  worktreeId: string,
): [WorktreeUIState, Update] {
  const key = keyFor(repoId, worktreeId);
  const subscribe = useCallback((fn: () => void) => {
    listeners.add(fn);
    return () => {
      listeners.delete(fn);
    };
  }, []);
  const getSnapshot = useCallback(() => read(key), [key]);
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const update: Update = useCallback(
    (updater) => setWorktreeUI(repoId, worktreeId, updater),
    [repoId, worktreeId],
  );
  return [state, update];
}
