import { z } from 'zod'
import { publicProcedure, router } from '../trpc.js'

export const systemRouter = router({
  ping: publicProcedure.input(z.string().optional()).query(({ input, ctx }) => ({
    pong: input ?? 'hello',
    appVersion: ctx.appVersion,
    now: new Date().toISOString(),
  })),
})
