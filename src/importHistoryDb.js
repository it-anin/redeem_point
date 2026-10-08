import { collection, doc, runTransaction } from 'firebase/firestore'
import { buildLedger, sentinelId } from './importHistory'

// ส่วนที่เขียน Firestore ของเครื่องมือนำเข้าประวัติย้อนหลัง — แยกจาก UI และรับ db เป็นพารามิเตอร์ เพื่อทดสอบกับ emulator ได้
// (importHistoryDb.emulator.test.js) · ตรรกะคำนวณล้วนๆ อยู่ที่ importHistory.js

// นำเข้าพนักงาน 1 คนใน transaction เดียว (atomic): อ่านยอดล่าสุด + ตรวจว่ายังไม่เคยนำเข้า → ตั้งยอด + เขียนทุกแถว
// คืน { points, rows: [{ id, ...data }] } · ถ้าเคยนำเข้าแล้ว throw error ที่มี code === 'ALREADY' (ไม่มีอะไรถูกเขียน)
export async function importOne(db, item, batchId, cutoff) {
  const emp = item.employee
  const empRef = doc(db, 'employees', emp.id)
  const sentinelRef = doc(db, 'transactions', sentinelId(emp.id))
  let out = null
  await runTransaction(db, async (tx) => {
    const empSnap = await tx.get(empRef)
    const sentSnap = await tx.get(sentinelRef)
    if (!empSnap.exists()) throw new Error('ไม่พบพนักงาน (อาจถูกลบไปแล้ว)')
    if (sentSnap.exists()) { const e = new Error('นำเข้าไปแล้ว'); e.code = 'ALREADY'; throw e }
    // ยอดเดิมใช้ค่าที่อ่านใน transaction (ไม่ใช่เลขในพรีวิว — พนักงานอาจแลกของ/แอดมินอีกคนแก้ไปแล้ว)
    const ledger = buildLedger(item, { current: empSnap.data().points ?? 0, batchId, cutoff })
    const rows = ledger.rows.map((r) => ({ ref: r.id ? doc(db, 'transactions', r.id) : doc(collection(db, 'transactions')), data: r.data }))
    tx.update(empRef, { points: ledger.points })
    rows.forEach((r) => tx.set(r.ref, r.data))
    out = { points: ledger.points, rows: rows.map((r) => ({ id: r.ref.id, ...r.data })) }
  })
  return out
}

// ย้อนแถวของชุดนำเข้าของพนักงาน 1 คน (group จาก planRollback: { employeeId, ids, delta }) ใน transaction เดียว
// ผลต่อยอด = −pointsUsed จึงคืนด้วย +Σ pointsUsed (ไม่ต่ำกว่า 0) — แบบเดียวกับลบแถวในหน้า ประวัติทั้งหมด
// คืนยอดคงเหลือใหม่ (null = ไม่ได้แตะยอด เช่นพนักงานถูกลบไปแล้ว)
export async function rollbackOne(db, group) {
  let balance = null
  await runTransaction(db, async (tx) => {
    balance = null
    const empRef = doc(db, 'employees', group.employeeId)
    const empSnap = await tx.get(empRef)
    if (empSnap.exists() && group.delta !== 0) {
      balance = Math.max(0, (empSnap.data().points ?? 0) + group.delta)
      tx.update(empRef, { points: balance })
    }
    group.ids.forEach((id) => tx.delete(doc(db, 'transactions', id)))
  })
  return balance
}
