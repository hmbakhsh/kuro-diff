import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

/**
 * The "what is the user looking at?" target used by Cmd+Shift+C. Any view that
 * wants to contribute a source for copy-for-agent (file viewer, diff viewer,
 * PR detail) pushes into this context while mounted; the palette reads it
 * plus the current `window.getSelection()` to build the payload.
 */
export interface CaptureTarget {
  readonly repoId: string
  readonly repoName: string
  readonly worktreeId: string | null
  readonly relativePath: string
  readonly contents: string | null
  readonly sha: string | null
  readonly branch: string | null
  readonly language: string | null
  /** Used to clamp the selection line-end for long files. */
  readonly lineCount: number
  /**
   * Optional diff payload a diff-view registers. When present the palette
   * exposes a "Copy diff for this file" action.
   */
  readonly diff: {
    readonly patch: string
    readonly base: string
    readonly head: string | null
  } | null
}

interface CaptureStore {
  readonly target: CaptureTarget | null
  readonly register: (token: symbol, target: CaptureTarget) => void
  readonly unregister: (token: symbol) => void
}

export const CaptureStoreContext = createContext<CaptureStore | null>(null)

export function useCaptureStore(): CaptureStore {
  const store = useContext(CaptureStoreContext)
  if (!store) throw new Error('CaptureStoreContext not mounted')
  return store
}

export function useCaptureTarget(): CaptureTarget | null {
  return useCaptureStore().target
}

/**
 * Mount-scoped registration of a capture target. Each caller owns a private
 * symbol so stacked mounts (A → B → unmount A) don't clobber the live owner.
 * Last register wins for read; unregister only fires if this caller still owns.
 *
 * Effect dependencies key off a stable primitive signature so callers that
 * rebuild the target object every render (without changing its contents) don't
 * loop through register → setTarget → re-render → rebuild → register.
 */
export function useRegisterCapture(target: CaptureTarget | null): void {
  const { register, unregister } = useCaptureStore()
  const token = useMemo(() => Symbol('capture'), [])
  const signature = target ? targetSignature(target) : null
  const latest = useRef(target)
  latest.current = target
  useEffect(() => {
    if (!latest.current) return
    register(token, latest.current)
    return () => unregister(token)
  }, [signature, register, unregister, token])
}

function targetSignature(t: CaptureTarget): string {
  return [
    t.repoId,
    t.worktreeId ?? '',
    t.relativePath,
    t.sha ?? '',
    t.branch ?? '',
    t.language ?? '',
    t.lineCount,
    t.contents?.length ?? -1,
    t.diff?.base ?? '',
    t.diff?.head ?? '',
    t.diff?.patch.length ?? -1,
  ].join('\x1f')
}

/**
 * Hook used by the root provider to construct a capture store. Keeps a stack
 * of registered targets so the most recent still-mounted source is exposed
 * even when registrations overlap across renders.
 */
export function useProvideCaptureStore(): CaptureStore {
  const [target, setTarget] = useState<CaptureTarget | null>(null)
  const stackRef = useRef<Array<{ token: symbol; target: CaptureTarget }>>([])

  const register = useCallback((token: symbol, t: CaptureTarget) => {
    const stack = stackRef.current
    const idx = stack.findIndex((e) => e.token === token)
    if (idx >= 0) stack.splice(idx, 1)
    stack.push({ token, target: t })
    setTarget(t)
  }, [])

  const unregister = useCallback((token: symbol) => {
    const stack = stackRef.current
    const idx = stack.findIndex((e) => e.token === token)
    if (idx < 0) return
    stack.splice(idx, 1)
    setTarget(stack.length > 0 ? stack[stack.length - 1]!.target : null)
  }, [])

  return useMemo<CaptureStore>(
    () => ({ target, register, unregister }),
    [target, register, unregister],
  )
}
