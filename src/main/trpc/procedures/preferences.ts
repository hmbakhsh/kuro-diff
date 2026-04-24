import { z } from 'zod'
import { publicProcedure, router } from '../trpc.js'
import {
  getPreferences,
  setCompareBase,
  setPreferences,
} from '../../services/workspace-store.js'

const preferencesPatch = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  diffMode: z.enum(['unified', 'split']).optional(),
  font: z.string().min(1).optional(),
  copyPreset: z.enum(['markdown-fence', 'claude-xml']).optional(),
  showIgnoredFiles: z.boolean().optional(),
})

const compareBaseInput = z.object({
  key: z.string().min(1),
  base: z.string().min(1),
})

export const preferencesRouter = router({
  get: publicProcedure.query(async () => getPreferences()),
  set: publicProcedure.input(preferencesPatch).mutation(async ({ input }) => {
    return setPreferences(input)
  }),
  setCompareBase: publicProcedure
    .input(compareBaseInput)
    .mutation(async ({ input }) => {
      return setCompareBase(input.key, input.base)
    }),
})
