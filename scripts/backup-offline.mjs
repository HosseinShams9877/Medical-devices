import { DatabaseSync, backup } from 'node:sqlite'
import { mkdirSync, cpSync, writeFileSync, existsSync, renameSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'
import net from 'node:net'
import { randomUUID } from 'node:crypto'
const arg=process.argv[2]
if (!arg || !path.isAbsolute(arg)) throw new Error('Pass an absolute NEW backup destination.')
const target=path.resolve(arg)
if(existsSync(target)) throw new Error('Destination already exists; refusing overwrite.')
const url=process.env.DATABASE_URL || ''
if(!url.startsWith('file:') || url.includes('?') || url.includes(':memory:')) throw new Error('Invalid DATABASE_URL')
const source=path.resolve('prisma',url.slice(5)), upload=path.resolve(process.env.MES_UPLOAD_DIR || 'upload')
if(!existsSync(source)) throw new Error('Database missing.')
if(target===upload || target.startsWith(upload+path.sep)) throw new Error('Backup must be outside upload directory.')
const listening=await new Promise((resolve,reject)=>{
 const socket=net.connect({host:'127.0.0.1',port:Number(process.env.PORT || 3000)})
 socket.once('connect',()=>{socket.destroy();resolve(true)})
 socket.once('error',e=>e.code==='ECONNREFUSED'?resolve(false):reject(e))
 socket.setTimeout(3000,()=>{socket.destroy();reject(new Error('Listener check timed out'))})
})
if(listening) throw new Error('Application port is listening. Stop application first.')
const temp=target+'.partial-'+randomUUID(), db=new DatabaseSync(source)
try {
 db.exec('BEGIN IMMEDIATE')
 if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok') throw new Error('Database integrity failed')
 const docs=db.prepare('SELECT fileName,sizeBytes FROM Document WHERE fileName IS NOT NULL').all()
 for(const d of docs){
  if(path.basename(d.fileName)!==d.fileName) throw new Error('Invalid attachment name')
  const f=path.join(upload,d.fileName)
  if(!existsSync(f) || (d.sizeBytes!==null && statSync(f).size!==d.sizeBytes)) throw new Error('Missing or incomplete attachment')
 }
 mkdirSync(temp,{recursive:true})
 const reader=new DatabaseSync(source,{readOnly:true})
 try {await backup(reader,path.join(temp,'custom.db'))} finally {reader.close()}
 if(existsSync(upload)) cpSync(upload,path.join(temp,'upload'),{recursive:true})
 else mkdirSync(path.join(temp,'upload'))
 writeFileSync(path.join(temp,'BACKUP.json'),JSON.stringify({createdAt:new Date().toISOString(),attachments:docs.length},null,2))
 db.exec('ROLLBACK');renameSync(temp,target);console.log('Complete DB and attachment backup:',target)
} catch(e){try{db.exec('ROLLBACK')}catch{};rmSync(temp,{recursive:true,force:true});throw e}
finally{db.close()}
