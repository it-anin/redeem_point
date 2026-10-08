import {
  parsePoints, parseDate, parsePaste, buildPlan, buildLedger,
  makeBatchId, batchDate, listBatches, planRollback,
  sentinelId, OPENING_NAME, CLEAR_NAME,
} from './importHistory'

const NOW = new Date(2026, 9, 7, 9, 0, 0) // 7 ต.ค. 2026 09:00
const noon = (y, m, d) => new Date(y, m - 1, d, 12, 0, 0, 0)

const EMPS = [
  { id: 'somchai@gmail.com', email: 'somchai@gmail.com', name: 'สมชาย ใจดี', code: 'E001', role: 'employee', points: 0 },
  { id: 'somying@gmail.com', email: 'somying@gmail.com', name: 'สมหญิง รักงาน', code: 'E002', role: 'employee', points: 300 },
  { id: 'dup1@gmail.com', name: 'วิชัย', code: 'E010', role: 'employee', points: 0 },
  { id: 'dup2@gmail.com', name: 'วิชัย', code: 'E011', role: 'employee', points: 0 },
  { id: 'hr@gmail.com', name: 'HR Admin', code: 'A001', role: 'admin', points: 0 },
]
const PENDING = [{ id: 'E099', code: 'E099', name: 'ใหม่ ยังไม่ผูก' }]

const plan = (text, transactions = [], employees = EMPS) =>
  buildPlan({ rows: parsePaste(text, { now: NOW }).rows, employees, pending: PENDING, transactions })
const only = (text, ...rest) => plan(text, ...rest).items[0]

describe('parsePoints', () => {
  test('ตัวเลขปกติ / คอมมา / ทศนิยมศูนย์ / เลขไทย', () => {
    expect(parsePoints('1,500')).toEqual({ value: 1500 })
    expect(parsePoints(' 1500.00 ')).toEqual({ value: 1500 })
    expect(parsePoints('๑๒๐')).toEqual({ value: 120 })
    expect(parsePoints('0')).toEqual({ value: 0 })
  })
  test('ว่าง = blank', () => {
    expect(parsePoints('')).toEqual({ blank: true })
    expect(parsePoints('   ')).toEqual({ blank: true })
  })
  test('ไม่ใช่ตัวเลข / ติดลบ / ทศนิยม = error', () => {
    for (const bad of ['abc', '-5', '1e3', '12.5', '12x']) expect(parsePoints(bad).error).toBeTruthy()
  })
})

describe('parseDate', () => {
  test('รูปแบบต่างๆ ได้วันเดียวกัน (12:00 น.)', () => {
    const want = noon(2024, 3, 15)
    for (const s of ['15/03/2024', '2024-03-15', '15-3-2024 10:30', '15.03.2024', '2024-03-15T00:00:00']) {
      expect(parseDate(s, { now: NOW }).value).toEqual(want)
    }
  })
  test('พ.ศ. และเลขไทย', () => {
    expect(parseDate('15/03/2567', { now: NOW }).value).toEqual(noon(2024, 3, 15))
    expect(parseDate('๑๕/๐๓/๒๕๖๗', { now: NOW }).value).toEqual(noon(2024, 3, 15))
  })
  test('ว่าง = blank', () => {
    expect(parseDate('', { now: NOW })).toEqual({ blank: true })
  })
  test('ผิด: วันไม่มีจริง / ปี 2 หลัก / ปีเก่าเกิน / อ่านไม่ได้', () => {
    for (const bad of ['31/02/2024', '15/03/24', '15/03/1990', '2024/13/01', 'เมื่อวาน']) {
      expect(parseDate(bad, { now: NOW }).error).toBeTruthy()
    }
  })
  test('อนาคต = error แต่วันนี้ผ่าน (แม้เวลาตอนนี้ยังไม่ถึง 12:00)', () => {
    expect(parseDate('08/10/2026', { now: NOW }).error).toMatch(/อนาคต/)
    expect(parseDate('07/10/2026', { now: NOW }).value).toEqual(noon(2026, 10, 7))
  })
})

