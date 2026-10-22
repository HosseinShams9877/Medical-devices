import { NextRequest } from 'next/server'
import { z } from 'zod'
import { withApi, requirePerm, ok } from '@/lib/api'
import { materialPlan } from '@/lib/catalog'

export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'production.create')
  const revisionId = z.string().min(1).parse(req.nextUrl.searchParams.get('revisionId'))
  const qty = z.coerce.number().int().min(1).max(500).parse(req.nextUrl.searchParams.get('qty'))
  return ok(await materialPlan(revisionId, qty))
})
