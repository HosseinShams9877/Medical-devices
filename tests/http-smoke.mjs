import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
const base = process.env.AUDIT_BASE || 'http://127.0.0.1:3000'
const f = JSON.parse(readFileSync(process.env.AUDIT_FIXTURE || '/tmp/mes-audit-fixture.json', 'utf8'))
for (let attempt = 0; attempt < 50; attempt++) {
 try { await fetch(base); break } catch (e) { if(attempt === 49) throw e; await new Promise(r=>setTimeout(r,200)) }
}
let cookie = ''
let passed = 0
async function req(path, body, expect = 200, headers = {}) {
 const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST', headers: { ...(cookie ? { Cookie: cookie } : {}), ...(body === undefined ? {} : {'Content-Type':'application/json'}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) })
 const data = await r.json()
 assert.equal(r.status, expect, path + ': ' + JSON.stringify(data))
 passed++
 return { data, response: r }
}
async function login(username) {
 const {response} = await req('/api/auth/login', {username, password:'Audit-Only-2026!'})
 cookie = response.headers.get('set-cookie').split(';')[0]
}
async function stock() {const {data}=await req('/api/inventory?q=AUDIT-C');return data.components.find(c=>c.id===f.componentId).stockQty}
await req('/api/inventory', undefined, 401)
await login('audit_viewer')
await req('/api/inventory', {action:'out',componentId:f.componentId,qty:1,reason:'test'},403)
await req('/api/users', undefined,403)
await login('audit_admin')
await req('/api/inventory',{action:'out',componentId:f.componentId,qty:1,reason:'test'},403,{Origin:'https://untrusted.example'})
assert.equal(await stock(),100)
const received = await req('/api/inventory',{action:'receive',componentId:f.componentId,qty:10,lotNumber:'AUDIT-PENDING'})
assert.equal(await stock(),100)
await req('/api/incoming',{action:'decide',inspectionId:received.data.inspection.id,decision:'APPROVED'})
assert.equal(await stock(),110)
await req('/api/incoming',{action:'decide',inspectionId:received.data.inspection.id,decision:'APPROVED'},400)
const rejected=await req('/api/inventory',{action:'receive',componentId:f.componentId,qty:5,lotNumber:'AUDIT-REJECT'})
await req('/api/incoming',{action:'decide',inspectionId:rejected.data.inspection.id,decision:'REJECTED'})
assert.equal(await stock(),110)
const operationId=randomUUID()
const consume={action:'bom-consume',productId:f.productId,count:10,reason:'audit ten units',operationId}
await req('/api/inventory',consume)
assert.equal(await stock(),90)
await req('/api/inventory',consume,409)
assert.equal(await stock(),90)
await req('/api/inventory',{...consume,count:500,operationId:randomUUID()},400)
assert.equal(await stock(),90)
await req('/api/inventory',{action:'out',componentId:f.componentId,qty:500,reason:'shortage'},400)
await req('/api/orders/'+f.orderId,{action:'transition',to:'CLOSED'},400)
await req('/api/qc/tests',{templateId:f.templateId,deviceId:f.deviceId,actualValue:'9',passed:true},400)
await req('/api/qc/tests',{templateId:f.templateId,deviceId:f.deviceId,actualValue:'invalid',passed:true},400)
await req('/api/qc/tests',{templateId:f.templateId,deviceId:f.deviceId,actualValue:'۳'})
await req('/api/excel/records?scope=materials&page=-5')
await req('/api/excel/records?page=NaN')
await req('/api/releases',{action:'release',deviceId:f.deviceId},400)
console.log(`PASS: ${passed} HTTP assertions plus stock invariants`)
