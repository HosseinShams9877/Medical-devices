import { spawnSync } from 'node:child_process'
import { createRequire } from 'node:module'
process.env.NODE_ENV = 'production'
await import('./load-env.mjs')
const port = Number(process.env.PORT || 3000)
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('PORT must be 1..65535')
const result = spawnSync(process.execPath, ['--import', './scripts/load-env.mjs', '--import', 'tsx', 'scripts/preflight.ts'], { cwd: process.cwd(), env: process.env, stdio: 'inherit' })
if (result.error) throw result.error
if (result.status !== 0) process.exit(result.status || 1)
process.argv = [process.execPath, 'next', 'start', '--hostname', '127.0.0.1', '-p', String(port)]
createRequire(import.meta.url)('next/dist/bin/next')