describe('parsePaste', () => {
  test('ข้ามหัวตาราง และเก็บข้อความหัวไว้โชว์', () => {
    const { rows, header } = parsePaste('พนักงาน\tชื่อรางวัล\tคะแนนทั้งหมด\tคะแนนที่ใช้แลก\tวันที่\nE001\tบัตรกำนัล\t1500\t500\t15/03/2024', { now: NOW })
    expect(header).toMatch(/คะแนนทั้งหมด/)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ line: 2, employeeKey: 'E001', rewardName: 'บัตรกำนัล', total: 1500, used: 500, date: noon(2024, 3, 15) })
  })
  test('แถวแรกที่มีตัวเลข = ข้อมูล ไม่ใช่หัวตาราง; บรรทัดว่างข้ามแต่เลขบรรทัดยังนับ', () => {
    const { rows, header } = parsePaste('E001\tA\t100\t10\n\n   \nE002\tB\t200\t20', { now: NOW })
    expect(header).toBeNull()
    expect(rows.map((r) => r.line)).toEqual([1, 4])
  })
  test('คอลัมน์ว่างได้ค่าเริ่มต้น: ใช้แลกว่าง=0, วันที่ว่าง=null, คะแนนทั้งหมดว่าง=null', () => {
    const { rows } = parsePaste('E001\t\t\t', { now: NOW })
    expect(rows[0]).toMatchObject({ rewardName: '', total: null, used: 0, date: null, errors: [] })
  })
  test('คอลัมน์ที่ 6 = คงเหลือ (ว่างได้) และหัวตาราง 6 คอลัมน์ยังถูกข้าม', () => {
    const { rows, header } = parsePaste('พนักงาน\tชื่อรางวัล\tคะแนนทั้งหมด\tคะแนนที่ใช้แลก\tวันที่\tคงเหลือ\nE001\tของ\t2290\t800\t\t320\nE001\tของ2\t2290\t400', { now: NOW })
    expect(header).toMatch(/คงเหลือ/)
    expect(rows.map((r) => r.remaining)).toEqual([320, null])
    expect(rows[0].errors).toEqual([])
  })
  test('ไฟล์ที่ไม่มีคอลัมน์วันที่แล้วเอาคงเหลือไว้คอลัมน์ที่ 5 → error พร้อมบอกให้ย้ายไปคอลัมน์ที่ 6; คงเหลือไม่ใช่ตัวเลข = error', () => {
    expect(parsePaste('E001\tของ\t2290\t800\t320', { now: NOW }).rows[0].errors.join()).toMatch(/คอลัมน์ที่ 6/)
    expect(parsePaste('E001\tของ\t2290\t800\t\tabc', { now: NOW }).rows[0].errors.join()).toMatch(/คงเหลือ/)
  })
  test('error ระดับแถว: ใช้แลกแต่ไม่มีชื่อรางวัล / เลขผิด / วันที่ผิด / ไม่มีพนักงาน', () => {
    const { rows } = parsePaste('E001\t\t100\t50\n\tของ\t100\t10\nE001\tของ\tabc\t10\nE001\tของ\t100\t10\t99/99/2024', { now: NOW })
    expect(rows[0].errors.join()).toMatch(/ไม่มีชื่อรางวัล/)
    expect(rows[1].errors.join()).toMatch(/ไม่มีรหัส/)
    expect(rows[2].errors.join()).toMatch(/คะแนนทั้งหมด/)
    expect(rows[3].errors.join()).toMatch(/วันที่/)
  })
})

