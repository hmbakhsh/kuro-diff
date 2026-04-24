import { useEffect, useMemo, useState } from "react";
import { Command } from "cmdk";
import { useMatches, useNavigate } from "@tanstack/react-router";
import {
  ArrowRight,
  FileCode,
  FolderGit2,
  GitCompareArrows,
  GitPullRequestArrow,
  History,
  Settings as SettingsIcon,
  SunMoon,
} from "lucide-react";
import { trpc } from "@renderer/trpc";
import { cn } from "@renderer/lib/cn";
import { bumpRecent, listRecents } from "@renderer/lib/recents";

interface CommandMenuProps {
  open: boolean;
  onOpenChange(open: boolean): void;
}

type CommandItemBase = {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly icon: React.ComponentType<{ className?: string }>;
  readonly run: () => void;
};

/** Cap the number of file rows we hand to cmdk per keystroke. cmdk reorders
 *  DOM via `appendChild` on every filter pass, so the cost is linear in the
 *  number of rendered items. 200 is ~20ms on an M-series Mac and covers the
 *  common "I typed enough characters to find what I wanted" case. */
const FILE_ROW_CAP = 200;

export function CommandMenu({ open, onOpenChange }: CommandMenuProps) {
  const navigate = useNavigate();
  const matches = useMatches();
  const [search, setSearch] = useState("");
  const utils = trpc.useUtils();
  const setPreferences = trpc.preferences.set.useMutation({
    onSuccess: () => {
      void utils.preferences.get.invalidate();
    },
  });

  const activeRepoId =
    matches
      .map((m) => (m.params as { repoId?: string }).repoId)
      .find((v): v is string => typeof v === "string") ?? null;
  const activeWorktreeId =
    matches
      .map((m) => (m.params as { worktreeId?: string }).worktreeId)
      .find((v): v is string => typeof v === "string") ?? null;

  const repos = trpc.workspace.list.useQuery(undefined, { staleTime: 60_000 });
  const worktrees = trpc.workspace.listWorktrees.useQuery(
    activeRepoId ? { repoId: activeRepoId } : (undefined as never),
    { enabled: !!activeRepoId, staleTime: 60_000 },
  );
  const filesQuery = trpc.fs.listTree.useQuery(
    activeRepoId && activeWorktreeId
      ? {
          repoId: activeRepoId,
          worktreeId: activeWorktreeId,
          includeIgnored: false,
        }
      : (undefined as never),
    { enabled: !!activeRepoId && !!activeWorktreeId, staleTime: 5 * 60_000 },
  );

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  // `>` opens command mode. Drop the prefix from the query so cmdk's
  // built-in filter matches against the visible label only.
  const isCommandMode = search.startsWith(">");
  const queryText = isCommandMode ? search.slice(1).trimStart() : search;

  const scopeKey = `files:${activeRepoId ?? "none"}:${activeWorktreeId ?? "none"}`;
  const recents = useMemo(
    () => (activeRepoId && activeWorktreeId ? listRecents(scopeKey) : []),
    [scopeKey, open, activeRepoId, activeWorktreeId],
  );

  const files = filesQuery.data?.files ?? [];

  // Pre-filter + rank files in JS so cmdk only ever sees a small window of
  // rows. Rendering ~2000 `<Command.Item>`s was the source of the keystroke
  // lag — cmdk's internal `appendChild` reordering runs per-item per-input.
  const rankedFiles = useMemo(() => {
    if (!activeRepoId || !activeWorktreeId) return [] as string[];
    const needle = queryText.toLowerCase();

    if (needle.length === 0) {
      const recentSet = new Set(recents);
      const head: string[] = [];
      for (const r of recents) if (files.includes(r)) head.push(r);
      for (const f of files) {
        if (head.length + (recentSet.has(f) ? 0 : 1) > FILE_ROW_CAP) break;
        if (!recentSet.has(f)) head.push(f);
      }
      return head.slice(0, FILE_ROW_CAP);
    }

    const scored: Array<{ path: string; score: number }> = [];
    for (const path of files) {
      const lower = path.toLowerCase();
      const idx = lower.indexOf(needle);
      if (idx === -1) continue;
      // Prefer matches that hit the basename + hits closer to path start.
      const base = path.slice(path.lastIndexOf("/") + 1).toLowerCase();
      const baseIdx = base.indexOf(needle);
      const baseBonus =
        baseIdx >= 0 ? 0.5 + 0.25 * (1 - baseIdx / base.length) : 0;
      const score = 1 - idx / Math.max(lower.length, 1) + baseBonus;
      scored.push({ path, score });
    }
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, FILE_ROW_CAP).map((s) => s.path);
  }, [files, recents, activeRepoId, activeWorktreeId, queryText]);

  const close = () => onOpenChange(false);

  const commands: CommandItemBase[] = useMemo(() => {
    const out: CommandItemBase[] = [];
    if (activeRepoId && activeWorktreeId) {
      out.push({
        id: "goto:files",
        label: "Go to Files",
        hint: "Current worktree",
        icon: FileCode,
        run: () => {
          void navigate({
            to: "/repos/$repoId/wt/$worktreeId/files",
            params: { repoId: activeRepoId, worktreeId: activeWorktreeId },
          });
          close();
        },
      });
      out.push({
        id: "goto:diffs",
        label: "Go to Diffs",
        hint: "Current worktree",
        icon: GitCompareArrows,
        run: () => {
          void navigate({
            to: "/repos/$repoId/wt/$worktreeId/diffs",
            params: { repoId: activeRepoId, worktreeId: activeWorktreeId },
          });
          close();
        },
      });
      out.push({
        id: "goto:commits",
        label: "Go to Commits",
        hint: "Current worktree",
        icon: History,
        run: () => {
          void navigate({
            to: "/repos/$repoId/wt/$worktreeId/commits",
            params: { repoId: activeRepoId, worktreeId: activeWorktreeId },
          });
          close();
        },
      });
    }
    if (activeRepoId) {
      out.push({
        id: "goto:prs",
        label: "Go to Pull Requests",
        hint: "Current repo",
        icon: GitPullRequestArrow,
        run: () => {
          void navigate({
            to: "/repos/$repoId/prs",
            params: { repoId: activeRepoId },
          });
          close();
        },
      });
    }
    out.push({
      id: "goto:settings",
      label: "Open Settings",
      icon: SettingsIcon,
      run: () => {
        void navigate({ to: "/settings" });
        close();
      },
    });
    out.push({
      id: "theme:cycle",
      label: "Cycle theme (light / dark / system)",
      icon: SunMoon,
      run: () => {
        const current = document.documentElement.dataset.theme ?? "system";
        const next =
          current === "light"
            ? "dark"
            : current === "dark"
              ? "system"
              : "light";
        setPreferences.mutate({ theme: next as "light" | "dark" | "system" });
        close();
      },
    });
    for (const repo of repos.data ?? []) {
      if (repo.id === activeRepoId) continue;
      out.push({
        id: `switch:${repo.id}`,
        label: `Switch to ${repo.name}`,
        hint: repo.path,
        icon: FolderGit2,
        run: () => {
          void navigate({ to: "/repos/$repoId", params: { repoId: repo.id } });
          close();
        },
      });
    }
    for (const wt of worktrees.data ?? []) {
      if (wt.id === activeWorktreeId) continue;
      const label =
        wt.branch?.replace("refs/heads/", "") ?? wt.head.slice(0, 7);
      out.push({
        id: `switch-wt:${wt.id}`,
        label: `Switch worktree: ${label}`,
        hint: wt.path,
        icon: FolderGit2,
        run: () => {
          if (!activeRepoId) return;
          void navigate({
            to: "/repos/$repoId/wt/$worktreeId",
            params: { repoId: activeRepoId, worktreeId: wt.id },
          });
          close();
        },
      });
    }
    return out;
  }, [
    activeRepoId,
    activeWorktreeId,
    navigate,
    repos.data,
    worktrees.data,
    setPreferences,
  ]);

  const onFileSelect = (path: string): void => {
    if (!activeRepoId || !activeWorktreeId) return;
    bumpRecent(scopeKey, path);
    void navigate({
      to: "/repos/$repoId/wt/$worktreeId/files",
      params: { repoId: activeRepoId, worktreeId: activeWorktreeId },
      search: { p: path },
    });
    close();
  };

  const showFiles = !isCommandMode && !!activeRepoId && !!activeWorktreeId;
  const showCommands = isCommandMode;
  const showRepos = !isCommandMode && !activeRepoId;

  return (
    <Command.Dialog
      open={open}
      onOpenChange={onOpenChange}
      label="Command menu"
      // `shouldFilter={false}` — we pre-filter file rows in JS so cmdk only
      // paints what matched. Without this, cmdk re-scores + re-orders every
      // item in the DOM on every keystroke (the cause of the input lag).
      shouldFilter={false}
      // cmdk spreads unknown props onto its `cmdk-root` div, which wraps our
      // children. DialogContent is flex-col so cmdk-root gets a bounded height
      // as a flex-1 child; without that the List's `overflow-auto` has no
      // constraint to scroll against, and arrow-nav scrolls the document
      // instead — pushing the search input out of view.
      className="flex min-h-0 flex-1 flex-col"
      contentClassName={cn(
        "fixed left-1/2 top-[18vh] z-50 flex w-[min(640px,92vw)] -translate-x-1/2 flex-col",
        "max-h-[min(520px,70vh)] overflow-hidden",
        "rounded-xl border border-black/10 bg-white/95 shadow-2xl backdrop-blur",
        "dark:border-white/10 dark:bg-zinc-900/95",
      )}
      overlayClassName="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
    >
      <div className="shrink-0 border-b border-black/5 px-3 dark:border-white/5">
        <Command.Input
          value={search}
          onValueChange={setSearch}
          placeholder={
            isCommandMode ? "Run a command…" : "Search files · `>` for commands"
          }
          className={cn(
            "h-11 w-full bg-transparent text-sm outline-none",
            "placeholder:text-zinc-400 dark:placeholder:text-zinc-500",
          )}
        />
      </div>
      <Command.List className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-1">
        <Command.Empty className="px-4 py-6 text-center text-xs text-zinc-500">
          No matches.
        </Command.Empty>

        {showFiles && (
          <>
            {recents.length > 0 && queryText.length === 0 && (
              <Command.Group heading="Recent">
                {recents
                  .filter((r) => files.includes(r))
                  .slice(0, 8)
                  .map((path) => (
                    <FileRow
                      key={`recent:${path}`}
                      value={`recent:${path}`}
                      path={path}
                      icon={History}
                      onSelect={onFileSelect}
                    />
                  ))}
              </Command.Group>
            )}
            <Command.Group heading="Files">
              {rankedFiles.map((path) => (
                <FileRow
                  key={path}
                  value={path}
                  path={path}
                  icon={FileCode}
                  onSelect={onFileSelect}
                />
              ))}
            </Command.Group>
          </>
        )}

        {showCommands && (
          <Command.Group heading="Commands">
            {commands.map((cmd) => (
              <Command.Item
                key={cmd.id}
                value={`${cmd.label} ${cmd.hint ?? ""}`}
                onSelect={cmd.run}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm",
                  "aria-selected:bg-black/5 dark:aria-selected:bg-white/10",
                )}
              >
                <cmd.icon className="size-4 shrink-0 text-zinc-500" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{cmd.label}</span>
                  {cmd.hint && (
                    <span className="truncate text-[11px] text-zinc-500">
                      {cmd.hint}
                    </span>
                  )}
                </span>
                <ArrowRight className="ml-auto size-3.5 shrink-0 text-zinc-400" />
              </Command.Item>
            ))}
          </Command.Group>
        )}

        {showRepos && (
          <Command.Group heading="Repos">
            {(repos.data ?? []).map((repo) => (
              <Command.Item
                key={repo.id}
                value={`${repo.name} ${repo.path}`}
                onSelect={() => {
                  void navigate({
                    to: "/repos/$repoId",
                    params: { repoId: repo.id },
                  });
                  close();
                }}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2 text-sm",
                  "aria-selected:bg-black/5 dark:aria-selected:bg-white/10",
                )}
              >
                <FolderGit2 className="size-4 shrink-0 text-zinc-500" />
                <span className="flex min-w-0 flex-col">
                  <span className="font-medium">{repo.name}</span>
                  <span className="truncate text-[11px] text-zinc-500">
                    {repo.path}
                  </span>
                </span>
              </Command.Item>
            ))}
          </Command.Group>
        )}
      </Command.List>
      <div className="shrink-0 border-t border-black/5 px-3 py-1.5 text-[10px] text-zinc-500 dark:border-white/5">
        {isCommandMode ? "Command mode" : "File search"}
        <span className="mx-2">·</span>
        Enter to run · Esc to close
      </div>
    </Command.Dialog>
  );
}

function FileRow({
  path,
  value,
  icon: Icon,
  onSelect,
}: {
  path: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  onSelect(path: string): void;
}) {
  const segments = path.split("/");
  const name = segments[segments.length - 1] ?? path;
  const dir = segments.slice(0, -1).join("/");
  return (
    <Command.Item
      value={value}
      onSelect={() => onSelect(path)}
      className={cn(
        "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 text-sm",
        "aria-selected:bg-black/5 dark:aria-selected:bg-white/10",
      )}
    >
      <Icon className="size-4 shrink-0 text-zinc-500" />
      <span className="flex min-w-0 flex-col">
        <span className="truncate font-mono text-[12.5px]">{name}</span>
        {dir && (
          <span className="truncate text-[11px] text-zinc-500">{dir}</span>
        )}
      </span>
    </Command.Item>
  );
}
