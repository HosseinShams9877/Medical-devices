import assert from 'node:assert/strict'
import { db } from '../src/lib/db'
import { importComponents, importBom } from '../src/lib/excel-import'
import { evaluateQc } from '../src/lib/qc-evaluate'
import { buildTemplate } from '../src/lib/excel-export'
import { inspectWorkbook } from '../src/lib/excel'
import type { SessionUser } from '../src/lib/auth'
async function main() {
 if (!process.env.DATABASE_URL?.includes('audit-test')) throw new Error('Isolated audit-test database required')
 const admin = await db.user.findUniqueOrThrow({where:{username:'audit_admin'}})
 const user: SessionUser = {...admin, role:'ADMIN',permissions:[],roleLabel:'Admin'}
 const mapping={code:0,name:1,qty:2,category:-1,qtyInit:-1}
 const run=(name:string,qty:string)=>importComponents([['EXCEL-AUDIT',name,qty]],mapping,'AuditSheet',user,null,'audit.xlsx')
 let report=await run('Import Audit','12')
 assert.equal(report.errors.length,0)
 let comp=await db.component.findUniqueOrThrow({where:{code:'EXCEL-AUDIT'}})
 assert.equal(comp.stockQty,0)
 assert.equal(await db.incomingInspection.count({where:{componentId:comp.id,status:'PENDING'}}),1)
 await run('Import Audit','12')
 assert.equal(await db.incomingInspection.count({where:{componentId:comp.id}}),1)
 report=await run('Import Audit','garbage');assert.equal(report.errors.length,1)
 report=await run('Import Audit','-2');assert.equal(report.errors.length,1)
 report=await run('Other Item','12');assert.equal(report.errors.length,1)
 assert.equal(await db.component.count({where:{code:'EXCEL-AUDIT'}}),1)
 // Failed movement FK must roll back both component and lot depletion.
 comp=await db.component.findUniqueOrThrow({where:{code:'AUDIT-C'}})
 const before=comp.stockQty
 report=await importComponents([['AUDIT-C',comp.name,String(before-1)]],mapping,'Audit', {...user,id:'missing-user'},null,'rollback.xlsx')
 assert.equal(report.errors.length,1)
 assert.equal((await db.component.findUniqueOrThrow({where:{id:comp.id}})).stockQty,before)
 const opts={sheet:'audit',headerRowIndex:0,kind:'BOM' as const,headers:['code','name','qty'],productCode:'AUDIT-P',createStubs:false}
 const bomCount=await db.bom.count()
 await importBom([['AUDIT-C',comp.name,'2']],{code:0,name:1,qty:2},opts,user,null,'same.xlsx')
 assert.equal(await db.bom.count(),bomCount)
 const failed=await importBom([['','unresolved component','1']],{code:0,name:1,qty:2},opts,user,null,'bad.xlsx')
 assert.ok(failed.errors.length)
 assert.equal(await db.bom.count(),bomCount)
 assert.equal(evaluateQc('۳٫۵',1,5),true)
 assert.throws(()=>evaluateQc('9',1,5,true))
 assert.throws(()=>evaluateQc('3mg 99',1,5))
 const template=await inspectWorkbook(await buildTemplate('suppliers'),'suppliers.xlsx')
 assert.ok(template.sheets.some(s=>s.kind==='SUPPLIERS'))
 console.log('PASS: 15 import/QC safety invariants')
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>db.$disconnect())
