import { useEffect } from 'react'
import { ThemeProvider, useTheme } from 'next-themes'
import { trpc } from '@renderer/trpc'

/**
 * Bridges the persisted `preferences.theme` value to `next-themes`. The Pierre
 * diff components read Tailwind's `.dark` class via `@pierre/theme` tokens, so
 * attribute='class' keeps their styling in sync automatically.
 */
export function ThemeRoot({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      storageKey="kuro-diff-theme"
    >
      <PreferenceThemeSync />
      {children}
    </ThemeProvider>
  )
}

function PreferenceThemeSync() {
  const { theme, setTheme } = useTheme()
  const prefs = trpc.preferences.get.useQuery(undefined, { staleTime: 60_000 })

  useEffect(() => {
    const pref = prefs.data?.theme
    if (!pref) return
    if (pref !== theme) setTheme(pref)
  }, [prefs.data?.theme, setTheme, theme])

  return null
}
