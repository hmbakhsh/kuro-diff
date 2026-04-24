import { useCallback } from 'react'
import { formatForAgent, type CopyPreset } from '@shared/copy-template'
import { useCaptureStore } from '@renderer/lib/capture-context'
import { trpc } from '@renderer/trpc'

export interface CopyAction {
  readonly id:
    | 'copy-selection'
    | 'copy-path'
    | 'copy-content'
    | 'copy-diff'
  readonly label: string
  readonly description: string
  readonly available: boolean
  readonly run: () => Promise<void>
}

/**
 * Read the user's current text selection, clamped to the Pierre viewer. When
 * the selection crosses multiple `[data-line]` rows we use the lowest and
 * highest line numbers; otherwise we fall back to the selection's geometry.
 */
function readSelection(): { text: string; lineStart: number; lineEnd: number } | null {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return null
  const text = selection.toString()
  if (text.length === 0) return null

  let start = Number.POSITIVE_INFINITY
  let end = Number.NEGATIVE_INFINITY

  for (let i = 0; i < selection.rangeCount; i++) {
    const range = selection.getRangeAt(i)
    const nodes = collectLineNodes(range)
    for (const node of nodes) {
      const raw = node.getAttribute('data-line')
      if (!raw) continue
      const n = Number(raw)
      if (Number.isNaN(n)) continue
      if (n < start) start = n
      if (n > end) end = n
    }
  }

  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { text, lineStart: start, lineEnd: end }
}

function collectLineNodes(range: Range): HTMLElement[] {
  const common = range.commonAncestorContainer
  const root: Element =
    common.nodeType === Node.ELEMENT_NODE
      ? (common as Element)
      : (common.parentElement ?? (common.getRootNode() as Element))
  const out: HTMLElement[] = []
  // Walk the containing element for any `[data-line]` descendants that sit
  // inside the range. A TreeWalker on the common ancestor misses shadow DOM
  // hops, so we pick up start/end line nodes via the range's boundary
  // containers as well.
  const startLine = closestLine(range.startContainer)
  const endLine = closestLine(range.endContainer)
  if (startLine) out.push(startLine)
  if (endLine && endLine !== startLine) out.push(endLine)
  root.querySelectorAll?.('[data-line]').forEach((el) => {
    if (range.intersectsNode(el)) out.push(el as HTMLElement)
  })
  return out
}

function closestLine(node: Node): HTMLElement | null {
  let cur: Node | null = node
  while (cur) {
    if (cur instanceof HTMLElement && cur.hasAttribute('data-line')) return cur
    cur = cur.parentNode
  }
  return null
}

async function writeClipboard(text: string, fallback: (text: string) => Promise<void>): Promise<void> {
  try {
    await navigator.clipboard.writeText(text)
  } catch {
    await fallback(text)
  }
}

export interface CopyActionsArgs {
  readonly preset: CopyPreset
}

export function useCopyForAgent({ preset }: CopyActionsArgs): {
  actions: CopyAction[]
  copySelection: () => Promise<string | null>
} {
  const { target } = useCaptureStore()
  const copyViaMain = trpc.system.copyText.useMutation()

  const writeFallback = useCallback(
    async (text: string) => {
      await copyViaMain.mutateAsync({ text })
    },
    [copyViaMain],
  )

  const copySelection = useCallback(async (): Promise<string | null> => {
    if (!target) return null
    const sel = readSelection()
    if (!sel) return null
    const clamped = Math.min(sel.lineEnd, Math.max(sel.lineStart, target.lineCount))
    const payload = formatForAgent(
      {
        repoName: target.repoName,
        relativePath: target.relativePath,
        lineStart: sel.lineStart,
        lineEnd: clamped,
        sha: target.sha,
        branch: target.branch,
        language: target.language,
        content: sel.text,
      },
      preset,
    )
    await writeClipboard(payload, writeFallback)
    return payload
  }, [target, preset, writeFallback])

  const copyPath = useCallback(async (): Promise<void> => {
    if (!target) return
    const qualified = target.branch
      ? `${target.repoName}/${target.relativePath}@${target.branch}`
      : `${target.repoName}/${target.relativePath}`
    await writeClipboard(qualified, writeFallback)
  }, [target, writeFallback])

  const copyContent = useCallback(async (): Promise<void> => {
    if (!target || !target.contents) return
    const payload = formatForAgent(
      {
        repoName: target.repoName,
        relativePath: target.relativePath,
        lineStart: 1,
        lineEnd: target.lineCount,
        sha: target.sha,
        branch: target.branch,
        language: target.language,
        content: target.contents,
      },
      preset,
    )
    await writeClipboard(payload, writeFallback)
  }, [target, preset, writeFallback])

  const copyDiff = useCallback(async (): Promise<void> => {
    if (!target?.diff) return
    const header = `// ${target.repoName}/${target.relativePath}  ${target.diff.base}…${target.diff.head ?? 'working-tree'}`
    const body =
      preset === 'claude-xml'
        ? `<diff path="${target.relativePath}" base="${target.diff.base}" head="${target.diff.head ?? 'working-tree'}">\n${target.diff.patch}\n</diff>\n`
        : `${header}\n\`\`\`diff\n${target.diff.patch}\n\`\`\`\n`
    await writeClipboard(body, writeFallback)
  }, [target, preset, writeFallback])

  const actions: CopyAction[] = [
    {
      id: 'copy-selection',
      label: 'Copy selection',
      description: 'Selected text with file/line metadata',
      available: !!target,
      run: async () => {
        await copySelection()
      },
    },
    {
      id: 'copy-path',
      label: 'Copy file path',
      description: target?.relativePath ?? 'No file in focus',
      available: !!target,
      run: copyPath,
    },
    {
      id: 'copy-content',
      label: 'Copy file content',
      description: 'Entire file as an agent block',
      available: !!(target && target.contents),
      run: copyContent,
    },
    {
      id: 'copy-diff',
      label: 'Copy diff for this file',
      description: 'Patch body with base/head headers',
      available: !!(target && target.diff),
      run: copyDiff,
    },
  ]

  return { actions, copySelection }
}