describe('buildPlan — จับคู่พนักงาน', () => {
  test('ตามรหัส / อีเมล (ไม่สนตัวพิมพ์) / ชื่อ', () => {
    expect(only('E001\tของ\t1500\t500')).toMatchObject({ status: 'ok', matchedBy: 'code', employee: { id: 'somchai@gmail.com' } })
    expect(only('e001\tของ\t1500\t500').matchedBy).toBe('code')
    expect(only('SomChai@Gmail.com\tของ\t1500\t500')).toMatchObject({ status: 'ok', matchedBy: 'email' })
    expect(only('สมชาย  ใจดี\tของ\t1500\t500')).toMatchObject({ status: 'ok', matchedBy: 'name' })
  })
  test('ลำดับความสำคัญ: รหัส ชนะ ชื่อ', () => {
    const emps = [
      { id: 'a@x.com', name: 'คนแรก', code: 'สมชาย', role: 'employee', points: 0 },
      { id: 'b@x.com', name: 'สมชาย', code: 'B1', role: 'employee', points: 0 },
    ]
    expect(only('สมชาย\tของ\t100\t10', [], emps).employee.id).toBe('a@x.com')
  })
  test('ชื่อซ้ำ = error แนะนำให้ใช้รหัส/อีเมล', () => {
    const item = only('วิชัย\tของ\t100\t10')
    expect(item.status).toBe('error')
    expect(item.errors.join()).toMatch(/2 คน/)
    expect(only('E010\tของ\t100\t10').status).toBe('ok')
  })
  test('แอดมิน / ยังไม่ผูกบัญชี / ไม่พบ = error คนละข้อความ', () => {
    expect(only('A001\tของ\t100\t10').errors.join()).toMatch(/แอดมิน/)
    expect(only('E099\tของ\t100\t10').errors.join()).toMatch(/ยังไม่ผูกบัญชี/)
    expect(only('ใหม่ ยังไม่ผูก\tของ\t100\t10').errors.join()).toMatch(/ยังไม่ผูกบัญชี/)
    expect(only('ZZZ\tของ\t100\t10').errors.join()).toMatch(/ไม่พบพนักงาน/)
  })
  test('หลายแถวของคนเดียวกัน (คนละวิธีระบุ) รวมเป็นรายการเดียว', () => {
    const { items } = plan('E001\tA\t1500\t100\nสมชาย ใจดี\tB\t1500\t200')
    expect(items).toHaveLength(1)
    expect(items[0]).toMatchObject({ used: 300, total: 1500, remaining: 1200 })
    expect(items[0].redemptions.map((r) => r.rewardName)).toEqual(['A', 'B'])
  })
})

