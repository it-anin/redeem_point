import { isRedemption, isRejected, balanceEffect, spentOf, netUsedOf, reconcile, APPROVAL } from './pointsLedger'

// แถวตัวอย่าง — ตรงกับที่แต่ละเส้นทางในแอปสร้างจริง
const REDEEM = { id: 'a', rewardId: 'r1', rewardName: 'เสื้อ', pointsUsed: 400, approval: APPROVAL.APPROVED }            // พนักงานแลกเอง
const REJECTED = { id: 'b', rewardId: 'r2', rewardName: 'แก้ว', pointsUsed: 300, approval: APPROVAL.REJECTED }            // ปฏิเสธแล้ว (คืนแต้มไปแล้ว)
const ADMIN_REDEEM = { id: 'c', rewardId: null, addedByAdmin: true, rewardName: 'ของขวัญ', pointsUsed: 100, approval: APPROVAL.APPROVED } // 🎁 บันทึกการแลก
const LEGACY_ADD = { id: 'd', rewardId: null, addedByAdmin: true, rewardName: 'โบนัส', pointsUsed: -500, approval: APPROVAL.APPROVED }  // ปุ่ม ➕ เก่า ใส่ -500
const ADJUST_ADD = { id: 'e', rewardId: null, rewardName: 'เพิ่มแต้มโดย Admin', pointsUsed: -200, status: 'เพิ่มแต้ม' }   // พนักงาน → ปรับแต้ม
const ADJUST_SUB = { id: 'f', rewardId: null, rewardName: 'หักแต้มโดย Admin', pointsUsed: 50, status: 'หักแต้ม' }
const RECORD_ONLY = { id: 'g', rewardId: null, addedByAdmin: true, rewardName: 'บันทึกเฉยๆ', pointsUsed: 0 }
const OPENING = { id: 'imp_x', rewardId: null, rewardName: 'ยอดยกมาจากระบบเก่า', pointsUsed: -2290, imported: true }

describe('isRedemption / isRejected', () => {
  test('รายการแลกจริง และที่ admin บันทึกแทน (รวมบันทึกเฉยๆ 0 แต้ม) = รายการแลก', () => {
    for (const t of [REDEEM, REJECTED, ADMIN_REDEEM, RECORD_ONLY]) expect(isRedemption(t)).toBe(true)
  })
  test('แถวเพิ่มแต้ม (ปุ่มเก่าใส่ติดลบ / ปรับแต้ม / ยอดยกมา) และแถวหักแต้มปรับยอด ไม่ใช่รายการแลก', () => {
    for (const t of [LEGACY_ADD, ADJUST_ADD, ADJUST_SUB, OPENING]) expect(isRedemption(t)).toBe(false)
  })
  test('isRejected ดูเฉพาะ approval = ปฏิเสธ; ค่าว่าง/undefined ไม่พัง', () => {
    expect(isRejected(REJECTED)).toBe(true)
    expect(isRejected(REDEEM)).toBe(false)
    expect(isRejected(undefined)).toBe(false)
    expect(isRedemption(undefined)).toBe(false)
  })
})

describe('balanceEffect / spentOf / netUsedOf', () => {
  test('ผลต่อยอด: แลก −, เพิ่มแต้ม +, ปฏิเสธ 0 (คืนไปแล้ว), และไม่เป็น −0', () => {
    expect(balanceEffect(REDEEM)).toBe(-400)
    expect(balanceEffect(LEGACY_ADD)).toBe(500)
    expect(balanceEffect(REJECTED)).toBe(0)
    expect(Object.is(balanceEffect(RECORD_ONLY), 0)).toBe(true)
    expect(Object.is(balanceEffect({ approval: APPROVAL.REJECTED }), 0)).toBe(true)
  })
  test('"แต้มที่ใช้ไป" = เฉพาะรายการแลกที่ไม่ถูกปฏิเสธ — ไม่ถูกแถวเพิ่มแต้มหักลด ไม่ถูกรายการที่คืนไปแล้วบวกเพิ่ม (กรณีจริง: ควร 400 เคยโชว์ 200)', () => {
    expect(spentOf([REDEEM, REJECTED, LEGACY_ADD])).toBe(400)
    expect(spentOf([REDEEM, ADMIN_REDEEM, ADJUST_SUB])).toBe(500)
    expect(spentOf([])).toBe(0)
  })
  test('"สุทธิตามประวัติ" ไม่รวมแถวที่ปฏิเสธ: แลก 400 + ปฏิเสธ 300 + เพิ่ม 500 → ได้สุทธิ 100 (pointsUsed สุทธิ −100)', () => {
    expect(netUsedOf([REDEEM, REJECTED, LEGACY_ADD])).toBe(-100)
    expect(netUsedOf([REDEEM, ADMIN_REDEEM])).toBe(500)
  })
})

