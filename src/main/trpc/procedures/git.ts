import { z } from "zod";
import { publicProcedure, router } from "../trpc.js";
import {
  composeUntrackedPatches,
  composeWorkingTreeDiff,
  runGit,
} from "../../services/git-service.js";
import {
  detectMainBranch,
  resolveRepo,
  resolveWorktree,
} from "../../services/workspace-lookup.js";
import type { GitRef } from "@shared/types";

const repoIdInput = z.object({ repoId: z.string().uuid() });

// `null` head = working tree. `worktreeId` optionally pins the diff to a
// specific checkout; otherwise we use the primary worktree.
const diffInput = z.object({
  repoId: z.string().uuid(),
  worktreeId: z.string().min(1).nullable().optional(),
  base: z.string().min(1),
  head: z.string().nullable(),
  /** When head is null (working tree), include staged changes (`--cached`). */
  staged: z.boolean().optional(),
  /**
   * Working-tree only: also render untracked files as new-file patches.
   * Used by the Commits tab's working-tree pseudo-row. When set, the composed
   * diff is `HEAD → worktree` (base/paths are ignored) plus untracked
   * synthesized entries.
   */
  includeUntracked: z.boolean().optional(),
  /** Optional path filter (relative); when set, diff only those paths. */
  paths: z.array(z.string().min(1)).optional(),
});

const worktreeScope = z.object({
  repoId: z.string().uuid(),
  worktreeId: z.string().min(1).nullable().optional(),
});

const logInput = worktreeScope.extend({
  /** When set, list `<base>..HEAD`; otherwise full HEAD log. */
  base: z.string().min(1).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  cursor: z.number().int().min(0).optional(),
});

const commitDiffInput = worktreeScope.extend({
  sha: z.string().regex(/^[0-9a-f]{4,40}$/),
});

const UNIT = "\x1f"; // ASCII Unit Separator, safe delimiter inside git --format

async function listLocalBranches(cwd: string): Promise<GitRef[]> {
  const out = await runGit(
    [
      "for-each-ref",
      "--format=%(refname:short)%09%(objectname)",
      "refs/heads/",
    ],
    { cwd },
  );
  return parseRefLines(out, "branch");
}

async function listRemoteBranches(cwd: string): Promise<GitRef[]> {
  const out = await runGit(
    [
      "for-each-ref",
      "--format=%(refname:short)%09%(objectname)",
      "refs/remotes/origin/",
    ],
    { cwd },
  );
  return parseRefLines(out, "remote").filter((r) => !r.name.endsWith("/HEAD"));
}

async function listTags(cwd: string): Promise<GitRef[]> {
  const out = await runGit(
    ["for-each-ref", "--format=%(refname:short)%09%(objectname)", "refs/tags/"],
    { cwd },
  );
  return parseRefLines(out, "tag");
}

function parseRefLines(raw: string, kind: GitRef["kind"]): GitRef[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter((l) => l.length > 0)
    .map((line) => {
      const tab = line.indexOf("\t");
      if (tab === -1) return null;
      return {
        name: line.slice(0, tab),
        sha: line.slice(tab + 1),
        kind,
      } satisfies GitRef;
    })
    .filter((r): r is GitRef => r !== null);
}

export interface LogCommit {
  sha: string;
  shortSha: string;
  subject: string;
  authorName: string;
  authorDate: string;
  parents: string[];
}

function parseLog(raw: string): LogCommit[] {
  if (!raw) return [];
  return raw
    .split("\n")
    .filter((l) => l.length > 0)
    .map((line): LogCommit => {
      const [
        sha = "",
        shortSha = "",
        parents = "",
        authorName = "",
        authorDate = "",
        ...subjectParts
      ] = line.split(UNIT);
      // `%s` never contains the unit separator, but join any surplus fields
      // defensively in case a future format change lands.
      const subject = subjectParts.join(UNIT);
      return {
        sha,
        shortSha,
        parents: parents.length > 0 ? parents.split(" ").filter(Boolean) : [],
        authorName,
        authorDate,
        subject,
      };
    });
}