describe('buildPlan — ตรวจข้อมูล', () => {
  test('"คะแนนทั้งหมด" ไม่เท่ากันในแต่ละแถว = error', () => {
    const item = only('E001\tA\t1500\t100\nE001\tB\t1400\t100')
    expect(item.status).toBe('error')
    expect(item.errors.join()).toMatch(/ไม่เท่ากัน/)
  })
  test('ใส่ "คะแนนทั้งหมด" แค่แถวเดียวก็พอ', () => {
    expect(only('E001\tA\t1500\t100\nE001\tB\t\t200')).toMatchObject({ status: 'ok', total: 1500, used: 300 })
  })
  test('ไม่มี "คะแนนทั้งหมด" เลย = error', () => {
    expect(only('E001\tA\t\t100').errors.join()).toMatch(/ไม่มี "คะแนนทั้งหมด"/)
  })
  test('ใช้แลกรวมมากกว่าคะแนนทั้งหมด = error', () => {
    const item = only('E001\tA\t500\t300\nE001\tB\t500\t300')
    expect(item.status).toBe('error')
    expect(item.errors.join()).toMatch(/มากกว่า/)
  })
  test('เกิน 400 รายการต่อคน = error (1 คน = 1 transaction ของ Firestore เขียนได้ไม่เกิน 500 doc)', () => {
    const many = Array.from({ length: 401 }, (_, i) => `E001\tของ${i}\t1000\t1`).join('\n')
    expect(only(many).errors.join()).toMatch(/เกินที่นำเข้าต่อคน/)
    expect(only(many.split('\n').slice(0, 400).join('\n')).status).toBe('ok')
  })
  test('แถวที่เลขผิดทำให้พนักงานคนนั้นถูกข้ามทั้งคน แต่คนอื่นยังนำเข้าได้', () => {
    const { items, summary } = plan('E001\tA\tabc\t100\nE002\tB\t1000\t200')
    expect(items.map((i) => i.status)).toEqual(['error', 'ok'])
    expect(summary).toMatchObject({ ok: 1, error: 1, skip: 0 })
  })
  test('คนที่ไม่เคยแลก: แถวชื่อรางวัลว่าง + ใช้แลก 0 → ตั้งยอดได้ ไม่สร้างประวัติแลก', () => {
    const item = only('E001\t\t800\t0')
    expect(item).toMatchObject({ status: 'ok', total: 800, used: 0, remaining: 800, redemptions: [], ledgerRows: 1 })
  })
  test('คะแนนทั้งหมด 0 และไม่มีรายการ = skip', () => {
    expect(only('E001\t\t0\t0')).toMatchObject({ status: 'skip' })
  })
  test('นำเข้าไปแล้ว (มีแถว imp_<email>) = skip', () => {
    const item = only('E001\tA\t1500\t100', [{ id: sentinelId('somchai@gmail.com'), employeeId: 'somchai@gmail.com', imported: true }])
    expect(item.status).toBe('skip')
    expect(item.info).toMatch(/นำเข้าไปแล้ว/)
  })
  test('คำเตือน: ยอดปัจจุบัน ≠ 0 / มีประวัติเดิม / รางวัลใช้แลก 0', () => {
    const txs = [{ id: 't1', employeeId: 'somying@gmail.com' }, { id: 't2', employeeId: 'somying@gmail.com' }, { id: 't3', employeeId: 'somying@gmail.com', imported: true }]
    const item = only('E002\tของแจก\t1000\t0\nE002\tA\t1000\t200', txs)
    expect(item.status).toBe('ok')
    expect(item.warnings.join('|')).toMatch(/ยอดปัจจุบัน 300 จะถูกล้าง.*800/)
    expect(item.warnings.join('|')).toMatch(/ประวัติเดิม 2 รายการ/)
    expect(item.warnings.join('|')).toMatch(/ใช้แลก 0 แต้ม/)
  })
  test('สรุป + เรียง error ก่อน ok ก่อน skip', () => {
    const { items, summary } = plan('E001\tA\t1500\t500\nE002\tB\t1000\t200\nZZZ\tC\t10\t1\nE010\t\t0\t0')
    expect(items.map((i) => i.status)).toEqual(['error', 'ok', 'ok', 'skip'])
    expect(summary).toEqual({ ok: 2, error: 1, skip: 1, rows: 1 + 1 + (1 + 1 + 1), redemptions: 2, checked: 0, carried: 2500, used: 700 })
  })
})