describe('reconcile — ตรวจยอดแต้ม', () => {
  const emp = (id, name, points, extra = {}) => ({ id, name, points, role: 'employee', ...extra })
  const row = (employeeId, t) => ({ employeeId, ...t })

  test('ตรง / ไม่มีประวัติ / ไม่ตรง แยกสถานะ และเรียงตัวที่ไม่ตรงขึ้นก่อน (มากไปน้อย)', () => {
    const employees = [
      emp('ok@x', 'ก', 100),
      emp('none@x', 'ข', 500), // แต้มเริ่มต้น ไม่มีแถวประวัติ
      emp('bad@x', 'ค', 900),
      emp('worse@x', 'ง', 0),
    ]
    const txs = [
      row('ok@x', { pointsUsed: -500 }), row('ok@x', { pointsUsed: 400, rewardId: 'r' }), // ledger = +100
      row('bad@x', { pointsUsed: -500 }),                                                  // ledger = 500 แต่ยอดจริง 900 → +400
      row('worse@x', { pointsUsed: -1000 }),                                               // ledger = 1000 แต่ยอดจริง 0 → −1000
    ]
    const { people, summary } = reconcile(employees, txs)
    expect(summary).toEqual({ total: 4, ok: 1, diff: 2, noHistory: 1 })
    expect(people.map((p) => [p.employee.id, p.status, p.diff])).toEqual([
      ['worse@x', 'diff', -1000],
      ['bad@x', 'diff', 400],
      ['none@x', 'noHistory', 500],
      ['ok@x', 'ok', 0],
    ])
  })

  test('แถวที่ปฏิเสธไม่นับในยอดตามประวัติ → คนที่เคยถูกปฏิเสธและข้อมูลถูกต้องจะ "ตรง" (เดิมจะขึ้นไม่ตรง 300)', () => {
    const { people } = reconcile([emp('a@x', 'A', 600)], [row('a@x', { pointsUsed: -1000 }), row('a@x', REDEEM), row('a@x', REJECTED)])
    expect(people[0]).toMatchObject({ ledger: 600, diff: 0, status: 'ok', rejected: 1 })
  })

  test('ข้อสังเกต: แถวเพิ่มแต้มจากปุ่มเก่า (นับจำนวน/แต้ม) และสถานะนำเข้า; แถวนำเข้าเองไม่ถูกนับเป็นปุ่มเก่า', () => {
    const txs = [row('a@x', LEGACY_ADD), row('a@x', { ...LEGACY_ADD, id: 'd2', pointsUsed: -250 }), row('a@x', OPENING)]
    const { people } = reconcile([emp('a@x', 'A', 3040)], txs)
    expect(people[0].legacyAdds).toEqual({ count: 2, points: 750 })
    expect(people[0].imported).toBe(true)
    expect(people[0]).toMatchObject({ ledger: 3040, diff: 0, status: 'ok' })
  })

  test('แอดมินไม่อยู่ในรายการ; ประวัติของบัญชีที่ไม่มีใน employees แล้วแยกเป็น orphans', () => {
    const employees = [emp('a@x', 'A', 0), emp('admin@x', 'Admin', 0, { role: 'admin' })]
    const txs = [row('gone@x', { employeeName: 'คนที่ถูกลบ', pointsUsed: 100 }), row('gone@x', { pointsUsed: -300 })]
    const { people, orphans } = reconcile(employees, txs)
    expect(people.map((p) => p.employee.id)).toEqual(['a@x'])
    expect(orphans).toEqual([{ employeeId: 'gone@x', name: 'คนที่ถูกลบ', count: 2, net: 200 }])
  })

  test('ไม่มีข้อมูล = ไม่พัง', () => {
    expect(reconcile([], [])).toEqual({ people: [], orphans: [], summary: { total: 0, ok: 0, diff: 0, noHistory: 0 } })
  })
})
