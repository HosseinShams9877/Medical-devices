// ─────────────────────────────────────────────────────────────
// Seed — داده نمونه واقع‌گرایانه (شرکت تولید تجهیزات پزشکی)
// اجرا: bun scripts/seed.ts
// ─────────────────────────────────────────────────────────────
import { PrismaClient } from '@prisma/client'
import { hashPassword } from '../src/lib/password'

const db = new PrismaClient()

const D = (days: number) => new Date(Date.now() + days * 86400000)
const PW = hashPassword('demo1234')

async function main() {
  console.log('⏳ پاک‌سازی دیتابیس…')
  const tables = [
    'NotificationRead', 'Notification', 'AuditLog', 'Document', 'WarrantyOverride',
    'RepairPart', 'Repair', 'Complaint', 'TicketUpdate', 'ServiceTicket', 'Customer',
    'ProductRelease', 'ReworkRecord', 'Nonconformity', 'IncomingInspection', 'TestResult',
    'TestTemplate', 'Equipment', 'DevicePartUsage', 'StepRecord', 'Device', 'OrderStep',
    'OrderMaterial', 'ProductionOrder', 'ProcessStepTemplate', 'BomItem', 'Bom',
    'ProductRevision', 'Product', 'ComponentLot', 'Component', 'Supplier', 'Session', 'User',
  ]
  for (const t of tables) {
    // @ts-expect-error dynamic table name
    await db[t].deleteMany()
  }

  // ═══ کاربران ═══
  console.log('⏳ کاربران…')
  const mkUser = (username: string, fullName: string, role: string, phone?: string) =>
    db.user.create({ data: { username, fullName, role, phone, passwordHash: PW } })
  const admin = await mkUser('admin', 'مدیر سیستم', 'ADMIN')
  const pmgr = await mkUser('pmgr', 'علی رضایی', 'PRODUCTION_MGR', '0912-1000001')
  const oper = await mkUser('operator', 'حسین کریمی', 'OPERATOR', '0912-1000002')
  const qcu = await mkUser('qc', 'مریم حسینی', 'QC', '0912-1000003')
  const ware = await mkUser('warehouse', 'رضا احمدی', 'WAREHOUSE', '0912-1000004')
  const smgr = await mkUser('smgr', 'سارا موسوی', 'SERVICE_MGR', '0912-1000005')
  const tech1 = await mkUser('tech1', 'امیر تهرانی', 'TECHNICIAN', '0912-1000006')
  const tech2 = await mkUser('tech2', 'نگار صادقی', 'TECHNICIAN', '0912-1000007')
  const sales = await mkUser('sales', 'فاطمه نوری', 'SALES', '0912-1000008')
  await mkUser('viewer', 'دکتر رحیمی', 'VIEWER', '0912-1000009')

  // ═══ تأمین‌کنندگان ═══
  console.log('⏳ تأمین‌کنندگان و قطعات…')
  const sup = (code: string, name: string, person: string, phone: string) =>
    db.supplier.create({ data: { code, name, contactPerson: person, phone } })
  const s1 = await sup('SUP-001', 'تجهیزپژوهان پارس', 'مهندس شریفی', '021-88770001')
  const s2 = await sup('SUP-002', 'الکترونیک نوین آسیا', 'مهندس کاظمی', '021-88770002')
  const s3 = await sup('SUP-003', 'پلیمر صنعت کرمان', 'مهندس رستمی', '034-32110003')

  const mkComp = (code: string, name: string, manufacturer: string, criticality: string, supplierId: string, specs: string, stock: number, reserved: number, min: number, unit = 'عدد') =>
    db.component.create({ data: { code, name, manufacturer, criticality, supplierId, specs, stockQty: stock, reservedQty: reserved, minStock: min, unit } })

  const cPcb = await mkComp('PCB-MAIN-X1', 'برد اصلی میکروکنترلر', 'Nextin Co.', 'CRITICAL', s2.id, '۴ لایه، STM32F407، RoHS', 120, 18, 30)
  const cSens = await mkComp('SENS-SPO2-01', 'ماژول سنسور پالس‌اکسیژن', 'Masimo OEM', 'CRITICAL', s1.id, 'دقت ±۲٪، طول‌موج 660/905nm', 200, 18, 40)
  const cOled = await mkComp('DISP-OLED-096', 'نمایشگر OLED 0.96 اینچ', 'WinStar', 'CRITICAL', s2.id, 'I2C، 128×64', 90, 18, 25)
  const cBat = await mkComp('BAT-LI-18650', 'باتری لیتیومی 18650', 'Samsung SDI', 'CRITICAL', s2.id, '3.7V، 2600mAh، دارای BMS', 100, 22, 30)
  const cEncl = await mkComp('ENCL-PX1', 'بدنه پلیمری PX', 'پلیمر صنعت', 'NORMAL', s3.id, 'ABS+PC، ضد ضربه', 150, 18, 40)
  const cAdp = await mkComp('ADP-12V', 'آداپتور DC 12V/2A', 'MeanWell', 'CRITICAL', s1.id, 'IEC 60601-1 پزشکی', 60, 22, 20)
  const cFuse = await mkComp('FUSE-2A', 'فیوز شیشه‌ای 2A', 'Bel Fuse', 'CRITICAL', s2.id, '250V، سریع', 500, 36, 100)
  const cScrew = await mkComp('SCR-M3x8', 'پیچ M3×8 استیل', 'فیکس ایران', 'NORMAL', s3.id, 'A2-70', 2000, 176, 300)
  const cLabel = await mkComp('LBL-PX1', 'لیبل شناسنامه محصول', 'چاپ پارس', 'NORMAL', s3.id, 'لاتاریت ضدآب', 500, 18, 60)
  const cMotor = await mkComp('MOT-PMP-12', 'موتور پمپ پریستالتیک 12V', 'Nidec', 'CRITICAL', s1.id, 'دبی ۵۰۰ml/h، نویز <۴۵dB', 2, 0, 10)
  const cPcbDrv = await mkComp('PCB-DRV-IP5', 'برد درایور پمپ انفوزیون', 'Nextin Co.', 'CRITICAL', s2.id, 'کنترل موتور + سنسور فشار', 12, 0, 6)
  const cTube = await mkComp('TUBE-SIL-2', 'لوله سیلیکونی ۲mm', 'سیلیکون تک', 'NORMAL', s3.id, 'Medical Grade', 300, 0, 60)
  const cValve = await mkComp('VLV-CHK-1', 'سوپاپ یک‌طرفه پزشکی', 'BQ Medical', 'CRITICAL', s1.id, 'CR/TE، ضد انعقاد', 40, 0, 12)
  const cSpring = await mkComp('SPR-SS-05', 'فنر فولادی', 'فنرسازی ایران', 'NORMAL', s3.id, '304، بار ۵N', 500, 0, 100)
  const cPcbEcg = await mkComp('PCB-ECG-30', 'برد اکتساب ECG ۱۲کاناله', 'CardioTech', 'CRITICAL', s2.id, 'نویز <۲۰μV، ISO 13485 سازنده', 30, 4, 10)
  const cLcd = await mkComp('DISP-LCD-7', 'نمایشگر لمسی ۷ اینچ', 'Riverdi', 'NORMAL', s2.id, '800×480، RS485', 25, 4, 8)
  const cCbl = await mkComp('CBL-ECG-12', 'کابل بیمار ۱۲کاناله', 'CardioTech', 'CRITICAL', s1.id, 'ماهیتی با پوشش ضدحساسیت', 80, 4, 20)

  // ═══ لات‌ها ═══
  console.log('⏳ لات‌های قطعات…')
  const mkLot = (componentId: string, lotNumber: string, qty: number, supplierId: string, receivedDaysAgo: number, status: string) =>
    db.componentLot.create({ data: { componentId, lotNumber, quantity: qty, remaining: qty, supplierId, receivedAt: D(-receivedDaysAgo), status } })
  const lPcb = await mkLot(cPcb.id, 'LT-PCB-2411', 200, s2.id, 45, 'APPROVED')
  const lPcbBad = await mkLot(cPcb.id, 'LT-PCB-2412', 50, s2.id, 10, 'REJECTED')
  const lSens = await mkLot(cSens.id, 'LT-SENS-2409', 150, s1.id, 60, 'APPROVED')
  const lSens2 = await mkLot(cSens.id, 'LT-SENS-2410', 60, s1.id, 20, 'APPROVED')
  const lBat = await mkLot(cBat.id, 'LT-BAT-2415', 100, s2.id, 5, 'PENDING')

  // ═══ محصولات و نسخه‌ها ═══
  console.log('⏳ محصولات، نسخه‌ها و BOM…')
  const pPx = await db.product.create({ data: { code: 'PX-100', name: 'پالس‌اکسیمتر رومیزی PX-100', category: 'مانیتورینگ', warrantyMonths: 24, hasFirmware: true, description: 'اندازه‌گیری SpO2 و نبض با نمایش OLED و خروجی سریال' } })
  const pIp = await db.product.create({ data: { code: 'IP-500', name: 'پمپ انفوزیون IP-500', category: 'تزریق', warrantyMonths: 18, hasFirmware: true, description: 'دبی ۰.۱ تا ۵۰۰ میلی‌لیتر بر ساعت با سنسور فشار' } })
  const pEcg = await db.product.create({ data: { code: 'ECG-300', name: 'الکتروکاردیوگراف ECG-300', category: 'تشخیصی', warrantyMonths: 24, hasFirmware: true, description: '۱۲ کاناله با نمایش لمسی ۷ اینچ و چاپگر حرارتی' } })

  const rPxA = await db.productRevision.create({ data: { productId: pPx.id, revision: 'A', notes: 'نسخه اولیه با سنسور قدیمی', isActive: false } })
  const rPxB = await db.productRevision.create({ data: { productId: pPx.id, revision: 'B', notes: 'ارتقای سنسور و کاهش مصرف باتری', isActive: true } })
  const rIpA = await db.productRevision.create({ data: { productId: pIp.id, revision: 'A', isActive: true } })
  const rEcgA = await db.productRevision.create({ data: { productId: pEcg.id, revision: 'A', isActive: true } })

  // BOM‌ها — نسخه قبلی RETIRED می‌شود؛ سفارش‌های قدیمی به همان نسخه متصل می‌مانند
  const bomPxB1 = await db.bom.create({ data: { productRevisionId: rPxB.id, revision: 1, status: 'RETIRED', effectiveDate: D(-200), notes: 'سنسور نسخه جدید', createdById: pmgr.id } })
  const bomPxB2 = await db.bom.create({ data: { productRevisionId: rPxB.id, revision: 2, status: 'ACTIVE', effectiveDate: D(-60), notes: 'افزایش ایمنی: فیوز دوم + آداپتور پزشکی', createdById: pmgr.id } })
  const bomIpA1 = await db.bom.create({ data: { productRevisionId: rIpA.id, revision: 1, status: 'ACTIVE', effectiveDate: D(-150), createdById: pmgr.id } })
  const bomEcgA1 = await db.bom.create({ data: { productRevisionId: rEcgA.id, revision: 1, status: 'ACTIVE', effectiveDate: D(-90), createdById: pmgr.id } })

  const addItem = (bomId: string, componentId: string, qty: number, criticality: string, order: number) =>
    ({ bomId, componentId, qty, criticality, sortOrder: order })
  await db.bomItem.createMany({ data: [
    addItem(bomPxB2.id, cPcb.id, 1, 'CRITICAL', 1), addItem(bomPxB2.id, cSens.id, 1, 'CRITICAL', 2),
    addItem(bomPxB2.id, cOled.id, 1, 'CRITICAL', 3), addItem(bomPxB2.id, cBat.id, 1, 'CRITICAL', 4),
    addItem(bomPxB2.id, cEncl.id, 1, 'NORMAL', 5), addItem(bomPxB2.id, cAdp.id, 1, 'CRITICAL', 6),
    addItem(bomPxB2.id, cFuse.id, 2, 'CRITICAL', 7), addItem(bomPxB2.id, cScrew.id, 8, 'NORMAL', 8),
    addItem(bomPxB2.id, cLabel.id, 1, 'NORMAL', 9),
    // IP-500
    addItem(bomIpA1.id, cPcbDrv.id, 1, 'CRITICAL', 1), addItem(bomIpA1.id, cMotor.id, 1, 'CRITICAL', 2),
    addItem(bomIpA1.id, cTube.id, 2, 'NORMAL', 3), addItem(bomIpA1.id, cValve.id, 1, 'CRITICAL', 4),
    addItem(bomIpA1.id, cBat.id, 1, 'CRITICAL', 5), addItem(bomIpA1.id, cAdp.id, 1, 'CRITICAL', 6),
    addItem(bomIpA1.id, cSpring.id, 2, 'NORMAL', 7), addItem(bomIpA1.id, cScrew.id, 10, 'NORMAL', 8),
    // ECG-300
    addItem(bomEcgA1.id, cPcbEcg.id, 1, 'CRITICAL', 1), addItem(bomEcgA1.id, cLcd.id, 1, 'NORMAL', 2),
    addItem(bomEcgA1.id, cBat.id, 1, 'CRITICAL', 3), addItem(bomEcgA1.id, cAdp.id, 1, 'CRITICAL', 4),
    addItem(bomEcgA1.id, cCbl.id, 1, 'CRITICAL', 5), addItem(bomEcgA1.id, cScrew.id, 8, 'NORMAL', 6),
  ]})

  // ═══ قالب فرایند تولید ═══
  const stepsPx: [string, string, string, string, string, string, boolean, boolean, boolean][] = [
    ['تحویل مواد به خط تولید', 'دریافت کیت قطعات از انبار بر اساس BOM', 'بارکدخوان', 'کیت کامل', 'رسید کیت', 'تطبیق کد و لات', true, false, false],
    ['بازرسی مواد (First Article)', 'کنترل ظاهری و تطبیق مشخصات قطعات', 'لوپ ۱۰×', 'کیت قطعات', 'کیت تأیید‌شده', 'بدون آسیب دیدگی', true, false, false],
    ['مونتاژ PCB', 'نصب SMT و لحیم‌کاری قطعات', 'ایستگاه لحیم', 'PCB خام + قطعات', 'PCB مونتاژ‌شده', 'بازرسی اتصالات', true, false, false],
    ['مونتاژ نهایی بدنه', 'نصب ماژول‌ها در بدنه و اتصالات', 'پیچ‌گوشی پنوماتیک', 'PCB + ماژول‌ها', 'دستگاه مونتاژ‌شده', 'فشار پیچ ۰.۵N.m', true, false, false],
    ['پروگرام Firmware', 'فلاش فریمور از طریق JTAG', 'پروگرامر J-Link', 'PCB', 'FW فلش‌شده', 'CRC OK', true, false, false],
    ['تست Firmware', 'اجرای تست خودکار دیاگ', 'نرم‌افزار تست v3', 'دستگاه با FW', 'گزارش تست', 'همه ماژول‌ها PASS', true, true, false],
    ['تست عملکرد', 'تست SpO2 با شبیه‌ساز بیمار', 'شبیه‌ساز ProSim', 'دستگاه کامل', 'نتیجه تست', 'خطا ≤ ۲٪', true, true, false],
    ['کالیبراسیون', 'کالیبراسیون سنسور', 'شبیه‌ساز + مولتی‌متر', 'دستگاه', 'گزارش کالیبراسیون', 'انحراف ≤ ۱٪', true, false, false],
    ['بازرسی نهایی و بسته‌بندی', 'کنترل نهایی + بسته‌بندی', '—', 'دستگاه تست‌شده', 'بسته آماده', 'چک‌لیست کامل', true, false, true],
    ['QC نهایی', 'بررسی مدارک و تأیید نهایی', 'چک‌لیست QC', 'بسته محصول', 'رکورد QC', 'تأیید QC', true, true, false],
  ]
  await db.processStepTemplate.createMany({
    data: stepsPx.map((s, i) => ({
      productRevisionId: rPxB.id, stepIndex: i + 1, name: s[0], description: s[1],
      tools: s[2], inputs: s[3], outputs: s[4], acceptance: s[5],
      required: s[6], needsQc: s[7], isPackaging: s[8],
    })),
  })
  const stepsIp: [string, string, string, string, string, string, boolean, boolean, boolean][] = [
    ['تحویل مواد به خط تولید', 'دریافت کیت', 'بارکدخوان', 'کیت', 'رسید', 'تطبیق لات', true, false, false],
    ['مونتاژ مسیر سیال', 'نصب لوله، سوپاپ و محفظه', 'پرس دستی', 'قطعات سیال', 'مسیر آب‌بندی‌شده', 'تست نشتی OK', true, false, false],
    ['مونتاژ برد و موتور', 'نصب درایور و موتور پمپ', 'پیچ‌گوشی', 'PCB + موتور', 'یونیت کامل', 'فشار پیچ استاندارد', true, false, false],
    ['پروگرام Firmware', 'فلاش فریمور', 'پروگرامر', 'PCB', 'FW فلش‌شده', 'CRC OK', true, false, false],
    ['تست دبی و فشار', 'کالیبراسیون دبی', 'بالن کالیبراسیون', 'دستگاه کامل', 'گزارش دبی', 'خطا ≤ ۵٪', true, true, false],
    ['بازرسی نهایی و بسته‌بندی', 'کنترل نهایی و بسته‌بندی', '—', 'دستگاه', 'بسته', 'چک‌لیست کامل', true, false, true],
  ]
  await db.processStepTemplate.createMany({
    data: stepsIp.map((s, i) => ({
      productRevisionId: rIpA.id, stepIndex: i + 1, name: s[0], description: s[1],
      tools: s[2], inputs: s[3], outputs: s[4], acceptance: s[5],
      required: s[6], needsQc: s[7], isPackaging: s[8],
    })),
  })
  const stepsEcg: [string, string, string, string, string, string, boolean, boolean, boolean][] = [
    ['تحویل مواد به خط تولید', 'دریافت کیت', 'بارکدخوان', 'کیت', 'رسید', 'تطبیق لات', true, false, false],
    ['مونتاژ برد ECG', 'نصب برد اکتساب و شیلد', 'ایستگاه لحیم', 'PCB + شیلد', 'برد کامل', 'بازرسی اتصالات', true, false, false],
    ['پروگرام Firmware', 'فلاش فریمور', 'پروگرامر', 'برد', 'FW فلش‌شده', 'CRC OK', true, false, false],
    ['تست نویز و کانال‌ها', 'تست ۱۲ کانال با شبیه‌ساز', 'شبیه‌ساز ECG', 'دستگاه کامل', 'گزارش تست', 'نویز ≤ ۲۰μV', true, true, false],
    ['بازرسی نهایی و بسته‌بندی', 'کنترل نهایی و بسته‌بندی', '—', 'دستگاه', 'بسته', 'چک‌لیست', true, false, true],
  ]
  await db.processStepTemplate.createMany({
    data: stepsEcg.map((s, i) => ({
      productRevisionId: rEcgA.id, stepIndex: i + 1, name: s[0], description: s[1],
      tools: s[2], inputs: s[3], outputs: s[4], acceptance: s[5],
      required: s[6], needsQc: s[7], isPackaging: s[8],
    })),
  })

  // ═══ تجهیزات تست ═══
  console.log('⏳ تجهیزات تست و قالب تست…')
  const eqMm = await db.equipment.create({ data: { code: 'EQ-MULT-01', name: 'مولتی‌متر Fluke 87V', calibratedAt: D(-100), calibrationDueAt: D(80), status: 'ACTIVE' } })
  const eqSim = await db.equipment.create({ data: { code: 'EQ-SIM-01', name: 'شبیه‌ساز بیمار Fluke ProSim 8', calibratedAt: D(-160), calibrationDueAt: D(15), status: 'ACTIVE' } })
  const eqScope = await db.equipment.create({ data: { code: 'EQ-SCOP-01', name: 'اسیلوسکوپ Keysight DSOX', calibratedAt: D(-400), calibrationDueAt: D(-30), status: 'OVERDUE', notes: 'نیاز به کالیبراسیون فوری' } })
  const eqPsu = await db.equipment.create({ data: { code: 'EQ-PSU-01', name: 'منبع تغذیه آزمایشگاهی', calibratedAt: D(-80), calibrationDueAt: D(280), status: 'ACTIVE' } })

  const mkTpl = (code: string, name: string, stage: string, param: string, unit: string, criteria: string, min: number | null, max: number | null, target: number | null, required: boolean, opts: Partial<{ productId: string; productRevisionId: string; componentId: string; equipmentId: string }> = {}) =>
    db.testTemplate.create({ data: { code, name, stage, parameterName: param, unit, criteria, minValue: min, maxValue: max, targetValue: target, required, ...opts } })
  await mkTpl('IQC-PCB-01', 'بازرسی مداری PCB', 'INCOMING', 'مقاومت خط تغذیه', 'Ω', '≥ 100', 100, null, null, true, { componentId: cPcb.id })
  await mkTpl('IQC-SENS-01', 'دقت سنسور SpO2', 'INCOMING', 'خطای اندازه‌گیری', '%', '≤ 2', null, 2, null, true, { componentId: cSens.id })
  await mkTpl('IQC-BAT-01', 'ظرفیت باتری', 'INCOMING', 'ظرفیت واقعی', 'mAh', '≥ 2500', 2500, null, 2600, true, { componentId: cBat.id })
  await mkTpl('IPC-PROG-01', 'برنامه‌ریزی Firmware', 'IN_PROCESS', 'CRC فریمور', '—', 'PASS', null, null, null, true, { productRevisionId: rPxB.id, equipmentId: eqPsu.id })
  await mkTpl('IPC-CAL-01', 'کالیبراسیون سنسور', 'IN_PROCESS', 'انحراف کالیبراسیون', '%', '≤ 1', null, 1, null, true, { productRevisionId: rPxB.id, equipmentId: eqSim.id })
  await mkTpl('FIN-ACC-01', 'دقت نهایی SpO2', 'FINAL', 'خطای کل', '%', '≤ 2', null, 2, null, true, { productRevisionId: rPxB.id, equipmentId: eqSim.id })
  await mkTpl('FIN-SAFE-01', 'ایمنی الکتریکی (IEC 60601)', 'FINAL', 'جریان نشتی', 'μA', '≤ 100', null, 100, null, true, { productRevisionId: rPxB.id, equipmentId: eqMm.id })
  await mkTpl('FIN-BURN-01', 'تست Burn-in', 'FINAL', 'خرابی در ۲۴ ساعت', '—', 'PASS', null, null, null, true, { productRevisionId: rPxB.id })
  await mkTpl('FIN-ECG-01', 'تست نویز ECG', 'FINAL', 'نویز کانال', 'μV', '≤ 20', null, 20, null, true, { productRevisionId: rEcgA.id, equipmentId: eqSim.id })

  const tplMap: Record<string, string> = {}
  for (const t of await db.testTemplate.findMany()) tplMap[t.code] = t.id

  // ═══ مشتریان ═══
  const mkCust = (code: string, name: string, type: string, person: string, phone: string, city: string) =>
    db.customer.create({ data: { code, name, type, contactPerson: person, phone, city } })
  const cu1 = await mkCust('CU-001', 'بیمارستان میلاد تهران', 'HOSPITAL', 'مهندس فروغی', '021-48880000', 'تهران')
  const cu2 = await mkCust('CU-002', 'بیمارستان امام خمینی', 'HOSPITAL', 'خانم رحیمی', '031-36690000', 'اصفهان')
  const cu3 = await mkCust('CU-003', 'درمانگاه شهدا', 'CLINIC', 'آقای واحدی', '051-38430000', 'مشهد')
  const cu4 = await mkCust('CU-004', 'کلینیک تخصصی نور', 'CLINIC', 'دکتر احمدی', '026-34560000', 'کرج')
  const cu5 = await mkCust('CU-005', 'بیمارستان قلب تهران', 'HOSPITAL', 'خانم صادقی', '021-66570000', 'تهران')

  // ═══ سفارش‌های تولید ═══
  console.log('⏳ سفارش‌های تولید…')
  const mkOrder = (code: string, productId: string, revId: string, bomId: string, qty: number, status: string, opts: Partial<{ priority: string; plannedStart: Date; plannedEnd: Date; ownerId: string; productionLine: string; notes: string; createdById: string; actualStart: Date; actualEnd: Date }> = {}) =>
    db.productionOrder.create({ data: { code, productId, productRevisionId: revId, bomId, qty, status, createdById: pmgr.id, ownerId: pmgr.id, ...opts } })

  const po10 = await mkOrder('PO-1404-010', pPx.id, rPxB.id, bomPxB1.id, 12, 'RELEASED', {
    priority: 'HIGH', plannedStart: D(-160), plannedEnd: D(-140), actualStart: D(-158), actualEnd: D(-138),
    productionLine: 'خط ۱ — مونتاژ PX', notes: 'سفارش فصلی بیمارستان میلاد',
  })
  const po11 = await mkOrder('PO-1404-011', pIp.id, rIpA.id, bomIpA1.id, 5, 'DRAFT', {
    priority: 'NORMAL', plannedStart: D(7), plannedEnd: D(30), productionLine: 'خط ۲ — انفوزیون',
  })
  const po12 = await mkOrder('PO-1404-012', pPx.id, rPxB.id, bomPxB2.id, 10, 'IN_PRODUCTION', {
    priority: 'NORMAL', plannedStart: D(-12), plannedEnd: D(2), actualStart: D(-11),
    productionLine: 'خط ۱ — مونتاژ PX', notes: 'با BOM نسخه ۲ (فیوز دوم)',
  })
  const po13 = await mkOrder('PO-1404-013', pPx.id, rPxB.id, bomPxB2.id, 8, 'REWORK', {
    priority: 'HIGH', plannedStart: D(-30), plannedEnd: D(-18), actualStart: D(-29), actualEnd: D(-19),
    productionLine: 'خط ۱ — مونتاژ PX',
  })
  const po14 = await mkOrder('PO-1404-014', pIp.id, rIpA.id, bomIpA1.id, 6, 'MATERIAL_CHECK', {
    priority: 'URGENT', plannedStart: D(3), plannedEnd: D(20), productionLine: 'خط ۲ — انفوزیون',
    notes: 'نیاز به تأمین موتور پمپ',
  })
  const po15 = await mkOrder('PO-1404-015', pEcg.id, rEcgA.id, bomEcgA1.id, 4, 'COMPLETED', {
    priority: 'NORMAL', plannedStart: D(-20), plannedEnd: D(-8), actualStart: D(-19), actualEnd: D(-7),
    productionLine: 'خط ۳ — ECG',
  })

  // مواد رزرو‌شده سفارش‌ها (بررسی موجودی)
  const mkMat = (orderId: string, componentId: string, required: number, reserved: number, critical: boolean, note?: string) =>
    ({ orderId, componentId, requiredQty: required, reservedQty: reserved, shortageQty: Math.max(0, required - reserved), critical, note })
  const pxItems: [typeof cPcb, number][] = [[cPcb, 1], [cSens, 1], [cOled, 1], [cBat, 1], [cEncl, 1], [cAdp, 1], [cFuse, 2], [cScrew, 8], [cLabel, 1]]
  await db.orderMaterial.createMany({ data: [
    ...pxItems.map(([c, q]) => mkMat(po12.id, c.id, q * 10, q * 10, c.criticality === 'CRITICAL')),
    ...pxItems.map(([c, q]) => mkMat(po13.id, c.id, q * 8, q * 8, c.criticality === 'CRITICAL')),
    mkMat(po14.id, cPcbDrv.id, 6, 6, true),
    mkMat(po14.id, cMotor.id, 6, 2, true, 'موجودی انبار فقط ۲ عدد — سفارش خرید صادر شده'),
    mkMat(po14.id, cTube.id, 12, 12, false),
    mkMat(po14.id, cValve.id, 6, 6, true),
    mkMat(po14.id, cBat.id, 6, 6, true),
    mkMat(po14.id, cAdp.id, 6, 6, true),
    mkMat(po14.id, cSpring.id, 12, 12, false),
    mkMat(po14.id, cScrew.id, 60, 60, false),
    mkMat(po15.id, cPcbEcg.id, 4, 4, true), mkMat(po15.id, cLcd.id, 4, 4, false),
    mkMat(po15.id, cBat.id, 4, 4, true), mkMat(po15.id, cAdp.id, 4, 4, true),
    mkMat(po15.id, cCbl.id, 4, 4, true), mkMat(po15.id, cScrew.id, 32, 32, false),
  ]})

  // ═══ مراحل سفارش ═══
  const pxSteps = await db.processStepTemplate.findMany({ where: { productRevisionId: rPxB.id }, orderBy: { stepIndex: 'asc' } })
  const ipSteps = await db.processStepTemplate.findMany({ where: { productRevisionId: rIpA.id }, orderBy: { stepIndex: 'asc' } })
  const ecgSteps = await db.processStepTemplate.findMany({ where: { productRevisionId: rEcgA.id }, orderBy: { stepIndex: 'asc' } })

  const createOrderSteps = async (orderId: string, templates: typeof pxSteps, doneCount: number, inProgress = -1) => {
    await db.orderStep.createMany({
      data: templates.map((t) => ({
        orderId, stepIndex: t.stepIndex, name: t.name, tools: t.tools, acceptance: t.acceptance,
        required: t.required, isPackaging: t.isPackaging, needsQc: t.needsQc,
        status: t.stepIndex <= doneCount ? 'DONE' : t.stepIndex === inProgress ? 'IN_PROGRESS' : 'PENDING',
        operatorId: t.stepIndex <= doneCount || t.stepIndex === inProgress ? oper.id : null,
        startedAt: t.stepIndex <= doneCount || t.stepIndex === inProgress ? D(-10 - (templates.length - t.stepIndex)) : null,
        finishedAt: t.stepIndex <= doneCount ? D(-10 - (templates.length - t.stepIndex) + 0.2) : null,
      })),
    })
    return db.orderStep.findMany({ where: { orderId }, orderBy: { stepIndex: 'asc' } })
  }
  await createOrderSteps(po10.id, pxSteps, 10)
  await createOrderSteps(po11.id, ipSteps, 0)
  const po12Steps = await createOrderSteps(po12.id, pxSteps, 5, 6)
  const po13Steps = await createOrderSteps(po13.id, pxSteps, 10)
  await createOrderSteps(po14.id, ipSteps, 0)
  const po15Steps = await createOrderSteps(po15.id, ecgSteps, 5)

  // ═══ دستگاه‌ها (شماره سریال) ═══
  console.log('⏳ دستگاه‌ها و شماره سریال…')
  type DeviceT = { id: string; serial: string; status: string }
  const mkDevice = (serial: string, productId: string, revId: string, orderId: string, bomId: string, status: string, opts: Partial<{ fw: string; sw: string; progDays: number; producedDays: number; step: number }> = {}) =>
    db.device.create({ data: {
      serial, productId, productRevisionId: revId, orderId, bomId, status,
      firmwareVersion: opts.fw, softwareVersion: opts.sw,
      programmedAt: opts.progDays !== undefined ? D(-opts.progDays) : undefined,
      programmedById: opts.fw ? oper.id : undefined,
      programMethod: opts.fw ? 'پروگرامر J-Link / JTAG' : undefined,
      programVerified: opts.fw ? true : undefined,
      producedAt: opts.producedDays !== undefined ? D(-opts.producedDays) : undefined,
      currentStepIndex: opts.step ?? 0,
    } })

  const dev10: DeviceT[] = []
  for (let i = 1; i <= 12; i++) {
    dev10.push(await mkDevice(`PX100-B-01${String(i).padStart(2, '0')}`, pPx.id, rPxB.id, po10.id, bomPxB1.id, 'RELEASED', { fw: 'v1.0.8', sw: 'v1.0.2', progDays: 150, producedDays: 140, step: 10 }))
  }
  const dev12: DeviceT[] = []
  for (let i = 1; i <= 10; i++) {
    dev12.push(await mkDevice(`PX100-B-02${String(i).padStart(2, '0')}`, pPx.id, rPxB.id, po12.id, bomPxB2.id, 'IN_PRODUCTION', { fw: 'v2.1.3', sw: 'v2.1.0', progDays: 9, step: i <= 6 ? 6 : 5 }))
  }
  const dev13: DeviceT[] = []
  for (let i = 1; i <= 8; i++) {
    const failed = i === 5
    dev13.push(await mkDevice(`PX100-B-03${String(i).padStart(2, '0')}`, pPx.id, rPxB.id, po13.id, bomPxB2.id, failed ? 'QC_FAIL' : 'QC_PASS', { fw: 'v2.1.3', sw: 'v2.1.0', progDays: 25, producedDays: 20, step: 10 }))
  }
  const dev15: DeviceT[] = []
  for (let i = 1; i <= 4; i++) {
    dev15.push(await mkDevice(`ECG300-A-04${String(i).padStart(2, '0')}`, pEcg.id, rEcgA.id, po15.id, bomEcgA1.id, 'QC_PASS', { fw: 'v1.4.0', sw: 'v1.4.0', progDays: 12, producedDays: 8, step: 5 }))
  }

  // تحویل ۵ دستگاه از PO-10
  const deliveries: [DeviceT, string, number, string][] = [
    [dev10[0], cu1.id, -120, 'bill-1024'], [dev10[1], cu1.id, -120, 'bill-1025'],
    [dev10[2], cu3.id, -118, 'bill-1030'], [dev10[3], cu4.id, -110, 'bill-1041'],
    [dev10[4], cu2.id, -95, 'bill-1050'],
  ]
  for (const [dev, custId, days, note] of deliveries) {
    await db.device.update({ where: { id: dev.id }, data: { customerId: custId, deliveredAt: D(days), deliveredById: sales.id, deliveryNote: note, status: 'DELIVERED' } })
  }

  // ═══ رکورد‌های اپراتور ═══
  console.log('⏳ رکورد‌های اپراتور و تست‌ها…')
  const stepRecs: { stepId: string; deviceId: string | null; operatorId: string; result: string; startedAt: Date; finishedAt: Date; notes?: string }[] = []
  for (const dev of dev13) {
    for (const st of po13Steps) {
      stepRecs.push({ stepId: st.id, deviceId: dev.id, operatorId: oper.id, result: 'DONE', startedAt: D(-26), finishedAt: D(-25.8) })
    }
  }
  for (const dev of dev12.slice(0, 8)) {
    for (const st of po12Steps.filter((s) => s.status === 'DONE')) {
      stepRecs.push({ stepId: st.id, deviceId: dev.id, operatorId: oper.id, result: 'DONE', startedAt: D(-9), finishedAt: D(-8.9) })
    }
  }
  for (const dev of dev15) {
    for (const st of po15Steps) {
      stepRecs.push({ stepId: st.id, deviceId: dev.id, operatorId: oper.id, result: 'DONE', startedAt: D(-11), finishedAt: D(-10.9) })
    }
  }
  await db.stepRecord.createMany({ data: stepRecs })

  // ═══ نتایج تست QC ═══
  const mkTest = (templateCode: string, name: string, stage: string, deviceId: string | null, orderId: string, param: string, unit: string, criteria: string, actual: string, passed: boolean, opts: Partial<{ eq: string; days: number; verified: boolean; notes: string; operatorId: string }> = {}) =>
    db.testResult.create({ data: {
      templateCode, name, stage, templateId: tplMap[templateCode] ?? null, deviceId, orderId, parameterName: param, unit, criteria, actualValue: actual, passed,
      equipmentId: opts.eq, operatorId: opts.operatorId ?? qcu.id,
      verifiedById: opts.verified ? qcu.id : undefined, verifiedAt: opts.verified ? D(-(opts.days ?? 5)) : undefined,
      notes: opts.notes, createdAt: D(-(opts.days ?? 5)),
    } })

  for (const dev of dev13) {
    const failed = dev.status === 'QC_FAIL'
    await mkTest('FIN-ACC-01', 'دقت نهایی SpO2', 'FINAL', dev.id, po13.id, 'خطای کل', '%', '≤ 2', failed ? '4.1' : '1.3', !failed, { eq: eqSim.id, days: 19, verified: true, operatorId: qcu.id, notes: failed ? 'خطا خارج از محدوده — نیازمند Rework' : undefined })
    await mkTest('FIN-SAFE-01', 'ایمنی الکتریکی', 'FINAL', dev.id, po13.id, 'جریان نشتی', 'μA', '≤ 100', failed ? '82' : '76', true, { eq: eqMm.id, days: 19, verified: true })
    await mkTest('FIN-BURN-01', 'تست Burn-in', 'FINAL', dev.id, po13.id, 'خرابی در ۲۴ ساعت', '—', 'PASS', failed ? 'خاموشی مجدد در ساعت ۱۸' : 'PASS', !failed, { days: 18, verified: true, notes: failed ? 'دستگاه خاموش شد — مرتبط با تست دقت' : undefined })
  }
  for (const dev of dev15) {
    await mkTest('FIN-ECG-01', 'تست نویز ECG', 'FINAL', dev.id, po15.id, 'نویز کانال', 'μV', '≤ 20', '14', true, { eq: eqSim.id, days: 8, verified: true })
  }
  for (const dev of dev12.slice(0, 6)) {
    await mkTest('IPC-PROG-01', 'برنامه‌ریزی Firmware', 'IN_PROCESS', dev.id, po12.id, 'CRC فریمور', '—', 'PASS', 'PASS', true, { eq: eqPsu.id, days: 9, verified: true, operatorId: oper.id })
  }
  const badDev = dev12[7]
  await mkTest('IPC-CAL-01', 'کالیبراسیون سنسور', 'IN_PROCESS', badDev.id, po12.id, 'انحراف کالیبراسیون', '%', '≤ 1', '2.4', false, { eq: eqSim.id, days: 4, notes: 'نیاز به بازکالیبراسیون' })
  await mkTest('IPC-CAL-01', 'کالیبراسیون سنسور (Retest)', 'IN_PROCESS', badDev.id, po12.id, 'انحراف کالیبراسیون', '%', '≤ 1', '0.6', true, { eq: eqSim.id, days: 3, verified: true, notes: 'پس از بازکالیبراسیون مجدد' })

  // ═══ کنترل ورودی ═══
  await db.incomingInspection.create({ data: { code: 'IQC-1404-011', componentId: cSens.id, lotId: lSens2.id, supplierId: s1.id, qty: 60, status: 'APPROVED', inspectorId: qcu.id, inspectedAt: D(-19), decisionNote: 'نمونه‌گیری سطح II — تأیید' } })
  await db.incomingInspection.create({ data: { code: 'IQC-1404-012', componentId: cPcb.id, lotId: lPcbBad.id, supplierId: s2.id, qty: 50, status: 'REJECTED', inspectorId: qcu.id, inspectedAt: D(-9), decisionNote: 'خطای اتصال در ۸ برد از نمونه ۲۰تایی' } })
  const insBat = await db.incomingInspection.create({ data: { code: 'IQC-1404-013', componentId: cBat.id, lotId: lBat.id, supplierId: s2.id, qty: 100, status: 'PENDING' } })
  await db.componentLot.update({ where: { id: lBat.id }, data: { inspectionId: insBat.id } })

  // ═══ عدم انطباق‌ها ═══
  console.log('⏳ عدم انطباق، Rework و آزادسازی…')
  const failTest = await db.testResult.findFirst({ where: { deviceId: dev13[4].id, templateCode: 'FIN-ACC-01' } })
  const ncr1 = await db.nonconformity.create({ data: {
    code: 'NCR-1404-001', type: 'MATERIAL', source: 'INCOMING', componentId: cPcb.id, lotId: lPcbBad.id,
    title: 'خطای اتصال در لات PCB', description: 'در بازرسی ورودی لات LT-PCB-2412، ۸ برد از ۲۰ نمونه دارای اتصال کوتاه در خط تغذیه بودند.',
    severity: 'HIGH', rootCause: 'خطای فرایند لحیم‌کاری تأمین‌کننده', correctiveAction: 'مرجوعی کامل لات و صدور CAR به تأمین‌کننده',
    preventiveAction: 'افزایش سطح نمونه‌گیری به سطح III برای ۳ لات بعدی', status: 'RESOLVED',
    detectedById: qcu.id, detectedAt: D(-9),
  } })
  const ncr2 = await db.nonconformity.create({ data: {
    code: 'NCR-1404-002', type: 'TEST_FAIL', source: 'FINAL', deviceId: dev13[4].id, orderId: po13.id, testResultId: failTest?.id,
    title: `خطای دقت SpO2 خارج از حد در ${dev13[4].serial}`, description: 'در تست نهایی، خطای کل 4.1٪ اندازه‌گیری شد (حد مجاز ≤ ۲٪). Burn-in نیز خاموشی در ساعت ۱۸ نشان داد.',
    severity: 'HIGH', rootCause: 'کالیبراسیون نادرست ایستگاه ۳ و درگیری سوکت سنسور', correctiveAction: 'بازکالیبراسیون کامل، تعویض سوکت سنسور و اجرای مجدد تست‌های نهایی',
    status: 'IN_REWORK', detectedById: qcu.id, detectedAt: D(-19),
  } })
  await db.nonconformity.create({ data: {
    code: 'NCR-1404-003', type: 'COMPLAINT', source: 'SERVICE', deviceId: dev10[3].id,
    title: `خاموشی ناگهانی دستگاه ${dev10[3].serial} حین استفاده`, description: 'بر اساس شکایت CMP-1404-001 بیمارستان؛ دستگاه در حین استفاده خاموش شده است. در حال بررسی.',
    severity: 'HIGH', status: 'OPEN', detectedById: smgr.id, detectedAt: D(-2),
  } })

  await db.reworkRecord.create({ data: { ncrId: ncr2.id, deviceId: dev13[4].id, orderId: po13.id, action: 'بازکالیبراسیون و تعویض سوکت سنسور', performedById: oper.id, performedAt: D(-3), notes: 'در انتظار Retest توسط QC' } })

  // ═══ آزادسازی محصولات PO-10 + ردیابی قطعات تولید ═══
  for (const dev of dev10) {
    await db.productRelease.create({ data: {
      deviceId: dev.id, releasedById: qcu.id, releasedAt: D(-142),
      notes: 'آزادسازی پس از تأیید کامل مدارک',
      checksJson: JSON.stringify([
        { key: 'steps', pass: true }, { key: 'packaging', pass: true }, { key: 'serial', pass: true },
        { key: 'tests-done', pass: true }, { key: 'tests-pass', pass: true }, { key: 'firmware', pass: true },
        { key: 'qc-verified', pass: true }, { key: 'not-released', pass: true },
      ]),
    } })
  }
  await db.devicePartUsage.createMany({ data: [
    { deviceId: dev10[0].id, componentId: cSens.id, lotId: lSens.id, lotNumber: lSens.lotNumber, qty: 1, source: 'PRODUCTION', usedById: oper.id, usedAt: D(-150) },
    { deviceId: dev10[1].id, componentId: cSens.id, lotId: lSens.id, lotNumber: lSens.lotNumber, qty: 1, source: 'PRODUCTION', usedById: oper.id, usedAt: D(-150) },
    { deviceId: dev10[2].id, componentId: cSens.id, lotId: lSens.id, lotNumber: lSens.lotNumber, qty: 1, source: 'PRODUCTION', usedById: oper.id, usedAt: D(-149) },
    { deviceId: dev10[0].id, componentId: cPcb.id, lotId: lPcb.id, lotNumber: lPcb.lotNumber, qty: 1, source: 'PRODUCTION', usedById: oper.id, usedAt: D(-152) },
    { deviceId: dev10[1].id, componentId: cPcb.id, lotId: lPcb.id, lotNumber: lPcb.lotNumber, qty: 1, source: 'PRODUCTION', usedById: oper.id, usedAt: D(-152) },
  ] })
  await db.componentLot.update({ where: { id: lSens.id }, data: { remaining: 147 } })
  await db.componentLot.update({ where: { id: lPcb.id }, data: { remaining: 198 } })

  // ═══ تیکت‌های خدمات ═══
  console.log('⏳ خدمات پس از فروش…')
  const st1 = await db.serviceTicket.create({ data: {
    code: 'ST-1404-001', customerId: cu1.id, deviceId: dev10[0].id, contactPhone: '021-48880123',
    problem: 'دستگاه پس از ۲۰ دقیقه کارکرد خطای E-03 نمایش می‌دهد و خاموش می‌شود', category: 'خطای الکترونیکی',
    priority: 'HIGH', status: 'DIAGNOSING', receivedAt: D(-4), assignedTechnicianId: tech1.id, createdById: sales.id,
    notes: 'مشتری گزارش کرده در ICU استفاده می‌شود — اولویت بالا',
  } })
  const st2 = await db.serviceTicket.create({ data: {
    code: 'ST-1404-002', customerId: cu3.id, deviceId: dev10[2].id, contactPhone: '051-38430111',
    problem: 'اتصال سنسور انگشتی مرتب قطع می‌شود', category: 'قطعه/لوازم',
    priority: 'NORMAL', status: 'CLOSED', receivedAt: D(-40), assignedTechnicianId: tech1.id, createdById: sales.id,
    resolvedAt: D(-36), closedAt: D(-35), closedById: smgr.id,
  } })
  const st3 = await db.serviceTicket.create({ data: {
    code: 'ST-1404-003', customerId: cu2.id, deviceId: dev10[4].id, contactPhone: '031-36690222',
    problem: 'دستگاه کلاً روشن نمی‌شود؛ آداپتور گرم می‌شود', category: 'تغذیه/برق',
    priority: 'URGENT', status: 'WAITING_PART', receivedAt: D(-6), assignedTechnicianId: tech2.id, createdById: smgr.id,
    notes: 'آداپتور معیوب — در انتظار رسید لات جدید آداپتور',
  } })
  await db.serviceTicket.create({ data: {
    code: 'ST-1404-004', customerId: cu4.id, deviceSerialText: 'PX100-A-0091 (خارج از رجیستری فعلی)',
    contactPhone: '026-34560444', problem: 'درخواست آموزش عملکرد و کالیبراسیون دوره‌ای', category: 'آموزش/کالیبراسیون',
    priority: 'LOW', status: 'NEW', receivedAt: D(-1), createdById: sales.id,
  } })
  const st5 = await db.serviceTicket.create({ data: {
    code: 'ST-1404-005', customerId: cu5.id, deviceId: dev10[1].id, contactPhone: '021-66570333',
    problem: 'کالیبراسیون سالانه مطابق SOP-24', category: 'کالیبراسیون',
    priority: 'NORMAL', status: 'RESOLVED', receivedAt: D(-15), assignedTechnicianId: tech1.id, createdById: smgr.id,
    resolvedAt: D(-13),
  } })

  await db.ticketUpdate.createMany({ data: [
    { ticketId: st1.id, userId: sales.id, text: 'تیکت ثبت شد و با مشتری تماس گرفته شد.', createdAt: D(-4) },
    { ticketId: st1.id, userId: smgr.id, text: 'ارجاع به تکنسین تهرانی — اولویت HIGH', createdAt: D(-3.5) },
    { ticketId: st1.id, userId: tech1.id, text: 'عیب‌یابی آغاز شد؛ احتمال مشکل برد تغذیه. در حال تست.', createdAt: D(-1) },
    { ticketId: st1.id, userId: tech1.id, text: 'خطای E-03 در تست مجدد بازتولید شد؛ ظاهراً رابط برد معیوب است.', createdAt: D(-0.5), internal: true },
    { ticketId: st2.id, userId: tech1.id, text: 'سیم سنسور فرسوده بود؛ تعویض انجام شد.', createdAt: D(-36) },
    { ticketId: st2.id, userId: smgr.id, text: 'تأیید رفع مشکل و بستن تیکت.', createdAt: D(-35) },
    { ticketId: st3.id, userId: tech2.id, text: 'آداپتور سوخته؛ نیاز به آداپتور جدید از موجودی.', createdAt: D(-5) },
  ] })

  // ═══ تعمیرات + قطعات مصرفی ═══
  const rep1 = await db.repair.create({ data: {
    code: 'REP-1404-001', ticketId: st2.id, deviceId: dev10[2].id, technicianId: tech1.id,
    diagnosis: 'قطعی سیم ماژول سنسور در محل اتصال', failureMode: 'فرسودگی مکانیکی کابل',
    rootCause: 'خستگی خمشی کابل به دلیل استفاده طولانی‌مدت', action: 'تعویض کامل ماژول سنسور پالس‌اکسیژن',
    result: 'FIXED', performedAt: D(-36), notes: 'پس از تعمیر، تست عملکرد با شبیه‌ساز انجام و تأیید شد.',
  } })
  await db.repair.create({ data: {
    code: 'REP-1404-002', ticketId: st5.id, deviceId: dev10[1].id, technicianId: tech1.id,
    diagnosis: 'انحراف کالیبراسیون ۰.۸٪', failureMode: 'انحراف تدریجی کالیبراسیون',
    rootCause: 'گذر زمان از آخرین کالیبراسیون', action: 'کالیبراسیون مجدد با شبیه‌ساز ProSim 8',
    result: 'FIXED', performedAt: D(-13), qcRequired: false,
  } })
  await db.repairPart.create({ data: { repairId: rep1.id, componentId: cSens.id, lotId: lSens2.id, lotNumber: lSens2.lotNumber, qty: 1, oldPart: 'ماژول سنسور فرسوده SN-90231', newPart: 'ماژول سنسور جدید از لات LT-SENS-2410' } })
  await db.devicePartUsage.create({ data: { deviceId: dev10[2].id, componentId: cSens.id, lotId: lSens2.id, lotNumber: lSens2.lotNumber, qty: 1, source: 'SERVICE', repairId: rep1.id, usedById: tech1.id, usedAt: D(-36) } })
  await db.component.update({ where: { id: cSens.id }, data: { stockQty: 199 } })
  await db.componentLot.update({ where: { id: lSens2.id }, data: { remaining: 59 } })

  // ═══ شکایات ═══
  const cmp1 = await db.complaint.create({ data: {
    code: 'CMP-1404-001', customerId: cu1.id, deviceId: dev10[3].id, description: 'خاموشی ناگهانی دستگاه حین استفاده در بخش ICU؛ به گفته پرستار نزدیک بود خطای دارویی رخ دهد.',
    severity: 'HIGH', safetyImpact: 'UNKNOWN', receivedAt: D(-2), status: 'INVESTIGATING', ticketId: st1.id,
    regulatoryReviewStatus: 'PENDING', createdById: smgr.id,
  } })
  await db.complaint.create({ data: {
    code: 'CMP-1404-002', customerId: cu3.id, description: 'تأخیر ۹ روزه در دریافت قطعه سنسور در تعمیر قبلی.',
    severity: 'LOW', safetyImpact: 'NO', receivedAt: D(-30), status: 'CLOSED',
    rootCause: 'کسری موجودی انبار قطعات یدکی', correctiveAction: 'تعیین حداقل موجودی قطعات پرمصرف (ROP)',
    preventiveAction: 'پایش هفتگی موجودی قطعات پرمصرف در داشبورد', resolution: 'ROP قطعات به‌روزرسانی و به مشتری اطلاع داده شد.',
    approvedById: qcu.id, approvedAt: D(-22), createdById: sales.id,
  } })
  await db.complaint.create({ data: {
    code: 'CMP-1404-003', customerId: cu4.id, deviceId: dev10[3].id, description: 'نویز متناوب روی نمایشگر OLED در دمای پایین اتاق.',
    severity: 'MEDIUM', safetyImpact: 'NO', receivedAt: D(-8), status: 'CAPA',
    rootCause: 'به‌روزرسانی ناموفق درایور نمایشگر در FW v1.0.8', correctiveAction: 'اصلاح درایور و انتشار FW v1.0.9 + به‌روزرسانی دستگاه‌های در خدمت',
    createdById: smgr.id,
  } })

  // ═══ گارانتی Override ═══
  await db.warrantyOverride.create({ data: { deviceId: dev10[2].id, status: 'IN_WARRANTY', reason: 'تمدید گارانتی ۶ ماهه طبق قرارداد خدمات', setById: smgr.id, setAt: D(-34) } })

  // ═══ مستندات ═══
  console.log('⏳ مستندات، اعلان‌ها و Audit…')
  await db.document.createMany({ data: [
    { name: 'گزارش تست نهایی PO-1404-013', docType: 'QC_REPORT', entityType: 'ORDER', entityId: po13.id, entityCode: 'PO-1404-013', revision: 1, status: 'ACTIVE', uploadedById: qcu.id, uploadedAt: D(-19), notes: 'شامل ۸ دستگاه — یک مورد FAIL' },
    { name: 'گواهی کالیبراسیون شبیه‌ساز ProSim 8', docType: 'CALIBRATION', entityCode: 'EQ-SIM-01', revision: 1, status: 'ACTIVE', uploadedById: qcu.id, uploadedAt: D(-160), notes: 'مرجع: آزمایشگاه کالیبراسیون پارس' },
    { name: 'گزارش تعمیر ST-1404-002', docType: 'REPAIR_REPORT', entityType: 'TICKET', entityId: st2.id, entityCode: 'ST-1404-002', revision: 1, status: 'ACTIVE', uploadedById: tech1.id, uploadedAt: D(-36) },
    { name: 'چک‌لیست QC نهایی نسخه ۳', docType: 'PRODUCTION', entityCode: 'PX-100', revision: 3, status: 'ACTIVE', uploadedById: qcu.id, uploadedAt: D(-60), notes: 'بازنگری پس از BOM r2' },
    { name: 'چک‌لیست QC نهایی نسخه ۲', docType: 'PRODUCTION', entityCode: 'PX-100', revision: 2, status: 'SUPERSEDED', uploadedById: qcu.id, uploadedAt: D(-200) },
  ] })

  // ═══ اعلان‌ها ═══
  await db.notification.createMany({ data: [
    { targetRole: 'WAREHOUSE', title: 'کسری قطعه بحرانی برای PO-1404-014', body: 'موتور پمپ (MOT-PMP-12): موردنیاز ۶، موجودی ۲، کسری ۴ عدد. سفارش در انتظار تأمین است.', severity: 'CRITICAL', entityType: 'ORDER', entityId: po14.id, linkView: 'order-detail' },
    { targetRole: 'PRODUCTION_MGR', title: 'سفارش فوری در انتظار مواد', body: 'PO-1404-014 (پمپ انفوزیون ×۶، اولویت فوری) در مرحله بررسی مواد متوقف است.', severity: 'WARNING', entityType: 'ORDER', entityId: po14.id, linkView: 'order-detail' },
    { targetRole: 'QC', title: 'تست نهایی ناموفق — NCR-1404-002', body: 'دستگاه PX100-B-0305 در تست دقت نهایی رد شد (خطا 4.1٪). دستگاه وارد Rework شد.', severity: 'CRITICAL', entityType: 'NCR', entityId: ncr2.id, linkView: 'quality' },
    { targetRole: 'QC', title: '۴ دستگاه ECG-300 در انتظار آزادسازی', body: 'سفارش PO-1404-015 تکمیل شده؛ دستگاه‌ها در صف آزادسازی هستند.', severity: 'INFO', entityType: 'ORDER', entityId: po15.id, linkView: 'release' },
    { targetRole: 'QC', title: 'شکایت با اثر احتمالی بر ایمنی — CMP-1404-001', body: 'شکایت بیمارستان میلاد (خاموشی ناگهانی) نیازمند بررسی رگولاتوری است. سیستم تصمیم‌گیرنده نیست؛ نیازمند بررسی فرد واجد صلاحیت.', severity: 'CRITICAL', entityType: 'COMPLAINT', entityId: cmp1.id, linkView: 'service' },
    { targetRole: 'QC', title: 'لات باتری در انتظار کنطrol ورودی'.replace('کنطrol', 'کنتر'), body: 'لات LT-BAT-2415 (۱۰۰ عدد BAT-LI-18650) منتظر تصمیم IQC است.', severity: 'INFO', entityType: 'INVENTORY', entityId: lBat.id, linkView: 'inventory' },
    { targetRole: 'SERVICE_MGR', title: 'تیکت فوری معوق', body: 'ST-1404-003 (دستگاه روشن نمی‌شود، اولویت فوری) بیش از ۶ روز در انتظار قطعه است.', severity: 'WARNING', entityType: 'TICKET', entityId: st3.id, linkView: 'service' },
    { targetRole: 'QC', title: 'کالیبراسیون اسیلوسکوپ منقضی شده', body: 'تجهیزات EQ-SCOP-01 باید پیش از استفاده مجدد کالیبره شود.', severity: 'WARNING', entityType: 'EQUIPMENT', entityId: eqScope.id, linkView: 'quality' },
  ] })

  // ═══ Audit Trail نمونه (Append-Only) ═══
  const A = (action: string, user: { id: string; username: string; role: string } | null, entityType: string, entityId: string, entityCode: string, newV: unknown, days: number) => ({
    userId: user?.id, username: user?.username, role: user?.role, action, entityType, entityId, entityCode,
    newValues: newV === undefined ? undefined : JSON.stringify(newV), ip: '10.12.0.20', userAgent: 'Seed/1.0', createdAt: D(-days),
  })
  const uP = { id: pmgr.id, username: 'pmgr', role: 'PRODUCTION_MGR' }
  const uQ = { id: qcu.id, username: 'qc', role: 'QC' }
  const uS = { id: smgr.id, username: 'smgr', role: 'SERVICE_MGR' }
  const uT = { id: tech1.id, username: 'tech1', role: 'TECHNICIAN' }
  const uSal = { id: sales.id, username: 'sales', role: 'SALES' }
  await db.auditLog.createMany({ data: [
    A('ORDER_CREATE', uP, 'ORDER', po10.id, 'PO-1404-010', { qty: 12, product: 'PX-100' }, 160),
    A('ORDER_TRANSITION', uP, 'ORDER', po10.id, 'PO-1404-010', { from: 'DRAFT', to: 'APPROVED' }, 159),
    A('ORDER_MATERIAL_RESERVE', uP, 'ORDER', po10.id, 'PO-1404-010', { components: 9, reservedQty: 12 }, 158),
    A('PRODUCT_RELEASE', uQ, 'DEVICE', dev10[0].id, dev10[0].serial, { checks: 'passed', releasedBy: 'qc' }, 142),
    A('PRODUCT_RELEASE', uQ, 'DEVICE', dev10[1].id, dev10[1].serial, { checks: 'passed' }, 142),
    A('DEVICE_DELIVER', uSal, 'DEVICE', dev10[0].id, dev10[0].serial, { customer: 'CU-001', deliveryNote: 'bill-1024' }, 120),
    A('QC_TEST_FAIL', uQ, 'DEVICE', dev13[4].id, dev13[4].serial, { template: 'FIN-ACC-01', actual: '4.1%', criteria: '≤ 2%' }, 19),
    A('NCR_CREATE', uQ, 'NCR', ncr2.id, 'NCR-1404-002', { severity: 'HIGH', device: dev13[4].serial }, 19),
    A('ORDER_TRANSITION', uQ, 'ORDER', po13.id, 'PO-1404-013', { from: 'WAITING_QC', to: 'REWORK' }, 18),
    A('REWORK_RECORD', uP, 'NCR', ncr2.id, 'NCR-1404-002', { device: dev13[4].serial, action: 'بازکالیبراسیون' }, 3),
    A('REPAIR_CREATE', uT, 'REPAIR', rep1.id, 'REP-1404-001', { device: dev10[2].serial, parts: ['SENS-SPO2-01 ×1'] }, 36),
    A('PART_USED_SERVICE', uT, 'DEVICE', dev10[2].id, dev10[2].serial, { component: 'SENS-SPO2-01', lot: 'LT-SENS-2410', qty: 1 }, 36),
    A('COMPLAINT_CREATE', uS, 'COMPLAINT', cmp1.id, 'CMP-1404-001', { severity: 'HIGH', safetyImpact: 'UNKNOWN' }, 2),
    A('WARRANTY_OVERRIDE', uS, 'DEVICE', dev10[2].id, dev10[2].serial, { from: 'computed', to: 'IN_WARRANTY', reason: 'تمدید قراردادی' }, 34),
    A('SECURITY', null, 'AUTH', '', '', { event: 'LOGIN_FAILED', username: 'root', detail: 'نام کاربری وجود ندارد' }, 1),
  ] })

  console.log('✅ Seed کامل شد.')
  const counts = {
    users: await db.user.count(), products: await db.product.count(), orders: await db.productionOrder.count(),
    devices: await db.device.count(), tests: await db.testResult.count(), tickets: await db.serviceTicket.count(),
    complaints: await db.complaint.count(), repairs: await db.repair.count(), audit: await db.auditLog.count(),
    notifications: await db.notification.count(),
  }
  console.log(JSON.stringify(counts, null, 2))
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