describe('buildPlan — เทียบกับ "คงเหลือ" ในไฟล์เก่า', () => {
  // ตัวอย่างจริง SRC-SA-PHAS-0022: ทั้งหมด 2290, ใช้แลก 1970 (4 รายการ), คงเหลือ 320
  const E = [
    { id: 'src22@x.com', name: 'พนักงานตัวอย่าง', code: 'SRC-SA-PHAS-0022', role: 'employee', points: 0 },
    { id: 'other@x.com', name: 'อีกคน', code: 'E500', role: 'employee', points: 0 },
  ]
  const ITEMS = [['บัตรกำนัล', 800], ['เสื้อ', 450], ['แก้วน้ำ', 320], ['กระเป๋า', 400]]
  const sheet = (items = ITEMS, remaining = 320, key = 'src-sa-phas-0022') =>
    items.map(([n, u]) => [key, n, 2290, u, '', remaining].join('\t')).join('\n')
  const planE = (t) => plan(t, [], E)
  const one = (t) => planE(t).items[0]

  test('รายการแลกรวม 1970 ตรงกับ 2290 − 320 → ผ่าน และนับว่าเทียบแล้ว', () => {
    expect(one(sheet())).toMatchObject({ status: 'ok', matchedBy: 'code', total: 2290, used: 1970, remaining: 320, fileRemaining: 320, errors: [] })
    expect(planE(sheet()).summary).toMatchObject({ ok: 1, error: 0, checked: 1 })
  })
  test('รายการหาย (รวมได้ 1870) → ไม่นำเข้า และบอกว่าขาดไป 100', () => {
    const p = planE(sheet([['บัตรกำนัล', 800], ['เสื้อ', 450], ['แก้วน้ำ', 220], ['กระเป๋า', 400]]))
    expect(p.items[0].status).toBe('error')
    const msg = p.items[0].errors.join()
    expect(msg).toMatch(/2,290.*320.*1,970/)
    expect(msg).toMatch(/รวมได้ 1,870/)
    expect(msg).toMatch(/รายการขาดไป 100/)
    expect(p.summary).toMatchObject({ ok: 0, error: 1, checked: 0 })
  })
  test('รายการเกิน (รวมได้ 2070) → ไม่นำเข้า และบอกว่าเกินมา 100', () => {
    const it = one(sheet([['บัตรกำนัล', 800], ['เสื้อ', 450], ['แก้วน้ำ', 320], ['กระเป๋า', 500]]))
    expect(it.status).toBe('error')
    expect(it.errors.join()).toMatch(/รายการเกินมา 100/)
  })
  test('คงเหลือมากกว่าคะแนนทั้งหมด → error', () => {
    expect(one(sheet(ITEMS, 3000)).errors.join()).toMatch(/มากกว่าคะแนนทั้งหมด/)
  })
  test('"คงเหลือ" ไม่เท่ากันในแต่ละแถว → error; ใส่แถวเดียวก็เทียบได้', () => {
    const mixed = [
      ['src-sa-phas-0022', 'A', 2290, 1000, '', 320].join('\t'),
      ['src-sa-phas-0022', 'B', 2290, 970, '', 300].join('\t'),
    ].join('\n')
    expect(one(mixed).errors.join()).toMatch(/คงเหลือ.*ไม่เท่ากัน/)
    const onlyOnce = [
      ['src-sa-phas-0022', 'A', 2290, 1000, '', ''].join('\t'),
      ['src-sa-phas-0022', 'B', 2290, 970, '', 320].join('\t'),
    ].join('\n')
    expect(one(onlyOnce)).toMatchObject({ status: 'ok', fileRemaining: 320 })
  })
  test('ไม่มีคอลัมน์คงเหลือ = ไม่เทียบ ผ่านเหมือนเดิม และไม่นับใน checked', () => {
    const noRem = ITEMS.map(([n, u]) => ['src-sa-phas-0022', n, 2290, u].join('\t')).join('\n')
    expect(one(noRem)).toMatchObject({ status: 'ok', fileRemaining: null })
    expect(planE(noRem).summary).toMatchObject({ ok: 1, checked: 0 })
  })
  test('ตรวจรายคน: คนที่ตรงผ่าน คนที่ไม่ตรงถูกข้าม และ checked นับเฉพาะคนที่ผ่าน', () => {
    const p = planE(sheet() + '\n' + ['E500', 'ของ', 1000, 100, '', 800].join('\t'))
    expect(p.items.map((i) => [i.label, i.status])).toEqual([['อีกคน', 'error'], ['พนักงานตัวอย่าง', 'ok']])
    expect(p.summary).toMatchObject({ ok: 1, error: 1, checked: 1 })
  })
  test('ตัวเลขใน ledger ที่เขียนจริงยังเป็น 2290 − 1970 = 320 (คงเหลือในไฟล์ใช้ตรวจ ไม่ใช่ค่าที่ตั้ง)', () => {
    const it = one(sheet())
    const { points, rows } = buildLedger(it, { current: 0, batchId: 'imp-x', cutoff: noon(2025, 9, 30) })
    expect(points).toBe(320)
    expect(rows.map((r) => r.data.pointsUsed)).toEqual([-2290, 800, 450, 320, 400])
    expect(rows.reduce((s, r) => s - r.data.pointsUsed, 0)).toBe(320)
  })
})

