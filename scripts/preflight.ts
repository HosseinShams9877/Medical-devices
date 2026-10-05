import { db } from '../src/lib/db'
import { verifyPassword } from '../src/lib/password'
import { existsSync } from 'node:fs'
async function main() {
 const errors: string[] = []
 if (!process.env.DATABASE_URL?.startsWith('file:')) errors.push('DATABASE_URL must point to persistent SQLite storage.')
 if (!process.env.APP_ORIGIN?.startsWith('https://')) errors.push('APP_ORIGIN must be the public HTTPS origin.')
 if (process.env.SESSION_COOKIE_SECURE === 'false') errors.push('Secure cookies cannot be disabled in production.')
 if (!existsSync('.next/BUILD_ID')) errors.push('Run npm run build first.')
 const users = await db.user.findMany({ where: { status: 'ACTIVE' }, select: { username: true, role: true, passwordHash: true } })
 if (!users.some(u=>u.role==='ADMIN')) errors.push('An active administrator is required.')
 for (const u of users) if (verifyPassword('demo1234',u.passwordHash)) errors.push(`Default demo password is active: ${u.username}`)
 const result = await db.$queryRawUnsafe<{ integrity_check: string }[]>('PRAGMA integrity_check')
 if (result.some(r=>r.integrity_check !== 'ok')) errors.push('SQLite integrity check failed.')
 if (errors.length) throw new Error(errors.join('\n'))
 console.log('Production preflight passed. Use one application instance and persistent db/upload/backups directories.')
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect())
