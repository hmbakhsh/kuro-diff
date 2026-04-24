import { cn } from "@renderer/lib/cn";

export interface WorkingTreeSummary {
  readonly staged: number;
  readonly modified: number;
  readonly untracked: number;
}

interface WorkingTreeRowProps {
  readonly summary: WorkingTreeSummary;
  readonly selected: boolean;
  readonly onSelect: () => void;
}

export function WorkingTreeRow({
  summary,
  selected,
  onSelect,
}: WorkingTreeRowProps) {
  const parts: string[] = [];
  if (summary.staged > 0) parts.push(`${summary.staged} staged`);
  if (summary.modified > 0) parts.push(`${summary.modified} modified`);
  if (summary.untracked > 0) parts.push(`${summary.untracked} untracked`);
  const summaryLine = parts.length > 0 ? parts.join(" · ") : "No changes";

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[12px]",
        selected
          ? "bg-black/10 text-zinc-900 dark:bg-white/15 dark:text-zinc-100"
          : "text-zinc-700 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10",
      )}
    >
      <span className="w-[54px] shrink-0 font-mono text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
        WT
      </span>
      <span className="min-w-0 flex-1 truncate font-medium">Working tree</span>
      <span className="shrink-0 text-[11px] text-zinc-500">{summaryLine}</span>
    </button>
  );
}
