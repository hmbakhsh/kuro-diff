import { useEffect, useMemo } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { z } from "zod";
import { trpc } from "@renderer/trpc";
import { CommitsSidebar } from "@renderer/components/commits/CommitsSidebar";
import {
  CommitDetail,
  type CommitMeta,
} from "@renderer/components/commits/CommitDetail";
import type { DiffMode } from "@renderer/components/diffs/DiffModeToggle";
import {
  useRegisterCapture,
  type CaptureTarget,
} from "@renderer/lib/capture-context";
import { useWorktreeUI } from "@renderer/lib/worktree-ui-state";

const searchSchema = z.object({
  sha: z.string().optional(),
  full: z.boolean().optional(),
});

export const Route = createFileRoute("/repos/$repoId/wt/$worktreeId/commits")({
  validateSearch: (search: Record<string, unknown>) =>
    searchSchema.parse(search),
  component: CommitsView,
});

function CommitsView() {
  const { repoId, worktreeId } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate({
    from: "/repos/$repoId/wt/$worktreeId/commits",
  });

  const fullHistory = search.full ?? false;
  const selectedSha = search.sha ?? null;

  const [ui, updateUi] = useWorktreeUI(repoId, worktreeId);

  const refsQuery = trpc.git.refs.useQuery({ repoId }, { staleTime: 60_000 });
  const preferencesQuery = trpc.preferences.get.useQuery(undefined, {
    staleTime: Infinity,
  });
  const reposQuery = trpc.workspace.list.useQuery(undefined, {
    staleTime: 60_000,
  });
  const worktreesQuery = trpc.workspace.listWorktrees.useQuery(
    { repoId },
    { staleTime: 30_000 },
  );

  const compareBaseKey = `${repoId}:${worktreeId}`;
  const storedBase = preferencesQuery.data?.compareBases?.[compareBaseKey];
  const resolvedBase = storedBase ?? refsQuery.data?.mainBranch ?? null;

  const mode: DiffMode = preferencesQuery.data?.diffMode ?? "unified";
  const repoName = reposQuery.data?.find((r) => r.id === repoId)?.name ?? "";
  const worktree = worktreesQuery.data?.find((w) => w.id === worktreeId);
  const branch = worktree?.branch?.replace("refs/heads/", "") ?? null;

  const statusQuery = trpc.git.status.useQuery(
    { repoId, worktreeId },
    { staleTime: 5_000, refetchOnWindowFocus: true },
  );

  const logQuery = trpc.git.log.useInfiniteQuery(
    {
      repoId,
      worktreeId,
      base: fullHistory ? undefined : (resolvedBase ?? undefined),
      limit: 50,
    },
    {
      initialCursor: 0,
      getNextPageParam: (last) => last.nextCursor,
      enabled: !!refsQuery.data && (fullHistory || !!resolvedBase),
      staleTime: 10_000,
    },
  );

  const commits = useMemo(
    () => (logQuery.data?.pages ?? []).flatMap((p) => p.commits),
    [logQuery.data],
  );
  const fellBackToHead =
    logQuery.data?.pages.some((p) => p.fellBackToHead) ?? false;
  const workingTreeSummary = statusQuery.data?.isDirty
    ? {
        staged: statusQuery.data.staged.length,
        modified: statusQuery.data.modified.length,
        untracked: statusQuery.data.untracked.length,
      }
    : null;

  // Selection normalization: if nothing is selected, land on the first row
  // (working-tree if dirty, else first commit). Also re-normalize when the
  // selection points at a sha that is no longer in the list (force-push,
  // rebase, base change, full-history toggle).
  const firstRowId = workingTreeSummary ? "wt" : (commits[0]?.sha ?? null);
  const selectionIsValid =
    selectedSha === null ||
    (selectedSha === "wt" && !!workingTreeSummary) ||
    commits.some((c) => c.sha === selectedSha || c.shortSha === selectedSha);

  // Prefer the store's remembered sha on first entry (URL has no ?sha yet)
  // as long as it still exists in the current list — this is how tab hops
  // and app restarts restore the last-viewed commit.
  const storedSha = ui.commits.selectedSha;
  const storedShaIsValid =
    storedSha !== null &&
    (storedSha === "wt"
      ? !!workingTreeSummary
      : commits.some((c) => c.sha === storedSha || c.shortSha === storedSha));

  useEffect(() => {
    if (selectedSha === null) {
      const candidate = storedShaIsValid ? storedSha : firstRowId;
      if (candidate !== null) {
        void navigate({
          to: "/repos/$repoId/wt/$worktreeId/commits",
          params: { repoId, worktreeId },
          search: { ...search, sha: candidate },
          replace: true,
        });
      }
      return;
    }
    if (selectedSha !== null && !selectionIsValid && firstRowId !== null) {
      void navigate({
        to: "/repos/$repoId/wt/$worktreeId/commits",
        params: { repoId, worktreeId },
        search: { ...search, sha: firstRowId },
        replace: true,
      });
    }
  }, [
    selectedSha,
    firstRowId,
    selectionIsValid,
    storedSha,
    storedShaIsValid,
    navigate,
    repoId,
    worktreeId,
    search,
  ]);

  const normalizedSelection: string | null =
    selectedSha && selectionIsValid ? selectedSha : null;

  // Mirror the resolved selection back into the store so tab hops and app
  // restarts resume here. Skip when it already matches to avoid a write
  // loop through the hook's notify → re-render path.
  useEffect(() => {
    if (normalizedSelection === null) return;
    if (ui.commits.selectedSha === normalizedSelection) return;
    updateUi((prev) => ({
      ...prev,
      commits: { selectedSha: normalizedSelection },
    }));
  }, [normalizedSelection, ui.commits.selectedSha, updateUi]);

  const selectedCommit = useMemo(
    () =>
      normalizedSelection && normalizedSelection !== "wt"
        ? (commits.find(
            (c) =>
              c.sha === normalizedSelection ||
              c.shortSha === normalizedSelection,
          ) ?? null)
        : null,
    [commits, normalizedSelection],
  );

  const commitDiffQuery = trpc.git.commitDiff.useQuery(
    { repoId, worktreeId, sha: selectedCommit?.sha ?? "" },
    {
      enabled: !!selectedCommit,
      staleTime: 5 * 60_000,
    },
  );

  const workingTreeDiffQuery = trpc.git.diff.useQuery(
    {
      repoId,
      worktreeId,
      base: "HEAD",
      head: null,
      staged: false,
      includeUntracked: true,
    },
    {
      enabled: normalizedSelection === "wt" && !!workingTreeSummary,
      staleTime: 2_000,
    },
  );

  const captureTarget = useMemo<CaptureTarget | null>(() => {
    if (!repoName) return null;
    if (normalizedSelection === "wt" && workingTreeDiffQuery.data) {
      return {
        repoId,
        repoName,
        worktreeId,
        relativePath: "<working tree>",
        contents: null,
        sha: null,
        branch,
        language: null,
        lineCount: 1_000_000,
        diff: {
          patch: workingTreeDiffQuery.data.patch,
          base: "HEAD",
          head: null,
        },
      };
    }
    if (selectedCommit && commitDiffQuery.data) {
      const meta = commitDiffQuery.data.meta;
      const parent = meta.parents[0] ?? "∅";
      return {
        repoId,
        repoName,
        worktreeId,
        relativePath: `<commit ${meta.shortSha}>`,
        contents: null,
        sha: meta.sha,
        branch: null,
        language: null,
        lineCount: 1_000_000,
        diff: {
          patch: commitDiffQuery.data.patch,
          base: parent,
          head: meta.sha,
        },
      };
    }
    return null;
  }, [
    repoId,
    repoName,
    worktreeId,
    branch,
    normalizedSelection,
    selectedCommit,
    commitDiffQuery.data,
    workingTreeDiffQuery.data,
  ]);
  useRegisterCapture(captureTarget);

  const rangeLabel = fullHistory
    ? "Full history"
    : resolvedBase
      ? `${resolvedBase}..HEAD`
      : "No base configured";

  const onSelect = (id: string): void => {
    void navigate({
      to: "/repos/$repoId/wt/$worktreeId/commits",
      params: { repoId, worktreeId },
      search: { ...search, sha: id },
      replace: true,
    });
  };

  const onToggleFullHistory = (next: boolean): void => {
    updateUi((prev) => ({
      ...prev,
      commits: { selectedSha: null },
    }));
    void navigate({
      to: "/repos/$repoId/wt/$worktreeId/commits",
      params: { repoId, worktreeId },
      search: { ...search, full: next || undefined, sha: undefined },
      replace: true,
    });
  };

  const onOpenFile = (path: string): void => {
    void navigate({
      to: "/repos/$repoId/wt/$worktreeId/files",
      params: { repoId, worktreeId },
      search: { p: path },
    });
  };

  return (
    <div className="flex h-full min-h-0">
      <CommitsSidebar
        commits={commits}
        selectedId={normalizedSelection}
        onSelect={onSelect}
        workingTree={workingTreeSummary}
        fullHistory={fullHistory}
        onToggleFullHistory={onToggleFullHistory}
        rangeLabel={rangeLabel}
        hasNextPage={!!logQuery.hasNextPage}
        onLoadMore={() => void logQuery.fetchNextPage()}
        isLoadingMore={logQuery.isFetchingNextPage}
        isPending={logQuery.isPending}
        fellBackToHead={fellBackToHead}
      />
      {normalizedSelection === "wt" ? (
        <CommitDetail
          scope="wt"
          mode={mode}
          cacheKey={`${repoId}:${worktreeId}:wt`}
          patch={workingTreeDiffQuery.data?.patch ?? null}
          isPending={workingTreeDiffQuery.isPending}
          error={workingTreeDiffQuery.error?.message ?? null}
          branch={branch}
          counts={{
            staged: statusQuery.data?.staged.length ?? 0,
            modified: statusQuery.data?.modified.length ?? 0,
            untracked: statusQuery.data?.untracked.length ?? 0,
          }}
          onOpenFile={onOpenFile}
        />
      ) : (
        <CommitDetail
          scope="commit"
          mode={mode}
          cacheKey={`${repoId}:${worktreeId}:commit:${selectedCommit?.sha ?? "none"}`}
          patch={commitDiffQuery.data?.patch ?? null}
          isPending={!!selectedCommit && commitDiffQuery.isPending}
          error={commitDiffQuery.error?.message ?? null}
          meta={(commitDiffQuery.data?.meta as CommitMeta | undefined) ?? null}
          onOpenFile={onOpenFile}
        />
      )}
    </div>
  );
}
