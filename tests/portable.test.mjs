import test from 'node:test'
import assert from 'node:assert/strict'
import {mkdtempSync,copyFileSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs'
import {tmpdir} from 'node:os'
import path from 'node:path'
import {spawnSync} from 'node:child_process'
import {DatabaseSync} from 'node:sqlite'
import {createHash} from 'node:crypto'
test('Full backup preserves database and attachment, refuses overwrite',()=>{
 const temp=mkdtempSync(path.join(tmpdir(),'mes-backup-'))
 try {
 const source=path.join(temp,'source.db'),upload=path.join(temp,'upload'),target=path.join(temp,'backup')
 copyFileSync('db/custom.db',source);mkdirSync(upload);writeFileSync(path.join(upload,'test.txt'),'retained attachment')
 const hash=()=>createHash('sha256').update(readFileSync(source)).digest('hex'),before=hash()
 const env={...process.env,DATABASE_URL:'file:'+source.replaceAll('\\','/'),MES_UPLOAD_DIR:upload,PORT:'39187'}
 const run=()=>spawnSync(process.execPath,['scripts/backup-offline.mjs',target],{env,encoding:'utf8',timeout:20000})
 const result=run();assert.equal(result.status,0,result.stderr)
 assert.equal(readFileSync(path.join(target,'upload/test.txt'),'utf8'),'retained attachment')
 const db=new DatabaseSync(path.join(target,'custom.db'),{readOnly:true});assert.equal(db.prepare('PRAGMA integrity_check').get().integrity_check,'ok');db.close()
 assert.equal(hash(),before);assert.notEqual(run().status,0)
 }finally{rmSync(temp,{recursive:true,force:true})}
})
test('Windows absolute data paths',()=>assert.equal(path.win32.resolve('C:\\MES\\prisma','C:/MES-data/custom.db'),'C:\\MES-data\\custom.db'))