describe('buildLedger', () => {
  const cutoff = noon(2025, 12, 31)
  const item = (text) => only(text)
  const sum = (rows) => rows.reduce((s, r) => s - r.data.pointsUsed, 0) // ผลต่อยอดรวม = −Σ pointsUsed

  test('ยอดเดิม 0: ยอดยกมา + รายการแลก, ยอดสุดท้าย = T−ΣU', () => {
    const it = item('E001\tบัตรกำนัล\t1500\t500\t15/03/2024\nE001\tเสื้อ\t1500\t300')
    const { points, rows } = buildLedger(it, { current: 0, batchId: 'imp-x', cutoff })
    expect(points).toBe(700)
    expect(rows).toHaveLength(3)
    expect(rows[0].id).toBe(sentinelId('somchai@gmail.com'))
    expect(rows[0].data).toMatchObject({ rewardName: OPENING_NAME, pointsUsed: -1500, status: 'เพิ่มแต้ม', createdAt: cutoff })
    expect(rows[0].data.addedByAdmin).toBeUndefined() // ไม่ขึ้นประวัติมือถือ / ไม่นับ "แต้มที่ใช้ไป"
    expect(rows[1].data).toMatchObject({
      rewardName: 'บัตรกำนัล', pointsUsed: 500, rewardId: null, addedByAdmin: true,
      approval: 'อนุมัติแล้ว', status: 'สำเร็จ', createdAt: noon(2024, 3, 15),
    })
    expect(rows[2].data.createdAt.getTime()).toBeGreaterThan(cutoff.getTime()) // ไม่มีวันที่ → ใช้วันตัดยอด (+ms เรียงลำดับ)
    expect(rows[2].data.createdAt.getTime() - cutoff.getTime()).toBeLessThan(1000)
    expect(0 + sum(rows)).toBe(points)
  })

  test('ยอดเดิม ≠ 0: มีแถวล้างยอดเดิม และยอดสุดท้ายยังเท่ากับ T−ΣU', () => {
    const it = item('E002\tของ\t1500\t500')
    const { points, rows } = buildLedger(it, { current: 300, batchId: 'imp-x', cutoff })
    expect(points).toBe(1000)
    expect(rows.map((r) => r.data.rewardName)).toEqual([OPENING_NAME, CLEAR_NAME, 'ของ'])
    expect(rows[1].data).toMatchObject({ pointsUsed: 300, status: 'หักแต้ม' })
    expect(rows[1].data.addedByAdmin).toBeUndefined()
    expect(300 + sum(rows)).toBe(points) // ยอดเดิม + ผลต่อยอดของทุกแถว = ยอดใหม่
  })

  test('ทุกแถวติด imported + importBatch และผูกพนักงานถูกคน', () => {
    const { rows } = buildLedger(item('E002\tของ\t1500\t500'), { current: 300, batchId: 'imp-abc', cutoff })
    for (const r of rows) {
      expect(r.data).toMatchObject({ imported: true, importBatch: 'imp-abc', employeeId: 'somying@gmail.com', employeeName: 'สมหญิง รักงาน', rewardId: null })
    }
  })

  test('T = 0 ไม่ได้ค่า -0', () => {
    const { rows } = buildLedger(item('E001\tของฟรี\t0\t0'), { current: 0, batchId: 'imp-x', cutoff })
    expect(Object.is(rows[0].data.pointsUsed, 0)).toBe(true)
  })
})

