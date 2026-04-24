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

// Cache reads so useSyncExternalStore's `getSnapshot` returns stable
// references between polls on the same underlying string — React bails out
// of re-renders when the snapshot identity hasn't changed. Without this
// cache, every read would allocate a new object and cause infinite renders.
const cache = new Map<string, { raw: string | null; value: WorktreeUIState }>();

function read(key: string): WorktreeUIState {
  const raw = (() => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  })();
  const entry = cache.get(key);
  if (entry && entry.raw === raw) return entry.value;
  let value: WorktreeUIState = EMPTY;
  if (raw !== null) {
    try {
      const parsed = stateSchema.safeParse(JSON.parse(raw));
      if (parsed.success) value = parsed.data;
    } catch {
      // Malformed JSON — drop it and fall through to EMPTY.
    }
  }
  cache.set(key, { raw, value });
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
        const raw = JSON.stringify(value);
        window.localStorage.setItem(key, raw);
        cache.set(key, { raw, value });
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
  cache.set(key, { raw: JSON.stringify(next), value: next });
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
  cache.set(key, { raw: JSON.stringify(next), value: next });
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
