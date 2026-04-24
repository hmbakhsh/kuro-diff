import { useEffect, useMemo, useRef } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { trpc } from "@renderer/trpc";
import { FileTree } from "@renderer/components/files/FileTree";
import { FileContent } from "@renderer/components/files/FileContent";
import { FileTabs } from "@renderer/components/files/FileTabs";
import {
  getWorktreeUI,
  setWorktreeUI,
  useWorktreeUI,
} from "@renderer/lib/worktree-ui-state";
import { cn } from "@renderer/lib/cn";

const searchSchema = z.object({
  p: z.string().optional(),
});

export const Route = createFileRoute("/repos/$repoId/wt/$worktreeId/files")({
  validateSearch: (search: Record<string, unknown>) =>
    searchSchema.parse(search),
  component: FilesView,
});

function FilesView() {
  const { repoId, worktreeId } = Route.useParams();
  const { p: urlPath } = Route.useSearch();
  const navigate = useNavigate({ from: "/repos/$repoId/wt/$worktreeId/files" });
  const utils = trpc.useUtils();

  const [ui, updateUi] = useWorktreeUI(repoId, worktreeId);
  const openPaths = ui.files.openPaths;
  const activePath = ui.files.activePath;

  const prefs = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 });
  const showIgnored = prefs.data?.showIgnoredFiles ?? false;

  const setPrefs = trpc.preferences.set.useMutation({
    onSuccess: (next) => {
      utils.preferences.get.setData(undefined, next);
    },
  });

  const treeVisible = trpc.fs.listTree.useQuery(
    { repoId, worktreeId, includeIgnored: false },
    { staleTime: 5 * 60_000, gcTime: 30 * 60_000 },
  );
  const treeWithIgnored = trpc.fs.listTree.useQuery(
    { repoId, worktreeId, includeIgnored: true },
    { staleTime: 5 * 60_000, gcTime: 30 * 60_000 },
  );
  const tree = showIgnored ? treeWithIgnored : treeVisible;

  const files = useMemo(() => tree.data?.files ?? [], [tree.data]);
  const ignoredPrefixes = useMemo(
    () => (showIgnored ? (treeWithIgnored.data?.ignoredPrefixes ?? []) : []),
    [showIgnored, treeWithIgnored.data],
  );

  // The two effects below form a one-way-at-a-time sync between URL ?p and
  // the store's active file. Subtlety: if both effects subscribed to both
  // `urlPath` and `activePath`, clicking a tab would (1) update the store,
  // (2) the URL-mirror would navigate, (3) before the URL settles the
  // URL-hydrate would see urlPath (stale) ≠ activePath (new) and bounce
  // activePath back to the old URL value — visible as a fast flicker
  // between the last-two-active tabs.
  //
  // Fix: hydrate reacts only to URL changes (dep on urlPath only, reads the
  // store imperatively). Mirror marks the URL it just pushed via a ref so
  // the subsequent urlPath-triggered hydrate recognizes its own echo and
  // skips. Net: user action → store → URL (mirror); external navigate →
  // store (hydrate). Never both directions in the same commit.
  const lastPushedUrlPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!urlPath) return;
    if (urlPath === lastPushedUrlPathRef.current) return;
    const current = getWorktreeUI(repoId, worktreeId).files.activePath;
    if (urlPath === current) return;
    setWorktreeUI(repoId, worktreeId, (prev) => ({
      ...prev,
      files: {
        openPaths: prev.files.openPaths.includes(urlPath)
          ? prev.files.openPaths
          : [...prev.files.openPaths, urlPath],
        activePath: urlPath,
      },
    }));
  }, [urlPath, repoId, worktreeId]);

  useEffect(() => {
    const target = activePath ?? null;
    if ((target ?? undefined) === urlPath) return;
    lastPushedUrlPathRef.current = target;
    void navigate({
      to: "/repos/$repoId/wt/$worktreeId/files",
      params: { repoId, worktreeId },
      search: target ? { p: target } : {},
      replace: true,
    });
  }, [activePath, urlPath, navigate, repoId, worktreeId]);

  const handleSelect = (path: string): void => {
    updateUi((prev) => {
      const already = prev.files.openPaths.includes(path);
      return {
        ...prev,
        files: {
          openPaths: already
            ? prev.files.openPaths
            : [...prev.files.openPaths, path],
          activePath: path,
        },
      };
    });
  };

  const handleClose = (path: string): void => {
    updateUi((prev) => {
      const idx = prev.files.openPaths.indexOf(path);
      if (idx === -1) return prev;
      const nextOpen = [
        ...prev.files.openPaths.slice(0, idx),
        ...prev.files.openPaths.slice(idx + 1),
      ];
      let nextActive = prev.files.activePath;
      if (prev.files.activePath === path) {
        nextActive = nextOpen[idx] ?? nextOpen[idx - 1] ?? null;
      }
      return {
        ...prev,
        files: { openPaths: nextOpen, activePath: nextActive },
      };
    });
  };

  return (
    <div className="flex h-full min-h-0">
      <div className="flex w-64 shrink-0 flex-col border-r border-black/10 text-[12px] dark:border-white/10">
        <div className="flex items-center justify-between gap-2 border-b border-black/5 px-2 py-1.5 dark:border-white/5">
          <span className="text-[11px] uppercase tracking-wide text-zinc-500">
            Files
          </span>
          <button
            type="button"
            onClick={() => setPrefs.mutate({ showIgnoredFiles: !showIgnored })}
            title={
              showIgnored ? "Hide gitignored files" : "Show gitignored files"
            }
            aria-pressed={showIgnored}
            className={cn(
              "rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide transition-colors",
              showIgnored
                ? "bg-zinc-900 text-white dark:bg-white dark:text-zinc-900"
                : "text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10",
            )}
          >
            .ignored
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tree.isPending && (
            <div className="p-3 text-xs text-zinc-500">Loading tree…</div>
          )}
          {tree.isError && (
            <div className="p-3 text-xs text-red-500">
              Failed to list files: {tree.error.message}
            </div>
          )}
          {tree.data && (
            <FileTree
              files={files}
              ignoredPrefixes={ignoredPrefixes}
              selectedPath={activePath}
              onSelect={handleSelect}
            />
          )}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col">
        <FileTabs
          openPaths={openPaths}
          activePath={activePath}
          onSelect={(path) =>
            updateUi((prev) => ({
              ...prev,
              files: { ...prev.files, activePath: path },
            }))
          }
          onClose={handleClose}
        />
        <div className="min-h-0 flex-1 overflow-hidden">
          <FileContent
            repoId={repoId}
            worktreeId={worktreeId}
            path={activePath}
          />
        </div>
      </div>
    </div>
  );
}
