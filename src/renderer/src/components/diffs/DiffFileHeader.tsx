import { useMemo } from 'react'
import type { FileDiffMetadata } from '@pierre/diffs'
import { cn } from '@renderer/lib/cn'

interface DiffFileHeaderProps {
  readonly file: FileDiffMetadata
  readonly onOpen?: (path: string) => void
}

export function DiffFileHeader({ file, onOpen }: DiffFileHeaderProps) {
  const { additions, deletions } = useMemo(() => {
    let add = 0
    let del = 0
    for (const hunk of file.hunks) {
      add += hunk.additionLines
      del += hunk.deletionLines
    }
    return { additions: add, deletions: del }
  }, [file.hunks])

  const showDeletions = deletions > 0 || additions === 0
  const showAdditions = additions > 0 || deletions === 0
  const showRename = file.prevName != null && file.prevName !== file.name

  return (
    <div
      className={cn(
        'sticky top-0 z-[1] flex min-h-[2.5rem] flex-row items-center justify-between gap-2 px-4',
        'bg-white dark:bg-black',
        'border-b border-black/10 dark:border-white/10',
        'text-[13px] text-zinc-800 dark:text-zinc-200',
        'font-sans',
      )}
      data-diffs-header-replica
    >
      <div className="flex min-w-0 flex-row items-center gap-2">
        <ChangeIcon type={file.type} />
        {showRename && (
          <>
            <span
              className="min-w-0 shrink overflow-hidden text-ellipsis whitespace-nowrap opacity-70"
              style={{ direction: 'rtl', textAlign: 'left' }}
            >
              <bdi>{file.prevName}</bdi>
            </span>
            <ArrowRightIcon />
          </>
        )}
        <span
          className="min-w-0 shrink overflow-hidden text-ellipsis whitespace-nowrap"
          style={{ direction: 'rtl', textAlign: 'left' }}
        >
          <bdi>{file.name}</bdi>
        </span>
      </div>
      <div className="flex shrink-0 flex-row items-center gap-[1ch]">
        {showDeletions && (
          <span className="font-mono text-[#ff2e3f] dark:text-[#ff6762]">
            {`-${deletions}`}
          </span>
        )}
        {showAdditions && (
          <span className="font-mono text-[#0dbe4e] dark:text-[#5ecc71]">
            {`+${additions}`}
          </span>
        )}
        {onOpen && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              onOpen(file.name)
            }}
            title={`Open ${file.name} in Files`}
            className={cn(
              'ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-medium text-zinc-500',
              'hover:bg-black/10 hover:text-zinc-900',
              'dark:hover:bg-white/15 dark:hover:text-zinc-100',
            )}
          >
            Open in Files
          </button>
        )}
      </div>
    </div>
  )
}

