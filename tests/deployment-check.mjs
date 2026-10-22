// Real production startup, account hardening, attachments, backup and restore.
// All writes use an isolated copy. No operational database or credentials change.
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, copyFileSync, symlinkSync, writeFileSync, readFileSync, renameSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { randomBytes, createHash } from 'node:crypto'
import { DatabaseSync } from 'node:sqlite'

const root = process.cwd(), temp = mkdtempSync(path.join(tmpdir(), 'mes-deploy-'))
const source = path.join(root, 'db/custom.db'), database = path.join(temp, 'production.db')
const sourceHash = createHash('sha256').update(readFileSync(source)).digest('hex')
copyFileSync(source, database)
for (const name of ['node_modules', 'scripts', 'src', 'prisma', '.next', 'public']) symlinkSync(path.join(root, name), path.join(temp, name), process.platform === 'win32' ? 'junction' : 'dir')
for (const name of ['package.json', 'tsconfig.json', 'next.config.ts']) copyFileSync(path.join(root, name), path.join(temp, name))
const env = { ...process.env, NODE_ENV: 'production' }
for (const name of ['DATABASE_URL', 'APP_ORIGIN', 'SESSION_COOKIE_SECURE', 'MES_ADMIN_USERNAME', 'MES_ADMIN_PASSWORD', 'MES_UPLOAD_DIR', 'MES_BACKUP_DIR', 'PORT']) delete env[name]
const origin = 'https://mes.deploy-test.example', base = 'http://127.0.0.1:3000'
const password = randomBytes(24).toString('hex')
const checks = [], logs = []
let server, currentDb = database
const check = name => { checks.push(name); console.log('PASS:', name) }
function settings(extra = {}) {
  const values = { DATABASE_URL: `file:${currentDb.replaceAll('\\', '/')}`, APP_ORIGIN: origin, SESSION_COOKIE_SECURE: 'true', MES_UPLOAD_DIR: path.join(temp, 'persistent-upload').replaceAll('\\', '/'), MES_BACKUP_DIR: path.join(temp, 'persistent-backups').replaceAll('\\', '/'), ...extra }
  writeFileSync(path.join(temp, '.env'), Object.entries(values).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join('\n'))
}
function command(script, override = {}) {
  const entry = script === 'preflight' ? 'scripts/preflight.ts' : 'scripts/set-production-admin.ts'
  const result = spawnSync(process.execPath, ['--import', './scripts/load-env.mjs', '--import', 'tsx', entry], { cwd: temp, env: { ...env, ...override }, encoding: 'utf8', timeout: 30000 })
  return { status: result.status, output: (result.stdout || '') + (result.stderr || '') + (result.error?.message || '') }
}
function preflight(expected, includes) {
  const result = command('preflight')
  assert.equal(result.status, expected, result.output)
  if (includes) assert.ok(result.output.includes(includes), result.output)
}
async function start() {
  server = spawn(process.execPath, ['scripts/start-production.mjs'], { cwd: temp, env, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', b => logs.push(String(b))); server.stderr.on('data', b => logs.push(String(b)))
  for (let n = 0; n < 150; n++) {
    if (server.exitCode !== null) throw new Error(logs.join(''))
    try { if ((await fetch(base)).ok) return } catch {}
    await new Promise(r => setTimeout(r, 200))
  }
  throw new Error('Production server not ready')
}
async function stop() {
  if (!server || server.exitCode !== null) return
  const child = server
  const closed = new Promise(resolve => child.once('close', resolve))
  try { if (process.platform === 'win32') child.kill(); else process.kill(-child.pid, 'SIGTERM') } catch {}
  await Promise.race([closed, new Promise(resolve => setTimeout(resolve, 3000))])
  server = undefined
}
async function request(route, body, cookie = '', expected = 200, requestOrigin = origin) {
  const multipart = body instanceof FormData
  const response = await fetch(base + route, { method: body === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { Cookie: cookie } : {}), Origin: requestOrigin, ...(body !== undefined && !multipart ? { 'Content-Type': 'application/json' } : {}) }, body: body === undefined ? undefined : multipart ? body : JSON.stringify(body) })
  assert.equal(response.status, expected, `${route}: ${await response.clone().text()}`)
  return response
}
async function login(username, secret) {
  const response = await request('/api/auth/login', { username, password: secret })
  const value = response.headers.get('set-cookie')
  assert.match(value, /; Secure/i); assert.match(value, /; HttpOnly/i); assert.match(value, /SameSite=lax/i)
  return value.split(';')[0]
}
try {
  settings({ APP_ORIGIN: '' }); preflight(1, 'exact HTTPS origin'); check('Missing configuration fails clearly before database access')
  settings({ APP_ORIGIN: origin + '/' }); preflight(1, 'exact HTTPS origin'); check('Origin with trailing slash rejected')
  settings({ SESSION_COOKIE_SECURE: 'false' }); preflight(1, 'SESSION_COOKIE_SECURE=true'); check('Insecure production cookies rejected')
  settings({ DATABASE_URL: `file:${temp}/missing.db` }); preflight(1, 'does not exist'); assert.equal(existsSync(path.join(temp, 'missing.db')), false); check('Missing database is not silently created')
  settings(); preflight(1, 'Default demo password'); check('Bundled default passwords block production startup')
  const secure = command('admin:secure', { MES_ADMIN_USERNAME: 'admin', MES_ADMIN_PASSWORD: password }); assert.equal(secure.status, 0, secure.output)
  const sql = new DatabaseSync(database)
  assert.equal(sql.prepare("SELECT count(*) AS n FROM User WHERE status='ACTIVE'").get().n, 1)
  sql.close(); check('Isolated admin hardened and other default-password accounts disabled')
  preflight(0); check('Administrative commands load production configuration from .env')
  await start(); check('Actual npm run start:production starts successfully')
  const home = await fetch(base)
  assert.equal(home.headers.get('x-content-type-options'), 'nosniff'); assert.equal(home.headers.get('x-frame-options'), 'DENY'); assert.equal(home.headers.get('x-powered-by'), null)
  check('Security headers present and framework header removed')
  await request('/api/inventory', undefined, '', 401); await request('/api/admin/backup', undefined, '', 401)
  for (const route of ['/db/custom.db', '/.env', '/backups/production.db']) await request(route, undefined, '', 404)
  check('Anonymous database, backup and private paths are inaccessible')
  let admin = await login('admin', password); check('Login issues Secure, HttpOnly and SameSite session cookie')
  await request('/api/customers', { code: 'DENIED', name: 'untrusted' }, admin, 403, 'https://untrusted.example'); check('Cross-origin mutation rejected')
  await request('/api/customers', { code: 'DEPLOY-CHECK', name: 'مشتری آزمون دیپلوی', phone: '09120000999' }, admin)
  await Promise.all(Array.from({length: 8}, (_, i) => request('/api/customers', { code: `CONCURRENT-${i}`, name: `Concurrent client ${i}` }, admin)))
  check('Eight concurrent authenticated customer writes succeed')
  const viewerPassword = randomBytes(16).toString('hex')
  const newUser = await (await request('/api/users', { action: 'create', username: 'deploy_viewer', fullName: 'Deployment Viewer', role: 'VIEWER', password: viewerPassword }, admin)).json()
  const viewer = await login('deploy_viewer', viewerPassword)
  await request('/api/admin/backup', undefined, viewer, 403)
  await request('/api/users', { action: 'update', id: newUser.user.id, password: randomBytes(20).toString('hex') }, admin)
  assert.equal((await (await request('/api/auth/me', undefined, viewer)).json()).user, null)
  check('Backup permission enforced and old session revoked after password change')
  const form = new FormData(); form.set('name', 'Deployment attachment'); form.set('docType', 'OTHER'); form.set('file', new Blob(['deployment attachment test'], { type: 'text/plain' }), 'deployment.txt')
  const doc = (await (await request('/api/documents', form, admin)).json()).document
  assert.equal(await (await request(`/api/documents/${doc.id}?file=1`, undefined, admin)).text(), 'deployment attachment test')
  check('Attachment upload and authenticated download preserve bytes')
  const backup = await (await request('/api/admin/backup', {}, admin)).json()
  const snapshot = Buffer.from(await (await request(`/api/admin/backup?download=1&name=${encodeURIComponent(backup.fileName)}`, undefined, admin)).arrayBuffer())
  const restored = path.join(temp, 'restored.db'); writeFileSync(restored, snapshot)
  const restoredSql = new DatabaseSync(restored)
  assert.equal(restoredSql.prepare('PRAGMA integrity_check').get().integrity_check, 'ok')
  assert.equal(restoredSql.prepare('PRAGMA foreign_key_check').all().length, 0)
  assert.equal(restoredSql.prepare("SELECT count(*) AS n FROM Customer WHERE code='DEPLOY-CHECK'").get().n, 1)
  assert.equal(restoredSql.prepare('SELECT count(*) AS n FROM Document WHERE id=?').get(doc.id).n, 1)
  restoredSql.close(); check('Downloaded backup has valid integrity/references and contains committed customer/attachment metadata')
  await stop()
  currentDb = restored; settings(); preflight(0); await start(); admin = await login('admin', password)
  assert.equal((await (await request('/api/customers?q=DEPLOY-CHECK', undefined, admin)).json()).customers.length, 1)
  assert.equal(await (await request(`/api/documents/${doc.id}?file=1`, undefined, admin)).text(), 'deployment attachment test')
  check('Restart on restored backup retains customer and attachment access')
  await stop()
  const attachment = path.join(temp, 'persistent-upload', doc.fileName); renameSync(attachment, attachment + '.hidden')
  preflight(1, 'attachment(s)'); renameSync(attachment + '.hidden', attachment); check('Missing attachment blocks preflight')
  const corrupt = new DatabaseSync(restored); corrupt.exec('PRAGMA foreign_keys=OFF')
  const owner = corrupt.prepare('SELECT uploadedById FROM Document WHERE id=?').get(doc.id).uploadedById
  corrupt.prepare('UPDATE Document SET uploadedById=? WHERE id=?').run('nonexistent-user', doc.id)
  preflight(1, 'foreign-key'); corrupt.prepare('UPDATE Document SET uploadedById=? WHERE id=?').run(owner, doc.id)
  check('Broken foreign-key reference blocks preflight')
  const component = corrupt.prepare('SELECT id,stockQty FROM Component LIMIT 1').get()
  corrupt.prepare('UPDATE Component SET stockQty=-1 WHERE id=?').run(component.id); preflight(1, 'negative quantities')
  corrupt.prepare('UPDATE Component SET stockQty=? WHERE id=?').run(component.stockQty, component.id); corrupt.close()
  preflight(0); check('Negative inventory blocks preflight; restored valid data passes')
  assert.equal(createHash('sha256').update(readFileSync(source)).digest('hex'), sourceHash); check('Original database is byte-for-byte unchanged')
  writeFileSync(path.join(root, 'tests/deployment-test-results.json'), JSON.stringify({ success: true, checks, completedAt: new Date().toISOString(), environment: `${process.platform} / ${process.version} / loopback upstream; Windows and public TLS not tested` }, null, 2))
  console.log(`PASS: ${checks.length} deployment checks`)
} finally {
  await stop()
  writeFileSync(path.join(root, 'tests/deployment-server.log'), logs.join(''))
  rmSync(temp, { recursive: true, force: true })
}
