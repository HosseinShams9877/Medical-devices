import { spawn, spawnSync } from 'node:child_process'
import { writeFileSync, mkdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomUUID } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'
const id = randomUUID().slice(0, 8)
const database = resolve(`db/audit-test-${id}.db`)
const port = Number(process.env.AUDIT_PORT || 3200)
const env = { ...process.env, DATABASE_URL: `file:${database}`, AUDIT_BASE: `http://127.0.0.1:${port}`, APP_ORIGIN: `http://127.0.0.1:${port}`, SESSION_COOKIE_SECURE: 'false', AUDIT_FIXTURE: resolve(`tests/fixture-${id}.json`) }
mkdirSync('db', { recursive: true })
function run(args) {
  const r = spawnSync(process.execPath, args, { env, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`Command failed: ${args.join(' ')}`)
}
const schema = spawnSync(process.execPath, ['node_modules/prisma/build/index.js', 'migrate', 'diff', '--from-empty', '--to-schema-datamodel', 'prisma/schema.prisma', '--script'], { env, encoding: 'utf8' })
if (schema.status !== 0) throw new Error(schema.stderr)
const sqlite = new DatabaseSync(database); sqlite.exec(schema.stdout); sqlite.close()
run(['--import', 'tsx', 'tests/prepare.ts'])
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '-p', String(port)], { env, stdio: ['ignore', 'pipe', 'pipe'] })
let logs = ''; server.stdout.on('data', b => { logs += b }); server.stderr.on('data', b => { logs += b })
try {
  let ready = false
  for (let i = 0; i < 100; i++) {
    if (server.exitCode !== null) throw new Error(logs)
    try { const r = await fetch(env.AUDIT_BASE); if (r.ok) { ready = true; break } } catch {}
    await new Promise(r => setTimeout(r, 200))
  }
  if (!ready) throw new Error('Test server did not become ready')
  run(['tests/http-smoke.mjs'])
  run(['--import', 'tsx', 'tests/import-safety.ts'])
  run(['--import', 'tsx', 'tests/catalog-acceptance.ts'])
  if (process.env.MES_BROWSER_TEST_SCRIPT) run([process.env.MES_BROWSER_TEST_SCRIPT])
  console.log('All isolated acceptance suites passed. Operational database was not used.')
} finally {
  server.kill('SIGTERM')
  await new Promise(resolve => { server.once('close', resolve); setTimeout(resolve, 3000).unref() })
  writeFileSync('tests/server-test.log', logs)
}