function ChangeIcon({ type }: { type: FileDiffMetadata['type'] }) {
  const color = changeIconColor(type)
  switch (type) {
    case 'new':
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          className={cn('shrink-0', color)}
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M8 4a.75.75 0 0 1 .75.75v2.5h2.5a.75.75 0 0 1 0 1.5h-2.5v2.5a.75.75 0 0 1-1.5 0v-2.5h-2.5a.75.75 0 0 1 0-1.5h2.5v-2.5A.75.75 0 0 1 8 4"
          />
          <path
            fill="currentColor"
            d="M1.788 4.296c.196-.88.478-1.381.802-1.706s.826-.606 1.706-.802C5.194 1.588 6.387 1.5 8 1.5s2.806.088 3.704.288c.88.196 1.381.478 1.706.802s.607.826.802 1.706c.2.898.288 2.091.288 3.704s-.088 2.806-.288 3.704c-.195.88-.478 1.381-.802 1.706s-.826.607-1.706.802c-.898.2-2.091.288-3.704.288s-2.806-.088-3.704-.288c-.88-.195-1.381-.478-1.706-.802s-.606-.826-.802-1.706C1.588 10.806 1.5 9.613 1.5 8s.088-2.806.288-3.704M8 0C1.412 0 0 1.412 0 8s1.412 8 8 8 8-1.412 8-8-1.412-8-8-8"
          />
        </svg>
      )
    case 'deleted':
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          className={cn('shrink-0', color)}
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M4 8a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 4 8"
          />
          <path
            fill="currentColor"
            d="M1.788 4.296c.196-.88.478-1.381.802-1.706s.826-.606 1.706-.802C5.194 1.588 6.387 1.5 8 1.5s2.806.088 3.704.288c.88.196 1.381.478 1.706.802s.607.826.802 1.706c.2.898.288 2.091.288 3.704s-.088 2.806-.288 3.704c-.195.88-.478 1.381-.802 1.706s-.826.607-1.706.802c-.898.2-2.091.288-3.704.288s-2.806-.088-3.704-.288c-.88-.195-1.381-.478-1.706-.802s-.606-.826-.802-1.706C1.588 10.806 1.5 9.613 1.5 8s.088-2.806.288-3.704M8 0C1.412 0 0 1.412 0 8s1.412 8 8 8 8-1.412 8-8-1.412-8-8-8"
          />
        </svg>
      )
    case 'rename-pure':
    case 'rename-changed':
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          className={cn('shrink-0', color)}
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M1.788 4.296c.196-.88.478-1.381.802-1.706s.826-.606 1.706-.802C5.194 1.588 6.387 1.5 8 1.5s2.806.088 3.704.288c.88.196 1.381.478 1.706.802s.607.826.802 1.706c.2.898.288 2.091.288 3.704s-.088 2.806-.288 3.704c-.195.88-.478 1.381-.802 1.706s-.826.607-1.706.802c-.898.2-2.091.288-3.704.288s-2.806-.088-3.704-.288c-.88-.195-1.381-.478-1.706-.802s-.606-.826-.802-1.706C1.588 10.806 1.5 9.613 1.5 8s.088-2.806.288-3.704M8 0C1.412 0 0 1.412 0 8s1.412 8 8 8 8-1.412 8-8-1.412-8-8-8"
          />
          <path
            fill="currentColor"
            d="M8.495 4.695a.75.75 0 0 0-.05 1.06L10.486 8l-2.041 2.246a.75.75 0 0 0 1.11 1.008l2.5-2.75a.75.75 0 0 0 0-1.008l-2.5-2.75a.75.75 0 0 0-1.06-.051m-4 0a.75.75 0 0 0-.05 1.06l2.044 2.248-1.796 1.995a.75.75 0 0 0 1.114 1.004l2.25-2.5a.75.75 0 0 0-.002-1.007l-2.5-2.75a.75.75 0 0 0-1.06-.05"
          />
        </svg>
      )
    case 'change':
    default:
      return (
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          className={cn('shrink-0', color)}
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M1.5 8c0 1.613.088 2.806.288 3.704.196.88.478 1.381.802 1.706s.826.607 1.706.802c.898.2 2.091.288 3.704.288s2.806-.088 3.704-.288c.88-.195 1.381-.478 1.706-.802s.607-.826.802-1.706c.2-.898.288-2.091.288-3.704s-.088-2.806-.288-3.704c-.195-.88-.478-1.381-.802-1.706s-.826-.606-1.706-.802C10.806 1.588 9.613 1.5 8 1.5s-2.806.088-3.704.288c-.88.196-1.381.478-1.706.802s-.606.826-.802 1.706C1.588 5.194 1.5 6.387 1.5 8M0 8c0-6.588 1.412-8 8-8s8 1.412 8 8-1.412 8-8 8-8-1.412-8-8m8 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6"
          />
        </svg>
      )
  }
}

function ArrowRightIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      className="shrink-0 text-zinc-500 dark:text-zinc-400"
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M8.47 4.22a.75.75 0 0 0 0 1.06l1.97 1.97H3.75a.75.75 0 0 0 0 1.5h6.69l-1.97 1.97a.75.75 0 1 0 1.06 1.06l3.25-3.25a.75.75 0 0 0 0-1.06L9.53 4.22a.75.75 0 0 0-1.06 0"
      />
    </svg>
  )
}

function changeIconColor(type: FileDiffMetadata['type']): string {
  switch (type) {
    case 'new':
      return 'text-[#0dbe4e] dark:text-[#5ecc71]'
    case 'deleted':
      return 'text-[#ff2e3f] dark:text-[#ff6762]'
    case 'rename-pure':
    case 'rename-changed':
    case 'change':
    default:
      return 'text-[#009fff] dark:text-[#69b1ff]'
  }
}
