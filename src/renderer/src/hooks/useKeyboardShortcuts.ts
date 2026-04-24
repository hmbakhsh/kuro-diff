import { useEffect } from 'react'

export interface GlobalShortcutHandlers {
  onCommandPalette?: () => void
  onCopyForAgent?: () => void
}

/**
 * Window-scoped keybindings used by the command palettes. Separated from the
 * macOS menu so both sources (menu accelerator + raw keydown) converge on the
 * same dispatcher — ensures the menu item stays the canonical documentation
 * of the shortcut and the keydown fallback still fires while menu focus is
 * suppressed (e.g. during IME composition).
 */
export function useGlobalShortcuts(handlers: GlobalShortcutHandlers): void {
  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      const mod = e.metaKey || e.ctrlKey
      if (!mod) return
      if (!e.shiftKey && (e.key === 'p' || e.key === 'P')) {
        e.preventDefault()
        handlers.onCommandPalette?.()
      } else if (e.shiftKey && (e.key === 'c' || e.key === 'C')) {
        e.preventDefault()
        handlers.onCopyForAgent?.()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [handlers])
}
