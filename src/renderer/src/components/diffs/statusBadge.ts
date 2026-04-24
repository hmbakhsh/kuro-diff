import type { FileDiffMetadata } from '@pierre/diffs'

export interface StatusBadge {
  readonly label: string
  readonly className: string
}

export const UNTRACKED_BADGE: StatusBadge = {
  label: 'U',
  className: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
}

export function statusBadge(type: FileDiffMetadata['type']): StatusBadge {
  switch (type) {
    case 'new':
      return {
        label: 'A',
        className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
      }
    case 'deleted':
      return {
        label: 'D',
        className: 'bg-red-500/15 text-red-600 dark:text-red-400',
      }
    case 'rename-pure':
    case 'rename-changed':
      return {
        label: 'R',
        className: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
      }
    case 'change':
    default:
      return {
        label: 'M',
        className: 'bg-sky-500/15 text-sky-600 dark:text-sky-400',
      }
  }
}
