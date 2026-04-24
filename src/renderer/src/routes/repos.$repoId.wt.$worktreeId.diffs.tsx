import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { trpc } from "@renderer/trpc";
import { RefPicker } from "@renderer/components/diffs/RefPicker";
import {
  DiffModeToggle,
  type DiffMode,
} from "@renderer/components/diffs/DiffModeToggle";
import {
  DiffView,
  type DiffViewHandle,
} from "@renderer/components/diffs/DiffView";
import { DiffsSidebar } from "@renderer/components/diffs/DiffsSidebar";
import { useDiffFiles } from "@renderer/components/diffs/useDiffFiles";
import {
  getWorktreeUI,
  setWorktreeUIScroll,
} from "@renderer/lib/worktree-ui-state";

const WORKING_TREE = "__wt__";

// `head` values: a ref name, the `__wt__` sentinel for the worktree's current
// working copy, or undefined (coerced to the working-tree default on first
// render). `base` defaults to the repo's main branch.
const searchSchema = z.object({
  base: z.string().optional(),
  head: z.string().optional(),
  staged: z.boolean().optional(),
});

export const Route = createFileRoute("/repos/$repoId/wt/$worktreeId/diffs")({
  validateSearch: (search: Record<string, unknown>) =>
    searchSchema.parse(search),
  component: DiffsView,
});

