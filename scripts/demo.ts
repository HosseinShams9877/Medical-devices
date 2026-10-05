import { db } from '../src/lib/db'
import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'
async function main() {
 if (!existsSync('.next/BUILD_ID')) throw new Error('ابتدا npm run build را اجرا کنید.')
 mkdirSync('db',{recursive:true})
 const target=path.resolve('db/demo.db')
 if (!existsSync(target)) await db.$executeRawUnsafe('VACUUM INTO ?',target)
 await db.$disconnect()
 console.log('Demo: http://127.0.0.1:3000 — isolated db/demo.db. Source data is preserved.')
 const child=spawn(process.execPath,['node_modules/next/dist/bin/next','start','--hostname','127.0.0.1','-p','3000'],{stdio:'inherit',env:{...process.env,DATABASE_URL:`file:${target}`,SESSION_COOKIE_SECURE:'false',APP_ORIGIN:'http://127.0.0.1:3000'}})
 for (const signal of ['SIGINT','SIGTERM'] as const) process.on(signal,()=>child.kill(signal))
 child.on('exit',code=>{process.exitCode=code ?? 1})
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect())
