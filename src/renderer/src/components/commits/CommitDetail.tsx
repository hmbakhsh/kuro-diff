import { DiffView } from "@renderer/components/diffs/DiffView";
import type { DiffMode } from "@renderer/components/diffs/DiffModeToggle";
import { useDiffFiles } from "@renderer/components/diffs/useDiffFiles";
import { cn } from "@renderer/lib/cn";
import { formatRelative } from "@renderer/lib/relative-date";

export interface CommitMeta {
  readonly sha: string;
  readonly shortSha: string;
  readonly subject: string;
  readonly body: string;
  readonly authorName: string;
  readonly authorEmail: string;
  readonly authorDate: string;
  readonly parents: string[];
}

interface BaseProps {
  readonly mode: DiffMode;
  readonly cacheKey: string;
  readonly patch: string | null;
  readonly isPending: boolean;
  readonly error: string | null;
  readonly onOpenFile?: (path: string) => void;
}

interface CommitDetailProps extends BaseProps {
  readonly scope: "commit";
  readonly meta: CommitMeta | null;
}

interface WorkingTreeDetailProps extends BaseProps {
  readonly scope: "wt";
  readonly branch: string | null;
  readonly counts: { staged: number; modified: number; untracked: number };
}

type Props = CommitDetailProps | WorkingTreeDetailProps;

export function CommitDetail(props: Props) {
  const parsed = useDiffFiles(props.patch ?? "", props.cacheKey);
  return (
    <div className="flex h-full min-h-0 flex-1 flex-col">
      <Header {...props} />
      <div className="min-h-0 flex-1">
        {props.error && (
          <div className="p-4 text-xs text-red-500">{props.error}</div>
        )}
        {!props.error && props.isPending && (
          <div className="p-4 text-xs text-zinc-500">Loading diff…</div>
        )}
        {!props.error && !props.isPending && props.patch !== null && (
          <DiffView
            parsed={parsed}
            mode={props.mode}
            onOpenFile={props.onOpenFile}
          />
        )}
      </div>
    </div>
  );
}

function Header(props: Props) {
  if (props.scope === "commit") {
    const { meta } = props;
    if (!meta) {
      return (
        <div className="shrink-0 border-b border-black/10 px-4 py-2 text-[12px] text-zinc-500 dark:border-white/10">
          Select a commit
        </div>
      );
    }
    return (
      <div className="shrink-0 border-b border-black/10 px-4 py-2 dark:border-white/10">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => void navigator.clipboard.writeText(meta.sha)}
            title={`Copy ${meta.sha}`}
            className={cn(
              "font-mono text-[11px] text-zinc-500",
              "hover:text-zinc-900 dark:hover:text-zinc-100",
            )}
          >
            {meta.shortSha}
          </button>
          <span className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
            {meta.subject}
          </span>
          <span className="ml-auto shrink-0 text-[11px] text-zinc-500">
            {meta.authorName} · {formatRelative(meta.authorDate)}
          </span>
        </div>
        {meta.body.length > 0 && (
          <details className="mt-1 text-[11.5px] text-zinc-600 dark:text-zinc-400">
            <summary className="cursor-pointer select-none text-[11px] text-zinc-500">
              Message
            </summary>
            <pre className="whitespace-pre-wrap pt-1 font-sans">
              {meta.body}
            </pre>
          </details>
        )}
      </div>
    );
  }

  const summaryLine = [
    props.counts.staged > 0 ? `${props.counts.staged} staged` : null,
    props.counts.modified > 0 ? `${props.counts.modified} modified` : null,
    props.counts.untracked > 0 ? `${props.counts.untracked} untracked` : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="shrink-0 border-b border-black/10 px-4 py-2 dark:border-white/10">
      <div className="flex items-center gap-3">
        <span className="font-mono text-[11px] uppercase tracking-wide text-amber-600 dark:text-amber-400">
          WT
        </span>
        <span className="text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
          Working tree
        </span>
        <span className="ml-auto shrink-0 text-[11px] text-zinc-500">
          {props.branch ? `on ${props.branch} · ` : ""}
          {summaryLine || "No changes"}
        </span>
      </div>
    </div>
  );
}
