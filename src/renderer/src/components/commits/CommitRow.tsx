import { cn } from "@renderer/lib/cn";
import { formatRelative } from "@renderer/lib/relative-date";

export interface CommitRowCommit {
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
  readonly authorDate: string;
}

interface CommitRowProps {
  readonly commit: CommitRowCommit;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

export function CommitRow({ commit, selected, onSelect }: CommitRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      title={commit.subject}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
        selected
          ? "bg-black/10 text-zinc-900 dark:bg-white/15 dark:text-zinc-100"
          : "text-zinc-700 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10",
      )}
    >
      <span className="w-[54px] shrink-0 font-mono text-[11px] text-zinc-500">
        {commit.shortSha}
      </span>
      <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
      <span className="shrink-0 text-[11px] text-zinc-500">
        {formatRelative(commit.authorDate)}
      </span>
    </button>
  );
}
