import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { FileDiff, Virtualizer } from "@pierre/diffs/react";
import type { FileDiffMetadata } from "@pierre/diffs";
import { cn } from "@renderer/lib/cn";
import type { DiffMode } from "./DiffModeToggle";
import type { ParsedDiff } from "./useDiffFiles";

const LARGE_DIFF_THRESHOLD_BYTES = 512 * 1024;

export interface DiffViewHandle {
  scrollToFile(index: number): void;
}

interface DiffViewProps {
  parsed: ParsedDiff;
  mode: DiffMode;
  className?: string;
  onOpenFile?: (path: string) => void;
  /**
   * Identifier for the current diff context (e.g. `${base}:${head}:${staged}`).
   * Scroll persistence is keyed on this — changing it resets restoration and
   * starts a new tracking window, since a different diff has a different file
   * set and raw scrollTop wouldn't be meaningful across keys.
   */
  scrollKey?: string | null;
  initialScrollTop?: number | null;
  onScrollPersist?: (top: number) => void;
}

export const DiffView = forwardRef<DiffViewHandle, DiffViewProps>(
  function DiffView(
    {
      parsed,
      mode,
      className,
      onOpenFile,
      scrollKey = null,
      initialScrollTop = null,
      onScrollPersist,
    },
    ref,
  ) {
    const [forceLarge, setForceLarge] = useState(false);
    const fileRefs = useRef<Array<HTMLDivElement | null>>([]);
    const wrapperRef = useRef<HTMLDivElement | null>(null);
    // `restoredFor` tracks the last scrollKey we successfully (re)seeded. This
    // prevents repeated restorations from overriding the user's own scrolling.
    const restoredForRef = useRef<string | null>(null);
    const onScrollPersistRef = useRef(onScrollPersist);
    useEffect(() => {
      onScrollPersistRef.current = onScrollPersist;
    }, [onScrollPersist]);

    // Pierre's <Virtualizer> renders `<div class={className}>` as the actual
    // scroll container; our wrapper is its parent, so firstElementChild is
    // the scroller. Cached here for the imperative scroll handle and effects.
    const getScroller = (): HTMLElement | null => {
      const first = wrapperRef.current?.firstElementChild;
      return first instanceof HTMLElement ? first : null;
    };

    useImperativeHandle(ref, () => ({
      scrollToFile(index: number) {
        const el = fileRefs.current[index];
        if (!el) return;
        el.scrollIntoView({
          behavior: "instant" as ScrollBehavior,
          block: "start",
        });
      },
    }));

    // Restore scroll when the key changes. Pierre's virtualizer measures
    // content over a couple of frames, so seeking on the same tick lands us
    // at scrollHeight=viewport (i.e. 0). Two rAFs give the layout time to
    // expand enough that the target offset is reachable.
    useEffect(() => {
      if (scrollKey === null) return;
      if (restoredForRef.current === scrollKey) return;
      const top = initialScrollTop ?? 0;
      restoredForRef.current = scrollKey;
      if (top <= 0) return;
      let cancelled = false;
      const seek = (attempt: number): void => {
        if (cancelled) return;
        const scroller = getScroller();
        if (!scroller) return;
        scroller.scrollTop = top;
        // If the virtualizer hasn't expanded yet, scrollTop will clamp low.
        // Retry a few frames to catch up with async hunk rendering.
        if (scroller.scrollTop < top - 1 && attempt < 10) {
          requestAnimationFrame(() => seek(attempt + 1));
        }
      };
      requestAnimationFrame(() => seek(0));
      return () => {
        cancelled = true;
      };
    }, [scrollKey, initialScrollTop]);

    const options = useMemo(
      () => ({
        diffStyle: mode,
        diffIndicators: "bars" as const,
        theme: { dark: "github-dark", light: "github-light" } as const,
      }),
      [mode],
    );

    const renderHeaderMetadata = useMemo(() => {
      if (!onOpenFile) return undefined;
      return (fileDiff: FileDiffMetadata) => (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onOpenFile(fileDiff.name);
          }}
          title={`Open ${fileDiff.name} in Files`}
          className={cn(
            "rounded-md px-1.5 py-0.5 text-[10px] font-medium text-zinc-500",
            "hover:bg-black/10 hover:text-zinc-900",
            "dark:hover:bg-white/15 dark:hover:text-zinc-100",
          )}
        >
          Open in Files
        </button>
      );
    }, [onOpenFile]);

    const { files, binaryCount, binaryPaths, rawSize } = parsed;

    if (rawSize === 0) {
      return (
        <div
          className={cn(
            "flex h-full items-center justify-center text-xs text-zinc-500",
            className,
          )}
        >
          No changes.
        </div>
      );
    }

    if (rawSize > LARGE_DIFF_THRESHOLD_BYTES && !forceLarge) {
      return (
        <div
          className={cn(
            "flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-xs",
            className,
          )}
        >
          <p>
            This diff is large ({formatBytes(rawSize)}). Rendering it may slow
            the app down.
          </p>
          <button
            type="button"
            onClick={() => setForceLarge(true)}
            className="rounded-md border border-black/15 px-3 py-1 text-xs hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
          >
            Render anyway
          </button>
        </div>
      );
    }

    if (files.length === 0 && binaryCount === 0) {
      return (
        <div
          className={cn(
            "flex h-full items-center justify-center text-xs text-zinc-500",
            className,
          )}
        >
          No changes.
        </div>
      );
    }

    // scroll doesn't bubble, but it does fire during capture — onScrollCapture
    // at the wrapper catches the Virtualizer's internal scroll events.
    const handleScrollCapture = (e: React.UIEvent<HTMLDivElement>): void => {
      if (restoredForRef.current !== scrollKey) return;
      const target = e.target;
      if (!(target instanceof HTMLElement)) return;
      onScrollPersistRef.current?.(target.scrollTop);
    };

    return (
      <div className={cn("flex h-full min-h-0 flex-col", className)}>
        {binaryCount > 0 && (
          <div
            className={cn(
              "shrink-0 border-b border-black/10 px-3 py-1 text-[11px] text-zinc-500",
              "dark:border-white/10",
            )}
            title={binaryPaths.join("\n")}
          >
            {binaryCount} binary file
            {binaryCount === 1 ? "" : "s"} hidden
          </div>
        )}
        <div
          ref={wrapperRef}
          onScrollCapture={handleScrollCapture}
          className="min-h-0 flex-1"
        >
          <Virtualizer
            className="h-full overflow-auto"
            config={{ overscrollSize: 800 }}
          >
            <div className="flex flex-col gap-2 py-2">
              {files.map((fileDiff, i) => (
                <div
                  key={fileDiff.cacheKey ?? `${fileDiff.name}-${i}`}
                  ref={(el) => {
                    fileRefs.current[i] = el;
                  }}
                  data-diff-file-index={i}
                >
                  <FileDiff
                    fileDiff={fileDiff}
                    options={options}
                    renderHeaderMetadata={renderHeaderMetadata}
                    // Metrics drive virtualizer placeholder heights for
                    // off-screen files. `hunkLineCount` is per-file and
                    // mode-dependent — Pierre pre-computes both unified and
                    // split totals on the parsed metadata so we just pick the
                    // right one. Layout constants match Pierre's defaults for
                    // our theme; changing them requires a matching CSS override.
                    metrics={{
                      hunkLineCount:
                        mode === "split"
                          ? fileDiff.splitLineCount
                          : fileDiff.unifiedLineCount,
                      lineHeight: 20,
                      diffHeaderHeight: 44,
                      hunkSeparatorHeight: 32,
                      fileGap: 8,
                    }}
                  />
                </div>
              ))}
            </div>
          </Virtualizer>
        </div>
      </div>
    );
  },
);

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}
