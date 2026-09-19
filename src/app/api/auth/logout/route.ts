import { NextRequest } from 'next/server'
import { destroySession, getSessionUser } from '@/lib/auth'
import { audit } from '@/lib/audit'
import { withApi, ok } from '@/lib/api'

export const POST = withApi(async (req: NextRequest) => {
  const user = await getSessionUser()
  await destroySession()
  if (user) await audit(req, user, 'AUTH_LOGOUT', {})
  return ok({ success: true })
})
