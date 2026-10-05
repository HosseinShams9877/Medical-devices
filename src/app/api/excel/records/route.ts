import { NextRequest } from 'next/server'
import { requirePerm, withApi, ok } from '@/lib/api'
import { db } from '@/lib/db'

export const GET = withApi(async (req: NextRequest) => {
  await requirePerm(req, 'excel.export')
  const query = (req.nextUrl.searchParams.get('q') ?? '').trim().slice(0, 100)
  const rawPage = Number(req.nextUrl.searchParams.get('page') || '1')
  const page = Number.isSafeInteger(rawPage) && rawPage > 0 ? rawPage : 1
  if (req.nextUrl.searchParams.get('scope') === 'materials') {
    const where = query ? { OR: [{ itemName: { contains: query } }, { sheetName: { contains: query } }, { componentCode: { contains: query } }] } : {}
    const [total, records] = await Promise.all([
      db.excelMaterialRecord.count({ where }),
      db.excelMaterialRecord.findMany({ where, orderBy: [{ importedAt: 'desc' }, { rowNumber: 'asc' }], skip: (page - 1) * 50, take: 50 }),
    ])
    return ok({ total, page, records: records.map(({ headersJson, valuesJson, ...r }) => ({ ...r, serial: r.itemName, deviceId: r.componentId, productCode: r.componentCode ?? '', headers: JSON.parse(headersJson), values: JSON.parse(valuesJson) })) })
  }
  const where = query ? { OR: [{ serial: { contains: query } }, { sheetName: { contains: query } }, { productCode: { contains: query } }] } : {}
  const [total, records] = await Promise.all([
    db.excelDeviceRecord.count({ where }),
    db.excelDeviceRecord.findMany({ where, orderBy: [{ importedAt: 'desc' }, { rowNumber: 'asc' }], skip: (page - 1) * 50, take: 50 }),
  ])
  return ok({ total, page, records: records.map(({ headersJson, valuesJson, ...record }) => ({ ...record, headers: JSON.parse(headersJson), values: JSON.parse(valuesJson) })) })
})
