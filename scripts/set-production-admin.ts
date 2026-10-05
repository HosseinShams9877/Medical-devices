import { db } from '../src/lib/db'
import { hashPassword, verifyPassword } from '../src/lib/password'
async function main() {
 const password=process.env.MES_ADMIN_PASSWORD
 const username=process.env.MES_ADMIN_USERNAME || 'admin'
 if (!password || password.length<12 || password==='demo1234') throw new Error('MES_ADMIN_PASSWORD must contain at least 12 characters.')
 const user=await db.user.findUniqueOrThrow({where:{username}})
 if(user.role!=='ADMIN') throw new Error('Target must already be an administrator.')
 await db.$transaction(async tx=>{
  await tx.user.update({where:{id:user.id},data:{passwordHash:hashPassword(password),status:'ACTIVE'}})
  await tx.session.deleteMany({where:{userId:user.id}})
  const others=await tx.user.findMany({where:{id:{not:user.id},status:'ACTIVE'}})
  for(const other of others) if(verifyPassword('demo1234',other.passwordHash)) {
   await tx.user.update({where:{id:other.id},data:{status:'DISABLED'}})
   await tx.session.deleteMany({where:{userId:other.id}})
  }
 })
 console.log('Administrator password changed; other default-password accounts disabled. Create/re-enable named accounts with individual passwords in Users.')
}
main().catch(e=>{console.error(e.message);process.exitCode=1}).finally(()=>db.$disconnect())