function DiffsView() {
  const { repoId, worktreeId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/repos/$repoId/wt/$worktreeId/diffs" });

  const refsQuery = trpc.git.refs.useQuery({ repoId }, { staleTime: 60_000 });
  const preferencesQuery = trpc.preferences.get.useQuery(undefined, {
    staleTime: Infinity,
  });
  const utils = trpc.useUtils();
  const setPreferences = trpc.preferences.set.useMutation({
    onSuccess: () => void utils.preferences.get.invalidate(),
  });
  const setCompareBase = trpc.preferences.setCompareBase.useMutation({
    onSuccess: () => void utils.preferences.get.invalidate(),
  });

  const compareBaseKey = `${repoId}:${worktreeId}`;
  const storedBase = preferencesQuery.data?.compareBases?.[compareBaseKey];
  const resolvedDefaultBase = storedBase ?? refsQuery.data?.mainBranch ?? null;

  // Normalize the URL as soon as refs + prefs load: base = the persisted
  // compare-base for this worktree (falling back to the repo's main branch),
  // head = working tree. Ref pickers override either side without losing the
  // default on the next visit.
  useEffect(() => {
    if (!resolvedDefaultBase) return;
    if (search.base) return;
    void navigate({
      to: "/repos/$repoId/wt/$worktreeId/diffs",
      params: { repoId, worktreeId },
      search: {
        base: resolvedDefaultBase,
        head: WORKING_TREE,
        staged: false,
      },
      replace: true,
    });
  }, [resolvedDefaultBase, search.base, navigate, repoId, worktreeId]);

  const base = search.base ?? resolvedDefaultBase ?? "HEAD";
  const headParam = search.head ?? WORKING_TREE;
  const headForQuery = headParam === WORKING_TREE ? null : headParam;
  const staged = search.staged ?? false;

  const includeUntracked = headForQuery === null && !staged;
  const diffQuery = trpc.git.diff.useQuery(
    { repoId, worktreeId, base, head: headForQuery, staged, includeUntracked },
    {
      enabled: !!refsQuery.data,
      staleTime: 10_000,
    },
  );

  // Fetched only when head is the working tree — used to tag rows in the
  // sidebar whose files are untracked (never added to git) so they render a
  // distinct `U` badge instead of `A`, which would conflate them with
  // committed/staged new files.
  const statusQuery = trpc.git.status.useQuery(
    { repoId, worktreeId },
    {
      enabled: headForQuery === null,
      staleTime: 5_000,
      refetchOnWindowFocus: true,
    },
  );
  const untrackedPaths = useMemo(
    () => new Set(statusQuery.data?.untracked ?? []),
    [statusQuery.data],
  );

  const mode: DiffMode = preferencesQuery.data?.diffMode ?? "unified";

  const headValue = headForQuery; // null when working tree

  const rangeLabel = useMemo(() => {
    if (headForQuery === null) return staged ? "staged" : "working tree";
    return `${base} → ${headForQuery}`;
  }, [base, headForQuery, staged]);

  const cacheKey = `${repoId}:${worktreeId}:${base}:${headForQuery ?? "wt"}:${staged ? "s" : ""}`;
  const parsed = useDiffFiles(diffQuery.data?.patch ?? "", cacheKey);

  // Scroll persistence is write-heavy (fires on every scroll event) and
  // nothing reads it reactively — we only pull the value once per cacheKey
  // when DiffView mounts. Subscribing via the hook would re-render this
  // route (and its parent layout) 60× per second during a scroll burst,
  // which thrashed Pierre's Virtualizer into rendering blank placeholders.
  // Stash the initial value per cacheKey in a ref so switching base/head
  // still honors stored positions, and route writes through the silent
  // setter that updates localStorage without notifying subscribers.
  const initialScrollByKey = useRef<Record<string, number>>({});
  if (!(cacheKey in initialScrollByKey.current)) {
    initialScrollByKey.current[cacheKey] =
      getWorktreeUI(repoId, worktreeId).diffs.scroll[cacheKey] ?? 0;
  }
  const initialScrollTop = initialScrollByKey.current[cacheKey];

  const persistScroll = useCallback(
    (top: number): void => {
      setWorktreeUIScroll(repoId, worktreeId, cacheKey, top);
    },
    [repoId, worktreeId, cacheKey],
  );

  const diffViewRef = useRef<DiffViewHandle>(null);
  const [activeIndex, setActiveIndex] = useState<number | null>(null);

  // Reset selection when the file set changes (new ref/base combo).
  useEffect(() => {
    setActiveIndex(null);
  }, [cacheKey]);

  const handleSelect = (index: number) => {
    setActiveIndex(index);
    diffViewRef.current?.scrollToFile(index);
  };

  // Memoized so DiffView's `renderHeaderMetadata` memo stays stable across
  // re-renders — an unstable reference invalidates every FileDiff's props
  // inside the Virtualizer.
  const handleOpenFile = useCallback(
    (path: string) => {
      void navigate({
        to: "/repos/$repoId/wt/$worktreeId/files",
        params: { repoId, worktreeId },
        search: { p: path },
      });
    },
    [navigate, repoId, worktreeId],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 items-end gap-3 border-b border-black/10 px-4 py-2 dark:border-white/10">
        <RefPicker
          label="Base"
          refs={refsQuery.data?.refs ?? []}
          value={base}
          onChange={(next) => {
            const value = next ?? base;
            setCompareBase.mutate({ key: compareBaseKey, base: value });
            void navigate({
              to: "/repos/$repoId/wt/$worktreeId/diffs",
              params: { repoId, worktreeId },
              search: { ...search, base: value },
              replace: true,
            });
          }}
        />
        <RefPicker
          label="Head"
          refs={refsQuery.data?.refs ?? []}
          value={headValue}
          allowWorkingTree
          onChange={(next) =>
            void navigate({
              to: "/repos/$repoId/wt/$worktreeId/diffs",
              params: { repoId, worktreeId },
              search: {
                ...search,
                head: next === null ? WORKING_TREE : next,
              },
              replace: true,
            })
          }
        />
        {headForQuery === null && (
          <label className="flex h-7 items-center gap-1.5 text-[11px] text-zinc-500">
            <input
              type="checkbox"
              checked={staged}
              onChange={(e) =>
                void navigate({
                  to: "/repos/$repoId/wt/$worktreeId/diffs",
                  params: { repoId, worktreeId },
                  search: { ...search, staged: e.target.checked },
                  replace: true,
                })
              }
            />
            Staged only
          </label>
        )}
        <div className="ml-auto flex items-end gap-3">
          <span className="text-[11px] text-zinc-500">{rangeLabel}</span>
          <DiffModeToggle
            value={mode}
            onChange={(next) => setPreferences.mutate({ diffMode: next })}
          />
        </div>
      </div>

      <div className="flex min-h-0 flex-1">
        {refsQuery.isError && (
          <div className="p-4 text-xs text-red-500">
            Failed to load refs: {refsQuery.error.message}
          </div>
        )}
        {!refsQuery.isError && diffQuery.isPending && (
          <div className="p-4 text-xs text-zinc-500">Loading diff…</div>
        )}
        {diffQuery.isError && (
          <div className="p-4 text-xs text-red-500">
            Failed to compute diff: {diffQuery.error.message}
          </div>
        )}
        {diffQuery.data && (
          <>
            <DiffsSidebar
              files={parsed.files}
              activeIndex={activeIndex}
              onSelect={handleSelect}
              binaryCount={parsed.binaryCount}
              untrackedPaths={untrackedPaths}
            />
            <div className="min-w-0 flex-1">
              <DiffView
                ref={diffViewRef}
                parsed={parsed}
                mode={mode}
                onOpenFile={handleOpenFile}
                scrollKey={cacheKey}
                initialScrollTop={initialScrollTop}
                onScrollPersist={persistScroll}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
