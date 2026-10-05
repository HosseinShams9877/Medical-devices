import { NextRequest } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { withApi, ok } from '@/lib/api'

export const GET = withApi(async (_req: NextRequest) => {
  const user = await getSessionUser()
  return ok({ user })
})