export const gitRouter = router({
  refs: publicProcedure.input(repoIdInput).query(async ({ input }) => {
    const repo = await resolveRepo(input.repoId);
    const [local, remote, tags, mainBranch] = await Promise.all([
      listLocalBranches(repo.path),
      listRemoteBranches(repo.path),
      listTags(repo.path),
      detectMainBranch(repo.path),
    ]);
    return {
      mainBranch,
      refs: [...local, ...remote, ...tags],
    };
  }),

  diff: publicProcedure.input(diffInput).query(async ({ input }) => {
    const { worktree } = await resolveWorktree(input.repoId, input.worktreeId);
    const cwd = worktree.path;

    // Commits-tab working-tree row: caller pins base to HEAD and asks for
    // untracked — use the dedicated composer (HEAD → worktree + untracked).
    if (
      input.head === null &&
      !input.staged &&
      input.includeUntracked &&
      input.base === "HEAD"
    ) {
      return { patch: await composeWorkingTreeDiff(cwd) };
    }

    const pathArgs =
      input.paths && input.paths.length > 0 ? ["--", ...input.paths] : [];

    // Common flags: rename detection on, no colour, no pager. Binary entries
    // are stripped on the renderer side when a file has no hunks.
    const common = ["--no-color", "-M"];

    let args: string[];
    if (input.head === null) {
      // Working-tree diff of the selected worktree vs the chosen base.
      // Two flavours: `staged` = only index changes; otherwise HEAD of the
      // worktree + index + untracked-to-be-tracked.
      if (input.staged) {
        args = ["diff", ...common, "--cached", input.base, ...pathArgs];
      } else {
        args = ["diff", ...common, input.base, ...pathArgs];
      }
    } else {
      // Commit/branch range. Two-dot so the diff reflects "what head has on
      // top of base" directly; three-dot would hide head-side history.
      args = ["diff", ...common, `${input.base}..${input.head}`, ...pathArgs];
    }

    try {
      let patch = await runGit(args, { cwd, maxBuffer: 128 * 1024 * 1024 });
      // Diffs-tab working-tree view against an arbitrary base: append
      // synthesized untracked patches so new files appear alongside tracked
      // changes. Skipped for staged-only and ref-to-ref diffs (untracked
      // is meaningless in those).
      if (
        input.head === null &&
        !input.staged &&
        input.includeUntracked &&
        (!input.paths || input.paths.length === 0)
      ) {
        patch += await composeUntrackedPatches(cwd);
      }
      return { patch };
    } catch (err) {
      // Fallback: if base can't be resolved inside this worktree (fresh clone
      // before fetch), retry with `HEAD` so the user at least sees a diff
      // rather than a cryptic stderr.
      if (
        err instanceof Error &&
        /unknown revision|bad revision/i.test(err.message) &&
        input.base !== "HEAD"
      ) {
        const retryArgs = args.map((a) => (a === input.base ? "HEAD" : a));
        let patch = await runGit(retryArgs, {
          cwd,
          maxBuffer: 128 * 1024 * 1024,
        });
        if (
          input.head === null &&
          !input.staged &&
          input.includeUntracked &&
          (!input.paths || input.paths.length === 0)
        ) {
          patch += await composeUntrackedPatches(cwd);
        }
        return { patch };
      }
      throw err;
    }
  }),

  log: publicProcedure.input(logInput).query(async ({ input }) => {
    const { worktree } = await resolveWorktree(input.repoId, input.worktreeId);
    const cwd = worktree.path;
    const limit = input.limit ?? 50;
    const cursor = input.cursor ?? 0;
    const format = `--format=%H${UNIT}%h${UNIT}%P${UNIT}%an${UNIT}%aI${UNIT}%s`;
    const range = input.base ? `${input.base}..HEAD` : "HEAD";

    const runLog = async (rangeArg: string): Promise<string> =>
      runGit(
        [
          "log",
          "--no-color",
          format,
          `--max-count=${limit + 1}`,
          `--skip=${cursor}`,
          rangeArg,
        ],
        { cwd, maxBuffer: 32 * 1024 * 1024 },
      );

    let raw: string;
    let fellBack = false;
    try {
      raw = await runLog(range);
    } catch (err) {
      // Missing `base` (shallow clone, unfetched remote) → fall back to a full
      // HEAD log so the user still sees something.
      if (
        err instanceof Error &&
        /unknown revision|bad revision|ambiguous argument/i.test(err.message) &&
        range !== "HEAD"
      ) {
        raw = await runLog("HEAD");
        fellBack = true;
      } else {
        throw err;
      }
    }

    const parsed = parseLog(raw);
    const hasMore = parsed.length > limit;
    const commits = hasMore ? parsed.slice(0, limit) : parsed;
    return {
      commits,
      nextCursor: hasMore ? cursor + limit : null,
      fellBackToHead: fellBack,
    };
  }),

  status: publicProcedure.input(worktreeScope).query(async ({ input }) => {
    const { worktree } = await resolveWorktree(input.repoId, input.worktreeId);
    const cwd = worktree.path;
    const raw = await runGit(
      ["status", "--porcelain=v1", "-z", "--untracked-files=all"],
      { cwd, maxBuffer: 32 * 1024 * 1024 },
    );
    const tokens = raw.split("\0").filter((t) => t.length > 0);

    const staged: string[] = [];
    const modified: string[] = [];
    const untracked: string[] = [];

    for (let i = 0; i < tokens.length; i++) {
      const entry = tokens[i]!;
      const x = entry[0];
      const y = entry[1];
      const path = entry.slice(3);
      // Rename/copy records are followed by the original path in a separate
      // NUL-delimited token; consume it.
      if (x === "R" || x === "C" || y === "R" || y === "C") {
        i++;
      }
      if (x === "?" && y === "?") {
        untracked.push(path);
        continue;
      }
      if (x === "!" && y === "!") continue; // ignored
      if (x !== " " && x !== "?") staged.push(path);
      if (y !== " " && y !== "?") modified.push(path);
    }

    return {
      isDirty: staged.length + modified.length + untracked.length > 0,
      staged,
      modified,
      untracked,
    };
  }),

  commitDiff: publicProcedure
    .input(commitDiffInput)
    .query(async ({ input }) => {
      const { worktree } = await resolveWorktree(
        input.repoId,
        input.worktreeId,
      );
      const cwd = worktree.path;

      const metaFormat = `--format=%H${UNIT}%h${UNIT}%P${UNIT}%an${UNIT}%ae${UNIT}%aI${UNIT}%s${UNIT}%b`;

      const [patch, metaRaw] = await Promise.all([
        // Empty --format= suppresses the default commit header; `show` handles
        // the root-commit case natively (diff against the empty tree).
        runGit(["show", "--no-color", "-M", "--format=", input.sha], {
          cwd,
          maxBuffer: 128 * 1024 * 1024,
        }),
        runGit(["show", "--no-patch", metaFormat, input.sha], {
          cwd,
          maxBuffer: 4 * 1024 * 1024,
        }),
      ]);

      // The body may contain newlines; it's the last field, so anything beyond
      // the 7 leading fields is body.
      const fields = metaRaw.replace(/\n$/, "").split(UNIT);
      const [
        sha = "",
        shortSha = "",
        parents = "",
        authorName = "",
        authorEmail = "",
        authorDate = "",
        subject = "",
        ...bodyParts
      ] = fields;
      const body = bodyParts.join(UNIT).replace(/\n+$/, "");

      return {
        patch,
        meta: {
          sha,
          shortSha,
          subject,
          body,
          authorName,
          authorEmail,
          authorDate,
          parents: parents.length > 0 ? parents.split(" ").filter(Boolean) : [],
        },
      };
    }),
});
