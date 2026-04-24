import { createTRPCReact } from '@trpc/react-query'
import type { AppRouter } from '../../main/trpc/router'

// Type-only import — AppRouter is erased at build time, so no main code
// reaches the renderer bundle.
export const trpc = createTRPCReact<AppRouter>()
