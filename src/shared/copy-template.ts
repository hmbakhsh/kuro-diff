// Single source of truth for the copy-for-agent formatting.
// Phase 6 wires this into the hook + palette; Phase 1 lands the contract only.

export type CopyPreset = 'markdown-fence' | 'claude-xml'

export interface CopyPayload {
  readonly repoName: string
  readonly relativePath: string
  readonly lineStart: number
  readonly lineEnd: number
  readonly sha: string | null
  readonly branch: string | null
  readonly language: string | null
  readonly content: string
}

const languageFence = (lang: string | null): string => lang ?? ''

export function formatForAgent(payload: CopyPayload, preset: CopyPreset): string {
  if (preset === 'claude-xml') {
    const attrs = [
      `path="${payload.relativePath}"`,
      `lines="L${payload.lineStart}-L${payload.lineEnd}"`,
      payload.sha ? `sha="${payload.sha}"` : null,
      payload.branch ? `branch="${payload.branch}"` : null,
    ]
      .filter(Boolean)
      .join(' ')
    return `<file ${attrs}>\n${payload.content}\n</file>\n`
  }

  // Default: markdown-fence
  const header = [
    `// ${payload.repoName}/${payload.relativePath}`,
    `L${payload.lineStart}-L${payload.lineEnd}`,
    payload.sha ? `@ ${payload.sha}` : null,
  ]
    .filter(Boolean)
    .join(' ')
  return `${header}\n\`\`\`${languageFence(payload.language)}\n${payload.content}\n\`\`\`\n`
}
