import { collection, doc, runTransaction } from 'firebase/firestore'
import { APPROVAL, isRejected, fail } from './pointsLedger'

// ทุกการเปลี่ยน "ยอดแต้ม" ที่ผูกกับแถวใน transactions (แลก / อนุมัติ / ปฏิเสธ / ลบแถว / แก้แถว) อยู่ที่ไฟล์นี้ที่เดียว
// (เดิมกระจายอยู่ในหลายหน้าและไม่ตรงกัน → ปฏิเสธซ้ำคืนแต้มซ้ำ, ลบแถวที่ปฏิเสธแล้วคืนแต้มซ้ำ ฯลฯ) — รับ db เป็นพารามิเตอร์ เพื่อทดสอบกับ emulator ได้
// (emulator-tests/run.mjs)
//
// หลักการที่ใช้ทุกฟังก์ชัน (อย่าถอยกลับ):
//   1) ตัดสินใจจาก "ค่าล่าสุดในฐานข้อมูลที่อ่านใน transaction" ไม่ใช่แถวที่ค้างอยู่ใน state ของหน้า (หน้าโหลดครั้งเดียวแล้วค้างได้นาน เพื่อประหยัดโควตา)
//   2) แถวที่ "ปฏิเสธ" คืนแต้ม+สต็อกไปแล้ว → ลบ/แก้ต้องไม่คืน/ปรับซ้ำ
//   3) รางวัลไม่จำกัด (unlimited) ไม่แตะสต็อก ทั้งตอนแลกและตอนคืน
//   4) ยอดแต้มไม่ต่ำกว่า 0 (Math.max) ตามเดิม

const GONE = 'ไม่พบรายการนี้ (อาจถูกลบไปแล้ว) กรุณารีเฟรชหน้า'

// ── พนักงานแลกรางวัล ──
// reward = ออบเจ็กต์ที่หน้าจอพนักงานโหลดไว้ (ใช้ id/name/pointCost); ราคาที่หักใช้ค่าล่าสุดในฐานข้อมูล
// ถ้าแอดมินเพิ่งแก้ราคา (ต่างจากที่หน้าจอโชว์) → หยุด error.code = 'PRICE_CHANGED' (ยังไม่เขียนอะไร) ให้พนักงานดูราคาใหม่ก่อน
// คืน { newPoints, txId } · error ที่หน้าจอรอจับ: 'ของหมดแล้ว' / 'แต้มไม่พอ' (ข้อความเดิม)
export async function redeemReward(db, { email, name, reward, proofUrl }) {
  const txRef = doc(collection(db, 'transactions')) // จองที่อยู่ + ID ไว้ก่อน (ยังไม่เขียน) เพื่อ tx.set ในก้อนเดียวกัน
  let newPoints
  await runTransaction(db, async (tx) => {
    const empRef = doc(db, 'employees', email)
    const rwRef = doc(db, 'rewards', reward.id)
    const empSnap = await tx.get(empRef)
    const rwSnap = await tx.get(rwRef)
    if (!empSnap.exists()) throw new Error('ไม่พบข้อมูลพนักงาน')
    if (!rwSnap.exists()) throw new Error('ไม่พบรางวัล')
    const rw = rwSnap.data()
    if (rw.pointCost !== reward.pointCost) throw fail('ราคารางวัลเพิ่งเปลี่ยน กรุณาดูราคาใหม่แล้วกดแลกอีกครั้ง', 'PRICE_CHANGED')
    const pts = empSnap.data().points
    if (pts < rw.pointCost) throw new Error('แต้มไม่พอ')
    if (!rw.unlimited && rw.stock < 1) throw new Error('ของหมดแล้ว')
    newPoints = pts - rw.pointCost
    tx.update(empRef, { points: newPoints })
    if (!rw.unlimited) tx.update(rwRef, { stock: rw.stock - 1 }) // รางวัลไม่จำกัด ไม่ต้องหักสต็อก
    // บันทึกประวัติในก้อนเดียวกัน → atomic กับการหักแต้ม/สต็อก (createdAt ใช้ new Date เพราะ serverTimestamp ใช้ใน transaction ไม่ได้)
    tx.set(txRef, {
      employeeId: email,
      employeeName: name,
      rewardId: reward.id,
      rewardName: rw.name ?? reward.name,
      pointsUsed: rw.pointCost,
      createdAt: new Date(),
      status: 'สำเร็จ',
      approval: APPROVAL.PENDING,
      ...(proofUrl ? { proofUrl } : {}),
    })
  })
  return { newPoints, txId: txRef.id }
}

// ── แอดมินอนุมัติ / ปฏิเสธ ──
// ทำได้เฉพาะแถวที่ยัง "รออนุมัติ" จริงในฐานข้อมูล: ถ้าถูกจัดการไปแล้ว (แอดมินอีกคน/แท็บเก่า) → error.code = 'STALE' (+ .current = สถานะล่าสุด)
// ถ้าแถวถูกลบไปแล้ว → 'GONE'
function assertPending(snap) {
  if (!snap.exists()) throw fail(GONE, 'GONE')
  const row = snap.data()
  const current = row.approval ?? APPROVAL.PENDING
  if (current !== APPROVAL.PENDING) {
    throw fail(`รายการนี้ถูก${current === APPROVAL.REJECTED ? 'ปฏิเสธ' : 'อนุมัติ'}ไปแล้ว กรุณารีเฟรชหน้า`, 'STALE', { current })
  }
  return row
}

