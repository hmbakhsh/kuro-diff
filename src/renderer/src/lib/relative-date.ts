/**
 * Compact relative-time string for commit dates: "now", "5m", "2h", "3d", and
 * then falls back to a localized month/day (with year if the date is in a
 * different year from `now`). Parses ISO strings via `new Date`.
 */
export function formatRelative(input: string | Date, now: Date = new Date()): string {
  const d = typeof input === 'string' ? new Date(input) : input
  if (Number.isNaN(d.getTime())) return ''
  const diffMs = now.getTime() - d.getTime()
  const mins = Math.max(0, Math.round(diffMs / 60_000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.round(hours / 24)
  if (days < 7) return `${days}d`
  const sameYear = d.getFullYear() === now.getFullYear()
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(sameYear ? {} : { year: 'numeric' }),
  })
}
