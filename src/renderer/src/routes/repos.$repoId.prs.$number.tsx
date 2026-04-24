import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod'
import { PRDetail } from '@renderer/components/prs/PRDetail'

const params = z.object({
  repoId: z.string().uuid(),
  number: z.string().regex(/^\d+$/),
})

export const Route = createFileRoute('/repos/$repoId/prs/$number')({
  parseParams: (raw) => params.parse(raw),
  component: PRRoute,
})

function PRRoute() {
  const { repoId, number } = Route.useParams()
  return <PRDetail repoId={repoId} number={Number(number)} />
}