export async function approveRedemption(db, id) {
  await runTransaction(db, async (tx) => {
    const txRef = doc(db, 'transactions', id)
    assertPending(await tx.get(txRef))
    tx.update(txRef, { approval: APPROVAL.APPROVED })
  })
}

// ปฏิเสธ = คืนแต้ม (pointsUsed ล่าสุดจากฐานข้อมูล) + คืนสต็อก +1 (ยกเว้นรางวัลไม่จำกัด) แล้วตั้งสถานะ ปฏิเสธ
// คืน { balance (null = ไม่ได้แตะยอด), row }
export async function rejectRedemption(db, id) {
  let out
  await runTransaction(db, async (tx) => {
    const txRef = doc(db, 'transactions', id)
    const row = assertPending(await tx.get(txRef))
    const empRef = row.employeeId ? doc(db, 'employees', row.employeeId) : null
    const rwRef = row.rewardId ? doc(db, 'rewards', row.rewardId) : null
    const empSnap = empRef ? await tx.get(empRef) : null
    const rwSnap = rwRef ? await tx.get(rwRef) : null
    let balance = null
    if (empSnap?.exists()) {
      balance = Math.max(0, (empSnap.data().points ?? 0) + (row.pointsUsed ?? 0))
      tx.update(empRef, { points: balance })
    }
    if (rwSnap?.exists() && !rwSnap.data().unlimited) tx.update(rwRef, { stock: (rwSnap.data().stock ?? 0) + 1 })
    tx.update(txRef, { approval: APPROVAL.REJECTED })
    out = { balance, row: { id, ...row } }
  })
  return out
}

// ── แอดมินลบ / แก้แถวในหน้า ประวัติทั้งหมด ──
// ลบ = ย้อนผลของแถวกลับเข้ายอดจริง (แถวแลก/หัก = คืนแต้ม, แถวเพิ่มแต้ม = หักออก) + คืนสต็อก +1 เฉพาะแถวที่มี rewardId
// ⚠️ แถวที่ "ปฏิเสธ" แล้ว: ลบแถวอย่างเดียว ไม่คืนแต้ม/สต็อกซ้ำ (คืนไปแล้วตอนปฏิเสธ)
// คืน { balance (null = ไม่ได้แตะยอด), refund (แต้มที่ย้อนจริง), restocked, rejected, row }
export async function deleteHistoryRow(db, id) {
  let out
  await runTransaction(db, async (tx) => {
    const txRef = doc(db, 'transactions', id)
    const txSnap = await tx.get(txRef)
    if (!txSnap.exists()) throw fail(GONE, 'GONE') // ลบซ้ำจากหน้าค้าง = ต้องไม่คืนซ้ำ
    const row = txSnap.data()
    const rejected = isRejected(row)
    const refund = rejected ? 0 : (row.pointsUsed ?? 0)
    const empRef = row.employeeId && refund !== 0 ? doc(db, 'employees', row.employeeId) : null
    const rwRef = row.rewardId && !rejected ? doc(db, 'rewards', row.rewardId) : null
    const empSnap = empRef ? await tx.get(empRef) : null
    const rwSnap = rwRef ? await tx.get(rwRef) : null
    let balance = null
    if (empSnap?.exists()) {
      balance = Math.max(0, (empSnap.data().points ?? 0) + refund)
      tx.update(empRef, { points: balance })
    }
    const restocked = Boolean(rwSnap?.exists() && !rwSnap.data().unlimited)
    if (restocked) tx.update(rwRef, { stock: (rwSnap.data().stock ?? 0) + 1 })
    tx.delete(txRef)
    out = { balance, refund, restocked, rejected, row: { id, ...row } }
  })
  return out
}

// แก้แถว: effect = ผลต่อพนักงานที่ต้องการ (+ เพิ่มให้ / − หักจาก) → เก็บเป็น pointsUsed = −effect; ปรับยอดตามส่วนต่างจาก "ค่าล่าสุดในฐานข้อมูล"
// ⚠️ แถวที่ "ปฏิเสธ" แล้ว: แก้ตัวเลขได้แต่ไม่ขยับยอด (ผลของแถวนี้ถูกย้อนไปแล้ว)
// คืน { balance (null = ไม่ได้แตะยอด), delta (ส่วนต่างที่ปรับยอดจริง), oldEffect, rejected }
export async function editHistoryRow(db, id, { effect, rewardName, note }) {
  if (!Number.isFinite(effect)) throw new Error('แต้มต้องเป็นตัวเลข')
  let out
  await runTransaction(db, async (tx) => {
    const txRef = doc(db, 'transactions', id)
    const txSnap = await tx.get(txRef)
    if (!txSnap.exists()) throw fail(GONE, 'GONE')
    const row = txSnap.data()
    const rejected = isRejected(row)
    const oldEffect = 0 - (row.pointsUsed ?? 0)
    const delta = rejected ? 0 : effect - oldEffect
    const empRef = row.employeeId && delta !== 0 ? doc(db, 'employees', row.employeeId) : null
    const empSnap = empRef ? await tx.get(empRef) : null
    let balance = null
    if (empSnap?.exists()) {
      balance = Math.max(0, (empSnap.data().points ?? 0) + delta)
      tx.update(empRef, { points: balance })
    }
    tx.update(txRef, { pointsUsed: 0 - effect, note, rewardName, editedAt: new Date() })
    out = { balance, delta, oldEffect, rejected }
  })
  return out
}
