import path from 'node:path'
export const uploadDirectory = () => path.resolve(process.env.MES_UPLOAD_DIR || 'upload')
export const backupDirectory = () => path.resolve(process.env.MES_BACKUP_DIR || 'backups')
export const databaseFile = () => {
 const url = process.env.DATABASE_URL || ''
 if (!url.startsWith('file:') || url.includes('?') || url.includes(':memory:')) throw new Error('DATABASE_URL must name a persistent SQLite file.')
 return path.resolve(process.cwd(), 'prisma', url.slice(5))
}
