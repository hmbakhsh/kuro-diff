import { spawn } from 'node:child_process'
import { clipboard, shell } from 'electron'
import { z } from 'zod'
import { TRPCError } from '@trpc/server'
import { publicProcedure, router } from '../trpc.js'
import { resolveWorktree } from '../../services/workspace-lookup.js'

const OPEN_TARGETS = ['ghostty', 'finder'] as const
export type OpenTarget = (typeof OPEN_TARGETS)[number]

const openPathInput = z.object({
  repoId: z.string().uuid(),
  worktreeId: z.string().min(1).nullable().optional(),
  target: z.enum(OPEN_TARGETS),
})

const copyTextInput = z.object({ text: z.string().max(5 * 1024 * 1024) })

export const systemRouter = router({
  ping: publicProcedure.input(z.string().optional()).query(({ input, ctx }) => ({
    pong: input ?? 'hello',
    appVersion: ctx.appVersion,
    now: new Date().toISOString(),
  })),

  /**
   * Fallback clipboard writer for programmatic (non-user-gesture) copies. The
   * renderer prefers `navigator.clipboard.writeText`; this path only runs
   * when the DOM permission check fails (rare but possible in Electron when
   * the window lost focus mid-copy).
   */
  copyText: publicProcedure.input(copyTextInput).mutation(({ input }) => {
    clipboard.writeText(input.text)
    return { ok: true as const }
  }),

  /**
   * Open the resolved worktree directory in an external app. The path is
   * server-resolved so the renderer can't smuggle arbitrary dirs through.
   *
   * - `ghostty`: `open -a Ghostty <path>` → new tab in the existing window
   *   (no accessibility permission needed). macOS only.
   * - `finder`: Electron's `shell.openPath` → native file manager. Cross-
   *   platform, but labeled "Finder" in the UI since this app is macOS-first.
   */
  openPath: publicProcedure.input(openPathInput).mutation(async ({ input }) => {
    const { worktree } = await resolveWorktree(input.repoId, input.worktreeId)
    if (input.target === 'ghostty') {
      if (process.platform !== 'darwin') {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: 'Open in Ghostty is only supported on macOS',
        })
      }
      await openInGhostty(worktree.path)
    } else {
      const err = await shell.openPath(worktree.path)
      if (err) {
        throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: err })
      }
    }
    return { ok: true as const }
  }),
})

/**
 * `open -a Ghostty <dir>` — Ghostty's macOS app handles the Apple "open"
 * event by creating a new tab in the existing window with <dir> as the
 * working directory. No accessibility permission required, unlike the
 * keystroke-driven alternative.
 */
async function openInGhostty(dir: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const proc = spawn('open', ['-a', 'Ghostty', dir], {
      stdio: ['ignore', 'ignore', 'pipe'],
    })
    let stderr = ''
    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) resolve()
      else
        reject(
          new TRPCError({
            code: 'INTERNAL_SERVER_ERROR',
            message:
              stderr.trim() ||
              `Failed to open Ghostty (exit ${code}) — is it installed?`,
          }),
        )
    })
  })
}