describe('ชุดนำเข้า / ย้อนการนำเข้า', () => {
  test('makeBatchId ↔ batchDate', () => {
    const d = new Date(2026, 9, 7, 15, 30, 5)
    const id = makeBatchId(d, 0)
    expect(id).toBe('imp-20261007153005-0000')
    expect(batchDate(id)).toEqual(d)
    expect(batchDate('whatever')).toBeNull()
  })

  test('listBatches: นับแถว/คน เรียงใหม่ล่าสุดก่อน และไม่เอาแถวที่ไม่ใช่การนำเข้า', () => {
    const txs = [
      { id: '1', employeeId: 'a', importBatch: 'imp-20261001000000-aaaa' },
      { id: '2', employeeId: 'a', importBatch: 'imp-20261001000000-aaaa' },
      { id: '3', employeeId: 'b', importBatch: 'imp-20261001000000-aaaa' },
      { id: '4', employeeId: 'a', importBatch: 'imp-20261005000000-bbbb' },
      { id: '5', employeeId: 'a' },
    ]
    expect(listBatches(txs).map((b) => [b.batchId, b.rows, b.employees])).toEqual([
      ['imp-20261005000000-bbbb', 1, 1],
      ['imp-20261001000000-aaaa', 3, 2],
    ])
  })

  test('planRollback.expected = ยอดที่ชุดตั้งไว้ (ยอดยกมา + รายการแลก ไม่นับแถวล้างยอดเดิม) และตามไปเมื่อแถวของชุดถูกแก้/ลบทีหลัง', () => {
    const it = only('E002\tของ\t1500\t500\nE002\tเสื้อ\t1500\t200') // E002 ยอดเดิม 300 → มีแถวล้างยอดเดิมด้วย
    const { points, rows } = buildLedger(it, { current: 300, batchId: 'imp-x', cutoff: noon(2025, 12, 31) })
    const txs = rows.map((r, i) => ({ id: r.id ?? `auto${i}`, ...r.data }))
    const [g] = planRollback(txs, 'imp-x')
    expect(points).toBe(800)
    expect(g.expected).toBe(800) // = ยอดหลังนำเข้า (ไม่รวมแถวล้างยอดเดิม)

    // แอดมินแก้แถวรายการแลกหนึ่งแถว +100 ทีหลัง (ยอดจริงลดลงตามคู่กัน → 700) → expected ตามไปเป็น 700
    const edited = txs.map((t) => (t.rewardName === 'ของ' ? { ...t, pointsUsed: 600 } : t))
    expect(planRollback(edited, 'imp-x')[0].expected).toBe(700)
    // แอดมินลบแถวรายการแลกหนึ่งแถว (คืนแต้ม 200 → ยอดจริง 1000) → expected = 1000
    expect(planRollback(txs.filter((t) => t.rewardName !== 'เสื้อ'), 'imp-x')[0].expected).toBe(1000)
  })

  test('นำเข้า (ยอดเดิม 300) แล้วย้อน → ยอดกลับเป็น 300 เท่าเดิม', () => {
    const it = only('E002\tของ\t1500\t500\nE002\tเสื้อ\t1500\t200')
    const { points, rows } = buildLedger(it, { current: 300, batchId: 'imp-x', cutoff: noon(2025, 12, 31) })
    expect(points).toBe(800)
    const txs = rows.map((r, i) => ({ id: r.id ?? `auto${i}`, ...r.data }))
    const [g, ...rest] = planRollback(txs, 'imp-x')
    expect(rest).toHaveLength(0)
    expect(g).toMatchObject({ employeeId: 'somying@gmail.com', ids: expect.any(Array) })
    expect(g.ids).toHaveLength(4)
    expect(points + g.delta).toBe(300)
  })
})
