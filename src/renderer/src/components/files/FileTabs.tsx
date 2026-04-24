import { useMemo } from "react";
import { cn } from "@renderer/lib/cn";

interface FileTabsProps {
  openPaths: string[];
  activePath: string | null;
  onSelect(path: string): void;
  onClose(path: string): void;
  className?: string;
}

export function FileTabs({
  openPaths,
  activePath,
  onSelect,
  onClose,
  className,
}: FileTabsProps) {
  const labels = useMemo(() => labelTabs(openPaths), [openPaths]);
  if (openPaths.length === 0) return null;
  return (
    <div
      className={cn(
        "flex shrink-0 items-stretch overflow-x-auto border-b border-black/10 text-[12px]",
        "dark:border-white/10",
        className,
      )}
      role="tablist"
    >
      {openPaths.map((path) => {
        const isActive = path === activePath;
        const label = labels[path] ?? basename(path);
        return (
          <div
            key={path}
            role="tab"
            aria-selected={isActive}
            tabIndex={isActive ? 0 : -1}
            title={path}
            onClick={() => onSelect(path)}
            onAuxClick={(e) => {
              if (e.button === 1) {
                e.preventDefault();
                onClose(path);
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onSelect(path);
              }
            }}
            className={cn(
              "group flex shrink-0 cursor-pointer select-none items-center gap-1.5 border-r border-black/10 px-3 py-1.5",
              "dark:border-white/10",
              isActive
                ? "bg-black/5 text-zinc-900 dark:bg-white/10 dark:text-zinc-100"
                : "text-zinc-500 hover:bg-black/5 hover:text-zinc-800 dark:text-zinc-400 dark:hover:bg-white/5 dark:hover:text-zinc-200",
            )}
          >
            <span className="truncate">{label}</span>
            <button
              type="button"
              aria-label={`Close ${path}`}
              onClick={(e) => {
                e.stopPropagation();
                onClose(path);
              }}
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded text-zinc-400",
                "hover:bg-black/10 hover:text-zinc-900",
                "dark:text-zinc-500 dark:hover:bg-white/15 dark:hover:text-zinc-100",
                !isActive && "opacity-0 group-hover:opacity-100",
              )}
            >
              ×
            </button>
          </div>
        );
      })}
    </div>
  );
}

function basename(path: string): string {
  const i = path.lastIndexOf("/");
  return i === -1 ? path : path.slice(i + 1);
}

// When two open paths share a basename, disambiguate by appending just enough
// of the parent directory so the labels differ. For single-collision cases
// this is usually one segment; for deep shared roots we keep walking up.
function labelTabs(paths: string[]): Record<string, string> {
  const groups = new Map<string, string[]>();
  for (const p of paths) {
    const base = basename(p);
    const arr = groups.get(base) ?? [];
    arr.push(p);
    groups.set(base, arr);
  }
  const out: Record<string, string> = {};
  for (const [base, members] of groups) {
    if (members.length === 1) {
      out[members[0]!] = base;
      continue;
    }
    const segs = members.map((m) => m.split("/").slice(0, -1));
    let depth = 1;
    // Grow the parent-dir suffix until every member in the group is unique.
    while (true) {
      const suffixes = segs.map((s) => s.slice(-depth).join("/"));
      if (new Set(suffixes).size === suffixes.length) {
        for (let i = 0; i < members.length; i++) {
          out[members[i]!] = `${base} — ${suffixes[i]}`;
        }
        break;
      }
      if (depth >= Math.max(...segs.map((s) => s.length))) {
        // Ran out of segments — fall back to full relative paths.
        for (let i = 0; i < members.length; i++) out[members[i]!] = members[i]!;
        break;
      }
      depth++;
    }
  }
  return out;
}
