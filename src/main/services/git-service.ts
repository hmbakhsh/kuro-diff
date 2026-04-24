import { spawn } from "node:child_process";
import { simpleGit, type SimpleGit } from "simple-git";
import { gitEnv, resolveGitBinary } from "./git-binary.js";

const DEFAULT_TIMEOUT_MS = 30_000;

export class GitCommandError extends Error {
  readonly code = "GIT_COMMAND_FAILED";
  constructor(
    message: string,
    readonly stderr: string,
    readonly exitCode: number,
  ) {
    super(message);
    this.name = "GitCommandError";
  }
}

export function createGit(cwd: string): SimpleGit {
  const { path: binary } = resolveGitBinary();
  return simpleGit(cwd, {
    binary,
    maxConcurrentProcesses: 4,
    trimmed: true,
  }).env(gitEnv());
}

export interface SpawnGitOptions {
  readonly cwd: string;
  readonly timeoutMs?: number;
  readonly maxBuffer?: number;
  readonly input?: string;
  /**
   * Exit codes that should resolve with stdout instead of throwing. Use for
   * commands where a non-zero exit is meaningful (e.g. `diff --no-index`
   * returns 1 when files differ).
   */
  readonly allowedExitCodes?: readonly number[];
}

/**
 * Run git with raw spawn + buffered stdout. Use for commands where simple-git
 * lacks a parser (custom porcelain, large streaming diffs via streamGit).
 */
export function runGit(
  args: readonly string[],
  {
    cwd,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    maxBuffer = 64 * 1024 * 1024,
    input,
    allowedExitCodes,
  }: SpawnGitOptions,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const { path: binary } = resolveGitBinary();
    const child = spawn(binary, [...args], {
      cwd,
      env: gitEnv(),
      stdio: ["pipe", "pipe", "pipe"],
    });

    const chunks: Buffer[] = [];
    const errChunks: Buffer[] = [];
    let size = 0;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (c: Buffer) => {
      size += c.length;
      if (size > maxBuffer) {
        child.kill("SIGTERM");
        reject(
          new GitCommandError(
            `git ${args[0]} output exceeded ${maxBuffer} bytes`,
            "",
            -1,
          ),
        );
        return;
      }
      chunks.push(c);
    });
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));

    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(errChunks).toString("utf8");
      if (timedOut) {
        reject(
          new GitCommandError(
            `git ${args[0]} timed out after ${timeoutMs}ms`,
            stderr,
            -1,
          ),
        );
        return;
      }
      if (
        exitCode !== 0 &&
        !(
          allowedExitCodes &&
          exitCode !== null &&
          allowedExitCodes.includes(exitCode)
        )
      ) {
        reject(
          new GitCommandError(
            `git ${args.join(" ")} exited ${exitCode}`,
            stderr,
            exitCode ?? -1,
          ),
        );
        return;
      }
      resolve(Buffer.concat(chunks).toString("utf8"));
    });

    if (input !== undefined) {
      child.stdin.write(input);
      child.stdin.end();
    }
  });
}

/**
 * Spawn git with a streaming stdout callback. For diffs that can run into
 * hundreds of MB — don't buffer.
 */
export function streamGit(
  args: readonly string[],
  opts: SpawnGitOptions,
  onChunk: (chunk: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const { path: binary } = resolveGitBinary();
    const child = spawn(binary, [...args], {
      cwd: opts.cwd,
      env: gitEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });

    const errChunks: Buffer[] = [];
    const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (s: string) => onChunk(s));
    child.stderr.on("data", (c: Buffer) => errChunks.push(c));
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (exitCode) => {
      clearTimeout(timer);
      const stderr = Buffer.concat(errChunks).toString("utf8");
      if (timedOut) {
        reject(
          new GitCommandError(
            `git ${args[0]} timed out after ${timeoutMs}ms`,
            stderr,
            -1,
          ),
        );
        return;
      }
      if (exitCode !== 0) {
        reject(
          new GitCommandError(
            `git ${args.join(" ")} exited ${exitCode}`,
            stderr,
            exitCode ?? -1,
          ),
        );
        return;
      }
      resolve();
    });
  });
}

/**
 * Synthesize new-file patches for every untracked file in the worktree.
 * Uses `git diff --no-index /dev/null <path>` (exit 1 = differences found —
 * explicitly whitelisted). Returns an empty string when nothing is untracked.
 */
export async function composeUntrackedPatches(cwd: string): Promise<string> {
  const untrackedList = await runGit(
    ["ls-files", "--others", "--exclude-standard", "-z"],
    { cwd },
  );
  const paths = untrackedList.split("\0").filter(Boolean);
  if (paths.length === 0) return "";
  const fragments: string[] = [];
  for (const p of paths) {
    try {
      const frag = await runGit(
        ["diff", "--no-color", "--no-index", "--", "/dev/null", p],
        { cwd, maxBuffer: 64 * 1024 * 1024, allowedExitCodes: [1] },
      );
      fragments.push(frag);
    } catch (err) {
      // Skip a single untracked file that blows the buffer rather than
      // failing the whole composition. A large untracked artefact shouldn't
      // hide the rest of the review.
      if (err instanceof GitCommandError && err.message.includes("exceeded"))
        continue;
      throw err;
    }
  }
  return fragments.join("");
}

/**
 * Compose a single patch representing every uncommitted change in the worktree:
 * tracked (staged + unstaged) via `git diff HEAD`, plus untracked files as
 * synthetic new-file patches.
 */
export async function composeWorkingTreeDiff(cwd: string): Promise<string> {
  const tracked = await runGit(["diff", "--no-color", "-M", "HEAD"], {
    cwd,
    maxBuffer: 128 * 1024 * 1024,
  });
  return tracked + (await composeUntrackedPatches(cwd));
}
