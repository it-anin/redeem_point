// ตรรกะล้วน (ไม่แตะ Firebase) ว่า "แถวใน transactions แต่ละแบบ มีผลต่อยอดแต้มอย่างไร" — ใช้ร่วมกันทุกหน้า (มือถือ/แอดมิน/ตรวจยอด)
// เพื่อให้ทุกที่นิยามเหมือนกัน (เดิมแต่ละหน้าเขียนเงื่อนไขเองจนไม่ตรงกัน: แถวเพิ่มแต้มโผล่เป็นรายการแลก, แถวที่ปฏิเสธถูกนับเป็นการใช้แต้ม ฯลฯ)
//
// ข้อตกลง pointsUsed (ดู CLAUDE.md): บวก = ใช้แต้ม, ลบ = ได้รับแต้ม, ผลต่อยอดพนักงาน = −pointsUsed

export const APPROVAL = { PENDING: 'รออนุมัติ', APPROVED: 'อนุมัติแล้ว', REJECTED: 'ปฏิเสธ' }

// error ที่มี code ไว้ให้หน้าจอแยกแยะ (เช่น STALE / GONE / PRICE_CHANGED) แทนการเทียบข้อความ
export const fail = (message, code, extra) => Object.assign(new Error(message), { code, ...extra })

// แถวที่ "ปฏิเสธ" ถูกคืนแต้ม+สต็อกไปแล้วตั้งแต่ตอนปฏิเสธ → ไม่มีผลต่อยอดอีก (ห้ามคืน/ปรับซ้ำตอนลบหรือแก้แถว)
export const isRejected = (t) => t?.approval === APPROVAL.REJECTED

// รายการแลก (พนักงานแลกเอง หรือ admin บันทึกแทน) = ใช้แต้ม → pointsUsed >= 0
// ⚠️ แถวที่ปุ่ม "➕ เพิ่มรายการ" เวอร์ชันเก่าสร้างตอนแอดมินใส่ค่าติดลบ (= เพิ่มแต้ม) ก็มี addedByAdmin เหมือนกัน แต่ pointsUsed < 0 → ไม่ใช่รายการแลก
export const isRedemption = (t) => Boolean(t?.rewardId || t?.addedByAdmin) && (t?.pointsUsed ?? 0) >= 0

// ผลของแถวนี้ต่อยอดแต้มพนักงาน (บวก = ได้, ลบ = เสีย); `0 -` กัน −0
export const balanceEffect = (t) => (isRejected(t) ? 0 : 0 - (t?.pointsUsed ?? 0))

// "แต้มที่ใช้ไป" ที่โชว์ให้พนักงาน/แอดมิน = รายการแลกที่ไม่ถูกปฏิเสธ (ไม่รวมแถวเพิ่มแต้ม และไม่รวมที่คืนแต้มไปแล้ว)
export const spentOf = (rows) => rows.filter((t) => isRedemption(t) && !isRejected(t)).reduce((s, t) => s + (t.pointsUsed ?? 0), 0)

// "สุทธิตามประวัติ" = pointsUsed สุทธิของทุกแถวที่ยังมีผล (บวก = หักสุทธิ, ลบ = ได้สุทธิ) — ไม่รวมแถวที่ปฏิเสธ
export const netUsedOf = (rows) => rows.reduce((s, t) => s - balanceEffect(t), 0)

// ── ตรวจยอด: เทียบ "คงเหลือจริง" (employees.points) กับ "สุทธิตามประวัติ" ต่อพนักงาน (อ่านอย่างเดียว ใช้ข้อมูลที่หน้าโหลดไว้แล้ว) ──
// ผลต่าง ≠ 0 ไม่ได้แปลว่าผิดเสมอ: แต้มเริ่มต้นตอนผูกบัญชี/การตั้งแต้มด้วยมือไม่มีแถวประวัติ — จึงแยกสถานะให้:
//   ok = ตรง · noHistory = ไม่มีแถวประวัติเลย (ปกติ ถ้ามีแต้มเริ่มต้น) · diff = มีประวัติแต่ไม่ตรง (ควรไล่ดู)
export function reconcile(employees, transactions) {
  const byEmp = new Map()
  for (const t of transactions) {
    if (!t.employeeId) continue
    if (!byEmp.has(t.employeeId)) byEmp.set(t.employeeId, [])
    byEmp.get(t.employeeId).push(t)
  }
  const known = new Set(employees.map((e) => e.id))

  const people = employees
    .filter((e) => e.role !== 'admin')
    .map((e) => {
      const rows = byEmp.get(e.id) ?? []
      const balance = Number(e.points) || 0
      const ledger = rows.reduce((s, t) => s + balanceEffect(t), 0)
      const diff = balance - ledger
      // แถวที่ปุ่มเพิ่มรายการเวอร์ชันเก่าสร้างตอนเพิ่มแต้ม (ไม่ใช่ของนำเข้า): addedByAdmin + pointsUsed < 0
      const legacyAdds = rows.filter((t) => t.addedByAdmin && !t.imported && (t.pointsUsed ?? 0) < 0)
      const status = rows.length === 0 ? 'noHistory' : diff === 0 ? 'ok' : 'diff'
      return {
        employee: e, balance, ledger, diff, status, count: rows.length,
        legacyAdds: { count: legacyAdds.length, points: legacyAdds.reduce((s, t) => s - t.pointsUsed, 0) },
        rejected: rows.filter(isRejected).length,
        imported: rows.some((t) => t.imported),
      }
    })
    .sort((a, b) =>
      (a.status === 'diff' ? 0 : 1) - (b.status === 'diff' ? 0 : 1) ||
      Math.abs(b.diff) - Math.abs(a.diff) ||
      String(a.employee.name).localeCompare(String(b.employee.name), 'th'))

  // ประวัติของบัญชีที่ไม่มีใน employees แล้ว (ถูกลบ/เปลี่ยนอีเมล) — พนักงานจะไม่เห็นรายการเหล่านี้ที่มือถือ
  const orphanMap = new Map()
  for (const [employeeId, rows] of byEmp) {
    if (known.has(employeeId)) continue
    orphanMap.set(employeeId, { employeeId, name: rows[0].employeeName ?? '', count: rows.length, net: rows.reduce((s, t) => s + balanceEffect(t), 0) })
  }

  const count = (s) => people.filter((p) => p.status === s).length
  return {
    people,
    orphans: [...orphanMap.values()],
    summary: { total: people.length, ok: count('ok'), diff: count('diff'), noHistory: count('noHistory') },
  }
}
